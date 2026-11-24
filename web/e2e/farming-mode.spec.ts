import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

// OWNERS-PORT-MAP.md B1: combat mode and target mode are two rows (farming-mode-control.tsx),
// each button sending its own slot's field to POST /farming-mode.

function setup() {
  const server = new MockPartyServer()
  server.paired = true
  server.leader = 'Leada'
  server.followers = { Folla: true }
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 70 })
  server.addCharacter({ name: 'Folla', ctype: 'priest', level: 70 })
  return server
}

test('The two rows show the saved pair and each button sends only its slot field', async ({ page }) => {
  const server = setup()
  server.extraState = { combatMode: 'scatter', targetMode: 'farming' }
  await server.install(page)
  await page.goto('/characters/Leada')
  const farming = page.getByRole('region', { name: 'Farming' })
  const combat = farming.getByRole('group', { name: 'Combat mode' })
  const target = farming.getByRole('group', { name: 'Target mode' })
  await expect(combat.getByRole('button', { name: 'Scatter' })).toHaveAttribute('aria-pressed', 'true')
  await expect(target.getByRole('button', { name: 'Farming' })).toHaveAttribute('aria-pressed', 'true')
  await expect(farming.getByText('Farming (Scatter)')).toBeVisible()

  await combat.getByRole('button', { name: 'Default' }).click()
  await expect.poll(() => server.farmingModeWrites.at(-1)).toEqual({ combatMode: 'default', character: 'Leada' })
  await expect(combat.getByRole('button', { name: 'Default' })).toHaveAttribute('aria-pressed', 'true')
  await expect(target.getByRole('button', { name: 'Farming' })).toHaveAttribute('aria-pressed', 'true')
})

test("A follower's rows show its own saved pair under Copy leader", async ({ page }) => {
  const server = setup()
  server.extraState = { combatMode: 'default' }
  server.farmingProfiles = { Folla: { combatMode: 'scatter' } }
  await server.install(page)
  await page.goto('/characters/Folla')
  const farming = page.getByRole('region', { name: 'Farming' })
  await expect(farming.getByText('Copy leader')).toBeVisible()
  await expect(farming.getByText('Used when Follow is off.')).toBeVisible()
  await expect(farming.getByRole('group', { name: 'Combat mode' }).getByRole('button', { name: 'Scatter' })).toHaveAttribute('aria-pressed', 'true')
})

test('A failed add-on list read says why the rows hold no buttons', async ({ page }) => {
  const server = setup()
  server.addonsFail = true
  await server.install(page)
  await page.goto('/characters/Leada')
  const farming = page.getByRole('region', { name: 'Farming' })
  await expect(farming.getByRole('alert')).toContainText('Add-ons are unavailable: Add-on registry is starting')
  await expect(farming.getByRole('group', { name: 'Combat mode' }).getByRole('button')).toHaveCount(0)
})
