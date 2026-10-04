import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

test('Party list: a live character whose connection is lost shows only its pending card; Town and Escape stay available; a failed escape poll reads Escape - failed', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60 })
  server.extraState = {
    characterConnections: [{ name: 'Leada', status: 'lost', primary: false, delayed: false }],
    characterAppearances: { Leada: { characterSprite: { url: '/e2e-sprite.png', tileSize: 8, columns: 1, rows: 1, x: 0, y: 0 }, updatedAt: 1 } },
  }
  await server.install(page)
  await page.route('**/party-api/escape**', (route) => route.fulfill({ status: 503, json: { error: 'unavailable' } }))
  await page.goto('/')
  await expect(page.getByText('Connection lost')).toBeVisible()
  await expect(page.getByRole('link', { name: /^Leada/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Send party to town' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Escape - failed' })).toBeVisible()
})

test('Character card: gold target is the merchant’s only; Leader/Follow, Restock and Gold target show the server’s reason', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60 })
  server.addCharacter({ name: 'Merchy', ctype: 'merchant', level: 40 })
  await server.install(page)

  await page.goto('/characters/Leada')
  await expect(page.getByText('Gold target')).toHaveCount(0)
  server.failOnce['formation'] = 'Leader must be online'
  await page.getByRole('button', { name: 'Leader', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Leader must be online' })).toBeVisible()
  // restock-controls.tsx: Save works without editing (persists the shown policy).
  server.failOnce['restock'] = 'Invalid restock policy'
  await page.getByRole('region', { name: 'Restock' }).getByRole('button', { name: /^Save/ }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Invalid restock policy' })).toBeVisible()

  await page.goto('/characters/Merchy')
  await expect(page.getByText('Gold target')).toBeVisible()
  server.failOnce['command'] = 'Merchant is busy'
  await page.getByRole('button', { name: 'Exchange gold and items with bank' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Merchant is busy' })).toBeVisible()
})
