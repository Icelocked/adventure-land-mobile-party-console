import { test, expect } from '@playwright/test'
import { OwnersSet2Mock } from './fixtures/ownersSet2Mock'

// OWNERS-PORT-MAP.md B17: core merchantReady holds a queued fishing or mining job until the
// merchant jobs owner's plan lists it (merchant-card-controls.tsx).

test("B17: a queued gathering job is blocked until core's merchantReady lists it, with no extra due-mode rows", async ({ page }) => {
  const server = new OwnersSet2Mock()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.gatheringModes = ['fishing', 'mining']
  server.merchantQueue = [
    { id: 'g1', reason: 'fishing', target: 'Patinder', priority: 20 },
    { id: 'g2', reason: 'mining', target: 'Patinder', priority: 20 },
  ]
  server.extraState = { merchantReady: [{ id: 'g1', reason: 'fishing', target: 'Patinder', priority: 20, realm: null }] }
  await server.install(page)

  await page.goto('/characters/Patinder')
  const logistics = page.getByRole('region', { name: /Merchant logistics/ })
  // One row per job: the label, then the status on the right.
  const rows = logistics.locator('.font-mono > div')
  const fishing = rows.filter({ hasText: 'Fishing' })
  const mining = rows.filter({ hasText: 'Mining' })
  await expect(fishing).toHaveCount(1)
  await expect(fishing).toContainText('queued')
  await expect(mining).toHaveCount(1)
  await expect(mining).toContainText('BLOCKED')
  await expect(mining.getByTitle("Not ready in the merchant's plan")).toBeVisible()
})

test("B17: the market and stand screens hold GET /market-watch, and the market shows each feed's age", async ({ page }) => {
  const server = new OwnersSet2Mock()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.marketUpdatedAt = { aldata: Date.now() - 65_000, ponty: Date.now() - 5_000 }
  await server.install(page)

  await page.goto('/market')
  await expect.poll(() => server.marketWatchOpens).toBe(1)
  // market-age.ts: whole seconds per feed, ALData first.
  await expect(page.locator('[data-market-age]')).toHaveText(/^ALData 1m [5-9]s old · Ponty [5-9]s old$/)

  await page.goto('/stand')
  await expect.poll(() => server.marketWatchOpens).toBe(2)
})
