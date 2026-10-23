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
