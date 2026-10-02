import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function configBodies(page: Page): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/party-api/config')) bodies.push(request.postDataJSON() as Record<string, unknown>)
  })
  return bodies
}

async function openSettings(page: Page) {
  await page.goto('/characters/Patinder')
  await page.getByRole('button', { name: 'Merchant settings' }).click()
}

test('Collection thresholds: show the server values, not 0', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.extraState = { threshold: 250000, itemCollectionThreshold: 12 }
  await server.install(page)

  await openSettings(page)
  await expect(page.getByRole('textbox', { name: 'Collect above (gold)' })).toHaveValue('250000')
  await expect(page.getByRole('textbox', { name: /Marked slots required/ })).toHaveValue('12')
})

test('Collection thresholds: an out-of-range slot threshold is refused, a valid one is sent as-is', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.extraState = { threshold: 250000, itemCollectionThreshold: 12 }
  await server.install(page)
  const bodies = configBodies(page)

  await openSettings(page)
  const slots = page.getByRole('textbox', { name: /Marked slots required/ })
  await slots.fill('50')
  await page.getByRole('region', { name: 'Automatic item collection' }).getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByText('Use an item-slot threshold from 1 to 42')).toBeVisible()
  expect(bodies).toHaveLength(0)

  const gold = page.getByRole('textbox', { name: 'Collect above (gold)' })
  await gold.fill('300000')
  await page.getByRole('region', { name: 'Automatic gold collection' }).getByRole('button', { name: 'Apply' }).click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toEqual({ threshold: 300000 })
})

test('Merchant settings: buy batch size, stand location and trip switches post what the dashboard posts', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.extraState = { buyUpgradeBatchSize: 3, merchantStandLocation: { map: 'main', x: -40, y: 12 } }
  await server.install(page)
  const bodies: { path: string; body: unknown }[] = []
  page.on('request', (request) => {
    const match = request.url().match(/\/party-api\/(.+)$/)
    if (request.method() === 'POST' && match) bodies.push({ path: match[1], body: request.postDataJSON() })
  })

  await openSettings(page)
  const batch = page.getByRole('textbox', { name: 'Maximum number to buy at once for upgrading' })
  await expect(batch).toHaveValue('3')
  await batch.fill('43')
  await expect(page.locator('fieldset', { hasText: 'Maximum number to buy' }).getByRole('button', { name: 'Apply' })).toBeDisabled()
  await batch.fill('5')
  await page.locator('fieldset', { hasText: 'Maximum number to buy' }).getByRole('button', { name: 'Apply' }).click()
  await expect.poll(() => bodies.find((b) => b.path === 'config')?.body).toEqual({ buyUpgradeBatchSize: 5 })

  await expect(page.getByRole('textbox', { name: 'Stand X' })).toHaveValue('-40')
  await page.getByRole('textbox', { name: 'Stand Y' }).fill('20')
  await page.getByRole('button', { name: 'Save stand location' }).click()
  await expect.poll(() => bodies.find((b) => b.path === 'merchant/stand-location')?.body).toEqual({ map: 'main', x: -40, y: 20 })

  await page.getByRole('checkbox', { name: 'Marked withdrawals create merchant jobs' }).click()
  await expect.poll(() => bodies.find((b) => b.path === 'merchant/routine-priorities')?.body).toEqual({ priorities: {}, enabled: { withdrawals: false } })
})
