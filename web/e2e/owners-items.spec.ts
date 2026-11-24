import { test, expect, type Page } from '@playwright/test'
import { OwnersSet2Mock } from './fixtures/ownersSet2Mock'

// OWNERS-PORT-MAP.md B11 (and later item rows): the owners release's auto NPC sale keep, as
// party-management-panels.tsx asks for it and inventory-panel.tsx lists the rules.

function postBodies(page: Page, path: string): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/party-api/${path}`)) bodies.push(request.postDataJSON() as Record<string, unknown>)
  })
  return bodies
}
const ruleKey = (name: string) => JSON.stringify({ name, level: 0, p: null, stat_type: null })

test('B11: a merchant-wide auto NPC sale asks for the reserve, starts at 0 and sends it as text', async ({ page }) => {
  const server = new OwnersSet2Mock()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58, items: [{ name: 'ironore', q: 5 }, { name: 'hpot0', q: 9 }] })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.addCatalogEntry({ id: 'hpot0', name: 'Health Potion' })
  server.autoNpcSales = { [ruleKey('ironore')]: { item: { name: 'ironore' }, keep: 3 } }
  await server.install(page)
  const bodies = postBodies(page, 'merchant/auto-npc-sale')

  await page.goto('/characters/Patinder')
  await page.getByTestId('inventory-slot-1').click()
  await page.getByRole('button', { name: 'Auto sell to NPC…' }).click()
  const keep = page.getByLabel('Number to keep reserved')
  await expect(keep).toHaveValue('0')
  await expect(page.getByText(/Enter 0 to sell every copy\.$/)).toBeVisible()
  await page.getByRole('button', { name: 'Enable auto sale' }).click()
  await expect.poll(() => bodies[0]).toEqual({ item: { name: 'hpot0', q: 9 }, action: 'set', keep: '0' })

  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Update auto sell to NPC…' }).click()
  await expect(page.getByLabel('Number to keep reserved')).toHaveValue('3')
})

test("B11: the merchant lists a character's own NPC sale rule with its owner and removes it for that owner", async ({ page }) => {
  const server = new OwnersSet2Mock()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.addCatalogEntry({ id: 'hpot0', name: 'Health Potion' })
  server.autoNpcSales = {
    [JSON.stringify(['Ranger1', ruleKey('ironore')])]: { item: { name: 'ironore' }, character: 'Ranger1' },
    [ruleKey('hpot0')]: { item: { name: 'hpot0' }, keep: 2 },
  }
  await server.install(page)
  const bodies = postBodies(page, 'merchant/auto-npc-sale')

  await page.goto('/characters/Patinder')
  const rules = page.getByRole('region', { name: 'Auto NPC sales' })
  await rules.getByRole('button', { name: /^Auto NPC sales/ }).click()
  await expect(rules.getByText('Ranger1')).toBeVisible()
  // Only the merchant-wide rule keeps copies.
  await expect(rules.getByRole('button', { name: 'Keep 2' })).toBeVisible()
  await expect(rules.getByRole('button', { name: /^Keep / })).toHaveCount(1)
  await rules.getByRole('button', { name: 'Remove Iron Ore' }).click()
  await rules.getByRole('button', { name: 'Really remove Iron Ore' }).click()
  await expect.poll(() => bodies[0]).toEqual({ item: { name: 'ironore' }, character: 'Ranger1', action: 'remove' })
  await expect(rules.getByText('Ranger1')).toHaveCount(0, { timeout: 12_000 })
})

test('B13: select mode batches the inventory: one /command per item, and a locked item turns the rows off', async ({ page }) => {
  const server = new OwnersSet2Mock()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58, items: [{ name: 'bow', level: 2 }, { name: 'blade', level: 4 }, { name: 'staff', level: 1, l: 'l' }] })
  server.addCatalogEntry({ id: 'bow', name: 'Bow', upgradeable: true })
  server.addCatalogEntry({ id: 'blade', name: 'Blade', upgradeable: true })
  server.addCatalogEntry({ id: 'staff', name: 'Staff', upgradeable: true })
  await server.install(page)
  const bodies = postBodies(page, 'command')

  await page.goto('/characters/Patinder')
  const inventory = page.getByRole('region', { name: 'Inventory' })
  await inventory.getByRole('button', { name: 'Select', exact: true }).click()
  const bar = inventory.getByRole('group', { name: 'Selected items' })
  await inventory.getByRole('button', { name: 'Bow', exact: true }).click()
  // One item opens no batch list; the release's menu needs two.
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

test('B13: exchange rewards in item details batch the merchant rules at slot -1', async ({ page }) => {
  const server = new OwnersSet2Mock()
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
  const bodies = postBodies(page, 'command')

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
