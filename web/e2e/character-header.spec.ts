import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

test('Character header: doll portrait opens the stats, presence and ping, cave map relabelled, banking badge', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({
    name: 'Ranger1',
    ctype: 'ranger',
    level: 60,
    map: 'zone_ab12_3',
    diagnostics: {
      characterDollHtml: '<span data-testid="doll">doll</span>',
      ping: 87.4,
      primaryStat: 'dex',
      banking: true,
      dex: 100,
      str: 200,
      vit: 30,
      armor: 300,
      fortitude: 10,
      combatStats: { crit: 5, critDamage: 50 },
    },
  })
  await server.install(page)

  await page.goto('/characters/Ranger1')
  await expect(page.getByTestId('doll')).toBeAttached()
  await expect(page.getByLabel('Online')).toBeVisible()
  await expect(page.getByText(/· 87ms/)).toBeVisible()
  await expect(page.getByText(/^Cave of Many Dreams \(/)).toBeVisible()
  await expect(page.getByText('BANKING')).toBeVisible()

  await page.getByRole('button', { name: 'View Ranger1 stats' }).click()
  const stats = page.getByRole('dialog', { name: 'Ranger1 stats' })
  await expect(stats.getByRole('group', { name: 'Dexterity', exact: true })).toContainText('100 · PRIMARY')
  await expect(stats.getByRole('group', { name: 'Strength', exact: true })).toContainText('+4,200 max HP · +21 per point')
  // 300 armor: 1 - (0.1 + 0.1 + 0.095) = 70.5% of a hit.
  await expect(stats.getByRole('group', { name: 'Armor', exact: true })).toContainText('29.50% physical damage reduction · a 100-damage physical hit becomes 70.5')
  await expect(stats.getByRole('group', { name: 'Critical damage', exact: true })).toContainText('250%')
})

test('Active status: shown for merchants too, counts, stacks, and the condition details', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({
    name: 'Merchantina',
    ctype: 'merchant',
    level: 30,
    conditions: [
      { id: 'mluck', name: "Merchant's Luck", remainingMs: 3_600_000, definition: { duration: 7_200_000, luck: 25 }, explanation: 'Feeling lucky' } as never,
      { id: 'stack', name: 'Stacked', stacks: 3 } as never,
    ],
  })
  await server.install(page)

  await page.goto('/characters/Merchantina')
  const statuses = page.getByRole('region', { name: 'Active status' })
  await expect(statuses.getByText('2', { exact: true })).toBeVisible()
  await statuses.getByRole('button', { name: /Active status/ }).click()
  await expect(statuses.getByText('Active · 3 stacks')).toBeVisible()
  await expect(statuses.getByTestId('status-bar').first()).toHaveAttribute('style', /width: 50%/)
  await statuses.getByRole('button', { name: "Merchant's Luck" }).click()
  const details = page.getByRole('dialog', { name: 'Condition details' })
  await expect(details.getByText('Feeling lucky')).toBeVisible()
  await expect(details.getByText('luck', { exact: true })).toBeVisible()
  await expect(details.getByText('25', { exact: true })).toBeVisible()
})
