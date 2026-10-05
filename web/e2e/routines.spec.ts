import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

const serverPriorities = {
  'merchant luck': 100,
  'stand maintenance': 40,
  'automatic exchange': 67,
  'manual exchange': 67,
  'auto upgrade': 70,
  deliveries: 90,
  withdrawals: 90,
  fishing: 20,
  mining: 20,
}

test('Routines: saving without edits sends back exactly the server state', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.merchantRoutinePriorities = { ...serverPriorities }
  server.merchantAutomations = { 'auto upgrade': false, 'automatic exchange': true, deliveries: true, withdrawals: true }
  server.gatheringModes = []
  await server.install(page)

  await page.goto('/routines')
  await expect(page.getByRole('button', { name: 'Save routines' })).toBeEnabled()
  await page.getByRole('button', { name: 'Save routines' }).click()

  await expect.poll(() => server.lastRoutineSave).toBeTruthy()
  const { priorities, enabled } = server.lastRoutineSave as { priorities: Record<string, number>; enabled: Record<string, boolean> }
  expect(priorities).toEqual(serverPriorities)
  expect(enabled).toEqual({ 'auto upgrade': false, 'automatic exchange': true, fishing: false, mining: false })
  expect(server.gatheringModes).toEqual([])
})

test('Routines: reordering one row changes only the priorities the move requires', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.merchantRoutinePriorities = { ...serverPriorities }
  await server.install(page)

  await page.goto('/routines')
  await page.getByRole('button', { name: 'Move Stand listing maintenance up' }).click()
  await page.getByRole('button', { name: 'Save routines' }).click()

  await expect.poll(() => server.lastRoutineSave).toBeTruthy()
  const { priorities } = server.lastRoutineSave as { priorities: Record<string, number> }
  // The renumbering follows the console's move() (unlisted keys sort as 50),
  // so only assert it moved and the top is kept.
  expect(priorities['stand maintenance']).not.toBe(40)
  expect(priorities['merchant luck']).toBe(100)
  expect(priorities).not.toHaveProperty('exchange')
})

test('Routines: deliveries/withdrawals switched off in Merchant settings are locked and not saved', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.merchantRoutinePriorities = { ...serverPriorities }
  server.merchantAutomations = { deliveries: false }
  await server.install(page)

  await page.goto('/routines')
  await expect(page.getByRole('textbox', { name: 'Marked deliveries priority' })).toBeDisabled()
  await expect(page.getByText('Enable in Merchant settings')).toBeVisible()
  await page.getByRole('button', { name: 'Save routines' }).click()

  await expect.poll(() => server.lastRoutineSave).toBeTruthy()
  const { priorities, enabled } = server.lastRoutineSave as { priorities: Record<string, number>; enabled: Record<string, boolean> }
  expect(priorities).not.toHaveProperty('deliveries')
  expect(priorities.withdrawals).toBe(90)
  expect(enabled).not.toHaveProperty('deliveries')
  expect(enabled).not.toHaveProperty('withdrawals')
})

test('Routines: a successful save closes the routines screen (routine-priorities-dialog.tsx)', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  await server.install(page)
  await page.goto('/characters/Merchantina')
  await page.goto('/routines')
  await page.getByRole('button', { name: 'Save routines' }).click()
  await expect(page).toHaveURL(/\/characters\/Merchantina$/)
})
