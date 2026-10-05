import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

test('Character detail: lucky slot section shows real test results, not just that testing is happening', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.luckySlotTracking = {
    Merchantina: {
      'stream-1': {
        version: 1,
        slots: {
          '5': { totalRolls: 150, sumRolls: 12, rollsAbove96_3: 130, perfectRolls: 8 },
          '12': { totalRolls: 20, sumRolls: 5, rollsAbove96_3: 2, perfectRolls: 0 },
        },
      },
    },
  }
  server.luckyUpgradeSlots = { Merchantina: 5 }
  await server.install(page)

  await page.goto('/characters/Merchantina')
  await expect(page.getByText('Verified slot: 5.')).toBeVisible()

  await page.getByRole('button', { name: 'Show lucky slot data' }).click()
  await expect(page.getByText('170 recorded upgrade rolls')).toBeVisible()
  await expect(page.getByText('2/42 slots sampled')).toBeVisible()
})

test('ItemActionPanel: a failed action shows its error and keeps the panel open', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [{ name: 'wcoat', level: 0 }] })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat' })
  await server.install(page)

  await page.goto('/characters/Merchantina')
  await page.getByTestId('inventory-slot-0').click()

  server.failOnce['merchant/npc-sale'] = 'Item is currently reserved for crafting'
  await page.getByRole('button', { name: 'Sell to NPC…', exact: true }).click()
  await page.getByRole('group', { name: 'Sell to NPC' }).getByRole('button', { name: 'Sell to NPC' }).click()

  await expect(page.getByText('Item is currently reserved for crafting')).toBeVisible()
  // The panel only closes on success, so the sheet must still be open.
  await expect(page.getByRole('button', { name: 'Sell to NPC…', exact: true })).toBeVisible()
})

test('ItemActionPanel: marking an item for upgrade shows a badge on its inventory slot', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [{ name: 'wcoat', level: 0 }] })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat', upgradeable: true })
  await server.install(page)

  await page.goto('/characters/Merchantina')
  await page.getByTestId('inventory-slot-0').click()
  // Failure mode: marking for upgrade closes the panel with no visible
  // change anywhere.
  await page.getByRole('button', { name: 'Mark for upgrade', exact: true }).click()
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
  await page.getByRole('button', { name: 'Mark for compounding' }).click()

  await expect(page.getByTestId('inventory-slot-0')).toContainText('+0 → +1')
})

test('ItemActionPanel: a stale mark for an emptied/replaced slot does not badge the wrong item', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [null, { name: 'wcoat', level: 0 }] })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat' })
  server.addCatalogEntry({ id: 'ringo', name: 'Ring of Luck' })
  // Stale marks: slot 0 is now empty and slot 1 holds a different item.
  // Matching by item as well as slot must badge neither.
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
  // The auto-NPC-sale rule creates source "merchant" npcSaleMarks with no
  // `character` field, unlike the manual action's source "character"; both
  // must badge.
  server.npcSaleMarks = [{ id: 'auto-1', source: 'merchant', slot: 0, item: { name: 'ironore', level: 0 }, quantity: 5 }]
  await server.install(page)

  await page.goto('/characters/Merchantina')
  await expect(page.getByTestId('inventory-slot-0')).toContainText('NPC sale')
})

test('ItemActionPanel: marking a modified item for NPC sale from the merchant works and requires confirming the warning', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  // +3 makes this a modified item, which the server refuses to sell without
  // an acknowledgement. The merchant's own items must use source "merchant";
  // "character" is refused ("Unknown player character").
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [{ name: 'wcoat', level: 3 }] })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat' })
  await server.install(page)

  await page.goto('/characters/Merchantina')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Sell to NPC…', exact: true }).click()

  // The confirmation sheet shows the warning, and selling is refused
  // until it's acknowledged (use-party-console.tsx confirmNpcSale).
  const sheet = page.getByRole('group', { name: 'Sell to NPC' })
  await expect(sheet.getByText('permanently destroy it')).toBeVisible()
  await sheet.getByRole('button', { name: 'Sell to NPC' }).click()
  await expect(sheet.getByText('Confirm the modified-item warning')).toBeVisible()

  await sheet.getByRole('checkbox').check()
  await sheet.getByRole('button', { name: 'Sell to NPC' }).click()

  await expect(page.getByTestId('inventory-slot-0')).toContainText('NPC sale')
})

