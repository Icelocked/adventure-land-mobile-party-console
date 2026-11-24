import { test, expect, type Page } from '@playwright/test'
import { OwnersSet2Mock } from './fixtures/ownersSet2Mock'

// OWNERS-PORT-MAP.md B11 (and later item rows): the owners release's auto NPC sale keep, as
// party-management-panels.tsx asks for it and inventory-panel.tsx lists the rules.

function postBodies(page: Page, path: string): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/party-api/${path}`)) bodies.push(request.postDataJSON() as Record<string, unknown>)
  })
  return bodies
}
const ruleKey = (name: string) => JSON.stringify({ name, level: 0, p: null, stat_type: null })

test('B11: a merchant-wide auto NPC sale asks for the reserve, starts at 0 and sends it as text', async ({ page }) => {
  const server = new OwnersSet2Mock()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58, items: [{ name: 'ironore', q: 5 }, { name: 'hpot0', q: 9 }] })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.addCatalogEntry({ id: 'hpot0', name: 'Health Potion' })
  server.autoNpcSales = { [ruleKey('ironore')]: { item: { name: 'ironore' }, keep: 3 } }
  await server.install(page)
  const bodies = postBodies(page, 'merchant/auto-npc-sale')

  await page.goto('/characters/Patinder')
  await page.getByTestId('inventory-slot-1').click()
  await page.getByRole('button', { name: 'Auto sell to NPC…' }).click()
  const keep = page.getByLabel('Number to keep reserved')
  await expect(keep).toHaveValue('0')
  await expect(page.getByText(/Enter 0 to sell every copy\.$/)).toBeVisible()
  await page.getByRole('button', { name: 'Enable auto sale' }).click()
  await expect.poll(() => bodies[0]).toEqual({ item: { name: 'hpot0', q: 9 }, action: 'set', keep: '0' })

  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Update auto sell to NPC…' }).click()
  await expect(page.getByLabel('Number to keep reserved')).toHaveValue('3')
})

test("B11: the merchant lists a character's own NPC sale rule with its owner and removes it for that owner", async ({ page }) => {
  const server = new OwnersSet2Mock()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.addCatalogEntry({ id: 'hpot0', name: 'Health Potion' })
  server.autoNpcSales = {
    [JSON.stringify(['Ranger1', ruleKey('ironore')])]: { item: { name: 'ironore' }, character: 'Ranger1' },
    [ruleKey('hpot0')]: { item: { name: 'hpot0' }, keep: 2 },
  }
  await server.install(page)
  const bodies = postBodies(page, 'merchant/auto-npc-sale')

  await page.goto('/characters/Patinder')
  const rules = page.getByRole('region', { name: 'Auto NPC sales' })
  await rules.getByRole('button', { name: /^Auto NPC sales/ }).click()
  await expect(rules.getByText('Ranger1')).toBeVisible()
  // Only the merchant-wide rule keeps copies.
  await expect(rules.getByRole('button', { name: 'Keep 2' })).toBeVisible()
  await expect(rules.getByRole('button', { name: /^Keep / })).toHaveCount(1)
  await rules.getByRole('button', { name: 'Remove Iron Ore' }).click()
  await rules.getByRole('button', { name: 'Really remove Iron Ore' }).click()
  await expect.poll(() => bodies[0]).toEqual({ item: { name: 'ironore' }, character: 'Ranger1', action: 'remove' })
  await expect(rules.getByText('Ranger1')).toHaveCount(0, { timeout: 12_000 })
})
