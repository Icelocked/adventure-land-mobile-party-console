import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

test("Equipment: a merchant's stand (trade) slots are not shown as gear", async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({
    name: 'Patinder',
    ctype: 'merchant',
    level: 58,
    slots: { mainhand: { item: { name: 'broom', level: 3 } }, trade1: { item: { name: 'cscroll1', q: 5 }, price: 9000 } },
  })
  await server.install(page)

  await page.goto('/characters/Patinder')
  const equipment = page.getByRole('region', { name: 'Equipment' })
  await expect(equipment.getByText('mainhand')).toBeVisible()
  await expect(equipment.getByText('trade1')).toHaveCount(0)
})

function postBodies(page: import('@playwright/test').Page, path: string): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/party-api/${path}`)) bodies.push(request.postDataJSON() as Record<string, unknown>)
  })
  return bodies
}

test('Stand: listing a stack defaults to the whole stack at the item value', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58, items: [{ name: 'cscroll1', q: 200 }] })
  server.addCatalogEntry({ id: 'cscroll1', name: 'Compound Scroll', value: 6400 })
  await server.install(page)
  const bodies = postBodies(page, 'merchant/stand')

  await page.goto('/characters/Patinder')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Mark for stand', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Stand price' })).toHaveValue('6400')
  await expect(page.getByRole('textbox', { name: 'Stand quantity' })).toHaveValue('200')
  await page.getByRole('button', { name: 'List', exact: true }).click()

  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toMatchObject({ slot: 0, item: { name: 'cscroll1', q: 200 }, price: 6400, quantity: 200, markAll: false, remove: false })
})

test('Stand: removing a live listing sends its id, and editing a bank listing keeps its bank source', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.standListings = [
    { id: 'live-1', slot: 3, item: { name: 'ironore', level: 0 }, price: 500, quantity: 1, state: 'live', tradeSlot: 'trade1' },
    { id: 'bank-1', slot: 7, bankPack: 'items1', bankSlot: 7, item: { name: 'ironore', level: 0, q: 4 }, price: 400, quantity: 4 },
  ]
  await server.install(page)
  const bodies = postBodies(page, 'merchant/stand')

  await page.goto('/stand')
  const rows = page.locator('div.rounded-md', { hasText: 'Iron Ore' })
  await rows.nth(1).getByRole('button', { name: 'Edit price' }).click()
  await page.getByRole('textbox', { name: 'Stand price' }).fill('450')
  await page.getByRole('button', { name: 'List', exact: true }).click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toMatchObject({ id: 'bank-1', bankPack: 'items1', slot: 7, price: 450, quantity: 4 })

  await rows.nth(0).getByRole('button', { name: 'Remove' }).click()
  await rows.nth(0).getByRole('button', { name: 'Really remove?' }).click()
  await expect.poll(() => bodies.length).toBe(2)
  expect(bodies[1]).toMatchObject({ id: 'live-1', remove: true })
  await expect.poll(() => server.standListings.map((l) => l.id)).toEqual(['bank-1'])
})

test('Stand: bank "Mark all for stand" sends markAll', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.bankPacks = { items1: [{ slot: 0, item: { name: 'ironore', level: 0, q: 5 } }, { slot: 1, item: { name: 'ironore', level: 0, q: 3 } }] }
  await server.install(page)
  const bodies = postBodies(page, 'merchant/stand')

  await page.goto('/bank')
  await page.getByText('Iron Ore').first().click()
  await page.getByRole('button', { name: 'Mark for stand', exact: true }).click()
  // stand dialog: "Mark all for stand" lists every identical copy.
  await page.getByRole('checkbox', { name: /Mark all for stand/ }).check()
  await page.getByRole('button', { name: 'List', exact: true }).click()

  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toMatchObject({ bankPack: 'items1', markAll: true })
  await expect.poll(() => server.standListings.length).toBe(2)
})

test('Auto NPC sale: on the configured merchant the rule is account-wide (no character), shows in its list and can be removed', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58, items: [{ name: 'ironore', q: 5 }] })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  await server.install(page)
  const bodies = postBodies(page, 'merchant/auto-npc-sale')

  await page.goto('/characters/Patinder')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Auto sell to NPC…' }).click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toEqual({ item: { name: 'ironore', q: 5 }, action: 'set' })
  expect(Object.values(server.autoNpcSales)).toEqual([{ item: { name: 'ironore', q: 5 } }])
})

test('Auto NPC sale: on any other character the rule is scoped to that character', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50, items: [{ name: 'ironore', q: 5 }] })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  await server.install(page)
  const bodies = postBodies(page, 'merchant/auto-npc-sale')

  await page.goto('/characters/Ranger1')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Auto sell to NPC…' }).click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toEqual({ item: { name: 'ironore', q: 5 }, character: 'Ranger1', action: 'set' })
})

test('Sell to NPC: a stack defaults to the whole stack, Cancel sends nothing', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58, items: [{ name: 'ironore', q: 200 }] })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore', value: 100 })
  await server.install(page)
  const bodies = postBodies(page, 'merchant/npc-sale')

  await page.goto('/characters/Patinder')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Sell to NPC…', exact: true }).click()
  const sheet = page.getByRole('group', { name: 'Sell to NPC' })
  await expect(sheet.getByRole('textbox', { name: 'Sale quantity' })).toHaveValue('200')
  await expect(sheet.getByText(/You will receive: 12,000g/)).toBeVisible()
  await sheet.getByRole('button', { name: 'Cancel' }).click()
  await page.waitForTimeout(300)
  expect(bodies).toHaveLength(0)

  await page.getByRole('button', { name: 'Sell to NPC…', exact: true }).click()
  await page.getByRole('group', { name: 'Sell to NPC' }).getByRole('button', { name: 'Sell to NPC' }).click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toEqual({ source: 'merchant', slot: 0, item: { name: 'ironore', q: 200 }, quantity: 200, acknowledged: false })
})

test('Auto exchange: an already-marked item is not offered again (the server would toggle it off)', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58, items: [{ name: 'gem0', q: 3 }] })
  server.addCatalogEntry({ id: 'gem0', name: 'Green Gem', definition: { e: 1 } })
  server.extraState = { autoExchanges: { 'gem0@0': { name: 'gem0', level: 0 } } }
  await server.install(page)
  const bodies = postBodies(page, 'command')

  await page.goto('/characters/Patinder')
  await page.getByTestId('inventory-slot-0').click()
  // automatic-item-actions.tsx: disabled once the rule exists.
  const row = page.getByRole('button', { name: 'Auto exchange' })
  await expect(row).toBeDisabled()
  await page.waitForTimeout(300)
  expect(bodies.filter((b) => b.type === 'auto-exchange')).toHaveLength(0)
})

test('Auto exchange: only offered on the configured merchant', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.addCharacter({ name: 'Bankboi0', ctype: 'merchant', level: 1, items: [{ name: 'gem0', q: 3 }] })
  server.merchantCharacter = 'Patinder'
  server.addCatalogEntry({ id: 'gem0', name: 'Green Gem', definition: { e: 1 } })
  await server.install(page)

  await page.goto('/characters/Bankboi0')
  await page.getByTestId('inventory-slot-0').click()
  await expect(page.getByRole('button', { name: 'Mark for bank', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Auto exchange/ })).toHaveCount(0)
})

test('Auto compound: targets stop at +7 even when the item could go higher', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58, items: [{ name: 'ringsj', level: 2 }] })
  server.addCatalogEntry({ id: 'ringsj', name: 'Ring', compoundable: true, maxLevel: 10 })
  await server.install(page)

  await page.goto('/characters/Patinder')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Auto compound' }).click()
  await expect(page.getByRole('button', { name: /^\+7/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^\+8/ })).toHaveCount(0)
})
