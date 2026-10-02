import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

/**
 * The most common real usage pattern this app will actually see: someone
 * already paired, opening it for ten seconds to glance at their party
 * and immediately leaving - not configuring anything. This is the
 * opposite failure mode from the daily-use journey: instead of checking
 * that a long chain of actions doesn't go stale, this checks that the
 * FIRST thing on screen is immediately correct and nothing hangs in a
 * loading/connecting state once data has actually arrived.
 */
test('Quick check-in: party data is immediately correct on open, no lingering loading state', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Warriorname', ctype: 'warrior', level: 40, hp: 850, max_hp: 1000, gold: 1234 })
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, hp: 200, max_hp: 200, gold: 5000 })
  await server.install(page)

  await page.goto('/')

  // The connecting/loading placeholder must not still be showing once
  // real character rows have rendered - a stuck "Connecting..." message
  // alongside real data would mean the connected-state flag desynced
  // from the actual data arriving.
  await expect(page.getByText('Warriorname')).toBeVisible()
  await expect(page.getByText('Connecting...')).not.toBeVisible()
  await expect(page.locator('[aria-label="Disconnected"]')).not.toBeVisible()

  await expect(page.getByText('HP 850/1000')).toBeVisible()
  // party-gold.tsx: bank, then "(X total)" with what the party carries - correct on first render.
  await expect(page.getByRole('button', { name: 'Party gold' })).toContainText('(6,234 total)')

  // Glance at one character, then leave - no mutation, no deep
  // navigation. This should be the fastest, most boring path in the app.
  await page.getByText('Warriorname').click()
  await expect(page.getByText('HP', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL('/')
})
