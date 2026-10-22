import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

// Console 1.5 (stable15-oct) small parity items from pwa-gap/GAPS.md.

function postBodies(page: Page, path: string): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/party-api/${path}`)) bodies.push(request.postDataJSON() as Record<string, unknown>)
  })
  return bodies
}

function server() {
  const mock = new MockPartyServer()
  mock.paired = true
  return mock
}

test('G1 party gold: the total comes from core accountGold, offline slots included', async ({ page }) => {
  const mock = server()
  mock.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60, gold: 100 })
  mock.bankGold = 1000
  // An offline slot carries 5,000 more; party-gold.tsx reads state.accountGold first.
  mock.accountGold = { carried: 5100, total: 6100 }
  await mock.install(page)

  await page.goto('/')
  const gold = page.getByRole('button', { name: 'Party gold' })
  await expect(gold).toContainText('(6,100 total)')
  await gold.click()
  await expect(gold).toContainText('Bank: 1,000; carried: 5,100; combined: 6,100 gold')
})

test('G2 CC meter: code call cost out of 200, red from 180', async ({ page }) => {
  const mock = server()
  mock.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60, vitalsExtra: { cc: 185 } })
  await mock.install(page)

  await page.goto('/characters/Leada')
  const meter = page.getByRole('meter', { name: 'CC' })
  await expect(meter).toHaveAttribute('aria-valuenow', '185')
  await expect(meter).toHaveAttribute('aria-valuemax', '200')
  await expect(page.getByText('185 / 200')).toBeVisible()
  await expect(meter.locator('div')).toHaveCSS('background-color', 'rgb(127, 29, 29)')
})

test('G3 elixir slot: a countdown to expiry replaces the +level badge', async ({ page }) => {
  const mock = server()
  mock.addCatalogEntry({ id: 'elixirluck', name: 'Elixir of Luck' })
  mock.addCatalogEntry({ id: 'blade', name: 'Blade' })
  mock.addCharacter({
    name: 'Leada',
    ctype: 'warrior',
    level: 60,
    slots: { elixir: { item: { name: 'elixirluck', expires: new Date(Date.now() + 150_000).toISOString() } }, mainhand: { item: { name: 'blade', level: 3 } } },
  })
  await mock.install(page)

  await page.goto('/characters/Leada')
  // equip-slot.tsx shows the first unit of formatDuration(remaining).
  await expect(page.getByRole('button', { name: 'elixir: Elixir of Luck' })).toContainText(/^2m/)
  await expect(page.getByRole('button', { name: 'elixir: Elixir of Luck' })).not.toContainText('+0')
  await expect(page.getByRole('button', { name: 'mainhand: Blade' })).toContainText('+3')
})

test('G6 skills: the screen covers the catalog conditions group', async ({ page }) => {
  const mock = server()
  mock.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60 })
  mock.skillCatalog = [
    { id: 'warrior', name: 'Warrior', skills: [{ id: 'charge', name: 'Charge', sprite: null, definition: {} }] },
    { id: 'conditions', name: 'Conditions', skills: [{ id: 'poisoned', name: 'Poisoned', sprite: null, definition: { explanation: 'Takes damage over time.' } }] },
  ]
  await mock.install(page)

  await page.goto('/skills')
  // skills-dialog.tsx:52 title and description.
  await expect(page.getByText('Class skills and conditions')).toBeVisible()
  await expect(page.getByText('Browse every class-bound skill, shared game action and condition. Click an entry for its complete definition.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Conditions' }).getByText('Poisoned', { exact: true })).toBeVisible()
})

test('G12 event schedule: realm time, confirmed realm schedule and the next seven days', async ({ page }) => {
  const mock = server()
  mock.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60 })
  const next = Date.now() + 3_600_000
  mock.extraState = {
    eventSchedules: [{ id: 'crabxx', name: 'Crabxx', next, clockOffsetMs: 0, realmOffsetHours: -5, confirmed: true, occurrences: [{ at: next + 86_400_000, status: 'predicted' }, { at: next, status: 'confirmed' }] }],
  }
  await mock.install(page)

  await page.goto('/characters/Leada')
  await page.getByRole('button', { name: 'Events (1) ▾' }).click()
  const events = page.getByRole('group', { name: 'Events' })
  await expect(events.getByText(/^Realm: \d\d:\d\d \(UTC\u22125\)$/)).toBeVisible()
  await expect(events.getByText('Realm schedule confirmed')).toBeVisible()
  await events.getByText('Next seven days').click()
  await expect(events.getByText(new Date(next).toLocaleString('en-US'))).toBeVisible()
})

test('G13 bestiary: event-only monsters say which event spawns them', async ({ page }) => {
  const mock = server()
  mock.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60 })
  mock.bestiaryCatalog = [
    { id: 'crabxx', name: 'Giga Crab', hp: 1000, attack: 10, xp: 5, threat: 1, definition: {}, drops: [], spawnRecords: [], eventSources: [{ id: 'crabxx', name: 'Giga Crab', role: 'boss' }] },
    { id: 'crabx', name: 'Huge Crab', hp: 500, attack: 10, xp: 5, threat: 1, definition: {}, drops: [], spawnRecords: [], eventSources: [{ id: 'crabxx', name: 'Giga Crab', role: 'add', at: [0.5, 0.25] }] },
  ]
  await mock.install(page)

  await page.goto('/bestiary')
  const huge = page.getByRole('button', { name: /^Huge Crab/ })
  await expect(huge).toContainText('Event only: Giga Crab')
  await huge.click()
  // monster-spawns.tsx eventSourceText().
  await expect(page.getByText('Spawns only during Giga Crab: raised by the boss at 50% and 25% HP.')).toBeVisible()
  await expect(page.getByText('No static spawn recorded in game data.')).toHaveCount(0)
})

test('G17 donation preview: the level after donating, and a target level fills the amount', async ({ page }) => {
  const mock = server()
  // donationLevelXp is native G.levels, the XP needed to leave each level.
  mock.addCharacter({ name: 'Merchy', ctype: 'merchant', level: 2, vitalsExtra: { xp: 50 }, diagnostics: { donationXpPerGold: 2, donationLevelXp: [0, 100, 200, 400, 800] } })
  mock.merchantCharacter = 'Merchy'
  await mock.install(page)

  await page.goto('/characters/Merchy')
  await page.getByRole('button', { name: 'Donate gold' }).click()
  await page.getByLabel('Donation amount').fill('100')
  // donation-preview.tsx: 50 + 100 * 2 = 250 XP, so level 3 with 50 of 400.
  await expect(page.getByRole('status').filter({ hasText: 'XP/gold' })).toHaveText('Level 3 · 12.50% to next level · 200 XP (2 XP/gold)')
  await page.getByLabel('Merchant level after donation').fill('4')
  await expect(page.getByLabel('Donation amount')).toHaveValue('275')
})

test('G18 merchant jobs: a waiting job shows "Retry at" its retry time', async ({ page }) => {
  const mock = server()
  mock.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  const retryAt = Date.now() + 10 * 60_000
  mock.extraState = { merchantQueue: [{ id: 'job-1', target: 'Sadokunn', reason: 'restock', status: 'queued', retryAt }] }
  await mock.install(page)

  await page.goto('/characters/Patinder')
  // merchant-card-controls.tsx:208-209.
  await expect(page.getByText(`Retry at ${new Date(retryAt).toLocaleTimeString('en-US')}`)).toBeVisible()
})

test('G21 auto NPC sales: an inline Keep editor posts {item, keep, action: set}', async ({ page }) => {
  const mock = server()
  mock.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  mock.addCatalogEntry({ id: 'hpbelt', name: 'Belt' })
  const item = { name: 'hpbelt', level: 0 }
  mock.autoNpcSales = { [JSON.stringify({ name: 'hpbelt', level: 0, p: null, stat_type: null })]: { item, keep: 2 } }
  await mock.install(page)
  const bodies = postBodies(page, 'merchant/auto-npc-sale')

  await page.goto('/characters/Merchantina')
  const section = page.getByRole('region', { name: 'Auto NPC sales' })
  await section.getByRole('button', { name: /^Auto NPC sales\s*1$/ }).click()
  // inventory-panel.tsx:1635-1637 labels the reserve "Keep N".
  await section.getByRole('button', { name: 'Keep 2' }).click()
  await section.getByLabel('New reserve for Belt').fill('5')
  await section.getByRole('button', { name: 'Save reserve for Belt' }).click()
  await expect.poll(() => bodies[0]).toEqual({ item, keep: 5, action: 'set' })
  await expect(section.getByRole('button', { name: 'Keep 5' })).toBeVisible()
})

test('G16 merchant settings: replacement gathering tool crafting toggles', async ({ page }) => {
  const mock = server()
  mock.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  mock.merchantAutomations = { 'craft fishing tools': true, 'craft mining tools': false }
  await mock.install(page)
  const bodies = postBodies(page, 'merchant/routine-priorities')

  await page.goto('/characters/Patinder')
  await page.getByRole('button', { name: 'Merchant settings' }).click()
  const tools = page.getByRole('group', { name: 'Replacement gathering tools' })
  await expect(tools.getByRole('checkbox', { name: 'Automatically craft new fishing poles' })).toBeChecked()
  await tools.getByRole('checkbox', { name: 'Automatically craft new pickaxes' }).click()
  // gathering-tool-settings.tsx posts one key at a time.
  await expect.poll(() => bodies[0]).toEqual({ priorities: {}, enabled: { 'craft mining tools': true } })
  await expect(tools.getByRole('checkbox', { name: 'Automatically craft new pickaxes' })).toBeChecked()
})
