import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

/** Regression coverage for the affordability-gating bug fixed earlier this
 *  project: the per-recipe/per-item "Add" button only guards the
 *  incremental +1 tap - typing a larger quantity directly into the cart
 *  row's own Input bypassed it entirely, leaving Craft/Exchange's actual
 *  submit button enabled for an order the account couldn't afford. The fix
 *  added an aggregate check across the whole cart; these tests exercise
 *  exactly that path (enable via Add, then overrun via direct typing). */

test('Craft: submit disables when the cart is typed past what materials are on hand', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({
    name: 'Merchantina',
    ctype: 'merchant',
    level: 30,
    items: [{ name: 'ironore', level: 0, q: 3 }],
  })
  server.craftable = [
    {
      id: 'ironsword',
      name: 'Iron Sword',
      cost: 100,
      materials: [{ id: 'ironore', name: 'Iron Ore', quantity: 3, level: 0 }],
    },
  ]
  await server.install(page)

  await page.goto('/merchant/craft')
  await expect(page.getByText('Iron Sword')).toBeVisible()

  await page.getByRole('button', { name: 'Add' }).click()
  // "Craft" also matches the mode-tab chip above the list - scope to the
  // sticky submit bar specifically.
  const craftButton = page.locator('.sticky.bottom-0').getByRole('button', { name: 'Craft', exact: true })
  await expect(craftButton).toBeEnabled()

  await page.getByLabel('Iron Sword quantity').fill('2')
  await expect(craftButton).toBeDisabled()

  await page.getByLabel('Iron Sword quantity').fill('1')
  await expect(craftButton).toBeEnabled()
})

test('Exchange: submit disables when the cart is typed past what materials are on hand', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({
    name: 'Merchantina',
    ctype: 'merchant',
    level: 30,
    items: [{ name: 'ironbox', level: 0, q: 3 }],
  })
  server.exchangeable = [
    { key: 'ironbox@0', id: 'ironbox', level: 0, name: 'Iron Box', cost: 0, required: 3, results: [] },
  ]
  await server.install(page)

  await page.goto('/merchant/exchange')
  await expect(page.getByText('Iron Box')).toBeVisible()

  await page.getByRole('button', { name: 'Add' }).click()
  const exchangeButton = page.getByRole('button', { name: 'Exchange all', exact: true })
  await expect(exchangeButton).toBeEnabled()

  await page.getByLabel('Iron Box quantity').fill('2')
  await expect(exchangeButton).toBeDisabled()

  await page.getByLabel('Iron Box quantity').fill('1')
  await expect(exchangeButton).toBeEnabled()
})

test('Buy: 90% budget estimate, Gold (est), 9999 cap, budget sent, and 409 missing details', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [] })
  server.buyable = [
    { id: 'hpot0', name: 'Health Potion', cost: 20 },
    { id: 'bow', name: 'Bow', cost: 1000, upgradeable: true, upgradeGrade: 0, grades: [9, 10, 11, 12], upgradeChances: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  ]
  await server.install(page)

  await page.goto('/merchant/buy')
  const rows = page.locator('.rounded-md.border', { hasText: 'Health Potion' })
  await rows.getByRole('button', { name: 'Add' }).click()
  await page.getByLabel('Health Potion quantity').fill('123456')
  await expect(page.getByLabel('Health Potion quantity')).toHaveValue('9999')
  await page.getByLabel('Health Potion quantity').fill('3')
  await expect(page.getByText('Gold: 60g')).toBeVisible()

  await page.locator('.rounded-md.border', { hasText: 'Bow' }).getByRole('button', { name: 'Add' }).click()
  await page.getByLabel('Bow target level').fill('+2')
  await expect(page.getByText(/^90% budget: 1 base items/)).toBeVisible()
  await expect(page.getByText(/^Gold \(est\): /)).toBeVisible()

  server.failOnce['merchant/order'] = 'Not enough gold'
  server.failOnceBody['merchant/order'] = { missing: [{ id: 'bow', level: 0, required: 5, available: 2 }] }
  await page.getByRole('button', { name: 'Buy all' }).click()
  await expect(page.getByRole('alert')).toHaveText('Not enough gold · bow +0: 5 required, 2 available')

  await page.getByRole('button', { name: 'Buy all' }).click()
  await expect.poll(() => server.lastOrder).not.toBeNull()
  const buys = server.lastOrder!.buys as Record<string, unknown>[]
  expect(buys[0]).toEqual({ id: 'hpot0', quantity: 3 })
  expect(buys[1]).toMatchObject({ id: 'bow', quantity: 1, level: 2, maxAttempts: 1 })
  expect(typeof buys[1].budget).toBe('number')
})

test('Craft: owned counts include bankbois, gold adds ingredient purchases, recipe preview shows the next craft cost', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [{ name: 'ironore', level: 0, q: 1 }] })
  server.extraState = { bankbois: [{ name: 'Bankboi0', ctype: 'merchant', state: 'ready', items: [{ slot: 0, item: { name: 'ironore', level: 0, q: 1 } }] }] }
  server.buyable = [{ id: 'ironore', name: 'Iron Ore', cost: 50 }]
  server.craftable = [{ id: 'ironsword', name: 'Iron Sword', cost: 100, materials: [{ id: 'ironore', name: 'Iron Ore', quantity: 3, level: 0 }] }]
  await server.install(page)

  await page.goto('/merchant/craft')
  await page.getByRole('button', { name: 'Complete recipe' }).click()
  const recipe = page.getByRole('group', { name: 'Iron Sword recipe' })
  await expect(recipe.getByText('2 owned · buy 1')).toBeVisible()
  await expect(recipe.getByText('Next craft: 150g total')).toBeVisible()

  await page.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByText('3 needed · 2 owned · buy 1')).toBeVisible()
  await expect(page.getByText('Gold: 150g')).toBeVisible()
  await expect(recipe.getByText('Next craft: 250g total')).toBeVisible()
})

test('Commerce parity: Buy description, always-visible empty cart, catalog rows open item details, search clears on mode switch', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [] })
  server.addCatalogEntry({ id: 'hpot0', name: 'Health Potion' })
  server.addCatalogEntry({ id: 'ironsword', name: 'Iron Sword' })
  server.buyable = [{ id: 'hpot0', name: 'Health Potion', cost: 20 }]
  server.craftable = [{ id: 'ironsword', name: 'Iron Sword', cost: 100, materials: [{ id: 'ironore', name: 'Iron Ore', quantity: 3, level: 0 }] }]
  await server.install(page)

  await page.goto('/merchant/buy')
  await expect(page.getByText('Choose anything sold for gold.')).toBeVisible()
  await expect(page.getByText('Nothing selected.')).toBeVisible()
  await expect(page.getByText('Gold: 0g')).toBeVisible()
  await page.getByRole('button', { name: 'Inspect Health Potion' }).click()
  await expect(page.getByRole('button', { name: 'Add to WTB' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByPlaceholder('Search items...').fill('potion')
  await page.getByRole('button', { name: 'Craft', exact: true }).first().click()
  await expect(page.getByPlaceholder('Search items...')).toHaveValue('')
  // A recipe whose materials are missing stays inspectable.
  await page.getByRole('button', { name: 'Inspect Iron Sword' }).click()
  await expect(page.getByRole('button', { name: 'Add to WTB' })).toBeVisible()
})
