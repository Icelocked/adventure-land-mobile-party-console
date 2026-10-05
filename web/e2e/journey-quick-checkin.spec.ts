import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

/**
 * The common quick glance: an already-paired user opens the app, looks at
 * the party and leaves. Guards that the first screen is correct and nothing
 * stays in a loading/connecting state once data has arrived.
 */
test('Quick check-in: party data is immediately correct on open, no lingering loading state', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Warriorname', ctype: 'warrior', level: 40, hp: 850, max_hp: 1000, gold: 1234 })
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, hp: 200, max_hp: 200, gold: 5000 })
  await server.install(page)

  await page.goto('/')

  // "Connecting..." next to real rows would mean the connected flag is out
  // of sync with the data.
  await expect(page.getByText('Warriorname')).toBeVisible()
  await expect(page.getByText('Connecting...')).not.toBeVisible()
  await expect(page.locator('[aria-label="Disconnected"]')).not.toBeVisible()

  await expect(page.getByText('HP 850/1000')).toBeVisible()
  // party-gold.tsx: bank, then "(X total)" with what the party carries - correct on first render.
  await expect(page.getByRole('button', { name: 'Party gold' })).toContainText('(6,234 total)')

  // Glance at one character, then leave.
  await page.getByText('Warriorname').click()
  await expect(page.getByText('HP', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL('/')
})
