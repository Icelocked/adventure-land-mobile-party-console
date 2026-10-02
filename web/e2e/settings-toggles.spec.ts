import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function postBodies(page: Page, path: string): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/party-api/${path}`)) bodies.push(request.postDataJSON() as Record<string, unknown>)
  })
  return bodies
}

test('Force stand: shows the server value and a tap turns it off', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.extraState = { merchantForceStand: true }
  await server.install(page)
  const bodies = postBodies(page, 'merchant/force-stand')

  await page.goto('/characters/Patinder')
  await page.getByRole('button', { name: /Force stand · On/ }).click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toEqual({ enabled: false })
  await expect(page.getByRole('button', { name: /Force stand · Off/ })).toBeVisible()
})

test('Anniversary auto-chat: shows the server value and unticking turns it off', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.extraState = { anniversaryAutoChat: true }
  await server.install(page)
  const bodies = postBodies(page, 'dashboard-preferences')

  await page.goto('/settings')
  const checkbox = page.locator('div', { hasText: /^Anniversary auto-chat/ }).getByRole('checkbox')
  await expect(checkbox).toBeChecked()
  await checkbox.click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toEqual({ anniversaryAutoChat: false })
  await expect(checkbox).not.toBeChecked()
})

test('Bankboi prefix: shows the saved prefix, trims on save, and shows server errors', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.extraState = { bankboiPrefix: 'MyBank' }
  await server.install(page)
  const bodies = postBodies(page, 'dashboard-preferences')

  await page.goto('/settings')
  const field = page.getByRole('textbox', { name: 'Default name for bankboi' })
  await expect(field).toHaveValue('MyBank')

  await field.fill('  Foo  ')
  await page.getByRole('button', { name: 'Save name' }).click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toEqual({ bankboiPrefix: 'Foo' })
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible()

  await field.fill('ab')
  await page.getByRole('button', { name: 'Save name' }).click()
  await expect(page.getByRole('alert')).toHaveText('Use 3–11 letters, numbers, or underscores')
})
