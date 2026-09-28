import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

test('Bank: Deconstruct removes the item from its pack', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.bankGold = 1000
  server.bankPacks = { items1: [{ slot: 0, item: { name: 'ironore', level: 0, q: 5 } }] }
  await server.install(page)

  await page.goto('/bank')
  await expect(page.getByText('Iron Ore')).toBeVisible()

  await page.getByText('Iron Ore').click()
  await page.getByRole('button', { name: 'Deconstruct' }).click()

  // The pack itself stays (the app filters out an all-null pack rather
  // than deleting the key), so the item disappearing is the assertion.
  await expect(page.getByText('Iron Ore')).not.toBeVisible()
})

test('Mail: Collect marks the attachment as taken', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.mailMessages = [{ id: 'mail-1', from: 'Warriorname', subject: 'Loot', item: { name: 'ironore' }, taken: false }]
  await server.install(page)

  await page.goto('/mail')
  await expect(page.getByRole('button', { name: 'Collect' })).toBeVisible()
  await page.getByRole('button', { name: 'Collect' }).click()

  await expect(page.getByRole('button', { name: 'Collect' })).not.toBeVisible()
  await expect(page.getByText('(collected)')).toBeVisible()
})

test('Stand: Remove drops a listing', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.standListings = [{ id: 'listing-1', slot: 3, item: { name: 'ironore', level: 0 }, price: 500, quantity: 1 }]
  await server.install(page)
  // markForStand's remove call identifies the listing by slot, not id (see
  // StandScreen.tsx's Remove button) - patch the generic merchant/** no-op
  // default with the one behavior this test needs.
  await page.route('**/party-api/merchant/stand', async (route) => {
    const body = route.request().postDataJSON() as { remove?: boolean; slot?: number }
    if (body.remove) server.standListings = server.standListings.filter((listing) => listing.slot !== body.slot)
    await route.fulfill({ json: { ok: true } })
  })

  await page.goto('/stand')
  await expect(page.getByText('Iron Ore')).toBeVisible()
  await page.getByRole('button', { name: 'Remove' }).click()

  await expect(page.getByText('Nothing listed on the stand.')).toBeVisible()
})
