import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

test('Account menu is reachable from home with no character online, and shows the mail count', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.mailMessages = [{ id: 'mail-1', from: 'Someone', subject: 'Hi', taken: false }]
  await server.install(page)

  await page.goto('/')
  await page.getByRole('button', { name: 'Menu' }).click()
  await expect(page.getByRole('button', { name: 'Mail (1)' })).toBeVisible()
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByRole('button', { name: 'Change server address' })).toBeVisible()
})

test('Account menu includes Merchant routines and WTB orders', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  await server.install(page)

  await page.goto('/')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('button', { name: 'Merchant routines' }).click()
  await expect(page).toHaveURL(/\/routines$/)
})

test('Tapping an item opens its options list; Item details is one of the options', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58, items: [{ name: 'ironore', q: 5 }] })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore', value: 100 })
  await server.install(page)

  await page.goto('/characters/Patinder')
  await page.getByTestId('inventory-slot-0').click()
  const options = page.getByRole('button', { name: 'Item details' })
  await expect(options).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mark for Bank', exact: true })).toBeVisible()
  // The details pane is not shown until asked for.
  await expect(page.getByText('Sell to NPC', { exact: true })).toHaveCount(0)

  await options.click()
  await expect(page.getByText('Sell to NPC', { exact: true })).toBeVisible()
})
