/** Mirrors network/ServerConfig.kt's ServerSettings, minus TrustMode -
 *  the Android app supports three certificate-trust strategies because a
 *  native app can override how TLS trust decisions are made. A browser
 *  can't: it either trusts a certificate via its own normal trust store
 *  (ordinary https://) or the URL is plain http:// and there's no
 *  certificate at all - matching TrustMode.SYSTEM and TrustMode.CLEARTEXT
 *  respectively. PINNED_CERTIFICATE has no browser equivalent and isn't
 *  the proven connection path anyway (see DEPLOYMENT.md), so it's not
 *  ported.
 *
 *  baseUrl empty ("") means same-origin: talk to `/party-api/*` on
 *  whatever origin this page itself was loaded from. This is the DEFAULT
 *  and the only supported production path - party-console's coordinator
 *  sends no Access-Control-Allow-Origin header at all (confirmed against
 *  a live server), so any cross-origin baseUrl gets blocked by the
 *  browser's own CORS enforcement unless something in front of the
 *  coordinator adds that header. The self-hosting setup (web/Dockerfile,
 *  DEPLOYMENT.md) proxies /party-api/* through the SAME nginx that
 *  serves this app specifically so same-origin is always correct out of
 *  the box - a non-empty baseUrl is an advanced override (e.g. pointing
 *  at a different proxied deployment), not something most people need to
 *  ever touch. */
export interface ServerSettings {
  baseUrl: string // "" for same-origin (the default), or e.g. "https://party.example.com:3443"
}

export const SAME_ORIGIN_SETTINGS: ServerSettings = { baseUrl: '' }

/** party-console's own client code uses a relative "/party-api" base
 *  because it's served same-origin from the coordinator - this app
 *  matches that by default (see the doc comment above). */
export const apiBase = (settings: ServerSettings): string => `${settings.baseUrl.replace(/\/+$/, '')}/party-api`
export const streamUrl = (settings: ServerSettings): string => `${apiBase(settings)}/dashboard-stream`

const STORAGE_KEY = 'party-console-companion:server-settings'

/** Reads the active server connection - same-origin unless the user
 *  explicitly saved an override (see saveServerSettings). Unlike the
 *  Android app, there's no mandatory "enter an address" first screen:
 *  same-origin works immediately for the self-hosted deployment with
 *  zero configuration. */
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
    // Private browsing / storage disabled - the override just won't
    // persist across reloads; same-origin (the default) still works.
  }
}

export const clearServerSettings = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // See saveServerSettings.
  }
}
