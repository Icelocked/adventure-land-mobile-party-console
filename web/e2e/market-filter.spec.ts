import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

// OWNERS-PORT-MAP.md B10: the Market Filters add-on's bar on each Market tab
// (runtime/addons/market-filters), and the fork's Watch action.

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
  mock.enableAddon('market-filters')
  mock.npcShop = { orders: [], settings: { goldReserve: 0, ronDonation: false, ronVisitMinutes: 10 }, ron: null, merchantRealm: 'USIII', spendable: 1_000_000 }
  return mock
}

const rowNames = (page: import('@playwright/test').Page) =>
  page.getByRole('group', { name: /^Ponty / }).evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label')))

test('Ponty keeps its own order, Newest first sorts by last seen, and every bound narrows it', async ({ page }) => {
  const mock = server()
  mock.pontyListings = mock.pontyListings.map((entry, index) => ({ ...entry, seenAt: now - [60_000, 10_000, 30_000][index] }))
  await mock.install(page)
  await page.goto('/market')
  await page.getByRole('tab', { name: /^Ponty \(/ }).click()
  const own = await rowNames(page)
  await page.getByRole('button', { name: 'Newest first' }).click()
  await expect.poll(() => rowNames(page)).toEqual(['Ponty Amulet of Strength', 'Ponty Ring of Small Joys', 'Ponty Coat'])
  await page.getByRole('button', { name: 'Newest first' }).click()
  await expect.poll(() => rowNames(page)).toEqual(own)

  await page.getByRole('textbox', { name: 'Lowest level' }).fill('1')
  await expect.poll(() => rowNames(page)).toEqual(['Ponty Amulet of Strength'])
  await page.getByRole('textbox', { name: 'Lowest level' }).fill('')
  // The price boxes read the Market's shorthand.
  await page.getByRole('textbox', { name: 'Highest price, such as 250k or 1.5m' }).fill('2.4k')
  await expect.poll(() => rowNames(page)).toEqual(own.filter((name) => name !== 'Ponty Amulet of Strength'))
  // The tier choice lists the grades the tab's rows carry: an unupgraded item is Normal.
  await expect(page.getByRole('combobox', { name: 'Tier' }).locator('option')).toHaveText(['Any tier', 'Normal'])
  await page.getByRole('button', { name: 'Clear' }).click()
  await expect.poll(() => rowNames(page)).toEqual(own)

  // The value persists per tab on this device.
  await page.getByRole('textbox', { name: 'Lowest level' }).fill('1')
  await page.reload()
  await page.getByRole('tab', { name: /^Ponty \(/ }).click()
  await expect(page.getByRole('textbox', { name: 'Lowest level' })).toHaveValue('1')
  await page.getByRole('tab', { name: /^Live WTS/ }).click()
  await expect(page.getByRole('textbox', { name: 'Lowest level' })).toHaveValue('')
})

test('the bar shows only while the Market Filters add-on is on', async ({ page }) => {
  const mock = server()
  mock.addons = []
  await mock.install(page)
  await page.goto('/market')
  await page.getByRole('tab', { name: /^Ponty \(/ }).click()
  await expect(page.getByRole('group', { name: /^Ponty / })).toHaveCount(3)
  await expect(page.getByRole('textbox', { name: 'Lowest level' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Newest first' })).toHaveCount(0)
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

test('every market tab has the add-on bar, and the server choice lists only realms in that tab', async ({ page }) => {
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
    await expect.poll(servers).toEqual(['Any server', 'EU I', 'US III'])
    await page.getByRole('combobox', { name: 'Server' }).selectOption('EU I')
    await expect(rows).toHaveCount(1)
    await page.getByRole('textbox', { name: 'Lowest level' }).fill('2')
    await expect(rows).toHaveCount(0)
    await page.getByRole('button', { name: 'Clear' }).click()
    await expect(rows).toHaveCount(3)
  }
  await page.getByRole('tab', { name: /^Classifieds/ }).click()
  const classifieds = page.getByRole('group', { name: /^Classified / })
  await expect(classifieds).toHaveCount(2)
  // Classifieds carry no realm, so the bar draws no server choice.
  await expect(page.getByRole('combobox', { name: 'Server' })).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Lowest level' }).fill('1')
  await expect(classifieds).toHaveCount(1)
  await page.getByRole('tab', { name: /^Ponty \(/ }).click()
  const ponties = page.getByRole('group', { name: /^Ponty / })
  await expect(ponties).toHaveCount(4)
  await expect.poll(servers).toEqual(['Any server', 'EU I', 'US III'])
  await page.getByRole('combobox', { name: 'Server' }).selectOption('EU I')
  await expect(ponties).toHaveCount(1)
  // Each tab keeps its own server choice.
  await page.getByRole('tab', { name: /^Live WTS/ }).click()
  await expect(page.getByRole('combobox', { name: 'Server' })).toHaveValue('')
})
