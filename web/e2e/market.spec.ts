import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function postBodies(page: Page, path: string): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/party-api/${path}`)) bodies.push(request.postDataJSON())
  })
  return bodies
}

const base = () => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [{ name: 'wcoat', level: 0 }] })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore', value: 100 })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat', value: 1000 })
  return server
}
const fresh = () => Date.now() + 600_000
const listing = (key: string, fields: Record<string, unknown>) => ({
  key,
  source: 'aldata',
  seller: 'Seller1',
  serverRegion: 'US',
  serverIdentifier: 'I',
  map: 'main',
  seenAt: fresh(),
  item: { name: 'ironore', level: 0 },
  price: 40,
  quantity: 3,
  ...fields,
})

test('Live WTS: grouped listings with deal colouring, a confirmed buy split across them, Make WTB when stale, and the setup banner', async ({ page }) => {
  const server = base()
  server.extraState = {
    aldata: {
      auth: 'NO',
      merchantsUpdatedAt: 1,
      listings: [listing('a', {}), listing('b', {}), listing('c', { seller: 'Seller2', item: { name: 'wcoat', level: 0 }, price: 5000, quantity: 1, seenAt: 1 })],
    },
  }
  await server.install(page)
  const bodies = postBodies(page, 'merchant/aldata-order')

  await page.goto('/market')
  await expect(page.getByText('ALData publishing is not configured')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Go to setup' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Live WTS (3)' })).toBeVisible()

  const ore = page.getByRole('group', { name: 'WTS Iron Ore from Seller1' })
  await expect(ore.getByText(/· 6 available/)).toBeVisible()
  await expect(ore.getByText(/deal · 60% off/i)).toBeVisible()
  await ore.getByRole('button', { name: 'All' }).click()
  await ore.getByRole('button', { name: 'Buy' }).click()
  await expect(ore.getByText('Really buy 6 Iron Ore for 240g?')).toBeVisible()
  expect(bodies).toHaveLength(0)
  await ore.getByRole('button', { name: 'Yes' }).click()
  await expect.poll(() => bodies.length).toBe(2)
  expect(bodies.map((body) => [(body.listing as { key: string }).key, body.buyQuantity])).toEqual([
    ['a', 3],
    ['b', 3],
  ])

  // Stale: "Make WTB" opens the WTB dialog for that item instead of a buy.
  const coat = page.getByRole('group', { name: 'WTS Wolf Coat from Seller2' })
  await expect(coat.getByText(/400% above/i)).toBeVisible()
  await coat.getByRole('button', { name: 'Make WTB' }).click()
  await expect(page.getByRole('dialog', { name: 'Add to WTB' })).toBeVisible()
})

test('Live WTS filters: deals only, unaffordable with bank gold, blacklisted merchants hidden by default', async ({ page }) => {
  const server = base()
  server.bankGold = 1000
  server.extraState = {
    aldata: { auth: 'CORRECT', merchantsUpdatedAt: 1, listings: [listing('a', {}), listing('b', { seller: 'Banned', price: 60 }), listing('c', { seller: 'Pricey', price: 5000, item: { name: 'wcoat' } })] },
    merchantBlacklist: { 'Banned||': { reason: 'manual', until: -1 } },
  }
  await server.install(page)

  await page.goto('/market')
  await expect(page.getByRole('group', { name: 'WTS Iron Ore from Seller1' })).toBeVisible()
  await expect(page.getByRole('group', { name: /from Banned/ })).toHaveCount(0)
  await page.getByRole('checkbox', { name: 'Hide blacklisted merchants' }).uncheck()
  await expect(page.getByRole('group', { name: /from Banned/ })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Hide unaffordable' }).check()
  await expect(page.getByRole('group', { name: /from Pricey/ })).toHaveCount(0)
  await page.getByRole('checkbox', { name: 'Show deals only' }).check()
  await expect(page.getByRole('group', { name: /from Banned/ })).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'WTS Iron Ore from Seller1' })).toBeVisible()
})

test('Live WTB: owned offers sell after confirming; a stale owned offer offers List at the WTB price', async ({ page }) => {
  const server = base()
  const order = (key: string, fields: Record<string, unknown>) => ({ key, source: 'aldata', buyer: 'Buyer1', serverRegion: 'EU', serverIdentifier: 'II', map: 'main', seenAt: fresh(), item: { name: 'wcoat', level: 0 }, price: 2500, quantity: 2, ...fields })
  server.extraState = {
    aldata: { auth: 'CORRECT', merchantsUpdatedAt: 1, listings: [], buyOrders: [order('o1', {}), order('o2', { buyer: 'Buyer2', seenAt: 1, price: 2200 }), order('o3', { buyer: 'Buyer3', item: { name: 'ironore' } })] },
  }
  await server.install(page)
  const sales = postBodies(page, 'merchant/aldata-sale')

  await page.goto('/market')
  await page.getByRole('tab', { name: 'Live WTB (3)' }).click()
  await expect(page.getByText('2 offers match exact items currently held by Merchantina or recorded in the bank.')).toBeVisible()
  const live = page.getByRole('group', { name: 'WTB Wolf Coat from Buyer1' })
  await expect(live.getByText('You have 1')).toBeVisible()
  await live.getByRole('button', { name: 'Sell' }).click()
  await live.getByRole('button', { name: 'Yes' }).click()
  await expect.poll(() => sales[0]).toMatchObject({ order: { key: 'o1' }, sellQuantity: 1 })

  await expect(page.getByRole('group', { name: 'WTB Iron Ore from Buyer3' }).getByText(/^no match owned$/i)).toBeVisible()
  const stale = page.getByRole('group', { name: 'WTB Wolf Coat from Buyer2' })
  await stale.getByRole('button', { name: 'List' }).click()
  await expect(stale.getByRole('textbox', { name: 'Stand price' })).toHaveValue('2200')

  await page.getByRole('checkbox', { name: 'Hide unowned' }).check()
  await expect(page.getByRole('group', { name: 'WTB Iron Ore from Buyer3' })).toHaveCount(0)
})

test('Ponty: realms grouped into one lot, stale rows cannot be bought, the confirmed buy sends every key', async ({ page }) => {
  const server = base()
  server.extraState = {
    aldata: { auth: 'CORRECT', merchantsUpdatedAt: 1, listings: [] },
    ponty: {
      listings: [
        { key: 'p-1', groupKey: 'g', item: { name: 'ironore' }, price: 300, unitPrice: 100, quantity: 3, serverRegion: 'US', serverIdentifier: 'I', seenAt: fresh() },
        { key: 'p-2', groupKey: 'g', item: { name: 'ironore' }, price: 220, unitPrice: 110, quantity: 2, serverRegion: 'EU', serverIdentifier: 'I', seenAt: fresh() },
        { key: 'p-3', item: { name: 'wcoat' }, price: 900, unitPrice: 900, quantity: 1, serverRegion: 'US', serverIdentifier: 'I', seenAt: 1 },
      ],
    },
  }
  server.standBids = { ironore: { price: 150, quantity: 5, minimumQuality: 0 } }
  await server.install(page)
  const bodies = postBodies(page, 'merchant/ponty-order')

  await page.goto('/market')
  await page.getByRole('tab', { name: 'Ponty (3)' }).click()
  const ore = page.getByRole('group', { name: 'Ponty Iron Ore' })
  await expect(ore.getByText('Mixed realms · 5 available · 110g each')).toBeVisible()
  await expect(ore.getByText('Matches WTB')).toBeVisible()
  await expect(ore.getByLabel('Ponty quantity for Iron Ore')).toHaveValue('2')
  await expect(page.getByRole('group', { name: 'Ponty Wolf Coat' }).getByRole('button', { name: 'Buy' })).toBeDisabled()
  await ore.getByLabel('Ponty quantity for Iron Ore').fill('4')
  await expect(ore.getByText('Up to 440g')).toBeVisible()
  await ore.getByRole('button', { name: 'Buy' }).click()
  await ore.getByRole('button', { name: 'Yes' }).click()
  await expect.poll(() => bodies[0]).toEqual({ keys: ['p-1', 'p-2'], quantity: 4, unitPrice: 110 })
})
