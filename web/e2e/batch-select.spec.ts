import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

// V150-PORT-MAP.md F6: console v1.5.0 batch select (item-selection.tsx). The bodies follow
// connected-inventory.tsx and party-inventory-panels.tsx `onBatchCommand` and
// exchange-reward-tile.tsx's batch menu.

function posts(page: Page, path: string): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/party-api/${path}`)) bodies.push(request.postDataJSON() as Record<string, unknown>)
  })
  return bodies
}

test('Inventory batch: one /command per item, and a locked item turns the rows off', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58, items: [{ name: 'bow', level: 2 }, { name: 'blade', level: 4 }, { name: 'staff', level: 1, l: 'l' }] })
  server.addCatalogEntry({ id: 'bow', name: 'Bow', upgradeable: true })
  server.addCatalogEntry({ id: 'blade', name: 'Blade', upgradeable: true })
  server.addCatalogEntry({ id: 'staff', name: 'Staff', upgradeable: true })
  await server.install(page)
  const bodies = posts(page, 'command')

  await page.goto('/characters/Patinder')
  const inventory = page.getByRole('region', { name: 'Inventory' })
  await inventory.getByRole('button', { name: 'Select', exact: true }).click()
  const bar = inventory.getByRole('group', { name: 'Selected items' })
  await inventory.getByRole('button', { name: 'Bow', exact: true }).click()
  // One item opens no batch menu; forEntry needs two.
  await expect(bar.getByRole('button', { name: 'Actions' })).toBeDisabled()
  await inventory.getByRole('button', { name: 'Blade', exact: true }).click()
  await expect(bar.getByText('2 selected items')).toBeVisible()
  await bar.getByRole('button', { name: 'Actions' }).click()
  const actions = page.getByRole('dialog', { name: 'Batch actions' })
  await expect(actions.getByRole('button', { name: 'Mark selected for bank' })).toBeVisible()
  await expect(actions.getByRole('button', { name: 'Auto upgrade each by one level' })).toBeVisible()
  await actions.getByRole('button', { name: 'Upgrade each by one level', exact: true }).click()
  await expect.poll(() => bodies).toEqual([
    { character: 'Patinder', type: 'upgrade-mark', item: { name: 'bow', level: 2 }, slot: 0, tiers: 1 },
    { character: 'Patinder', type: 'upgrade-mark', item: { name: 'blade', level: 4 }, slot: 1, tiers: 1 },
  ])

  await inventory.getByRole('button', { name: 'Staff', exact: true }).click()
  await bar.getByRole('button', { name: 'Actions' }).click()
  const locked = page.getByRole('dialog', { name: 'Batch actions' })
  await expect(locked.getByText('3 selected items')).toBeVisible()
  await expect(locked.getByRole('button', { name: /selected|each|Auto/ })).toHaveCount(0)
})

test('Bank batch: withdraw marks skip an item already marked, and auto rules carry pack and slot', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.addCatalogEntry({ id: 'bow', name: 'Bow', upgradeable: true })
  server.bankPacks = { items1: [{ slot: 0, item: { name: 'ironore', q: 5 } }, { slot: 1, item: { name: 'bow', level: 2 } }] }
  server.withdrawals = { Patinder: [{ pack: 'items1', slot: 0, item: { name: 'ironore', q: 5 } }] }
  await server.install(page)
  const bodies = posts(page, 'command')

  await page.goto('/bank')
  await page.getByRole('button', { name: 'Select', exact: true }).click()
  await page.getByRole('button', { name: /Iron Ore x5/ }).click()
  await page.getByRole('button', { name: /Bow \+2/ }).click()
  const bar = page.getByRole('group', { name: 'Selected items' })
  await bar.getByRole('button', { name: 'Actions' }).click()
  // bank-sheet.tsx onBank: a withdrawal is a toggle, so the marked iron ore sends nothing.
  await page.getByRole('dialog', { name: 'Batch actions' }).getByRole('button', { name: 'Mark selected for bank' }).click()
  await expect.poll(() => bodies).toEqual([{ character: 'Patinder', type: 'withdraw', pack: 'items1', slot: 1, item: { name: 'bow', level: 2 }, markAll: false }])

  await bar.getByRole('button', { name: 'Actions' }).click()
  await page.getByRole('dialog', { name: 'Batch actions' }).getByRole('button', { name: 'Auto mark for bank' }).click()
  await expect.poll(() => bodies.slice(1)).toEqual([
    { character: 'Patinder', type: 'auto-item-mark', pack: 'items1', slot: 0, item: { name: 'ironore', q: 5 }, mode: 'bank' },
    { character: 'Patinder', type: 'auto-item-mark', pack: 'items1', slot: 1, item: { name: 'bow', level: 2 }, mode: 'bank' },
  ])
})

test('Item details batch: exchange rewards get the merchant rules at slot -1', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [{ name: 'gem0', level: 0, q: 2 }] })
  server.addCatalogEntry({ id: 'gem0', name: 'Gem', definition: { type: 'box' } })
  server.addCatalogEntry({ id: 'hpot0', name: 'Health Potion' })
  server.addCatalogEntry({ id: 'candy0', name: 'Candy' })
  server.exchangeable = [
    {
      key: 'gem0@0', id: 'gem0', level: 0, name: 'Gem', cost: 0, required: 1,
      results: [
        { kind: 'hpot0', id: 'hpot0', name: 'Health Potion', quantity: 1, chance: 0.5 },
        { kind: 'gold', id: 'gold', name: 'Gold', quantity: 100, chance: 0.25 },
        { kind: 'candy0', id: 'candy0', name: 'Candy', quantity: 1, chance: 0.25 },
      ],
    },
  ]
  await server.install(page)
  const bodies = posts(page, 'command')

  await page.goto('/merchant/exchange')
  await page.getByRole('button', { name: 'Inspect Gem' }).click()
  await page.getByRole('button', { name: 'Exchange', exact: true }).last().click()
  await page.getByRole('button', { name: 'Select', exact: true }).click()
  await page.getByRole('button', { name: 'Exchange reward: hpot0 +0' }).click()
  await page.getByRole('button', { name: 'Exchange reward: candy0 +0' }).click()
  await page.getByRole('group', { name: 'Selected items' }).getByRole('button', { name: 'Actions' }).click()
  await page.getByRole('dialog', { name: 'Batch actions' }).getByRole('button', { name: 'Auto mark for bank' }).click()
  await expect.poll(() => bodies).toEqual([
    { character: 'Merchantina', type: 'auto-item-mark', item: { name: 'hpot0', level: 0 }, mode: 'bank', slot: -1 },
    { character: 'Merchantina', type: 'auto-item-mark', item: { name: 'candy0', level: 0 }, mode: 'bank', slot: -1 },
  ])
})
