import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

const count = (server: MockPartyServer, section: string) => server.stateRequests.filter((r) => r.section === section).length

test('An action refreshes the domains it touches right away (query-actions.ts)', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.standListings = [{ id: 'l-1', slot: 3, item: { name: 'ironore' }, price: 500, quantity: 1 }]
  await server.install(page)

  await page.goto('/stand')
  await expect(page.getByText('Iron Ore')).toBeVisible()
  await page.waitForTimeout(500)
  const marketBefore = count(server, 'market')
  const remove = page.getByRole('button', { name: 'Remove Iron Ore from stand' })
  await remove.click()
  await expect(remove).toContainText('Really remove?')
  await remove.click()
  // merchant/stand is a "commerce" action: market refreshes immediately, not on its 10s timer.
  await expect.poll(() => count(server, 'market'), { timeout: 3_000 }).toBeGreaterThan(marketBefore)
})

test('The bank polls faster while the Bank screen is open', async ({ page }) => {
  test.setTimeout(60_000)
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  await server.install(page)

  await page.goto('/')
  await page.waitForTimeout(7_000)
  const idle = count(server, 'bank')
  await page.goto('/bank')
  const start = count(server, 'bank')
  await page.waitForTimeout(7_000)
  expect(idle).toBeLessThanOrEqual(2)
  expect(count(server, 'bank') - start).toBeGreaterThanOrEqual(3)
})

test('While the live stream is down, characters still arrive via the fast/inventory fallback', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50, items: [{ name: 'ironore', q: 5 }] })
  await server.install(page)
  await page.route('**/party-api/dashboard-stream', (route) => route.abort())

  await page.goto('/')
  await expect.poll(() => count(server, 'fast'), { timeout: 15_000 }).toBeGreaterThan(0)
  await expect.poll(() => count(server, 'inventory'), { timeout: 15_000 }).toBeGreaterThan(0)
  // A live row (vitals), not just a pending card for the slot.
  await expect(page.getByText('HP 100/100')).toBeVisible({ timeout: 10_000 })
})
