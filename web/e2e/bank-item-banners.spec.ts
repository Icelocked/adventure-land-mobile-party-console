import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

const ruleKey = (name: string, level = 0) => JSON.stringify({ name, level, p: null, stat_type: null })

function bankServer() {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  for (const [id, name] of [
    ['ironore', 'Iron Ore'],
    ['bow', 'Bow'],
    ['ringsj', 'Ring'],
    ['gem0', 'Gem'],
    ['hpot0', 'Potion'],
    ['wcoat', 'Coat'],
    ['seashell', 'Seashell'],
  ])
    server.addCatalogEntry({ id, name })
  server.bankPacks = {
    items1: [
      { slot: 0, item: { name: 'ironore', q: 5 } },
      { slot: 1, item: { name: 'bow', level: 2 } },
      { slot: 2, item: { name: 'ringsj', level: 1 } },
      { slot: 3, item: { name: 'gem0', q: 2 } },
      { slot: 4, item: { name: 'hpot0', q: 10 } },
      { slot: 5, item: { name: 'wcoat' } },
      { slot: 6, item: { name: 'seashell', q: 3 } },
    ],
  }
  return server
}

const banner = (page: import('@playwright/test').Page, row: RegExp) => page.getByRole('button', { name: row }).getByTestId('bank-item-banner')

test('Bank tiles show one banner per automatic rule, labelled like the dashboard (bank-item-banner.tsx)', async ({ page }) => {
  const server = bankServer()
  server.autoNpcSales = { [ruleKey('ironore')]: { item: { name: 'ironore', level: 0 } } }
  server.extraState = {
    autoStandMarks: { [ruleKey('seashell')]: { item: { name: 'seashell', level: 0 }, price: 50 } },
    autoUpgradeMarks: { Ranger1: { 'bow@+2': { tiers: 3, quantity: -1 } } },
    autoCompounds: { Patinder: [{ name: 'ringsj', targetTier: 3, quantity: -1 }] },
    autoExchanges: { 'gem0@0': true },
    autoItemMarks: { Ranger1: { 'hpot0@+0': 'bank' } },
    autoDeconstruction: { Patinder: { [ruleKey('wcoat')]: { item: { name: 'wcoat', level: 0 } } } },
  }
  await server.install(page)
  await page.goto('/bank')

  await expect(banner(page, /Iron Ore x5/)).toHaveText('Auto NPC')
  await expect(banner(page, /Iron Ore x5/)).toHaveAttribute('title', 'Auto NPC')
  await expect(banner(page, /Seashell x3/)).toHaveText('Auto stand')
  // Any character's upgrade rule counts without shared rules: +2 with 3 tiers.
  await expect(banner(page, /Bow \+2/)).toHaveText('Auto upgrade → +5')
  await expect(banner(page, /Ring \+1/)).toHaveText('Auto compound → +3')
  await expect(banner(page, /Gem x2/)).toHaveText('Auto exchange')
  await expect(banner(page, /Potion x10/)).toHaveText('Auto bank')
  await expect(banner(page, /^Coat/)).toHaveText('Auto deconstruction')
})

test('Bank tiles: a manual NPC sale mark wins over automatic rules, two automatic sale rules conflict, and shared rules only count the merchant', async ({ page }) => {
  const server = bankServer()
  server.autoNpcSales = {
    [ruleKey('ironore')]: { item: { name: 'ironore', level: 0 } },
    [ruleKey('seashell')]: { item: { name: 'seashell', level: 0 } },
  }
  // A bank-sourced manual mark on the ore, and an automatic one on the seashell.
  server.npcSaleMarks = [
    { id: 'm1', source: 'bank', pack: 'items1', slot: 0, item: { name: 'ironore', q: 5 }, quantity: 5 },
    { id: 'a1', source: 'bank', pack: 'items1', slot: 6, item: { name: 'seashell', q: 3 }, quantity: 3, auto: true } as (typeof server.npcSaleMarks)[number],
  ]
  server.extraState = {
    autoStandMarks: { [ruleKey('seashell')]: { item: { name: 'seashell', level: 0 }, price: 50 } },
    merchantRules: { version: 1, owner: 'Patinder', members: ['Patinder', 'Ranger1'], conflicts: [] },
    // With shared rules only Patinder's maps count, so Ranger1's bank rule is ignored.
    autoItemMarks: { Ranger1: { 'hpot0@+0': 'bank' }, Patinder: { 'gem0@+0': 'bank' } },
  }
  await server.install(page)
  await page.goto('/bank')

  await expect(banner(page, /Iron Ore x5/)).toHaveText('NPC sale')
  // An auto mark is not a manual mark: the seashell shows the conflict between its NPC and stand rules.
  await expect(banner(page, /Seashell x3/)).toHaveText('Rule conflict')
  await expect(banner(page, /Seashell x3/)).toHaveAttribute('title', 'npc · stand')
  await expect(banner(page, /Gem x2/)).toHaveText('Auto bank')
  await expect(banner(page, /Potion x10/)).toHaveCount(0)
})

test('Inventory tiles: "Auto NPC" for automatic sales, Auto exchange on any character while a merchant exists, upgrade and bank marks', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.addCharacter({
    name: 'Ranger1',
    ctype: 'ranger',
    level: 50,
    items: [{ name: 'ironore', q: 5 }, { name: 'gem0' }, { name: 'bow', level: 7 }, { name: 'hpot0', q: 3 }],
  })
  server.autoNpcSales = { [JSON.stringify(['Ranger1', ruleKey('ironore')])]: { item: { name: 'ironore', level: 0 }, character: 'Ranger1' } }
  server.extraState = {
    autoExchanges: { 'gem0@0': true },
    autoUpgradeMarks: { Ranger1: { 'bow@+7': { tiers: 1, quantity: -1 } } },
    autoItemMarks: { Ranger1: { 'hpot0@+0': 'bank' } },
  }
  server.addCatalogEntry({ id: 'bow', name: 'Bow', upgradeable: true })
  server.upgrades = { Ranger1: [{ slot: 2, item: { name: 'bow', level: 7 }, tiers: 1 }] }
  await server.install(page)
  await page.goto('/characters/Ranger1')

  await expect(page.getByTestId('inventory-slot-0')).toContainText('Auto NPC')
  await expect(page.getByTestId('inventory-slot-1')).toContainText('Auto exchange')
  await expect(page.getByTestId('inventory-slot-2')).toContainText('+7 → +8')
  await expect(page.getByTestId('inventory-slot-3')).toContainText('Auto bank')
})
