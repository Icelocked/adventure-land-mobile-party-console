import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function commandBodies(page: Page): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/party-api/command')) bodies.push(request.postDataJSON())
  })
  return bodies
}

test('Auto upgrades: inline target and remaining edits validate and send update-auto-upgrade-rule on the owner', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'bow', name: 'Bow', upgradeable: true })
  server.extraState = { autoUpgradeMarks: { Ranger1: { 'bow@+2': { tiers: 3, quantity: 4 } } } }
  await server.install(page)
  const bodies = commandBodies(page)

  await page.goto('/characters/Merchantina')
  const section = page.getByRole('region', { name: 'Auto upgrades' })
  await section.getByRole('button', { name: /^Auto upgrades\s*1$/ }).click()
  await expect(section.getByRole('button', { name: 'View Bow +2 · +2 → +5' })).toBeVisible()
  await expect(section.getByText('Ranger1')).toBeVisible()

  await section.getByRole('button', { name: '3 tiers → +5' }).click()
  const target = section.getByLabel('New target for Bow +2')
  await target.fill('12')
  await expect(section.getByRole('button', { name: 'Save target for Bow +2' })).toBeDisabled()
  await target.fill('4')
  await target.press('Enter')
  await expect.poll(() => bodies[0]).toMatchObject({ character: 'Ranger1', type: 'update-auto-upgrade-rule', ruleKey: 'bow@+2', tiers: 4 })

  await section.getByRole('button', { name: 'Remaining 4' }).click()
  await section.getByLabel('New quantity for Bow +2').fill('-1')
  await section.getByRole('button', { name: 'Save quantity for Bow +2' }).click()
  await expect.poll(() => bodies[1]).toMatchObject({ character: 'Ranger1', type: 'update-auto-upgrade-rule', ruleKey: 'bow@+2', quantity: -1 })
})

test('Auto compounds: target edit; clear all asks "Really?" first', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'ringsj', name: 'Ring', compoundable: true })
  server.extraState = { autoCompounds: { Merchantina: [{ name: 'ringsj', targetTier: 3, quantity: -1 }] } }
  await server.install(page)
  const bodies = commandBodies(page)

  await page.goto('/characters/Merchantina')
  const section = page.getByRole('region', { name: 'Auto compounds' })
  await section.getByRole('button', { name: /^Auto compounds\s*1$/ }).click()
  await expect(section.getByRole('button', { name: 'Remaining ∞' })).toBeVisible()
  await section.getByRole('button', { name: 'Target +3' }).click()
  await section.getByLabel('New target for Ring').fill('5')
  await section.getByLabel('New target for Ring').press('Enter')
  await expect.poll(() => bodies[0]).toMatchObject({ character: 'Merchantina', type: 'auto-compound-mark', item: { name: 'ringsj' }, targetTier: 5 })

  await section.getByRole('button', { name: 'Clear all Auto compounds' }).click()
  expect(bodies).toHaveLength(1)
  await section.getByRole('button', { name: 'Really clear all Auto compounds' }).click()
  await expect.poll(() => bodies[1]).toMatchObject({ character: 'Merchantina', type: 'clear-auto-compounds' })
})

test('Automatic rules are merchant-only, and a failed remove shows its error', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.extraState = { autoItemMarks: { Merchantina: { 'ironore@+0': 'bank' } } }
  await server.install(page)

  await page.goto('/characters/Ranger1')
  await expect(page.getByRole('region', { name: 'Vitals' }).or(page.getByRole('region', { name: 'Inventory' })).first()).toBeVisible()
  await expect(page.getByRole('region', { name: 'Automatic rules' })).toHaveCount(0)

  await page.goto('/characters/Merchantina')
  const section = page.getByRole('region', { name: 'Auto bank marks' })
  await section.getByRole('button', { name: /^Auto bank marks\s*1$/ }).click()
  server.failOnce['command'] = 'Rule is locked'
  await section.getByRole('button', { name: 'Remove Iron Ore' }).click()
  await section.getByRole('button', { name: 'Really remove Iron Ore' }).click()
  await expect(page.getByRole('region', { name: 'Automatic rules' }).getByRole('alert')).toHaveText('Rule is locked')
})
