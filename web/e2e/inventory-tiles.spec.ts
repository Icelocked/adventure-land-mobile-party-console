import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

const key = (name: string, level = 0) => JSON.stringify({ name, level, p: null, stat_type: null })

test('Inventory: occupied/total counter, collapsible header, +level only above 0, stat badge and mluck clover', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  const items = Array(42).fill(null)
  items[3] = { name: 'ironore', level: 0, q: 5 }
  items[7] = { name: 'bow', level: 4, stat_type: 'dex', m: true }
  items.fill({ name: 'ironore', q: 1 }, 10, 38)
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50, items })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.addCatalogEntry({ id: 'bow', name: 'Bow', upgradeable: true })
  await server.install(page)

  await page.goto('/characters/Ranger1')
  const inventory = page.getByRole('region', { name: 'Inventory' })
  // inventory-panel.tsx: fewer than 5 free slots is rose, with the free count as the hint.
  const counter = inventory.getByTitle('12 slots free')
  await expect(counter).toHaveText('30/42')
  await expect(counter).toHaveClass(/text-muted-foreground/)
  // Non-merchants get the compact layout: occupied tiles first.
  await expect(inventory.getByTestId('inventory-slot-0')).toHaveAccessibleName('Iron Ore')
  await expect(inventory.getByTestId('inventory-slot-0')).not.toContainText('+0')
  const bow = inventory.getByTestId('inventory-slot-1')
  await expect(bow).toContainText('+4')
  await expect(bow).toContainText('dex')
  await expect(bow.getByLabel("Merchant's Luck duplicate")).toBeVisible()

  await inventory.getByRole('button', { name: 'Inventory' }).click()
  await expect(inventory.getByTestId('inventory-slot-0')).not.toBeVisible()
})

test('Inventory: automatic rules on two families show "Rule conflict"; one shows its own banner', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [null, { name: 'ironore', level: 0, q: 5 }, { name: 'wcoat', level: 0 }] })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat' })
  server.autoNpcSales = { [key('ironore')]: { item: { name: 'ironore', level: 0 } } }
  server.extraState = { autoStandMarks: { [key('ironore')]: { item: { name: 'ironore', level: 0 }, price: 10 }, [key('wcoat')]: { item: { name: 'wcoat', level: 0 }, price: 99 } } }
  await server.install(page)

  await page.goto('/characters/Merchantina')
  const inventory = page.getByRole('region', { name: 'Inventory' })
  await expect(inventory.getByTestId('inventory-slot-1')).toContainText('Rule conflict')
  await expect(inventory.getByTestId('inventory-slot-1').locator('[data-item-action-banner]')).toHaveAttribute('title', 'npc · stand')
  await expect(inventory.getByTestId('inventory-slot-2')).toContainText('Auto stand')
})

test("Inventory: the merchant's empty lucky slot opens the lucky slot data; a long press shows price evidence", async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [null, { name: 'ironore', level: 0, q: 5 }] })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore', value: 20 })
  server.luckyUpgradeSlots = { Merchantina: 0 }
  await server.install(page)

  await page.goto('/characters/Merchantina')
  await page.getByRole('button', { name: /Verified lucky upgrade slot, slot 0/ }).click()
  await page.getByRole('button', { name: 'Show lucky slot data' }).click()
  await expect(page.getByText(/recorded upgrade rolls/)).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByTestId('inventory-slot-1').click({ button: 'right' })
  const details = page.getByRole('dialog', { name: 'Item tile details' })
  await expect(details.getByText('Default price: 20 gold')).toBeVisible()
  await expect(details.getByText('Lowest price seen: Not observed for +0')).toBeVisible()
  await expect(details.getByText('No repeatably farmable source')).toBeVisible()
})

test('Inventory: an in-progress upgrade shows from → to and its success chance', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [null, { name: 'bow', level: 4 }] })
  server.addCatalogEntry({ id: 'bow', name: 'Bow', upgradeable: true })
  // The live inventory carries `operation` on the entry being upgraded.
  server.inventoryOperations = { Merchantina: { 1: { type: 'upgrade', fromLevel: 4, toLevel: 5, chance: 0.5 } } }
  await server.install(page)

  await page.goto('/characters/Merchantina')
  await expect(page.getByLabel('upgrade: +4 to +5, 50.00% success')).toBeVisible()
})

test('Equipment: all 15 slots in dashboard order with Empty tiles; the elixir only shows its effect', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({
    name: 'Ranger1',
    ctype: 'ranger',
    level: 50,
    slots: { mainhand: { item: { name: 'bow', level: 7, stat_type: 'dex' } }, elixir: { item: { name: 'elixirdex0' } } },
  })
  server.addCatalogEntry({ id: 'bow', name: 'Bow', upgradeable: true })
  server.addCatalogEntry({ id: 'elixirdex0', name: 'Elixir of Dexterity' })
  await server.install(page)

  await page.goto('/characters/Ranger1')
  const equipment = page.getByRole('region', { name: 'Equipment' })
  // Slot tiles are named "<slot>: <item>"; the section title is the fold button.
  const tiles = equipment.getByRole('button', { name: /^[a-z0-9 ]+: / })
  await expect(tiles).toHaveCount(16)
  await expect(tiles.nth(0)).toHaveAccessibleName('helmet: Empty')
  await expect(tiles.nth(0)).toBeDisabled()
  await expect(tiles.nth(2)).toHaveAccessibleName('earring 1: Empty')
  await expect(tiles.nth(6)).toHaveAccessibleName('mainhand: Bow')
  await expect(tiles.nth(6)).toContainText('+7')
  await expect(tiles.nth(14)).toHaveAccessibleName('orb: Empty')
  await expect(tiles.nth(15)).toHaveAccessibleName('elixir: Elixir of Dexterity')

  await tiles.nth(15).click()
  await expect(page.getByRole('button', { name: 'Active elixir effect' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Unequip' })).not.toBeVisible()
})

test('Sections fold from their title and stay folded on this device, for every character', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50, slots: { mainhand: { item: { name: 'bow', level: 7 } } } })
  server.addCharacter({ name: 'Mage1', ctype: 'mage', level: 50 })
  server.addCatalogEntry({ id: 'bow', name: 'Bow', upgradeable: true })
  await server.install(page)

  await page.goto('/characters/Ranger1')
  const equipment = page.getByRole('region', { name: 'Equipment' })
  const fold = equipment.getByRole('button', { name: 'Equipment' })
  await expect(fold).toHaveAttribute('aria-expanded', 'true')
  await expect(equipment.getByRole('button', { name: 'mainhand: Bow' })).toBeVisible()
  await fold.click()
  await expect(fold).toHaveAttribute('aria-expanded', 'false')
  await expect(equipment.getByRole('button', { name: 'mainhand: Bow' })).toHaveCount(0)
  // Inventory folds the same way and is independent.
  const inventory = page.getByRole('region', { name: 'Inventory' }).getByRole('button', { name: /Inventory/ })
  await inventory.click()
  await expect(inventory).toHaveAttribute('aria-expanded', 'false')

  await page.reload()
  await expect(page.getByRole('region', { name: 'Equipment' }).getByRole('button', { name: 'Equipment' })).toHaveAttribute('aria-expanded', 'false')
  await page.goto('/characters/Mage1')
  await expect(page.getByRole('region', { name: 'Equipment' }).getByRole('button', { name: 'Equipment' })).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('region', { name: 'Inventory' }).getByRole('button', { name: /Inventory/ })).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('region', { name: 'Formation' }).getByRole('button', { name: 'Formation' })).toHaveAttribute('aria-expanded', 'true')
})
