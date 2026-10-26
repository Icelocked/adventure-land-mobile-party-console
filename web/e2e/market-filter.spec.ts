import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

// The console fork's market filter and Watch action (topic15/ponty-ron-buys):
// dashboard/features/party/market-filter-bar.tsx over market-filter.ts, and
// commerce/npc-shop.ts stamping firstSeenAt on Ponty and ALData listings.

const now = Date.now()
const ponty = (rid: string, name: string, level: number, unitPrice: number, firstSeenAt: number) => ({
  key: `US:III:${rid}`,
  rid,
  item: { name, level, rid },
  serverRegion: 'US',
  serverIdentifier: 'III',
  quantity: 1,
  unitPrice,
  price: unitPrice,
  seenAt: now,
  groupKey: `${name}@${level}@${unitPrice}`,
  firstSeenAt,
})

function server() {
  const mock = new MockPartyServer()
  mock.paired = true
  mock.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  mock.addCatalogEntry({ id: 'stramulet', name: 'Amulet of Strength', value: 5000, compoundable: true, definition: { compound: {}, tier: 2 } })
  mock.addCatalogEntry({ id: 'coat', name: 'Coat', value: 1000, upgradeable: true, definition: { upgrade: {}, tier: 1 } })
  mock.addCatalogEntry({ id: 'ringsj', name: 'Ring of Small Joys', value: 2000 })
  mock.pontyListings = [ponty('a', 'coat', 0, 1200, now - 60_000), ponty('b', 'stramulet', 1, 9000, now - 10_000), ponty('c', 'ringsj', 0, 2400, now - 30_000)]
  mock.npcShop = { orders: [], settings: { goldReserve: 0, ronDonation: false, ronVisitMinutes: 10 }, ron: null, merchantRealm: 'USIII', spendable: 1_000_000 }
  return mock
}

const rowNames = (page: import('@playwright/test').Page) =>
  page.getByRole('group', { name: /^Ponty / }).evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label')))

