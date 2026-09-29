import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

test('Bank: deconstruction options are hidden unless the item is actually deconstructible', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat' })
  server.bankGold = 1000
  server.bankPacks = {
    items1: [
      { slot: 0, item: { name: 'ironore', level: 0, q: 5 } },
      { slot: 1, item: { name: 'wcoat', level: 0 } },
    ],
  }
  // Only wcoat is deconstructible - matches deconstruction.ts's
  // canDeconstruct requiring a catalog entry to exist at all.
  server.deconstructionCatalog = { wcoat: { compound: false } }
  await server.install(page)

  await page.goto('/bank')
  await page.getByText('Iron Ore').click()
  await expect(page.getByRole('button', { name: 'Mark for deconstruction' })).not.toBeVisible()

  await page.getByText('Wolf Coat').click()
  await page.getByRole('button', { name: 'Mark for deconstruction' }).click()
  await expect(page.getByText('Wolf Coat')).not.toBeVisible()
})

test('Bank: pack header shows occupied/total and free slot count', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  // A 10-slot pack with 2 filled, 8 empty (padded with null, the same
  // fixed-length shape the real bank snapshot sends) - the list view
  // alone gave no way to tell open slots existed at all.
  server.bankPacks = {
    items1: [{ slot: 0, item: { name: 'ironore', level: 0, q: 5 } }, null, null, { slot: 3, item: { name: 'ironore', level: 0 } }, null, null, null, null, null, null],
  }
  await server.install(page)

  await page.goto('/bank')
  await expect(page.getByText('2/10 · 8 free')).toBeVisible()
})

test('Bank: a pack can be collapsed and expanded, hiding and restoring its item rows', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.bankPacks = { items1: [{ slot: 0, item: { name: 'ironore', level: 0, q: 5 } }] }
  await server.install(page)

  await page.goto('/bank')
  await expect(page.getByText('Iron Ore')).toBeVisible()

  await page.getByText('items1').click()
  await expect(page.getByText('Iron Ore')).not.toBeVisible()

  await page.getByText('items1').click()
  await expect(page.getByText('Iron Ore')).toBeVisible()
})

test('Bank: marking for withdrawal is a real toggle, and matches the dashboard by always targeting the merchant', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.bankPacks = { items1: [{ slot: 0, item: { name: 'ironore', level: 0, q: 5 } }] }
  await server.install(page)

  await page.goto('/bank')
  await page.getByText('Iron Ore').click()
  await expect(page.getByRole('button', { name: 'Mark for withdrawal' })).toBeVisible()

  await page.getByRole('button', { name: 'Mark for withdrawal' }).click()
  await expect.poll(() => server.withdrawals.Merchantina?.length).toBe(1)
  await expect(page.getByRole('button', { name: 'Unmark withdrawal' })).toBeVisible()

  await page.getByRole('button', { name: 'Unmark withdrawal' }).click()
  await expect.poll(() => server.withdrawals.Merchantina?.length ?? 0).toBe(0)
  await expect(page.getByRole('button', { name: 'Mark for withdrawal' })).toBeVisible()
})

test('Bank: marking for stand shows as already-marked and can be unmarked', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.bankPacks = { items1: [{ slot: 0, item: { name: 'ironore', level: 0, q: 5 } }] }
  await server.install(page)

  await page.goto('/bank')
  await page.getByText('Iron Ore').click()
  await page.getByRole('button', { name: 'Mark for stand', exact: true }).click()
  await page.getByLabel('Price').fill('100')
  await page.getByRole('button', { name: 'List' }).click()

  await expect(page.getByRole('button', { name: 'Unmark for stand' })).toBeVisible()
  await expect.poll(() => server.standListings.length).toBe(1)

  await page.getByRole('button', { name: 'Unmark for stand' }).click()
  await expect.poll(() => server.standListings.length).toBe(0)
  await expect(page.getByRole('button', { name: 'Mark for stand', exact: true })).toBeVisible()
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

  await page.goto('/stand')
  await expect(page.getByText('Iron Ore')).toBeVisible()
  await page.getByRole('button', { name: 'Remove' }).click()

  await expect(page.getByText('Nothing listed on the stand.')).toBeVisible()
})
