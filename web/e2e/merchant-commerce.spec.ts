import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

/** Affordability gating: "Add" only guards the +1 tap, so typing a larger
 *  quantity into a cart row must still disable Craft/Exchange when the whole
 *  cart is unaffordable. Each test enables via Add, then overruns by typing. */

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
  // "Craft" also matches the mode tab, so scope to the submit bar.
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

  await page.getByPlaceholder('Search items…').fill('potion')
  await page.getByRole('button', { name: 'Craft', exact: true }).first().click()
  await expect(page.getByPlaceholder('Search items…')).toHaveValue('')
  // A recipe whose materials are missing stays inspectable.
  await page.getByRole('button', { name: 'Inspect Iron Sword' }).click()
  await expect(page.getByRole('button', { name: 'Add to WTB' })).toBeVisible()
})

test('Buy on a phone: the cart stays pinned, so an item added far down the list shows at once', async ({ page }) => {
  // Failure mode: the cart sits after the whole catalog, so confirming an
  // addition means scrolling to the bottom and back.
  await page.setViewportSize({ width: 390, height: 780 })
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [] })
  server.buyable = Array.from({ length: 40 }, (_, i) => ({ id: `item${i}`, name: `Item ${String(i).padStart(2, '0')}`, cost: 10 + i }))
  await server.install(page)

  await page.goto('/merchant/buy')
  const cart = page.getByRole('region', { name: 'Cart' })
  await expect(cart).toBeInViewport()
  const row = page.locator('.rounded-md.border', { hasText: 'Item 30' })
  await row.scrollIntoViewIfNeeded()
  await row.getByRole('button', { name: 'Add' }).click()
  // Still on screen without scrolling, with the new line and the total.
  await expect(cart).toBeInViewport()
  await expect(cart.getByLabel('Item 30 quantity')).toBeInViewport()
  await expect(cart.getByText('Gold: 40g')).toBeVisible()
  await expect(cart.getByRole('button', { name: 'Buy all' })).toBeInViewport()
  // The header folds the cart away and back.
  await cart.getByRole('button', { name: /Cart \(1\)/ }).click()
  await expect(cart.getByLabel('Item 30 quantity')).toHaveCount(0)
  await row.getByRole('button', { name: 'Add' }).click()
  await expect(cart.getByLabel('Item 30 quantity')).toHaveValue('2')
})
