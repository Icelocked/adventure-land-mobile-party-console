import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function postBodies(page: Page, path: string): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/party-api/${path}`)) bodies.push(request.postDataJSON() as Record<string, unknown>)
  })
  return bodies
}

test('WTB unconfirmed purchase: the paused order says what happened and resolves through native-stand', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.addCatalogEntry({ id: 'bow', name: 'Bow', upgradeable: true })
  server.standBids = {
    ironore: { price: 500, quantity: 10, minimumQuality: 0, revision: 1 },
    bow: { price: 9000, quantity: 1, minimumQuality: 0, revision: 1 },
  }
  const id = 'native-buy-7:Seller:ironore'
  server.extraState = { nativeStand: { offers: {}, problems: {}, purchases: { [id]: { item: { name: 'ironore', price: 480 }, quantity: 4, jobId: 'native-buy-7' } } } }
  await server.install(page)
  const bodies = postBodies(page, 'merchant/native-stand')

  await page.goto('/wtb')
  const notice = page.getByRole('group', { name: 'Unconfirmed purchase of Iron Ore' })
  await expect(notice).toContainText('Purchase outcome unconfirmed: 4 × Iron Ore at 480 from Seller.')
  await expect(page.getByRole('group', { name: 'Unconfirmed purchase of Bow' })).toHaveCount(0)

  await notice.getByRole('button', { name: 'It was bought' }).click()
  await expect.poll(() => bodies[0]).toEqual({ action: 'resolve-purchase', id, bought: true })
  await expect(notice).toHaveCount(0)
})

test('WTB unconfirmed purchase: "It wasn\'t bought" sends bought false and a refusal stays visible', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.standBids = { ironore: { price: 500, quantity: 10, minimumQuality: 0, revision: 1 } }
  const id = 'native-buy-8:Seller:ironore'
  server.extraState = { nativeStand: { offers: {}, problems: {}, purchases: { [id]: { item: { name: 'ironore', price: 480 }, quantity: 4, jobId: 'native-buy-8' } } } }
  server.failOnce['merchant/native-stand'] = 'That purchase is still in progress'
  await server.install(page)
  const bodies = postBodies(page, 'merchant/native-stand')

  await page.goto('/wtb')
  const notice = page.getByRole('group', { name: 'Unconfirmed purchase of Iron Ore' })
  await notice.getByRole('button', { name: "It wasn't bought" }).click()
  await expect(notice.getByRole('alert')).toHaveText('That purchase is still in progress')
  expect(bodies[0]).toEqual({ action: 'resolve-purchase', id, bought: false })
})

test('Auto NPC sale on the merchant: Keep in storage prefills from the rule and is sent as text; blank omits it', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58, items: [{ name: 'ironore', q: 5 }, { name: 'hpot0', q: 9 }] })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.addCatalogEntry({ id: 'hpot0', name: 'Health Potion' })
  server.autoNpcSales = { [JSON.stringify({ name: 'ironore', level: 0, p: null, stat_type: null })]: { item: { name: 'ironore' }, keep: 3 } }
  await server.install(page)
  const bodies = postBodies(page, 'merchant/auto-npc-sale')

  await page.goto('/characters/Patinder')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Update auto sell to NPC…' }).click()
  const keep = page.getByLabel('Keep in storage')
  await expect(keep).toHaveValue('3')
  await keep.fill('12')
  await page.getByRole('button', { name: 'Enable auto sale' }).click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toEqual({ item: { name: 'ironore', q: 5 }, action: 'set', keep: '12' })
  expect(Object.values(server.autoNpcSales)[0]).toMatchObject({ keep: 12 })

  await page.getByTestId('inventory-slot-1').click()
  await page.getByRole('button', { name: 'Auto sell to NPC…' }).click()
  await expect(page.getByLabel('Keep in storage')).toHaveValue('')
  await page.getByRole('button', { name: 'Enable auto sale' }).click()
  await expect.poll(() => bodies.length).toBe(2)
  expect(bodies[1]).toEqual({ item: { name: 'hpot0', q: 9 }, action: 'set' })
})

test('Auto NPC sale on another character: no Keep in storage field, since only merchant-wide rules keep copies', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50, items: [{ name: 'ironore', q: 5 }] })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  await server.install(page)

  await page.goto('/characters/Ranger1')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Auto sell to NPC…' }).click()
  await expect(page.getByRole('group', { name: 'Automatically sell to NPC?' })).toBeVisible()
  await expect(page.getByLabel('Keep in storage')).toHaveCount(0)
})

test('Prim stack: offered under Mark for upgrade on a merchant item, posts target and method, shows grace from the preview', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [null, { name: 'bow', level: 9, stat_type: 'dex' }] })
  server.addCatalogEntry({ id: 'bow', name: 'Bow', upgradeable: true, maxLevel: 12, definition: { stat: 1, grades: [7, 10, 12, 13] } })
  server.addCatalogEntry({ id: 'dexscroll', name: 'Scroll of Dexterity' })
  server.extraState = { upgradeOfferingStock: { offeringp: 3 } }
  server.upgradePreview = { status: 'complete', result: { options: { none: { preview: { chance: 0.4, grace: 2.5 }, observedAt: 1_700_000_000_000 } } } }
  await server.install(page)
  const bodies = postBodies(page, 'prim-stack')

  await page.goto('/characters/Merchantina')
  await page.getByTestId('inventory-slot-1').click()
  await page.getByRole('button', { name: 'Mark for upgrade', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Upgrade chances' }).getByText('Grace 2.5')).toBeVisible()
  await page.getByRole('button', { name: 'Prim stack…' }).click()
  const dialog = page.getByRole('group', { name: 'Prim stack' })
  await expect(dialog.getByLabel('Target grace')).toHaveValue('11')
  await expect(dialog.getByText('3 Primlings in merchant inventory and storage.', { exact: false })).toBeVisible()
  // Level 9 against grades [7, 10, 12, 13] is grade 1: ten scrolls per stack.
  await dialog.getByRole('radio', { name: 'Primling + 10 × Scroll of Dexterity (+1 grace each, keeps DEX)' }).check()
  await dialog.getByLabel('Target grace').selectOption('7.5')
  await dialog.getByRole('button', { name: 'Stack grace' }).click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toEqual({ character: 'Merchantina', slot: 1, item: { name: 'bow', level: 9, stat_type: 'dex' }, target: 7.5, method: 'stat' })
  await expect(dialog).toHaveCount(0)
})

test('Prim stack: disabled without Primlings and on non-merchant items; an item without a stat only offers Primling only', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [{ name: 'bow', level: 2 }] })
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50, items: [{ name: 'bow', level: 2 }] })
  server.addCatalogEntry({ id: 'bow', name: 'Bow', upgradeable: true, maxLevel: 12, buyable: true })
  server.extraState = { upgradeOfferingStock: { offeringp: 1 } }
  await server.install(page)
  const bodies = postBodies(page, 'prim-stack')

  await page.goto('/characters/Ranger1')
  await page.getByTestId('inventory-slot-0').click()
  // Console 1.4 inventory-panel.tsx no longer offers "Buy another level 0".
  await expect(page.getByRole('button', { name: 'Buy another level 0' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Mark for upgrade', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Prim stack…' })).toBeDisabled()

  await page.goto('/characters/Merchantina')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Mark for upgrade', exact: true }).click()
  await page.getByRole('button', { name: 'Prim stack…' }).click()
  const dialog = page.getByRole('group', { name: 'Prim stack' })
  await expect(dialog.getByLabel('Target grace')).toHaveValue('4')
  await expect(dialog.getByRole('radio', { name: 'Primling + stat scroll (needs an item with an applied stat)' })).toBeDisabled()
  await expect(dialog.getByText('1 Primling in merchant inventory and storage.', { exact: false })).toBeVisible()
  await dialog.getByRole('button', { name: 'Stack grace' }).click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toEqual({ character: 'Merchantina', slot: 0, item: { name: 'bow', level: 2 }, target: 4, method: 'offering' })
})
