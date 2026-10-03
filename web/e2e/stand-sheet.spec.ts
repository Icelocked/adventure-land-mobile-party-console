import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function bidBodies(page: Page): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/party-api/merchant/bid')) bodies.push(request.postDataJSON())
  })
  return bodies
}

test('Inspect stand: sales reconciled with trade slots, buy orders with priority, and the menu count', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({
    name: 'Merchantina',
    ctype: 'merchant',
    level: 30,
    diagnostics: { standOpen: true },
    slots: {
      trade1: { item: { name: 'ironore', q: 2, price: 500 } },
      trade2: { item: { name: 'wcoat', price: 900 } },
      trade3: { item: { name: 'bow', level: 3, price: 7000, q: 5, b: true } },
    },
  })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat' })
  server.addCatalogEntry({ id: 'bow', name: 'Bow', upgradeable: true })
  server.addCatalogEntry({ id: 'gem0', name: 'Green Gem' })
  server.standListings = [
    { id: 'l-1', slot: 4, item: { name: 'ironore' }, price: 500, quantity: 2, state: 'live', tradeSlot: 'trade1' },
    { id: 'l-2', slot: 9, item: { name: 'gem0' }, price: 50, quantity: 1, state: 'paused' },
  ]
  server.standBids = { bow: { price: 7000, quantity: 3, minimumQuality: 3, revision: 2, priorityOverride: 40 } }
  await server.install(page)
  const bodies = bidBodies(page)

  await page.goto('/stand')
  await expect(page.getByText('Items for sale · 2/16 slots')).toBeVisible()
  await expect(page.getByText('Stand open')).toBeVisible()
  const sales = page.getByRole('region', { name: 'Items for sale' })
  await expect(sales.getByRole('group', { name: 'Sale Iron Ore' }).getByText('Live', { exact: true })).toBeVisible()
  // trade2 is on the stand but not managed by the console: read-only.
  await expect(sales.getByRole('button', { name: 'Edit sale price for wcoat' })).toBeDisabled()
  await expect(sales.getByRole('button', { name: 'Remove Wolf Coat from stand' })).toHaveCount(0)
  const queued = page.getByRole('region', { name: 'Queued sales for stand' })
  await expect(queued.getByText('Paused', { exact: true })).toBeVisible()

  await expect(page.getByText('Buy orders · 1/16 slots')).toBeVisible()
  const buy = page.getByRole('group', { name: 'Buy order Bow' })
  await expect(buy.getByText('3 wanted')).toBeVisible()
  await expect(buy.getByText('Native batch: 5')).toBeVisible()
  await buy.getByLabel('Priority override').fill('70')
  await buy.getByLabel('Priority override').press('Enter')
  await expect.poll(() => bodies[0]).toMatchObject({ itemId: 'bow', priorityOverride: 70, editField: 'priorityOverride', value: 70, bidRevision: 2 })

  await page.goto('/characters/Merchantina')
  await page.getByRole('button', { name: 'Menu' }).click()
  await expect(page.getByRole('button', { name: 'Inspect stand · 3/16' })).toBeVisible()
})
