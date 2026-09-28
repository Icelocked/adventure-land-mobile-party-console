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
