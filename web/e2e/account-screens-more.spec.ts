import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

test('Market: buying an ALData listing submits the order', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.aldataListings = [{ key: 'listing-1', source: 'aldata', item: { name: 'ironore', level: 0 }, price: 100, quantity: 5 }]
  await server.install(page)

  await page.goto('/market')
  await expect(page.getByText('Iron Ore')).toBeVisible()
  await page.getByRole('button', { name: 'Buy' }).click()

  await expect.poll(() => server.lastOrder?.path).toBe('merchant/aldata-order')
})

test('WTB: placing an order fails once with a server error, then succeeds, then can be cancelled', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  await server.install(page)

  await page.goto('/wtb')
  await expect(page.getByText('No standing buy orders.')).toBeVisible()

  await page.getByRole('button', { name: 'Add WTB order' }).click()
  await page.getByPlaceholder('Search items...').fill('Iron Ore')
  await page.getByText('Iron Ore').click()
  await page.getByLabel('Maximum price').fill('500')

  server.failOnce['merchant/bid'] = 'Stand is full'
  await page.getByRole('button', { name: 'Place WTB' }).click()
  await expect(page.getByText('Stand is full')).toBeVisible()
  // The form must stay open on failure - the order was never actually placed.
  await expect(page.getByRole('button', { name: 'Place WTB' })).toBeVisible()

  await page.getByRole('button', { name: 'Place WTB' }).click()
  await expect(page.getByPlaceholder('Search items...')).not.toBeVisible()
  await expect(page.getByText('500g')).toBeVisible()

  await page.getByRole('button', { name: /Iron Ore/ }).click()
  await page.getByRole('button', { name: 'Cancel WTB order' }).click()
  await expect(page.getByText('No standing buy orders.')).toBeVisible()
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
  server.realmControl = { activeRealm: 'US I', homeRealm: 'US I', realms: [{ key: 'US II', label: 'US II', players: 50, pvp: false }] }
  await server.install(page)

  await page.goto('/settings')
  await expect(page.getByText('Realm: US I')).toBeVisible()
  await page.getByText('Switch realm...').click()
  await page.getByText('US II (50 online)').click()

  await expect(page.getByText('Realm: US II')).toBeVisible()
})

test('Offerings: saving a rule fails once with a server error, then succeeds', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat', upgradeable: true })
  await server.install(page)

  await page.goto('/offerings')
  await page.getByRole('button', { name: 'Add rule' }).click()
  await page.getByPlaceholder('Search upgradeable items...').fill('Wolf Coat')
  await page.getByText('Wolf Coat').click()

  server.failOnce['command'] = 'Rule conflicts with an existing one'
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText('Rule conflicts with an existing one')).toBeVisible()

  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByPlaceholder('Search upgradeable items...')).not.toBeVisible()
  await expect(page.getByText('+0 → +1 · Primling · Required')).toBeVisible()
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
