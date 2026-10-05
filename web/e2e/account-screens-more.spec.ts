import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

test('Settings: App updates section can check for an update without erroring', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  await server.install(page)

  await page.goto('/settings')
  // An installed app has no browser chrome to force-refresh, so this button
  // is the way out of a stuck service worker.
  await page.getByRole('button', { name: 'Check for updates' }).click()
  await expect(page.getByRole('button', { name: /Checking…|Up to date/ })).toBeVisible()
})

test('WTB: placing an order fails once with a server error, then succeeds, then can be cancelled', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  await server.install(page)

  await page.goto('/wtb')
  await expect(page.getByText('No active orders.')).toBeVisible()

  await page.getByRole('button', { name: 'New WTB order' }).click()
  await page.getByPlaceholder('Search every item…').fill('Iron Ore')
  await page.getByText('Iron Ore').click()
  await page.getByLabel('Maximum price').fill('500')

  server.failOnce['merchant/bid'] = 'Stand is full'
  await page.getByRole('button', { name: 'Place WTB' }).click()
  await expect(page.getByText('Stand is full')).toBeVisible()
  // The form stays open on failure; the order was not placed.
  await expect(page.getByRole('button', { name: 'Place WTB' })).toBeVisible()

  await page.getByRole('button', { name: 'Place WTB' }).click()
  await expect(page.getByRole('button', { name: 'Place WTB' })).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit price for Iron Ore' })).toHaveText('500g')

  // stand-sheet.tsx: cancel asks "Really cancel?" first.
  const order = page.getByRole('group', { name: 'WTB Iron Ore' })
  await order.getByRole('button', { name: 'Cancel', exact: true }).click()
  await order.getByRole('button', { name: 'Really cancel?' }).click()
  await expect(page.getByText('No active orders.')).toBeVisible()
})

test('Skills: search, range labels, and the full definition of a skill', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.skillCatalog = [
    {
      id: 'warrior',
      name: 'Warrior',
      skills: [
        { id: 'cleave', name: 'Cleave', definition: { range: 100, range_multiplier: 2, range_bonus: 10, mp: 20, cooldown: 4000, explanation: 'Hits everything nearby' } },
        { id: 'charge', name: 'Charge', definition: { use_range: true, range_multiplier: 1.5, range_bonus: -5 } },
      ],
    },
    {
      id: 'skills',
      name: 'Shared',
      skills: [
        { id: 'throw', name: 'Throw', definition: { range: 200 } },
        { id: 'blink', name: 'Blink', definition: { global: true } },
        { id: 'emote', name: 'Emote', definition: {} },
      ],
    },
  ]
  await server.install(page)

  await page.goto('/skills')
  const warrior = page.getByRole('region', { name: 'Warrior' })
  await expect(warrior.getByRole('button', { name: /^Cleave cleave Range: 210$/ })).toBeVisible()
  await expect(warrior.getByRole('button', { name: /^Charge charge Range: 1\.5 × attack range − 5$/ })).toBeVisible()
  const shared = page.getByRole('region', { name: 'Shared' })
  await expect(shared.getByRole('button', { name: /Range: 200 \+ character level$/ })).toBeVisible()
  await expect(shared.getByRole('button', { name: /Range: Global$/ })).toBeVisible()
  await expect(shared.getByRole('button', { name: /Range: Not specified$/ })).toBeVisible()

  await page.getByPlaceholder('Search classes or skills…').fill('warrior')
  await expect(shared).toHaveCount(0)
  await expect(warrior.getByRole('button')).toHaveCount(2)

  await warrior.getByRole('button', { name: /^Cleave/ }).click()
  const details = page.getByRole('group', { name: 'Skill details' })
  await expect(details.getByText('G.skills.cleave')).toBeVisible()
  await expect(details.getByText('Hits everything nearby')).toBeVisible()
  await expect(details.getByText('210', { exact: true })).toBeVisible()
  await expect(details.getByText('4s', { exact: true })).toBeVisible()
})

test('Routines: moving a routine up changes its saved priority order', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.merchantRoutinePriorities = { fishing: 30, mining: 20 }
  server.merchantAutomations = { fishing: true, mining: true }
  await server.install(page)

  await page.goto('/routines')
  await page.getByRole('button', { name: 'Move Mining up' }).click()
  await page.getByRole('button', { name: 'Save routines' }).click()

  await expect.poll(() => server.lastRoutineSave?.priorities).toBeTruthy()
  const priorities = server.lastRoutineSave!.priorities as Record<string, number>
  expect(priorities.mining).toBeGreaterThan(priorities.fishing)
})

test('Settings: switching realm updates immediately (no stale data until the next poll)', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.realmControl = {
    activeRealm: 'US I',
    currentRealm: 'US I',
    homeRealm: 'US I',
    split: false,
    characters: [],
    realms: [
      { key: 'US I', label: 'US I', players: 80, pvp: false },
      { key: 'US II', label: 'US II', players: 50, pvp: false },
    ],
  }
  await server.install(page)

  await page.goto('/settings')
  await expect(page.getByText('Current: US I · Home: US I')).toBeVisible()
  await page.getByText('Change realm…').click()
  // The realm the party is already in can't be picked.
  await expect(page.getByRole('button', { name: 'US I (80 players)' })).toBeDisabled()
  await page.getByText('US II (50 players)').click()
  // party-inventory-panels.tsx: a confirmation with the Fatigue/Hop Sickness warnings first.
  await page.getByRole('group', { name: 'Switch realm?' }).getByRole('button', { name: 'Switch all characters' }).click()

  await expect(page.getByText('Current: US II · Home: US I')).toBeVisible()
})
