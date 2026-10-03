import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

const warrior = { id: 'warrior', name: 'Warrior' }
const mage = { id: 'mage', name: 'Mage' }

function catalogServer() {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore', definition: { type: 'material' } })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat', upgradeable: true, maxLevel: 10, definition: { type: 'chest', tier: 2, armor: 20, set: 'wolf' }, usage: { classes: [warrior, mage] } })
  server.addCatalogEntry({ id: 'coat', name: 'Coat', upgradeable: true, maxLevel: 10, definition: { type: 'chest', tier: 1, armor: 10 }, usage: { classes: [warrior, mage] } })
  server.addCatalogEntry({ id: 'plate', name: 'Plate Armor', upgradeable: true, maxLevel: 10, definition: { type: 'chest', tier: 3, armor: 40, resistance: 5 }, usage: { classes: [warrior] } })
  server.addCatalogEntry({ id: 'blade', name: 'Blade', upgradeable: true, maxLevel: 10, definition: { type: 'weapon', tier: 1, attack: 30, wtype: 'sword' }, usage: { classes: [warrior] } })
  return server
}

test('Equipment catalog: equipment only, sorts with the sorted stat, type and class filters, exclusive gear, details with WTB', async ({ page }) => {
  const server = catalogServer()
  await server.install(page)
  await page.goto('/catalog')

  const names = () => page.locator('.grid > div > button > p:first-of-type').allTextContents()
  await expect.poll(names).toEqual(['Plate Armor', 'Wolf Coat', 'Blade', 'Coat'])
  await expect(page.getByText('Iron Ore')).toHaveCount(0)
  await expect(page.getByText(/^4 items · sorted by Tier$/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /^Wolf Coat chest · T2 wolf$/ })).toBeVisible()

  await page.getByLabel('Sort equipment').selectOption('attack')
  await expect(page.getByRole('button', { name: /^Blade weapon · T1 ATTACK 30$/ })).toBeVisible()
  await page.getByRole('group', { name: 'Equipment types' }).getByRole('button', { name: 'chest' }).click()
  await expect.poll(names).toEqual(['Coat', 'Plate Armor', 'Wolf Coat'])

  await page.getByRole('button', { name: 'Mage' }).click()
  await expect.poll(names).toEqual(['Coat', 'Wolf Coat'])
  await expect(page.getByText(/· usable by every selected class$/i)).toBeVisible()
  await page.getByRole('button', { name: 'Mage' }).click()
  await page.getByRole('button', { name: 'Warrior' }).click()
  await page.getByRole('checkbox', { name: 'Exclusive gear' }).check()
  await expect.poll(names).toEqual(['Plate Armor'])
  await expect(page.getByText(/· usable only by the selected classes$/i)).toBeVisible()

  await page.getByRole('button', { name: 'All classes' }).click()
  await expect(page.getByRole('checkbox', { name: 'Exclusive gear' })).toBeDisabled()
  await page.getByPlaceholder('Search equipment, ID, or set…').fill('wolf')
  await expect.poll(names).toEqual(['Wolf Coat'])
  await page.getByRole('button', { name: /^Wolf Coat/ }).click()
  await expect(page.getByRole('button', { name: 'Add to WTB' })).toBeVisible()
})

test('Catalog comparison: From catalog starts with A, adds up to three, compares with deltas, and returns to the catalog', async ({ page }) => {
  const server = catalogServer()
  await server.install(page)
  await page.goto('/catalog')

  await page.getByRole('button', { name: /^Wolf Coat/ }).click()
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await page.getByRole('group', { name: 'Compare for' }).getByRole('button', { name: 'From catalog' }).click()

  const controls = page.getByRole('group', { name: 'Catalog comparison' })
  await expect(controls.getByText('A: Wolf Coat +0')).toBeVisible()
  await expect(controls.getByText('0/3 selected')).toBeVisible()
  await expect(controls.getByRole('button', { name: 'Compare selected' })).toBeDisabled()
  await expect(page.getByRole('group', { name: 'Equipment types' }).getByRole('button', { name: 'chest' })).toHaveAttribute('aria-pressed', 'true')

  const tile = (name: string) => page.locator('.grid > div', { has: page.getByRole('button', { name: new RegExp(`^${name}`) }) })
  await tile('Plate Armor').getByRole('button', { name: 'Add to compare' }).click()
  await tile('Coat').getByRole('button', { name: 'Add to compare' }).click()
  await expect(tile('Plate Armor').getByRole('button', { name: 'Added to compare' })).toBeDisabled()
  await expect(controls.getByText('2/3 selected')).toBeVisible()
  await expect(controls.getByRole('button', { name: 'Remove Plate Armor' })).toHaveText('B: Plate Armor ×')

  await controls.getByRole('button', { name: 'Compare selected' }).click()
  const table = page.getByRole('table')
  await expect(table.getByText('A · Baseline')).toBeVisible()
  await expect(table.getByRole('row', { name: /^armor 20 40\s?\(\+20 · \+100%\) 10\s?\(-10 · -50%\)$/i })).toBeVisible()
  await table.getByRole('button', { name: 'Remove C Coat' }).click()
  await expect(table.getByText('C · vs A')).toHaveCount(0)
  await page.getByRole('button', { name: 'Back to catalog · 1/3 selected' }).click()
  await page.getByRole('button', { name: 'Cancel comparison' }).click()
  await expect(controls).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add to compare' })).toHaveCount(0)
})
