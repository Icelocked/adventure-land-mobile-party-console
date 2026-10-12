import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

test('Pairing gate: an access code pairs this device; a wrong one shows the server error (setup-client.ts pairButton)', async ({ page }) => {
  const server = new MockPartyServer()
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.requirePairing = true
  server.accessCode = { code: 'K7MQ-2PXA', expiresAt: Date.now() + 600_000, failures: 0 }
  await server.install(page)
  await page.goto('/')

  const code = page.getByRole('textbox', { name: 'Access code' })
  const pair = page.getByRole('button', { name: 'Pair with access code' })
  await pair.click()
  await expect(page.getByRole('alert')).toHaveText('Enter the access code shown on a paired browser')
  expect(server.pairRequests).toEqual([])

  await code.fill('WRNG-CODE')
  await pair.click()
  await expect(page.getByRole('alert')).toHaveText('Access code is invalid or expired')
  expect(server.pairRequests).toEqual([{ code: 'WRNG-CODE' }])

  // Typed in lower case without the dash: sent as typed, matched by the server.
  await code.fill('  k7mq 2pxa ')
  await code.press('Enter')
  await expect(page.getByText('Merchantina')).toBeVisible()
  expect(server.pairRequests.at(-1)).toEqual({ code: 'k7mq 2pxa' })
  expect(server.accessCode).toBeNull()
})

test('Pairing gate: an expired access code is refused', async ({ page }) => {
  const server = new MockPartyServer()
  server.requirePairing = true
  server.accessCode = { code: 'K7MQ-2PXA', expiresAt: Date.now() - 1, failures: 0 }
  await server.install(page)
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Access code' }).fill('K7MQ-2PXA')
  await page.getByRole('button', { name: 'Pair with access code' }).click()
  await expect(page.getByRole('alert')).toHaveText('Access code is invalid or expired')
  await expect(page.getByRole('heading', { name: 'Pair this device' })).toBeVisible()
})

function pairedServer() {
  const server = new MockPartyServer()
  server.paired = true
  server.requirePairing = true
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60 })
  return server
}

test('Settings: Pair another browser shows the access code, its countdown, the setup address and the link, until another browser uses it', async ({ page }) => {
  const server = pairedServer()
  await server.install(page)
  const invites: unknown[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/setup/invite')) invites.push(request.postDataJSON())
  })
  await page.goto('/settings')

  const hosting = page.getByRole('region', { name: 'Hosting' })
  await hosting.getByRole('button', { name: 'Pair another browser' }).click()
  const invitation = hosting.getByRole('group', { name: 'Pairing invitation' })
  await expect(invitation.getByText('K7MQ-2PXA', { exact: true })).toBeVisible()
  expect(invites).toEqual([{}])
  await expect(invitation.getByText(/\(expires in (10:00|9:5\d)\)/)).toBeVisible()
  const origin = new URL(page.url()).origin
  await expect(invitation.getByText(`${origin}/setup`, { exact: true })).toBeVisible()
  await invitation.getByText('Use a pairing link instead').click()
  await expect(invitation.getByText(`${origin}/setup#${'c0ffee'.repeat(10)}c0de`)).toBeVisible()

  // Another browser pairs with it: /setup/state's accessCodeExpiresAt turns null.
  server.accessCode = null
  await expect(hosting.getByRole('status')).toHaveText('The access code was used or replaced. Choose Pair another browser for a new one.', { timeout: 8000 })
  await expect(invitation).toHaveCount(0)
})

test('Settings: the access code ends when it expires, and an invite failure shows its error', async ({ page }) => {
  const server = pairedServer()
  server.accessCodeTtlMs = 2000
  await server.install(page)
  await page.goto('/settings')

  const hosting = page.getByRole('region', { name: 'Hosting' })
  await hosting.getByRole('button', { name: 'Pair another browser' }).click()
  await expect(hosting.getByText('K7MQ-2PXA', { exact: true })).toBeVisible()
  await expect(hosting.getByRole('status')).toHaveText('The access code expired. Choose Pair another browser for a new one.', { timeout: 8000 })

  // A browser whose pairing lapsed is refused by the server.
  server.paired = false
  await hosting.getByRole('button', { name: 'Pair another browser' }).click()
  await expect(hosting.getByRole('alert')).toHaveText('Pair this browser before changing setup')
})

test('Settings: Pair another browser is only offered while pairing is required', async ({ page }) => {
  const server = pairedServer()
  server.requirePairing = false
  await server.install(page)
  await page.goto('/settings')
  const hosting = page.getByRole('region', { name: 'Hosting' })
  await expect(hosting.getByRole('checkbox', { name: 'Require secure pairing' })).not.toBeChecked()
  await expect(hosting.getByRole('button', { name: 'Pair another browser' })).toHaveCount(0)
})
