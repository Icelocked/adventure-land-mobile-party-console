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

  // Every domain uses the dashboard's own request shape.
  const sections = new Set(server.stateRequests.map((r) => `${r.section}:${r.dashboard}`))
  expect(sections).toContain('config:true')
  expect(sections).toContain('core:true')
  expect(sections).toContain('bank:true')
  expect(server.stateRequests.some((r) => r.section === '')).toBe(false)
})

test('Config section: a slow config response never holds up core, and config-seeded controls wait for it', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.leader = 'Patinder'
  server.configDelayMs = 20_000
  server.merchantCurrent = { id: 'merchant-1', target: 'Patinder', reason: 'restock' }
  await server.install(page)

  await page.goto('/characters/Patinder')
  // Core (the merchant job) renders while config is still in flight...
  await expect(page.getByText(/Now: restock/)).toBeVisible()
  // ...and the controls that would otherwise save defaults stay disabled.
  await expect(page.getByRole('button', { name: 'Follow', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: /Force stand/ })).toBeDisabled()
  await expect(page.getByText('Loading settings…').first()).toBeVisible()
})

test('Config section: polled on its own slower timer, not with every core poll', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'MainLeader', ctype: 'warrior', level: 60 })
  await server.install(page)

  await page.goto('/characters/MainLeader')
  await page.waitForTimeout(13_000)
  const core = server.stateRequests.filter((r) => r.section === 'core').length
  const config = server.stateRequests.filter((r) => r.section === 'config').length
  expect(core).toBeGreaterThanOrEqual(3)
  expect(config).toBe(1)
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
  await expect(page.getByText(/Now: restock/)).toBeVisible({ timeout: 20_000 })
})
