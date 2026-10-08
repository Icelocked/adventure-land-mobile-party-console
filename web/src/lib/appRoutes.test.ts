import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { APP_NAVIGATION_ALLOWLIST } from './appRoutes'

const owned = (path: string) => APP_NAVIGATION_ALLOWLIST.some((pattern) => pattern.test(path))
const appRoutes = [...readFileSync(new URL('../App.tsx', import.meta.url), 'utf8').matchAll(/path="([^"]+)"/g)]
  .map((match) => match[1].replace(/:[^/]+/g, 'x'))

describe('service worker navigation allowlist', () => {
  it('covers every page in App.tsx', () => {
    expect(appRoutes.length).toBeGreaterThan(10)
    for (const path of appRoutes) expect(owned(path), path).toBe(true)
    expect(owned('/?pair=abc')).toBe(true)
    expect(owned('/characters/Leada/hunt-settings')).toBe(true)
  })

  it("leaves the server's own paths to the network", () => {
    for (const path of ['/setup', '/setup/pair', '/console-update', '/console-debug', '/party-api/state', '/notify/subscribe', '/some-server-page/'])
      expect(owned(path), path).toBe(false)
  })
})
