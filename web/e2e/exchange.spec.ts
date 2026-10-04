import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function postBodies(page: Page): { path: string; body: Record<string, unknown> }[] {
  const bodies: { path: string; body: Record<string, unknown> }[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/party-api/'))
      bodies.push({ path: request.url().split('/party-api/')[1], body: request.postDataJSON() ?? {} })
  })
  return bodies
}

function exchangeServer() {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [{ name: 'gem0', level: 0, q: 2 }, { name: 'shellbag', level: 0, q: 10 }] })
  server.addCatalogEntry({ id: 'gem0', name: 'Gem', definition: { type: 'box' } })
  server.addCatalogEntry({ id: 'hpot0', name: 'Health Potion', value: 20 })
  server.addCatalogEntry({ id: 'candy0', name: 'Candy' })
  server.addCatalogEntry({ id: 'bow', name: 'Bow', upgradeable: true, maxLevel: 10 })
  server.exchangeable = [
    {
      key: 'gem0@0', id: 'gem0', level: 0, name: 'Gem', cost: 0, required: 1,
      results: [
        { kind: 'hpot0', id: 'hpot0', name: 'Health Potion', quantity: 1, chance: 0.5 },
        { kind: 'gold', id: 'gold', name: 'Gold', quantity: 100, chance: 0.25 },
        { kind: 'candy0', id: 'candy0', name: 'Candy', quantity: 1, chance: 0.25 },
      ],
    },
    { key: 'candy0@0', id: 'candy0', level: 0, name: 'Candy', cost: 0, required: 1, results: [{ kind: 'hpot0', id: 'hpot0', name: 'Health Potion', quantity: 2, chance: 1 }] },
    { key: 'shellbag@0:bow-2', id: 'shellbag', level: 0, name: 'Bow', cost: 0, required: 5, reward: 'bow-2', rewardQuantity: 1, currencyName: 'Shell bag', results: [] },
  ]
  return server
}

test('Exchange rules: required per exchange, passive results, nested drill-down, and currency choices', async ({ page }) => {
  const server = exchangeServer()
  await server.install(page)
  await page.goto('/merchant/exchange')

  await page.getByRole('button', { name: 'Exchange rules for Gem' }).click()
  const rules = page.getByRole('group', { name: 'Exchange details' })
  await expect(rules.getByText('1 required per exchange')).toBeVisible()
  await expect(rules.getByText(/^Potential results$/i)).toBeVisible()
  await expect(rules.getByRole('button', { name: 'Exchange reward: gold +0' })).toBeDisabled()
  await expect(rules.getByRole('button', { name: 'Exchange reward: hpot0 +0' })).toHaveAttribute('title', 'Health Potion · Auto bank (default)')

  // A result that is itself an exchange opens its own rules.
  await rules.getByRole('button', { name: 'Exchange reward: candy0 +0' }).click()
  await page.getByRole('button', { name: 'Item details' }).click()
  await expect(rules.getByText('Candy', { exact: true })).toBeVisible()
  await rules.getByRole('button', { name: 'Close exchange details' }).click()

  // Fixed-reward exchanges group under their currency with a Choose button.
  await page.getByRole('button', { name: 'Choose' }).click()
  await expect(rules.getByText(/^Choose a reward$/i)).toBeVisible()
  await expect(rules.getByRole('button', { name: 'Exchange reward: bow +2' })).toBeVisible()
  await rules.getByRole('button', { name: 'Add' }).click()
  await rules.getByRole('button', { name: 'Close exchange details' }).click()
  await expect(page.getByText('Bow · uses 5 Shell bag')).toBeVisible()
})

test('Exchange tile opens item details with Add; reward tiles in details open their options list', async ({ page }) => {
  const server = exchangeServer()
  await server.install(page)
  const bodies = postBodies(page)
  await page.goto('/merchant/exchange')

  await page.getByRole('button', { name: 'Inspect Gem' }).click()
  await page.getByRole('button', { name: 'Exchange', exact: true }).last().click()
  await expect(page.getByText(/^Rewards$/)).toBeVisible()
  await page.getByRole('button', { name: 'Exchange reward: hpot0 +0' }).click()
  await page.getByRole('button', { name: 'Auto mark for bank' }).click()
  await expect.poll(() => bodies.find((entry) => entry.body.type === 'auto-item-mark')?.body).toMatchObject({ type: 'auto-item-mark', character: 'Merchantina', item: { name: 'hpot0', level: 0 }, mode: 'bank' })

  await page.getByRole('button', { name: 'Add', exact: true }).last().click()
  await expect(page.getByLabel('Gem quantity')).toHaveValue('1')
})

test('Mark multiple: stages bank and upgrade rules as Pending, Done saves them, unsupported rewards stay disabled', async ({ page }) => {
  const server = exchangeServer()
  await server.install(page)
  const bodies = postBodies(page)
  await page.goto('/merchant/exchange')

  await page.getByRole('button', { name: 'Choose' }).click()
  const rules = page.getByRole('group', { name: 'Exchange details' })
  await expect(rules.getByRole('button', { name: 'Bank', exact: true })).toBeDisabled()
  await rules.getByRole('button', { name: 'Mark multiple' }).click()
  await rules.getByRole('button', { name: 'Upgrade', exact: true }).click()
  await rules.getByLabel('Bulk upgrade target level').selectOption('2')
  // +2 is not above the reward's own level.
  await expect(rules.getByRole('button', { name: 'Exchange reward: bow +2' })).toBeDisabled()
  await rules.getByLabel('Bulk upgrade target level').selectOption('5')
  await rules.getByRole('button', { name: 'Exchange reward: bow +2' }).click()
  await expect(rules.getByText('Pending', { exact: true })).toBeVisible()
  await expect(rules.getByText('1 pending changes. Done saves; closing discards.')).toBeVisible()
  await expect(rules.getByRole('button', { name: 'Exchange reward: bow +2' })).toHaveAttribute('title', 'Bow +2 · Auto upgrade → +5')
  await rules.getByRole('button', { name: 'Done' }).click()
  await expect.poll(() => bodies.find((entry) => entry.body.type === 'auto-upgrade-mark')?.body).toMatchObject({ character: 'Merchantina', item: { name: 'bow', level: 2 }, slot: -1, tiers: 3 })
  await expect(rules.getByRole('button', { name: 'Mark multiple' })).toBeVisible()

  await rules.getByRole('button', { name: 'Mark multiple' }).click()
  await rules.getByRole('button', { name: 'Stand', exact: true }).click()
  await expect(rules.getByText('0 pending changes. Done saves; closing discards. Existing prices are kept; new stand rules use the item gold value.')).toBeVisible()
})

test('Exchange reward options include Add upgrade rule for the merchant (upgrade-actions.tsx)', async ({ page }) => {
  const server = exchangeServer()
  await server.install(page)
  await page.goto('/merchant/exchange')
  await page.getByRole('button', { name: 'Choose' }).click()
  await page.getByRole('button', { name: 'Exchange reward: bow +2' }).click()
  await page.getByRole('button', { name: /^Auto mark for upgrade/ }).click()
  await page.getByRole('button', { name: 'Add upgrade rule' }).click()
  await expect(page.getByRole('group', { name: 'Add upgrade rule' })).toBeVisible()
})
