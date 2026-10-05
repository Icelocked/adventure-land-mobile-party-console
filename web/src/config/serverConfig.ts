/** Unlike the Android app there is no certificate trust mode: the browser
 *  decides TLS trust itself.
 *
 *  An empty baseUrl means same-origin, the default and the supported
 *  path. The coordinator sends no Access-Control-Allow-Origin header, so a
 *  cross-origin baseUrl only works if a proxy adds one. The self-hosted
 *  setup (web/Dockerfile, DEPLOYMENT.md) proxies /party-api/* through the
 *  same nginx that serves this app for that reason. */
export interface ServerSettings {
  baseUrl: string // "" for same-origin (the default), or e.g. "https://party.example.com:3443"
}

export const SAME_ORIGIN_SETTINGS: ServerSettings = { baseUrl: '' }

export const apiBase = (settings: ServerSettings): string => `${settings.baseUrl.replace(/\/+$/, '')}/party-api`
export const streamUrl = (settings: ServerSettings): string => `${apiBase(settings)}/dashboard-stream`
/** Per-character live map/entities feed - the only channel carrying nearby
 *  entities (id -> mtype), needed to turn a raw target id into a monster. */
export const mapStreamUrl = (settings: ServerSettings, character: string): string =>
  `${apiBase(settings)}/map-stream/${encodeURIComponent(character)}`

const STORAGE_KEY = 'party-console-companion:server-settings'

/** Same-origin unless the user saved an override. */
export const loadServerSettings = (): ServerSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return SAME_ORIGIN_SETTINGS
    const parsed = JSON.parse(raw) as Partial<ServerSettings>
    return typeof parsed.baseUrl === 'string' ? (parsed as ServerSettings) : SAME_ORIGIN_SETTINGS
  } catch {
    return SAME_ORIGIN_SETTINGS
  }
}

export const saveServerSettings = (settings: ServerSettings): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Storage disabled: the override won't persist; same-origin still works.
  }
}

export const clearServerSettings = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // See saveServerSettings.
  }
}
