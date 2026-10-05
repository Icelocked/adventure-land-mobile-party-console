// Entry point of the no-Docker packages (Start.ps1 on Windows, start.sh on
// Linux run it from the active version folder). Runs the gateway, keeps the push notifier running next to
// it, and is the package's updater: the same request-file protocol as the
// Docker updater (web/updater/agent.mjs), but it installs by downloading the
// release ZIP into a new version folder and restarting into it.
//
// Install layout (see distribution/windows and distribution/linux):
//   launcher, config.env          outside replaceable versions
//   app/ or versions/<v>/         the active version (active.json)
//   data/notifier, data/updates   settings, keys, subscriptions
import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGateway } from './gateway.mjs'
import { REPOSITORY, RELEASES_URL, newer, parseVersion } from '../notifier/updates.mjs'

// Exit code the launchers treat as "start again now, from active.json".
export const RESTART = 75
// One package per launcher; the app inside is the same.
const WINDOWS = process.platform === 'win32'
export const assetName = (version, windows = WINDOWS) => `party-console-companion-pwa-${windows ? 'windows' : 'linux'}-v${version}.${windows ? 'zip' : 'tar.gz'}`

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const HOME = resolve(process.env.PWA_HOME || APP)
const DATA = resolve(process.env.PWA_DATA || join(HOME, 'data'))
const UPDATES = join(DATA, 'updates')
const HOST = process.env.PWA_HOST || '127.0.0.1'
const PORT = Number(process.env.PWA_PORT || 8080)
const CONSOLE_URL = process.env.CONSOLE_URL || 'http://127.0.0.1:3010'
const NOTIFIER_PORT = Number(process.env.NOTIFIER_PORT || 3090)

const log = (...args) => console.log(new Date().toISOString(), '[pwa]', ...args)
const readJson = (path, fallback) => {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return fallback }
}
const writeJson = (path, value) => {
  writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 2), { mode: 0o600 })
  renameSync(`${path}.tmp`, path)
}
/** A folder under HOME, never outside it. */
const inside = (path) => {
  const full = resolve(HOME, path)
  if (relative(HOME, full).startsWith('..')) throw new Error(`Refusing path outside the install: ${path}`)
  return full
}

const manifest = readJson(join(APP, 'release.json'), null)
const version = manifest?.repository === REPOSITORY && parseVersion(manifest.version) ? manifest.version : ''

let phase = 'idle'
let error = ''
const heartbeat = () => writeJson(join(UPDATES, 'agent.json'), { at: Date.now(), phase, error: error || undefined })

// ---- notifier --------------------------------------------------------------

let notifier = null
let stopping = false
function startNotifier() {
  if (stopping) return
  notifier = spawn(process.execPath, [join(APP, 'notifier', 'server.mjs')], {
    stdio: 'inherit',
    windowsHide: true,
    env: {
      ...process.env,
      NOTIFIER_PORT: String(NOTIFIER_PORT),
      NOTIFIER_DATA: join(DATA, 'notifier'),
      UPDATES_DIR: UPDATES,
      CONSOLE_URL,
      PWA_VERSION: version,
    },
  })
  const started = Date.now()
  notifier.on('exit', (code) => {
    notifier = null
    if (stopping) return
    log(`notifier exited (${code}); restarting in 5s`)
    notifierCrashed = Date.now() - started < 15_000
    setTimeout(startNotifier, 5000).unref?.()
  })
}
let notifierCrashed = false

function stop(code) {
  stopping = true
  notifier?.kill()
  setTimeout(() => process.exit(code), 500)
}

// ---- updates ---------------------------------------------------------------