test('Bank: selling a modified item to NPC requires confirming the warning first', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat' })
  server.bankPacks = { items1: [{ slot: 0, item: { name: 'wcoat', level: 2 } }] }
  await server.install(page)

  await page.goto('/bank')
  await page.getByText('Wolf Coat').click()
  await page.getByRole('button', { name: 'Sell to NPC…', exact: true }).click()

  const sheet = page.getByRole('group', { name: 'Sell to NPC' })
  await expect(sheet.getByText('permanently destroy it')).toBeVisible()
  await sheet.getByRole('checkbox').check()
  await sheet.getByRole('button', { name: 'Sell to NPC' }).click()

  // The sale panel (which names the item) closes once the sale is queued.
  await expect(page.getByRole('group', { name: 'Sell to NPC' })).toHaveCount(0)
  await expect(page.getByText('Wolf Coat')).toBeVisible()
  await expect(page.getByText('NPC', { exact: true })).toBeVisible()
})

test('ItemActionPanel: marking an item for NPC sale shows a badge on its inventory slot', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [{ name: 'wcoat', level: 0 }] })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat' })
  await server.install(page)

  await page.goto('/characters/Merchantina')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Sell to NPC…', exact: true }).click()
  await page.getByRole('group', { name: 'Sell to NPC' }).getByRole('button', { name: 'Sell to NPC' }).click()

  await expect(page.getByTestId('inventory-slot-0')).toContainText('NPC sale')
})

test('ItemActionPanel: marking an item for deconstruction shows a badge on its inventory slot', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [{ name: 'wcoat', level: 0 }] })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat' })
  // inventory-panel.tsx only offers deconstruction for catalogued items.
  server.deconstructionCatalog = { wcoat: { compound: false, rewards: [{ name: 'leather', quantity: 1, chance: 1 }] } }
  await server.install(page)

  await page.goto('/characters/Merchantina')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Mark for deconstruction', exact: true }).click()
  await page.getByRole('group', { name: 'Mark for deconstruction?' }).getByRole('button', { name: 'Mark for deconstruction' }).click()

  await expect(page.getByTestId('inventory-slot-0')).toContainText('Deconstruction')
})

test('ItemActionPanel: delivering an item to another character shows it queued on the merchant\'s inventory', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [{ name: 'wcoat', level: 0 }] })
  server.addCharacter({ name: 'Warriorname', ctype: 'warrior', level: 20 })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat' })
  await server.install(page)

  await page.goto('/characters/Merchantina')
  await page.getByTestId('inventory-slot-0').click()
  // A marked delivery must stay visible after the panel closes.
  await page.getByRole('button', { name: 'Deliver to…' }).click()
  await page.getByRole('button', { name: /Warriorname/ }).click()

  await expect(page.getByTestId('inventory-slot-0')).toContainText('To Warriorname')
})

test('Hunt settings: Clear all requires confirmation before it actually clears the blacklist', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'MainLeader', ctype: 'warrior', level: 60 })
  server.leader = 'MainLeader'
  server.huntBlacklist = { osnake: { monsterId: 'osnake', at: Date.now(), deaths: 4, reason: 'deaths' } }
  await server.install(page)

  await page.goto('/characters/MainLeader/hunt-settings')
  await expect(page.getByText('osnake')).toBeVisible()

  await page.getByRole('button', { name: 'Clear all' }).click()
  // A confirmation step must appear - the blacklist is not cleared yet.
  await expect(page.getByText(/^Remove all \d+ blacklisted monsters for /)).toBeVisible()
  await expect(page.getByText('osnake')).toBeVisible()

  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByText(/^Remove all \d+ blacklisted monsters for /)).not.toBeVisible()
  await expect(page.getByText('osnake')).toBeVisible()

  await page.getByRole('button', { name: 'Clear all' }).click()
  await page.getByRole('button', { name: 'Clear all', exact: true }).click()
  await expect(page.getByText('No monsters blacklisted.')).toBeVisible()
})
