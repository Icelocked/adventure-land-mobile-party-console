import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function postBodies(page: Page, path: string): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/party-api/${path}`)) bodies.push(request.postDataJSON() as Record<string, unknown>)
  })
  return bodies
}

test('WTB: blanking the priority override clears it (null is sent)', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.standBids = { ironore: { price: 500, quantity: 10, minimumQuality: 0, priorityOverride: 80 } }
  await server.install(page)
  const bodies = postBodies(page, 'merchant/bid')

  await page.goto('/wtb')
  await page.getByText('Iron Ore').click()
  await page.getByPlaceholder('routine priority').fill('')
  await page.getByRole('button', { name: 'Place WTB' }).click()

  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toMatchObject({ itemId: 'ironore', priorityOverride: null, clear: false })
  expect(server.standBids.ironore.priorityOverride).toBeUndefined()
})

test('Market: a Ponty listing (no `source` field) is bought through ponty-order, whole listing', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.pontyListings = [{ key: 'p-1', item: { name: 'ironore' }, price: 3000, unitPrice: 300, quantity: 10 }]
  await server.install(page)
  const ponty = postBodies(page, 'merchant/ponty-order')
  const aldata = postBodies(page, 'merchant/aldata-order')

  await page.goto('/market')
  await page.getByRole('button', { name: 'Buy' }).click()
  await expect.poll(() => ponty.length).toBe(1)
  expect(ponty[0]).toEqual({ keys: ['p-1'], quantity: 10, unitPrice: 300 })
  expect(aldata).toHaveLength(0)
})

test('Bank: double-tapping "Mark for withdrawal" sends one request (it is a server toggle)', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.bankPacks = { items1: [{ slot: 0, item: { name: 'ironore', level: 0, q: 5 } }] }
  await server.install(page)
  const bodies = postBodies(page, 'command')

  await page.goto('/bank')
  await page.getByText('Iron Ore').click()
  await page.getByRole('button', { name: 'Mark for withdrawal' }).dblclick()
  await expect.poll(() => bodies.filter((b) => b.type === 'withdraw').length).toBe(1)
  await page.waitForTimeout(500)
  expect(bodies.filter((b) => b.type === 'withdraw')).toHaveLength(1)
  expect(server.withdrawals.Patinder).toHaveLength(1)
})

test('Merchant queue: cancelling an automatic routine job asks first; gathering jobs have no cancel', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.merchantQueue = [
    { id: 'job-1', target: 'Patinder', reason: 'exchange', autoExchangeKeys: ['gem0@0'], routine: 'automatic exchange' },
    { id: 'job-2', target: 'Patinder', reason: 'fishing' },
    { id: 'job-3', target: 'Ranger1', reason: 'manual visit' },
  ]
  await server.install(page)
  const bodies = postBodies(page, 'merchant/job/cancel')

  await page.goto('/characters/Patinder')
  await page.getByRole('button', { name: 'Cancel automatic exchange' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Cancel Automatic exchange?' })
  await expect(dialog.getByText(/also disable this routine/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await page.waitForTimeout(300)
  expect(bodies).toHaveLength(0)

  await page.getByRole('button', { name: 'Cancel automatic exchange' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toEqual({ id: 'job-1' })

  await expect(page.getByRole('button', { name: 'Cancel fishing' })).toHaveCount(0)
  // A manual job cancels straight away.
  await page.getByRole('button', { name: 'Cancel manual visit' }).click()
  await expect.poll(() => bodies.length).toBe(2)
})

test('Travel: the merchant\'s Go home sends go-home, not a map travel', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  await server.install(page)
  const bodies = postBodies(page, 'command')

  await page.goto('/characters/Patinder')
  await page.getByRole('button', { name: 'Go home' }).click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toEqual({ character: 'Patinder', type: 'go-home' })
})

test('Realm switch: tapping a realm asks first (with the Hop Sickness warning); Cancel sends nothing', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.realmControl = {
    activeRealm: 'US I',
    currentRealm: 'US I',
    homeRealm: 'US I',
    split: false,
    characters: [],
    realms: [
      { key: 'EU I', label: 'EU I', players: 30, pvp: false },
      { key: 'EU PVP', label: 'EU PVP', players: 9, pvp: true },
    ],
  }
  await server.install(page)
  const bodies = postBodies(page, 'realm/switch')

  await page.goto('/settings')
  await page.getByText('Change realm…').click()
  await expect(page.getByRole('button', { name: 'EU PVP (9 players) — disabled' })).toBeDisabled()
  await page.getByText('EU I (30 players)').click()
  const dialog = page.getByRole('group', { name: 'Switch realm?' })
  await expect(dialog.getByText(/Hop Sickness applies/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await page.waitForTimeout(300)
  expect(bodies).toHaveLength(0)

  await page.getByText('EU I (30 players)').click()
  await page.getByRole('group', { name: 'Switch realm?' }).getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Switch all characters' }).click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toEqual({ realm: 'EU I', setHome: true })
})

test('Realm: a split party shows "Mixed realms" with each character, and a running switch shows progress', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.realmControl = {
    activeRealm: 'US I',
    currentRealm: null,
    homeRealm: 'US I',
    split: true,
    characters: [
      { name: 'Patinder', ctype: 'merchant', realm: 'US I', online: true },
      { name: 'Ranger1', ctype: 'ranger', realm: null, online: false },
    ],
    realms: [{ key: 'US I', label: 'US I', players: 80, pvp: false }],
    operation: { id: 'op-1', phase: 'moving-characters', realm: 'US I', setHome: false, startedAt: Date.now(), characters: [{ name: 'Ranger1', ctype: 'ranger', realm: null, online: false }] },
  }
  await server.install(page)

  await page.goto('/settings')
  await expect(page.getByText('Current: Mixed realms · Home: US I')).toBeVisible()
  await expect(page.getByText('Patinder: US I')).toBeVisible()
  await expect(page.getByText('Ranger1: offline')).toBeVisible()
  await expect(page.getByText('moving characters')).toBeVisible()
  await expect(page.getByText('Ranger1: waiting')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Change realm…' })).toBeDisabled()
})
