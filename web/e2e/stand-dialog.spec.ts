import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

test('Stand dialog: NPC price, market count, presets at the exact level, Market low disabled below the item value', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [{ name: 'ironore', q: 5 }] })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore', value: 100, definition: { buyable: true } })
  server.aldataListings = [
    { key: 'a', item: { name: 'ironore', level: 0 }, price: 90, quantity: 3, seenAt: Date.now() + 600000 },
    { key: 'b', item: { name: 'ironore', level: 0 }, price: 90, quantity: 2, seenAt: 1 },
  ]
  server.extraState = { standPriceHistory: { ironore: { lowest: 90, lowestLevel: 0, recent: 300, recentLevel: 0, highestPublicWTB: 150, highestPublicWTBLevel: 1, seenAt: 1 } } }
  await server.install(page)

  await page.goto('/characters/Merchantina')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Mark for stand', exact: true }).click()
  const form = page.getByRole('group', { name: 'Merchant stand listing' })
  await expect(form.getByText('Current number on market: 3')).toBeVisible()
  await expect(form.getByRole('textbox', { name: 'Stand price' })).toHaveValue('100')
  // 90 × 0.95 is below the item's 100g value.
  await expect(form.getByRole('button', { name: /^Market low −5%/ })).toBeDisabled()
  // The highest public WTB was seen at +1, not this item's +0.
  await expect(form.getByRole('button', { name: /^Highest WTB price/ })).toBeDisabled()
  await form.getByRole('button', { name: /^Recent −5%/ }).click()
  await expect(form.getByRole('textbox', { name: 'Stand price' })).toHaveValue('285')
  await form.getByRole('button', { name: /^Input \+5%/ }).click()
  await expect(form.getByRole('textbox', { name: 'Stand price' })).toHaveValue('299')
  await expect(form.getByRole('textbox', { name: 'Stand quantity' })).toHaveValue('5')
})

test('Stand dialog: a new listing is blocked at 16/16; the automatic variant prefills the rule and says Save auto mark', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [{ name: 'ironore', q: 5 }, { name: 'wcoat' }] })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore', value: 100 })
  server.standListings = Array.from({ length: 16 }, (_, index) => ({ id: `l${index}`, slot: 20 + index, item: { name: 'wcoat' }, price: 10, quantity: 1 }))
  server.extraState = { autoStandMarks: { [JSON.stringify({ name: 'ironore', level: 0, p: null, stat_type: null })]: { item: { name: 'ironore', level: 0 }, price: 777 } } }
  await server.install(page)

  await page.goto('/characters/Merchantina')
  await page.getByTestId('inventory-slot-0').click()
  await expect(page.getByRole('button', { name: 'Mark for stand', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Update auto mark for stand…' }).click()
  const auto = page.getByRole('group', { name: 'Automatic merchant stand listing' })
  await expect(auto.getByText('Set one fixed price. Every future matching item is marked for the stand at this price.')).toBeVisible()
  await expect(auto.getByRole('textbox', { name: 'Stand price' })).toHaveValue('777')
  await expect(auto.getByRole('textbox', { name: 'Stand quantity' })).toHaveCount(0)
  await expect(auto.getByRole('button', { name: 'Save auto mark' })).toBeEnabled()
})
