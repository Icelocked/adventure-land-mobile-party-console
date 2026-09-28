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
