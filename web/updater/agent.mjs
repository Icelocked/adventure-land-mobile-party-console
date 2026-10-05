// Updater sidecar: replaces the PWA container with the latest release image.
// It has the Docker socket, so it is deliberately small and has no network
// listener. Its only input is a request file in the shared volume, and the
// only thing a request can ask for is "install the latest official release";
// the version is looked up on GitHub here, never taken from the request.
import { request } from 'node:http'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { RELEASES_URL, newer, parseVersion } from '../notifier/updates.mjs'

// PWA_IMAGE is overridable only to test against a local registry.
export const IMAGE = process.env.PWA_IMAGE || 'ghcr.io/icelocked/party-console-pwa'
const SERVICE = process.env.PWA_SERVICE || 'party-console-pwa'
const DIR = process.env.UPDATES_DIR || '/data/updates'
const API = '/v1.41'

const log = (...args) => console.log(new Date().toISOString(), '[updater]', ...args)
const file = (name) => join(DIR, name)
const write = (name, value) => {
  writeFileSync(file(`${name}.tmp`), JSON.stringify(value), { mode: 0o600 })
  renameSync(file(`${name}.tmp`), file(name))
}

export function docker(method, route, input) {
  return new Promise((resolve, reject) => {
    const req = request({ socketPath: '/var/run/docker.sock', method, path: API + route, headers: { 'Content-Type': 'application/json' } }, (res) => {
      let text = ''
      res.on('data', (chunk) => { text += chunk })
      res.on('end', () => {
        if ((res.statusCode || 500) >= 400) return reject(new Error(`Docker ${res.statusCode}: ${text.slice(-500)}`))
        try { resolve(text ? JSON.parse(text) : {}) } catch {
          // Image pulls stream newline-delimited progress objects.
          const rows = text.trim().split('\n').map((line) => { try { return JSON.parse(line) } catch { return {} } })
          const failed = rows.find((row) => row.error)
          failed ? reject(new Error(failed.error)) : resolve(rows)
        }
      })
    })
    req.setTimeout(600_000, () => req.destroy(new Error('Docker request timed out')))
    req.on('error', reject)
    req.end(input === undefined ? undefined : JSON.stringify(input))
  })
}

