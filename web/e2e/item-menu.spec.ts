import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

test('Item menu: Equip/Compare only for equipment, "Use elixir" for elixirs, compare picks a ring slot', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({
    name: 'Ranger1',
    ctype: 'ranger',
    level: 50,
    items: [{ name: 'ringsj', level: 1 }, { name: 'elixirdex0' }],
    slots: { ring1: { item: { name: 'ringsj', level: 3 } } },
  })
  server.addCatalogEntry({ id: 'ringsj', name: 'Ring', compoundable: true, definition: { type: 'ring', name: 'Ring' } })
  server.addCatalogEntry({ id: 'elixirdex0', name: 'Elixir', definition: { type: 'elixir' } })
  await server.install(page)

  await page.goto('/characters/Ranger1')
  await page.getByRole('region', { name: 'Inventory' }).getByTestId('inventory-slot-0').click()
  await expect(page.getByRole('button', { name: 'Equip', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Use/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Compare with equipped' }).click()
  await expect(page.getByRole('button', { name: /Ring 1\s*Ring/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Ring 2\s*Empty/ })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('region', { name: 'Inventory' }).getByTestId('inventory-slot-1').click()
  await expect(page.getByRole('button', { name: 'Use elixir' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Equip', exact: true })).toHaveCount(0)
})

test('Item menu: with no merchant configured the merchant-only actions are hidden', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50, items: [{ name: 'ironore', q: 3 }] })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.merchantCharacter = null
  await server.install(page)

  await page.goto('/characters/Ranger1')
  await page.getByTestId('inventory-slot-0').click()
  await expect(page.getByRole('button', { name: 'Mark for bank', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mark for merchant', exact: true })).toBeVisible()
  for (const name of ['Auto mark for bank', 'Sell to NPC…', 'Auto sell to NPC…', 'Clear all marks']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
})

test('Item menu: marks already set are disabled; Deliver to lists online party members only; Clear all marks appears once marked', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50, items: [{ name: 'ironore', q: 3 }] })
  server.addCharacter({ name: 'Bankboi0', ctype: 'merchant', level: 1 })
  server.merchantCharacter = 'Merchantina'
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.extraState = {
    marked: { Ranger1: [{ slot: 0, item: { name: 'ironore', q: 3 } }] },
    autoItemMarks: { Ranger1: { 'ironore@+0': 'merchant' } },
    bankbois: [{ name: 'Bankboi0', state: 'idle' }],
  }
  await server.install(page)

  await page.goto('/characters/Ranger1')
  await page.getByTestId('inventory-slot-0').click()
  await expect(page.getByRole('button', { name: 'Mark for bank', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Auto mark for merchant', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Mark for merchant', exact: true })).toBeEnabled()
  const clear = page.getByRole('button', { name: 'Clear all marks' })
  await expect(clear).toHaveAttribute('title', 'Clear this item’s manual marks and matching shared automatic rules')

  await page.getByRole('button', { name: 'Deliver to…' }).click()
  await expect(page.getByRole('button', { name: 'Merchantina', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Bankboi0', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ranger1', exact: true })).toHaveCount(0)
})
