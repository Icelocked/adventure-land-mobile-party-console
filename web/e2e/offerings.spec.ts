import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function commandBodies(page: Page): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/party-api/command')) bodies.push(request.postDataJSON())
  })
  return bodies
}

test('Upgrade rule: added from Auto mark for upgrade, validated, listed under Upgrade rules with Edit/Remove', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [null, { name: 'wcoat', level: 2 }] })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat', upgradeable: true, maxLevel: 10 })
  server.upgradeOfferingRules = [{ id: 'rule-0', name: 'wcoat', floor: 0, ceiling: 2, offering: 'offering', required: false }]
  await server.install(page)

  await page.goto('/characters/Merchantina')
  await page.getByTestId('inventory-slot-1').click()
  await page.getByRole('button', { name: 'Auto mark for upgrade', exact: true }).click()
  await page.getByRole('button', { name: 'Add upgrade rule' }).click()
  const dialog = page.getByRole('group', { name: 'Add upgrade rule' })
  await dialog.getByLabel('Starting level').selectOption('1')
  await expect(dialog.getByRole('alert')).toHaveText('There is already a rule that covers +0 to +2.')
  await dialog.getByLabel('Starting level').selectOption('2')
  await dialog.getByLabel('Ending level').selectOption('5')
  server.failOnce['command'] = 'Rule conflicts with an existing one'
  await dialog.getByRole('button', { name: 'Confirm' }).click()
  await expect(dialog.getByText('Rule conflicts with an existing one')).toBeVisible()
  await dialog.getByRole('button', { name: 'Confirm' }).click()
  await expect.poll(() => server.upgradeOfferingRules.length).toBe(2)

  await page.keyboard.press('Escape')
  const rules = page.getByRole('region', { name: 'Upgrade rules' })
  await rules.getByRole('button', { name: /^Upgrade rules\s*2$/ }).click()
  await expect(rules.getByText('+2 → +5')).toBeVisible()
  await expect(rules.getByText('When available')).toBeVisible()
  await rules.getByRole('button', { name: 'Clear all Upgrade rules' }).click()
  await rules.getByRole('button', { name: 'Really clear all Upgrade rules' }).click()
  await expect.poll(() => server.upgradeOfferingRules.length).toBe(0)
})

test('Upgrade with an offering: stock-gated, confirmed, sends one tier with the offering; the server preview polls and refreshes', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [null, { name: 'wcoat', level: 4 }] })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat', upgradeable: true, maxLevel: 10 })
  server.extraState = { upgradeOfferingStock: { offeringp: 2 } }
  server.upgradePreview = {
    status: 'partial',
    result: { executor: 'Merchantina', item: { name: 'wcoat', level: 4 }, options: { none: { preview: { chance: 0.6512 }, observedAt: 1_700_000_000_000 }, offeringp: { preview: { chance: 0.71 }, observedAt: 1_700_000_000_000 }, offering: { reason: 'No Primordial Essence' }, offeringx: { reason: 'No Primordial X' } } },
  }
  await server.install(page)
  const bodies = commandBodies(page)

  await page.goto('/characters/Merchantina')
  await page.getByTestId('inventory-slot-1').click()
  await page.getByRole('button', { name: 'Mark for upgrade', exact: true }).click()
  const preview = page.getByRole('region', { name: 'Upgrade chances' })
  await expect(preview.getByText('Next attempt: +4 → +5')).toBeVisible()
  await expect(preview.getByText('Some chances saved - see unavailable options below')).toBeVisible()
  await expect(preview.getByText('65.12%')).toBeVisible()
  await expect(preview.getByText('No Primordial Essence')).toBeVisible()
  await preview.getByRole('button', { name: 'Refresh chances' }).click()
  await expect.poll(() => server.upgradePreviewRequests.some((request) => request.refresh === true)).toBe(true)
  expect(server.upgradePreviewRequests[0]).toMatchObject({ character: 'Merchantina', slot: 1, item: { name: 'wcoat', level: 4 } })

  await expect(page.getByRole('button', { name: 'Upgrade with Primordial Essence' })).toBeDisabled()
  await page.getByRole('button', { name: 'Upgrade with Primling' }).click()
  const confirm = page.getByRole('group', { name: 'Confirm upgrade' })
  await expect(confirm.getByText('Use Primling to upgrade Wolf Coat from +4 to +5?')).toBeVisible()
  await confirm.getByRole('button', { name: 'Confirm' }).click()
  await expect.poll(() => bodies.find((body) => body.type === 'upgrade-mark')).toMatchObject({ character: 'Merchantina', type: 'upgrade-mark', slot: 1, tiers: 1, offering: 'offeringp', item: { name: 'wcoat', level: 4 } })
})
