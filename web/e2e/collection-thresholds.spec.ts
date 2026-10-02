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
  await page.getByRole('button', { name: 'Collection settings' }).click()
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
  await page.getByRole('button', { name: 'Apply' }).nth(1).click()
  await expect(page.getByText('Use an item-slot threshold from 1 to 42')).toBeVisible()
  expect(bodies).toHaveLength(0)

  const gold = page.getByRole('textbox', { name: 'Collect above (gold)' })
  await gold.fill('300000')
  await page.getByRole('button', { name: 'Apply' }).first().click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toEqual({ threshold: 300000 })
})