test('Ponty lists newest first and every filter bound narrows it', async ({ page }) => {
  await server().install(page)
  await page.goto('/market')
  await page.getByRole('tab', { name: /^Ponty \(/ }).click()
  await expect.poll(() => rowNames(page)).toEqual(['Ponty Amulet of Strength', 'Ponty Ring of Small Joys', 'Ponty Coat'])

  await page.getByRole('combobox', { name: 'Sort market' }).selectOption('price')
  await expect.poll(() => rowNames(page)).toEqual(['Ponty Coat', 'Ponty Ring of Small Joys', 'Ponty Amulet of Strength'])
  await page.getByRole('combobox', { name: 'Sort market' }).selectOption('level')
  await expect.poll(() => rowNames(page)).toEqual(['Ponty Amulet of Strength', 'Ponty Coat', 'Ponty Ring of Small Joys'])

  await page.getByRole('spinbutton', { name: 'Minimum level' }).fill('1')
  await expect.poll(() => rowNames(page)).toEqual(['Ponty Amulet of Strength'])
  await page.getByRole('spinbutton', { name: 'Minimum level' }).fill('')
  await page.getByRole('spinbutton', { name: 'Maximum price' }).fill('2400')
  await expect.poll(() => rowNames(page)).toEqual(['Ponty Coat', 'Ponty Ring of Small Joys'])
  await page.getByRole('spinbutton', { name: 'Minimum tier' }).fill('1')
  // Ring of Small Joys has no tier, so a tier bound drops it.
  await expect.poll(() => rowNames(page)).toEqual(['Ponty Coat'])
  await page.getByRole('button', { name: 'Clear filter' }).click()
  await page.getByRole('textbox', { name: 'Keywords' }).fill('amulet STR')
  await expect.poll(() => rowNames(page)).toEqual(['Ponty Amulet of Strength'])

  // The filter persists per tab in browser storage.
  await page.reload()
  await page.getByRole('tab', { name: /^Ponty \(/ }).click()
  await expect(page.getByRole('textbox', { name: 'Keywords' })).toHaveValue('amulet STR')
  await page.getByRole('tab', { name: /^Live WTS/ }).click()
  await expect(page.getByRole('textbox', { name: 'Keywords' })).toHaveValue('')
})

test('a Ponty row Watch action opens the watch list prefilled', async ({ page }) => {
  await server().install(page)
  await page.goto('/market')
  await page.getByRole('tab', { name: /^Ponty \(/ }).click()
  await page.getByRole('button', { name: 'Watch Amulet of Strength' }).click()
  const watch = page.getByRole('dialog', { name: 'Watch list' })
  await expect(watch.getByRole('combobox', { name: 'Watch item' })).toHaveValue('Amulet of Strength')
  await expect(watch.getByRole('spinbutton', { name: 'Lowest level' })).toHaveValue('1')
  await expect(watch.getByRole('spinbutton', { name: 'Highest level' })).toHaveValue('1')
})

test('every market tab has the filter bar, and the server choice lists only realms in that tab', async ({ page }) => {
  const mock = server()
  const sale = (key: string, region: string, identifier: string, level: number) => ({
    key, source: 'aldata', seller: `Seller-${key}`, buyer: `Buyer-${key}`, serverRegion: region, serverIdentifier: identifier, map: 'main',
    seenAt: Date.now() + 600_000, item: { name: 'coat', level }, price: 900, quantity: 1, firstSeenAt: now - level * 1000,
  })
  const entries = [sale('a', 'US', 'III', 0), sale('b', 'EU', 'I', 1), sale('c', 'US', 'III', 2)]
  mock.extraState = {
    aldata: { auth: 'CORRECT', merchantsUpdatedAt: 1, listings: entries, buyOrders: entries,
      trades: [{ owner: 'other', label: 'Other trader', listings: [{ name: 'coat', level: 0, wts: { price: 900, quantity: 1 } }, { name: 'coat', level: 2, wts: { price: 900, quantity: 1 } }] }] },
  }
  mock.pontyListings = [...mock.pontyListings, { ...ponty('d', 'coat', 3, 1200, now), serverRegion: 'EU', serverIdentifier: 'I', key: 'EU:I:d' }]
  await mock.install(page)
  await page.goto('/market')
  const servers = () => page.getByRole('combobox', { name: 'Server' }).locator('option').allTextContents()
  for (const [tab, prefix] of [['Live WTS', 'WTS '], ['Live WTB', 'WTB ']] as const) {
    await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click()
    const rows = page.getByRole('group', { name: new RegExp(`^${prefix}`) })
    await expect(rows).toHaveCount(3)
    await expect.poll(servers).toEqual(['All servers', 'EU I', 'US III'])
    await page.getByRole('combobox', { name: 'Server' }).selectOption('EU I')
    await expect(rows).toHaveCount(1)
    await page.getByRole('spinbutton', { name: 'Minimum level' }).fill('2')
    await expect(rows).toHaveCount(0)
    await page.getByRole('button', { name: 'Clear filter' }).click()
    await expect(rows).toHaveCount(3)
  }
  await page.getByRole('tab', { name: /^Classifieds/ }).click()
  const classifieds = page.getByRole('group', { name: /^Classified / })
  await expect(classifieds).toHaveCount(2)
  // Classifieds carry no realm, so only All is offered.
  await expect.poll(servers).toEqual(['All servers'])
  await page.getByRole('spinbutton', { name: 'Minimum level' }).fill('1')
  await expect(classifieds).toHaveCount(1)
  await page.getByRole('tab', { name: /^Ponty \(/ }).click()
  const ponties = page.getByRole('group', { name: /^Ponty / })
  await expect(ponties).toHaveCount(4)
  await expect.poll(servers).toEqual(['All servers', 'EU I', 'US III'])
  await page.getByRole('combobox', { name: 'Server' }).selectOption('EU I')
  await expect(ponties).toHaveCount(1)
  // Each tab keeps its own server choice.
  await page.getByRole('tab', { name: /^Live WTS/ }).click()
  await expect(page.getByRole('combobox', { name: 'Server' })).toHaveValue('')
})
