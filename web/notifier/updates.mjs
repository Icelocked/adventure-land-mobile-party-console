// PWA self-updates. The notifier checks GitHub for new releases (every 6 hours
// and on demand) and owns the preferences. Installing needs Docker, so it is
// done by the separate updater container (web/updater/agent.mjs), which only
// ever installs the latest official release. The two talk through files in a
// shared volume; neither listens to the other over the network.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPOSITORY = 'Icelocked/adventure-land-mobile-party-console'
// Overridable only to test against a fake release feed.
export const RELEASES_URL = process.env.RELEASES_URL || `https://api.github.com/repos/${REPOSITORY}/releases/latest`
const CHECK_EVERY_MS = 6 * 3600_000
const AGENT_STALE_MS = 30_000

export function parseVersion(value) {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(String(value ?? ''))
  return match ? match.slice(1, 4).map(Number) : null
}
export function newer(candidate, current) {
  const a = parseVersion(candidate), b = parseVersion(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}

// The package.json version the image was built from (see the Dockerfile).
function builtFrom() {
  try {
    return readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'base-version.txt'), 'utf8').trim()
  } catch {
    return ''
  }
}

export function createUpdates({ dir = process.env.UPDATES_DIR || '/data/updates', current = process.env.PWA_VERSION || '', base = builtFrom(), fetchImpl = fetch, now = Date.now, log = console.log } = {}) {
  mkdirSync(dir, { recursive: true })
  const file = (name) => join(dir, name)
  const read = (name, fallback) => {
    try { return JSON.parse(readFileSync(file(name), 'utf8')) } catch { return fallback }
  }
  const write = (name, value) => {
    writeFileSync(file(`${name}.tmp`), JSON.stringify(value), { mode: 0o600 })
    renameSync(file(`${name}.tmp`), file(name))
  }

  let preferences = { automatic: false, ...read('preferences.json', {}) }
  let release = read('release.json', null) // { version, notes, checkedAt }
  let checking = null
  let error = ''
  let etag = ''

  // A release image carries its version; a source build only knows the
  // version it was built from, which it compares releases against.
  const installed = () => (parseVersion(current) ? current.replace(/^v/, '') : '')
  const builtVersion = () => (parseVersion(base) ? base.replace(/^v/, '') : '')
  const agent = () => {
    const value = read('agent.json', null)
    return value && now() - Number(value.at || 0) < AGENT_STALE_MS ? value : null
  }
  const available = () => (release && newer(release.version, installed() || builtVersion()) ? release.version : '')

  async function check() {
    if (checking) return checking
    checking = (async () => {
      try {
        const response = await fetchImpl(RELEASES_URL, {
          headers: { 'User-Agent': 'party-console-pwa', Accept: 'application/vnd.github+json', ...(etag ? { 'If-None-Match': etag } : {}) },
          signal: AbortSignal.timeout(15_000),
        })
        if (response.status === 304 && release) {
          release = { ...release, checkedAt: now() }
        } else if (response.status === 404) {
          release = { version: '', notes: '', checkedAt: now() }
        } else if (!response.ok) {
          throw new Error(`GitHub update check failed (${response.status}); the installed version keeps running`)
        } else {
          const body = await response.json()
          if (body.draft || body.prerelease || !parseVersion(body.tag_name)) throw new Error('Latest release has no stable version tag')
          etag = response.headers.get('etag') || ''
          release = { version: String(body.tag_name).replace(/^v/, ''), notes: `https://github.com/${REPOSITORY}/releases/tag/${body.tag_name}`, checkedAt: now() }
        }
        write('release.json', release)
        error = ''
        if (preferences.automatic && available() && agent()) requestInstall()
      } catch (failure) {
        error = failure?.message || String(failure)
        log('update check failed:', error)
      } finally {
        checking = null
      }
    })()
    return checking
  }

  function requestInstall() {
    // Only "install the latest release" can be asked for; the agent looks the
    // version up on GitHub itself.
    write('request.json', { action: 'install', at: now() })
  }

  function status() {
    const worker = agent()
    return {
      current: installed() || (builtVersion() ? `${builtVersion()}-dev` : 'development build'),
      development: !installed(),
      available: available() || undefined,
      notes: available() ? release.notes : undefined,
      checkedAt: release?.checkedAt,
      automatic: !!preferences.automatic,
      // Installs need the updater container and a release image (not a local build).
      managed: !!worker && !!installed(),
      updater: !!worker,
      phase: checking ? 'checking' : worker?.phase && worker.phase !== 'idle' ? worker.phase : available() ? 'available' : 'idle',
      error: error || worker?.error || undefined,
    }
  }

  async function handle(req, path, body) {
    if (req.method === 'GET' && path === '/update') return [200, status()]
    if (req.method !== 'POST') return null
    if (path === '/update/check') { await check(); return [200, status()] }
    if (path === '/update/preferences') {
      if (typeof body.automatic !== 'boolean') return [400, { error: 'automatic must be true or false' }]
      preferences = { ...preferences, automatic: body.automatic }
      write('preferences.json', preferences)
      if (preferences.automatic && available() && agent()) requestInstall()
      return [200, status()]
    }
    if (path === '/update/install') {
      if (!agent()) return [409, { error: 'Installing needs the updater service. See DEPLOYMENT.md, "Automatic updates".' }]
      if (!installed()) return [409, { error: 'This PWA was built from source; update it the way you built it.' }]
      if (!available()) return [409, { error: 'Already up to date.' }]
      requestInstall()
      return [200, status()]
    }
    return null
  }

  function start() {
    if (!existsSync(file('preferences.json'))) write('preferences.json', preferences)
    setTimeout(() => void check(), 60_000).unref?.()
    setInterval(() => void check(), CHECK_EVERY_MS).unref?.()
  }

  return { check, status, handle, start }
}
