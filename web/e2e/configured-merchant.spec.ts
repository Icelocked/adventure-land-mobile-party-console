import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function postBodies(page: Page, path: string): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/party-api/${path}`)) bodies.push(request.postDataJSON() as Record<string, unknown>)
  })
  return bodies
}

test('Bank withdraw goes to the configured merchant, even while it is offline', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  // Only a bankboi (also merchant class) is online; the configured merchant is not.
  server.addCharacter({ name: 'Bankboi0', ctype: 'merchant', level: 1 })
  server.merchantCharacter = 'Patinder'
  server.extraState = { bankbois: [{ name: 'Bankboi0', ctype: 'merchant', state: 'idle', items: [] }] }
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.bankPacks = { items1: [{ slot: 0, item: { name: 'ironore', level: 0, q: 5 } }] }
  await server.install(page)
  const bodies = postBodies(page, 'command')

  await page.goto('/bank')
  await page.getByText('Iron Ore').click()
  await page.getByRole('button', { name: 'Mark for withdrawal' }).click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toMatchObject({ character: 'Patinder', type: 'withdraw', pack: 'items1', slot: 0 })
})

test('Bankbois are not listed as party characters', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.addCharacter({ name: 'Bankboi0', ctype: 'merchant', level: 1 })
  server.extraState = { bankbois: [{ name: 'Bankboi0', ctype: 'merchant', state: 'idle' }] }
  await server.install(page)

  await page.goto('/')
  await expect(page.getByText('Patinder')).toBeVisible()
  await expect(page.getByText('Bankboi0')).toHaveCount(0)
})
