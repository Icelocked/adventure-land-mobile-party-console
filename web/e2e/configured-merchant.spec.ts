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

test('Bank withdraw of an auto-bank-marked item asks to remove the mark, then retries with consent', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.bankPacks = { items1: [{ slot: 0, item: { name: 'ironore', level: 0, q: 5 } }] }
  server.extraState = { autoItemMarks: { Patinder: { 'ironore@+0': 'bank' } } }
  await server.install(page)
  const bodies = postBodies(page, 'command')

  await page.goto('/bank')
  await page.getByText('Iron Ore').click()
  await page.getByRole('button', { name: 'Mark for withdrawal' }).click()
  const dialog = page.getByRole('group', { name: 'Remove automatic bank mark?' })
  await expect(dialog).toBeVisible()
  expect(bodies[0]).toMatchObject({ removeAutoBankMark: false })

  await dialog.getByRole('button', { name: 'Confirm' }).click()
  await expect.poll(() => bodies.length).toBe(2)
  expect(bodies[1]).toMatchObject({ type: 'withdraw', removeAutoBankMark: true })
  await expect.poll(() => server.withdrawals.Patinder?.length).toBe(1)
})
