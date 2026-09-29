import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

test('ItemActionPanel: a failed action shows its error and keeps the panel open', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [{ name: 'wcoat', level: 0 }] })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat' })
  await server.install(page)

  await page.goto('/characters/Merchantina')
  await page.getByTestId('inventory-slot-0').click()

  server.failOnce['merchant/npc-sale'] = 'Item is currently reserved for crafting'
  await page.getByRole('button', { name: 'Mark for NPC Sale' }).click()

  await expect(page.getByText('Item is currently reserved for crafting')).toBeVisible()
  // ItemActionPanel's run() only calls onClose() on success - confirm the
  // sheet is genuinely still open, not just that the error text rendered.
  await expect(page.getByRole('button', { name: 'Mark for NPC Sale' })).toBeVisible()
})

test('ItemActionPanel: marking an item for upgrade shows a badge on its inventory slot', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [{ name: 'wcoat', level: 0 }] })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat', upgradeable: true })
  await server.install(page)

  await page.goto('/characters/Merchantina')
  await page.getByTestId('inventory-slot-0').click()
  // Regression: marking for upgrade used to produce zero visible feedback
  // anywhere in the app (the wire fields for pending one-time marks were
  // never modeled) - the panel just closed and nothing changed on screen.
  await page.getByRole('button', { name: 'Mark for Upgrade', exact: true }).click()
  await page.getByRole('button', { name: /^\+0 → \+1 /, exact: false }).click()

  await expect(page.getByTestId('inventory-slot-0')).toContainText('+0 → +1')
})

test('ItemActionPanel: marking an item for compounding shows a badge on its inventory slot', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [{ name: 'ringo', level: 0 }] })
  server.addCatalogEntry({ id: 'ringo', name: 'Ring of Luck', compoundable: true })
  await server.install(page)

  await page.goto('/characters/Merchantina')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Mark for Compound', exact: true }).click()

  await expect(page.getByTestId('inventory-slot-0')).toContainText('+0 → +1')
})

test('ItemActionPanel: a stale mark for an emptied/replaced slot does not badge the wrong item', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [null, { name: 'wcoat', level: 0 }] })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat' })
  server.addCatalogEntry({ id: 'ringo', name: 'Ring of Luck' })
  // Simulate marks left over from BEFORE the inventory changed - slot 0
  // is empty now, slot 1 holds a totally different item than when it was
  // marked. A slot-number-only match would badge the empty slot AND the
  // wrong item as "Deconstruction" - matching by item identity too must
  // rule both out.
  server.deconstructionMarks = [
    { id: 'stale-1', owner: 'Merchantina', slot: 0, item: { name: 'ringo', level: 0 }, quantity: 1, state: 'collecting' },
    { id: 'stale-2', owner: 'Merchantina', slot: 1, item: { name: 'ringo', level: 3 }, quantity: 1, state: 'collecting' },
  ]
  await server.install(page)

  await page.goto('/characters/Merchantina')
  await expect(page.getByTestId('inventory-slot-0')).not.toContainText('Deconstruction')
  await expect(page.getByTestId('inventory-slot-1')).not.toContainText('Deconstruction')
})

test('ItemActionPanel: an auto NPC sale rule shows a badge on the merchant\'s own inventory', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [{ name: 'ironore', level: 0, q: 5 }] })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  // The standing auto-NPC-sale rule reconciles server-side into its OWN
  // source "merchant" npcSaleMarks entries with no `character` field at
  // all (automatic-sales.ts's markNpcSale) - distinct from the manual
  // "Mark for NPC Sale" action's source "character". Only checking for
  // "character" meant an auto-marked item on the merchant never badged.
  server.npcSaleMarks = [{ id: 'auto-1', source: 'merchant', slot: 0, item: { name: 'ironore', level: 0 }, quantity: 5 }]
  await server.install(page)

  await page.goto('/characters/Merchantina')
  await expect(page.getByTestId('inventory-slot-0')).toContainText('NPC sale')
})

test('ItemActionPanel: marking an item for NPC sale shows a badge on its inventory slot', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [{ name: 'wcoat', level: 0 }] })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat' })
  await server.install(page)

  await page.goto('/characters/Merchantina')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Mark for NPC Sale' }).click()

  await expect(page.getByTestId('inventory-slot-0')).toContainText('NPC sale')
})

test('ItemActionPanel: marking an item for deconstruction shows a badge on its inventory slot', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [{ name: 'wcoat', level: 0 }] })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat' })
  await server.install(page)

  await page.goto('/characters/Merchantina')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Mark for Deconstruction' }).click()

  await expect(page.getByTestId('inventory-slot-0')).toContainText('Deconstruction')
})

test('Hunt settings: Clear all requires confirmation before it actually clears the blacklist', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.huntBlacklist = { osnake: { monsterId: 'osnake', at: Date.now(), deaths: 4, reason: 'deaths' } }
  await server.install(page)

  await page.goto('/hunt-settings')
  await expect(page.getByText('osnake')).toBeVisible()

  await page.getByRole('button', { name: 'Clear all' }).click()
  // A confirmation step must appear - the blacklist is not cleared yet.
  await expect(page.getByText('Really clear all?')).toBeVisible()
  await expect(page.getByText('osnake')).toBeVisible()

  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByText('Really clear all?')).not.toBeVisible()
  await expect(page.getByText('osnake')).toBeVisible()

  await page.getByRole('button', { name: 'Clear all' }).click()
  await page.getByRole('button', { name: 'Clear all', exact: true }).click()
  await expect(page.getByText('No monsters blacklisted.')).toBeVisible()
})
