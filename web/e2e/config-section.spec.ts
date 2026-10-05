import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

test('Config section: settings that only the config section carries reach the UI', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.addCharacter({ name: 'MainLeader', ctype: 'warrior', level: 60 })
  server.leader = 'MainLeader'
  server.extraState = { merchantForceStand: true }
  await server.install(page)

  await page.goto('/characters/MainLeader')
  await expect(page.getByRole('button', { name: 'Leader', exact: true })).toHaveAttribute('aria-pressed', 'true')

  await page.goto('/characters/Patinder')
  await expect(page.getByRole('button', { name: /Force stand · On/ })).toBeVisible()

  // Every domain uses the console's request shape.
  const sections = new Set(server.stateRequests.map((r) => `${r.section}:${r.dashboard}`))
  expect(sections).toContain('config:true')
  expect(sections).toContain('core:true')
  expect(sections).toContain('bank:true')
  expect(server.stateRequests.some((r) => r.section === '')).toBe(false)
})

test('Config section: a slow config response never holds up core, and config-seeded controls wait for it', async ({ page }) => {
  test.setTimeout(60_000)
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.leader = 'Patinder'
  server.configDelayMs = 20_000
  server.merchantCurrent = { id: 'merchant-1', target: 'Patinder', reason: 'restock' }
  await server.install(page)

  await page.goto('/characters/Patinder')
  // Core keeps polling on its own 6s cadence while config is still in flight...
  await expect.poll(() => server.stateRequests.filter((r) => r.section === 'core').length, { timeout: 15_000 }).toBeGreaterThanOrEqual(2)
  // ...and the controls that would otherwise save defaults stay disabled.
  await expect(page.getByRole('button', { name: 'Follow', exact: true })).toBeDisabled()
  await expect(page.getByText('Loading settings…').first()).toBeVisible()
  // Merchant sections wait for the configured merchant (a config field).
  await expect(page.getByText(/Party restock/)).toBeVisible({ timeout: 25_000 })
})

test('Config section: polled on its own slower timer, not with every core poll', async ({ page }) => {
  test.setTimeout(60_000)
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'MainLeader', ctype: 'warrior', level: 60 })
  await server.install(page)

  const start = Date.now()
  await page.goto('/characters/MainLeader')
  // Wait for several core polls rather than a fixed sleep - under a loaded
  // parallel run one 6s cycle can take longer than 6s.
  await expect.poll(() => server.stateRequests.filter((r) => r.section === 'core').length, { timeout: 40_000 }).toBeGreaterThanOrEqual(3)
  const config = server.stateRequests.filter((r) => r.section === 'config').length
  // One at startup, plus at most one per elapsed 15s tick.
  expect(config).toBeLessThanOrEqual(1 + Math.floor((Date.now() - start) / 15_000))
})

test('Session: a redirect to /setup shows the reconnect screen instead of silently stopping', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'MainLeader', ctype: 'warrior', level: 60 })
  server.redirectNextStateGet = true
  await server.install(page)

  await page.goto('/characters/MainLeader')
  await expect(page.getByText('Session expired. Reconnect this browser.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reconnect' })).toBeVisible()
})

test('Polling: a garbage (non-JSON) response does not stop later polls', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  await server.install(page)
  let garbled = 0
  await page.route('**/party-api/state?*section=core*', (route) => {
    if (garbled < 2) {
      garbled += 1
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<html>captive portal</html>' })
    }
    return route.fallback()
  })

  await page.goto('/characters/Patinder')
  server.merchantCurrent = { id: 'merchant-1', target: 'Patinder', reason: 'restock' }
  await expect(page.getByText(/Party restock/)).toBeVisible({ timeout: 20_000 })
})