async function latestRelease() {
  const response = await fetch(RELEASES_URL, {
    headers: { 'User-Agent': 'party-console-pwa-updater', Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`GitHub release lookup failed (${response.status})`)
  const body = await response.json()
  if (body.draft || body.prerelease || !parseVersion(body.tag_name)) throw new Error('Latest release has no stable version tag')
  return String(body.tag_name).replace(/^v/, '')
}

async function locate() {
  const self = await docker('GET', `/containers/${process.env.HOSTNAME}/json`)
  const project = self.Config.Labels?.['com.docker.compose.project']
  if (!project) throw new Error('The updater must run from the same Compose project as the PWA')
  const filters = encodeURIComponent(JSON.stringify({ label: [`com.docker.compose.project=${project}`, `com.docker.compose.service=${SERVICE}`] }))
  const found = await docker('GET', `/containers/json?all=true&filters=${filters}`)
  if (found.length !== 1) throw new Error(`Expected one "${SERVICE}" container in this Compose project, found ${found.length}`)
  return docker('GET', `/containers/${found[0].Id}/json`)
}

const imageInfo = (name) => docker('GET', `/images/${encodeURIComponent(name)}/json`)

/** The container's config minus everything it inherited from its old image,
 *  so the new image's environment, labels and command take effect. */
export function ownConfig(container, oldImage) {
  const config = { ...container.Config }
  const inherited = oldImage.Config || {}
  const imageEnv = new Set(inherited.Env || [])
  config.Env = (config.Env || []).filter((entry) => !imageEnv.has(entry))
  config.Labels = Object.fromEntries(Object.entries(config.Labels || {}).filter(([key, value]) => inherited.Labels?.[key] !== value))
  for (const key of ['Cmd', 'Entrypoint', 'WorkingDir', 'Healthcheck', 'ExposedPorts', 'Volumes', 'StopSignal', 'User']) {
    if (JSON.stringify(config[key] ?? null) === JSON.stringify(inherited[key] ?? null)) delete config[key]
  }
  delete config.Hostname
  delete config.Image
  return config
}

async function healthy(timeoutMs = 60_000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    try {
      // A 3xx counts: with HTTPS enabled, port 80 redirects.
      const response = await fetch(`http://${SERVICE}/`, { redirect: 'manual', signal: AbortSignal.timeout(3000) })
      if (response.status < 400) return true
    } catch { /* still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  return false
}

let phase = 'idle'
let error = ''
const heartbeat = () => write('agent.json', { at: Date.now(), phase, error: error || undefined })

async function install() {
  phase = 'installing'; error = ''; heartbeat()
  const version = await latestRelease()
  const old = await locate()
  const oldImage = await imageInfo(old.Image)
  const current = oldImage.Config?.Labels?.['org.opencontainers.image.version'] || ''
  if (!newer(version, current)) { log(`already on ${current}`); return }
  if (!String(old.Config.Image).startsWith(IMAGE)) throw new Error('The PWA container is not running a release image; update it the way you built it')

  log(`installing ${version} (was ${current})`)
  const target = `${IMAGE}:${version}`
  await docker('POST', `/images/create?fromImage=${encodeURIComponent(IMAGE)}&tag=${version}`)
  if ((await imageInfo(target)).Config?.Labels?.['org.opencontainers.image.version'] !== version) throw new Error('Pulled image does not carry the expected version')

  const name = old.Name.replace(/^\//, '')
  const endpoints = Object.fromEntries(Object.entries(old.NetworkSettings.Networks).map(([network, settings]) => [network, { Aliases: settings.Aliases?.filter((alias) => alias !== old.Id.slice(0, 12)) }]))
  await docker('POST', `/containers/${old.Id}/stop?t=10`).catch((failure) => { if (!/Docker 304/.test(String(failure))) throw failure })
  await docker('POST', `/containers/${old.Id}/rename?name=${encodeURIComponent(`${name}-previous`)}`)
  let created
  try {
    created = await docker('POST', `/containers/create?name=${encodeURIComponent(name)}`, {
      ...ownConfig(old, oldImage), Image: target, HostConfig: old.HostConfig, NetworkingConfig: { EndpointsConfig: endpoints },
    })
    await docker('POST', `/containers/${created.Id}/start`)
    if (!(await healthy())) throw new Error(`Version ${version} did not start; rolled back to ${current}`)
  } catch (failure) {
    if (created) await docker('DELETE', `/containers/${created.Id}?force=true`).catch(() => {})
    await docker('POST', `/containers/${old.Id}/rename?name=${encodeURIComponent(name)}`)
    await docker('POST', `/containers/${old.Id}/start`).catch(() => {})
    throw failure
  }
  await docker('DELETE', `/containers/${old.Id}`)
  // Only now point :latest at it, so "docker compose up" keeps what runs and
  // never picks up a release that failed to start.
  await docker('POST', `/images/${encodeURIComponent(target)}/tag?repo=${encodeURIComponent(IMAGE)}&tag=latest`)
  log(`installed ${version}`)
}

async function tick() {
  heartbeat()
  if (!existsSync(file('request.json'))) return
  let wanted
  try { wanted = JSON.parse(readFileSync(file('request.json'), 'utf8')) } catch { wanted = null }
  rmSync(file('request.json'), { force: true })
  if (wanted?.action !== 'install') return
  try { await install() } catch (failure) { error = failure?.message || String(failure); log('install failed:', error) }
  phase = 'idle'
  heartbeat()
}

if (process.argv[1]?.endsWith('agent.mjs')) {
  mkdirSync(DIR, { recursive: true })
  let busy = false
  setInterval(() => {
    if (busy) return
    busy = true
    tick().catch((failure) => log('tick failed:', failure?.message || failure)).finally(() => { busy = false })
  }, 2000)
  log(`watching ${DIR} for install requests (service "${SERVICE}")`)
}
