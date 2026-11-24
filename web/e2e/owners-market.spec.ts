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
