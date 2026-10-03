import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

test('Settings: App updates section can check for an update without erroring', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  await server.install(page)

  await page.goto('/settings')
  // Installed as a home-screen app, there's no browser chrome to force-
  // refresh from at all - this button is the only in-app escape hatch
  // for a stuck service worker.
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
  await page.getByPlaceholder('Search items...').fill('Iron Ore')
  await page.getByText('Iron Ore').click()
  await page.getByLabel('Maximum price').fill('500')

  server.failOnce['merchant/bid'] = 'Stand is full'
  await page.getByRole('button', { name: 'Place WTB' }).click()
  await expect(page.getByText('Stand is full')).toBeVisible()
  // The form must stay open on failure - the order was never actually placed.
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

test('Bestiary: expanding a monster shows its drop table', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.bestiaryCatalog = [
    {
      id: 'crab',
      name: 'Crab',
      hp: 100,
      attack: 10,
      xp: 5,
      threat: 1,
      drops: [{ id: 'shell', name: 'Shell', rate: 0.05, quantity: 1 }],
      spawnRecords: [],
    },
  ]
  await server.install(page)

  await page.goto('/bestiary')
  await expect(page.getByText('Crab')).toBeVisible()
  await expect(page.getByText('Shell')).not.toBeVisible()

  await page.getByText('Crab').click()
  await expect(page.getByText('Shell')).toBeVisible()
  await expect(page.getByText('5.0000%')).toBeVisible()
})

test('Skills: expanding a class shows a skill\'s definition', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.skillCatalog = [
    {
      id: 'warrior',
      name: 'Warrior',
      skills: [{ id: 'cleave', name: 'Cleave', definition: { range: 100, mp: 20, cooldown: 4000, explanation: 'Hits everything nearby' } }],
    },
  ]
  await server.install(page)

  await page.goto('/skills')
  await page.getByText('Warrior').click()
  await expect(page.getByText('Hits everything nearby')).toBeVisible()
  await expect(page.getByText('Range 100 · MP 20 · CD 4s')).toBeVisible()
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

test('Logs: shows an empty state with no activity', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  await server.install(page)

  await page.goto('/logs')
  await expect(page.getByText('No activity yet.')).toBeVisible()
})

test('Catalog: searching and opening an item shows its details', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat' })
  await server.install(page)

  await page.goto('/catalog')
  await expect(page.getByText('Iron Ore')).toBeVisible()
  await expect(page.getByText('Wolf Coat')).toBeVisible()

  await page.getByPlaceholder('Search').fill('Wolf')
  await expect(page.getByText('Iron Ore')).not.toBeVisible()
  await page.getByText('Wolf Coat').click()
  await expect(page.getByRole('dialog')).toBeVisible()
})
