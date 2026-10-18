import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

// Ryan's v1.4.0 console sends none of the stable fork's fields
// (src/models/consoleFeatures.ts), so each fork control stays hidden. The
// specs of each feature (combat-party, realm-chase, console14-*,
// merchant-bank-sort-visit, merchant-card, cosmetics) cover the stable fork.

function postBodies(page: Page, path: string): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/party-api/${path}`)) bodies.push(request.postDataJSON() as Record<string, unknown>)
  })
  return bodies
}

function v140Server() {
  const server = new MockPartyServer()
  server.paired = true
  server.consoleKind = 'v1.4.0'
  return server
}

function partyServer() {
  const server = v140Server()
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60, slots: { chest: { item: { name: 'coat', level: 7 } } } })
  server.addCharacter({ name: 'Folla', ctype: 'priest', level: 58 })
  server.addCharacter({ name: 'Merchy', ctype: 'merchant', level: 40 })
  server.leader = 'Leada'
  return server
}

test('v1.4.0: the party list has no designated tank', async ({ page }) => {
  await partyServer().install(page)
  await page.goto('/')
  await expect(page.getByText('Folla').first()).toBeVisible()
  await expect(page.getByRole('button', { name: /^Tank:/ })).toHaveCount(0)
  await expect(page.getByText('Holds melee range for the party regardless of class')).toHaveCount(0)
})

test('v1.4.0: a combat character has no gear sets, and Franky event settings have no routine', async ({ page }) => {
  await partyServer().install(page)
  await page.goto('/characters/Folla')
  await expect(page.getByRole('button', { name: 'Follow' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Gear sets/ })).toHaveCount(0)
  await page.getByRole('button', { name: /^Events \(\d+\) ▾$/ }).click()
  await page.getByRole('button', { name: 'Franky settings' }).click()
  await expect(page.getByRole('button', { name: 'Franky settings' })).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('button', { name: 'Franky routine settings' })).toHaveCount(0)
})

test('v1.4.0: the realm panel keeps home changes and has no boss chase or hop blacklist', async ({ page }) => {
  const server = v140Server()
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60 })
  server.realmControl = {
    activeRealm: 'SR_USI',
    currentRealm: 'SR_USI',
    homeRealm: 'SR_USI',
    homeCharacters: [{ name: 'Leada', home: 'SR_USI' }],
    split: false,
    characters: [],
    realms: [{ key: 'SR_USI', label: 'US I', players: 80, pvp: false }],
  }
  await server.install(page)
  await page.goto('/settings')
  await expect(page.getByText('US I').first()).toBeVisible()
  await expect(page.getByText('Chase event bosses across realms')).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Realm hopping blacklist' })).toHaveCount(0)
})

test('v1.4.0: merchant settings have no gapped bank sort', async ({ page }) => {
  const server = v140Server()
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.extraState = { bankSortMode: 'automatic' }
  await server.install(page)
  await page.goto('/characters/Patinder')
  await page.getByRole('button', { name: 'Merchant settings' }).click()
  await expect(page.getByText('Sort every bank visit')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Leave gaps between item types' })).toHaveCount(0)
})

test('v1.4.0: Join giveaway offers only loaded players, no typed host', async ({ page }) => {
  const server = v140Server()
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.extraState = { giveawayRealms: [{ key: 'EUI', label: 'EU I' }], giveawayPlayers: { EUI: ['Generous', 'Other'] } }
  await server.install(page)
  await page.goto('/characters/Patinder')
  await page.getByRole('button', { name: 'Join giveaway' }).click()
  await page.getByRole('combobox', { name: 'Server realm' }).selectOption('EUI')
  await page.getByPlaceholder('Search player name…').fill('FarHost')
  await expect(page.getByText('No online players loaded for this realm.')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Use “/ })).toHaveCount(0)
})

test('v1.4.0: an automatic NPC sale on the merchant has no Keep in storage and sends only item and action', async ({ page }) => {
  const server = v140Server()
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58, items: [{ name: 'hpot0', q: 9 }] })
  server.addCatalogEntry({ id: 'hpot0', name: 'Health Potion' })
  await server.install(page)
  const bodies = postBodies(page, 'merchant/auto-npc-sale')
  await page.goto('/characters/Patinder')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Auto sell to NPC…' }).click()
  await expect(page.getByRole('group', { name: 'Automatically sell to NPC?' })).toBeVisible()
  await expect(page.getByLabel('Keep in storage')).toHaveCount(0)
  await page.getByRole('button', { name: 'Enable auto sale' }).click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toEqual({ item: { name: 'hpot0', q: 9 }, action: 'set' })
})

test('v1.4.0: a pending native purchase shows no resolve control on the WTB order', async ({ page }) => {
  const server = v140Server()
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.standBids = { ironore: { price: 500, quantity: 10, minimumQuality: 0, revision: 1 } }
  server.extraState = { nativeStand: { offers: {}, problems: {}, purchases: { 'native-buy-7:Seller:ironore': { item: { name: 'ironore', price: 480 }, quantity: 4, jobId: 'native-buy-7' } } } }
  await server.install(page)
  await page.goto('/wtb')
  await expect(page.getByText('Iron Ore').first()).toBeVisible()
  await expect(page.getByRole('group', { name: 'Unconfirmed purchase of Iron Ore' })).toHaveCount(0)
})

test('v1.4.0: stale market rows offer no Check, and WTB offers sort fresh first', async ({ page }) => {
  const server = v140Server()
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [{ name: 'wcoat', level: 0 }] })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore', value: 100 })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat', value: 1000 })
  const order = (key: string, name: string, seenAt: number) => ({ key, buyer: 'Buyer1', serverRegion: 'US', serverIdentifier: 'I', map: 'main', seenAt, price: 900, quantity: 2, item: { name, level: 0 } })
  server.extraState = {
    aldata: {
      auth: 'CORRECT',
      merchantsUpdatedAt: 1,
      listings: [{ key: 'c', source: 'aldata', seller: 'Seller2', serverRegion: 'US', serverIdentifier: 'I', map: 'main', seenAt: 1, item: { name: 'wcoat', level: 0 }, price: 5000, quantity: 1 }],
      buyOrders: [order('w1', 'wcoat', 1), order('w2', 'ironore', Date.now() + 600_000)],
    },
  }
  await server.install(page)
  await page.goto('/market')
  const coat = page.getByRole('group', { name: 'WTS Wolf Coat from Seller2' })
  await expect(coat.getByRole('button', { name: 'Make WTB' })).toBeVisible()
  await expect(coat.getByRole('button', { name: 'Check' })).toHaveCount(0)

  await page.getByRole('tab', { name: /Live WTB/ }).click()
  const offer = page.getByRole('group', { name: 'WTB Wolf Coat from Buyer1' })
  await expect(offer.getByRole('button', { name: 'List', exact: true })).toBeVisible()
  await expect(offer.getByRole('button', { name: 'Check' })).toHaveCount(0)
  // The fresh offer for an unowned item stays ahead of the stale owned one.
  await expect(page.getByRole('group', { name: /^WTB / })).toHaveText([/Iron Ore/, /Wolf Coat/])
})

test('v1.4.0: a merchant item offers no Prim stack and the preview shows no grace', async ({ page }) => {
  const server = v140Server()
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [null, { name: 'bow', level: 9, stat_type: 'dex' }] })
  server.addCatalogEntry({ id: 'bow', name: 'Bow', upgradeable: true, maxLevel: 12, definition: { stat: 1, grades: [7, 10, 12, 13] } })
  server.extraState = { upgradeOfferingStock: { offeringp: 3 } }
  server.upgradePreview = { status: 'complete', result: { options: { none: { preview: { chance: 0.4, grace: 2.5 }, observedAt: 1_700_000_000_000 } } } }
  await server.install(page)
  await page.goto('/characters/Merchantina')
  await page.getByTestId('inventory-slot-1').click()
  await page.getByRole('button', { name: 'Mark for upgrade', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Upgrade chances' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Upgrade chances' }).getByText(/^Grace/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Prim stack…' })).toHaveCount(0)
})
