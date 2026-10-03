import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function bidBodies(page: Page): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/party-api/merchant/bid')) bodies.push(request.postDataJSON())
  })
  return bodies
}

test('WTB list: filter, inline quantity edit with the bid revision, priority clamp, toggles as preferencesOnly', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.addCatalogEntry({ id: 'bow', name: 'Bow', upgradeable: true })
  server.standBids = {
    ironore: { price: 500, quantity: 10, minimumQuality: 0, revision: 3 },
    bow: { price: 9000, quantity: 1, minimumQuality: 4, revision: 1 },
  }
  server.extraState = { nativeStand: { offers: { a: { itemId: 'bow', auto: true, phase: 'live', slot: 'trade1' } }, problems: { bow: 'Not enough gold for this order' } } }
  await server.install(page)
  const bodies = bidBodies(page)

  await page.goto('/wtb')
  await expect(page.getByText('Bow · +4 minimum')).toBeVisible()
  await expect(page.getByRole('group', { name: 'WTB Bow' }).getByText('Auto', { exact: true })).toBeVisible()
  await expect(page.getByText('Not enough gold for this order')).toBeVisible()

  await page.getByLabel('Filter WTB orders').fill('iron')
  await expect(page.getByText('1 / 2')).toBeVisible()
  await expect(page.getByText('Bow · +4 minimum')).toHaveCount(0)
  await page.getByRole('button', { name: 'Clear', exact: true }).click()

  await page.getByRole('button', { name: 'Edit quantity for Iron Ore' }).click()
  await page.getByLabel('Quantity for Iron Ore').fill('25')
  await page.getByLabel('Quantity for Iron Ore').press('Enter')
  await expect.poll(() => bodies[0]).toMatchObject({ itemId: 'ironore', price: 500, quantity: 25, clear: false, editField: 'quantity', value: 25, bidRevision: 3 })

  await page.getByRole('button', { name: 'Edit priority for Iron Ore' }).click()
  await page.getByLabel('Priority for Iron Ore').fill('150')
  await page.getByLabel('Priority for Iron Ore').press('Enter')
  await expect(page.getByRole('alert')).toHaveText('Priority must be 0–100 or blank.')
  await page.getByLabel('Priority for Iron Ore').press('Escape')

  await page.getByRole('group', { name: 'WTB Bow' }).getByRole('checkbox', { name: 'Accept higher levels' }).click()
  await expect.poll(() => bodies[1]).toMatchObject({ itemId: 'bow', acceptHigherLevels: false, preferencesOnly: true })
})

test('WTB dialog: presets at the exact level, and a full stand asks which entry to replace', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore', value: 100 })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat' })
  server.extraState = { standPriceHistory: { ironore: { lowest: 80, lowestLevel: 0, recent: 120, recentLevel: 0, seenAt: 1 } } }
  server.standFullOccupants = [{ id: 'listing-9', itemId: 'wcoat', kind: 'sale', price: 4000, quantity: 1 }]
  await server.install(page)
  const bodies = bidBodies(page)

  await page.goto('/wtb')
  await page.getByRole('button', { name: 'New WTB order' }).click()
  await page.getByPlaceholder('Search items...').fill('Iron Ore')
  await page.getByText('Iron Ore').click()
  const dialog = page.getByRole('dialog', { name: 'Add to WTB' })
  await dialog.getByRole('button', { name: /^Recent \+5%/ }).click()
  await expect(dialog.getByLabel('Maximum price')).toHaveValue('126')
  await dialog.getByRole('button', { name: /^Lowest seen/ }).click()
  await expect(dialog.getByLabel('Maximum price')).toHaveValue('80')
  await expect(dialog.getByRole('button', { name: /^Market price/ })).toBeDisabled()
  await dialog.getByLabel('Priority override').fill('250')
  await expect(dialog.getByLabel('Priority override')).toHaveValue('100')
  await dialog.getByRole('checkbox', { name: 'Use stand' }).check()
  await dialog.getByRole('button', { name: 'Place WTB' }).click()

  const replace = page.getByRole('dialog', { name: 'Make room for a buy order' })
  await expect(replace.getByText('1 at 4,000g each')).toBeVisible()
  await replace.getByRole('radio').check()
  await replace.getByRole('button', { name: 'Replace listing' }).click()
  await expect.poll(() => bodies[1]).toMatchObject({ itemId: 'ironore', price: 80, priorityOverride: 100, useStandSlot: true, replaceStandEntry: 'listing-9' })
  await expect(page.getByRole('button', { name: 'Edit price for Iron Ore' })).toHaveText('80g')
})