async function latestRelease() {
  const response = await fetch(RELEASES_URL, {
    headers: { 'User-Agent': 'party-console-pwa-updater', Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`GitHub release lookup failed (${response.status})`)
  const body = await response.json()
  if (body.draft || body.prerelease || !parseVersion(body.tag_name)) throw new Error('Latest release has no stable version tag')
  const tag = String(body.tag_name).replace(/^v/, '')
  const asset = (body.assets || []).find((entry) => entry.name === assetName(tag))
  if (!asset) throw new Error(`Release ${tag} has no ${WINDOWS ? 'Windows' : 'Linux'} package`)
  const digest = /^sha256:([0-9a-f]{64})$/.exec(String(asset.digest || ''))
  if (!digest) throw new Error(`Release ${tag} publishes no checksum for its package`)
  return { version: tag, url: asset.browser_download_url, sha256: digest[1] }
}

/** Downloads, verifies and unpacks a release into versions/<v>. */
async function stage(release) {
  const target = inside(join('versions', release.version))
  if (existsSync(join(target, 'release.json'))) return target
  const temporary = inside(join('downloads', release.version))
  rmSync(temporary, { recursive: true, force: true })
  mkdirSync(temporary, { recursive: true })
  const response = await fetch(release.url, { headers: { 'User-Agent': 'party-console-pwa-updater' }, signal: AbortSignal.timeout(300_000) })
  if (!response.ok) throw new Error(`Download failed (${response.status})`)
  const archive = Buffer.from(await response.arrayBuffer())
  if (createHash('sha256').update(archive).digest('hex') !== release.sha256) throw new Error('Downloaded package does not match its published checksum')
  const file = join(temporary, WINDOWS ? 'package.zip' : 'package.tar.gz')
  writeFileSync(file, archive)
  // Windows' own tar.exe reads ZIPs (by full path: Git's GNU tar, which may
  // come first on PATH, doesn't). The members are listed first; nothing may
  // point outside the folder.
  const tar = WINDOWS ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
  const members = execFileSync(tar, ['-tf', file], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean)
  for (const member of members) if (/^[\\/]|^[a-z]:|(^|[\\/])\.\.([\\/]|$)/i.test(member)) throw new Error('Package contains an unsafe path')
  execFileSync(tar, ['-xf', file, '-C', temporary])
  // The Linux tarball has a top-level folder; the Windows ZIP doesn't.
  const payload = [join(temporary, 'app'), join(temporary, 'party-console-pwa', 'app')].find((path) => existsSync(path)) || join(temporary, 'app')
  const unpacked = readJson(join(payload, 'release.json'), null)
  if (unpacked?.version !== release.version || unpacked?.repository !== REPOSITORY) throw new Error('Package identity does not match the release')
  mkdirSync(dirname(target), { recursive: true })
  renameSync(payload, target)
  rmSync(inside('downloads'), { recursive: true, force: true })
  return target
}

async function install() {
  phase = 'installing'; error = ''; heartbeat()
  if (!version) throw new Error('This PWA was not installed from a release package; update it the way you installed it')
  const release = await latestRelease()
  if (!newer(release.version, version)) { log(`already on ${version}`); return false }
  log(`installing ${release.version} (was ${version})`)
  const target = await stage(release)
  const active = readJson(join(HOME, 'active.json'), { root: 'app' })
  writeJson(join(HOME, 'active.json'), { root: relative(HOME, target), previous: active.root, pending: true })
  log(`restarting into ${release.version}`)
  return true
}

async function tick() {
  heartbeat()
  const requestFile = join(UPDATES, 'request.json')
  if (!existsSync(requestFile)) return
  const wanted = readJson(requestFile, null)
  rmSync(requestFile, { force: true })
  if (wanted?.action !== 'install') return
  try {
    if (await install()) return stop(RESTART)
  } catch (failure) {
    error = failure?.message || String(failure)
    log('install failed:', error)
  }
  phase = 'idle'
  heartbeat()
}

/** After an update, the new version confirms itself or hands back. */
async function settle(serving) {
  const active = readJson(join(HOME, 'active.json'), null)
  if (!active?.pending) return
  let healthy = false
  try {
    await serving
    await new Promise((done) => setTimeout(done, 15_000))
    const response = await fetch(`http://127.0.0.1:${PORT}/`, { signal: AbortSignal.timeout(5000) })
    healthy = response.ok && !notifierCrashed
  } catch { /* not healthy */ }
  if (healthy) {
    writeJson(join(HOME, 'active.json'), { root: active.root, previous: active.previous })
    // Keep the previous version for a manual rollback; drop anything older.
    for (const name of existsSync(join(HOME, 'versions')) ? readdirSync(join(HOME, 'versions')) : []) {
      const path = join('versions', name)
      if (path !== active.root && path !== active.previous) rmSync(inside(path), { recursive: true, force: true })
    }
    log(`version ${version} confirmed`)
    return
  }
  writeJson(join(HOME, 'active.json'), { root: active.previous })
  writeJson(join(UPDATES, 'result.json'), { error: `Version ${version} did not start; rolled back` })
  log(`version ${version} did not start; rolling back`)
  stop(RESTART)
}

// ---- main ------------------------------------------------------------------

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  mkdirSync(UPDATES, { recursive: true })
  mkdirSync(join(DATA, 'notifier'), { recursive: true })
  const result = readJson(join(UPDATES, 'result.json'), null)
  if (result?.error) { error = result.error; rmSync(join(UPDATES, 'result.json'), { force: true }) }

  const gateway = createGateway({ root: join(APP, 'dist'), consoleUrl: CONSOLE_URL, notifierUrl: `http://127.0.0.1:${NOTIFIER_PORT}`, log })
  const serving = new Promise((done, failed) => {
    gateway.once('error', failed)
    gateway.listen(PORT, HOST, done)
  })
  serving.then(
    () => log(`Party Console PWA ${version || '(source)'} on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/`),
    (failure) => {
      log(failure?.code === 'EADDRINUSE' ? `port ${PORT} is already in use; set PWA_PORT in config.env` : `could not start: ${failure?.message}`)
      process.exitCode = 1
      stop(1)
    },
  )
  startNotifier()
  void settle(serving)

  let busy = false
  setInterval(() => {
    if (busy) return
    busy = true
    tick().catch((failure) => log('update tick failed:', failure?.message || failure)).finally(() => { busy = false })
  }, 2000)
  process.on('SIGINT', () => stop(0))
  process.on('SIGTERM', () => stop(0))
}
