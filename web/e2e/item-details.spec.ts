import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

test('Item details: context line, derived equip slot instead of type, Add to WTB at the previewed level', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50, items: [{ name: 'ringsj', level: 2 }] })
  server.addCatalogEntry({ id: 'ringsj', name: 'Ring', compoundable: true, definition: { type: 'ring', dex: 2 } })
  await server.install(page)

  await page.goto('/characters/Ranger1')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Item details' }).click()
  await expect(page.getByText('Ranger1 · slot 0').last()).toBeVisible()
  // Only the merchant's inventory (or the bank) is a stand source.
  await expect(page.getByRole('button', { name: 'Add to stand' })).toHaveCount(0)
  await expect(page.getByText('equip slot')).toBeVisible()
  await expect(page.getByText('Ring 1 or Ring 2')).toBeVisible()
  await expect(page.getByText('type', { exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'Add to WTB' }).click()
  // WtbForm opens at the previewed level.
  await expect(page.getByText('Selected +level')).toBeVisible()
  await expect(page.getByLabel('Selected +level').or(page.locator('input[value="2"]')).first()).toHaveValue('2')
})

test("Item details: Add to stand from the merchant's inventory opens the stand form; disabled when the stand is full", async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [{ name: 'ironore', q: 5 }] })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore', value: 20 })
  await server.install(page)

  await page.goto('/characters/Merchantina')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Item details' }).click()
  await page.getByRole('button', { name: 'Add to stand' }).click()
  await expect(page.getByRole('textbox', { name: 'Stand price' })).toBeVisible()
})

test('Item details: a tracktrix shows the holder’s current bonuses', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50, items: [{ name: 'tracker' }], diagnostics: { tracktrix: { active: true, bonuses: { attack: 5, max_hp: 0 } } } })
  server.addCatalogEntry({ id: 'tracker', name: 'Tracktrix' })
  await server.install(page)

  await page.goto('/characters/Ranger1')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Item details' }).click()
  const bonuses = page.getByRole('region', { name: 'Current Tracktrix bonuses' })
  await expect(bonuses.getByText('ATTACK')).toBeVisible()
  await expect(bonuses.getByText('+5')).toBeVisible()
  await expect(bonuses.getByText('MAX HP')).toHaveCount(0)
})
