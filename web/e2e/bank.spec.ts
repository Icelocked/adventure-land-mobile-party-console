import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function posts(page: Page): { path: string; body: Record<string, unknown> }[] {
  const bodies: { path: string; body: Record<string, unknown> }[] = []
  page.on('request', (request) => {
    const match = request.url().match(/\/party-api\/(.+)$/)
    if (request.method() === 'POST' && match) bodies.push({ path: match[1], body: request.postDataJSON() as Record<string, unknown> })
  })
  return bodies
}

function bankServer() {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.addCatalogEntry({ id: 'bow', name: 'Bow', upgradeable: true })
  server.bankPacks = {
    items1: [
      { slot: 0, item: { name: 'ironore', q: 5 } },
      { slot: 1, item: { name: 'bow', level: 2 } },
      ...Array.from({ length: 33 }, () => null),
      { slot: 35, item: { name: 'ironore', q: 1 } },
    ],
  }
  return server
}

test('Bank: search dims non-matches; reserved items1 slots are labelled', async ({ page }) => {
  const server = bankServer()
  await server.install(page)

  await page.goto('/bank')
  await expect(page.getByText('RESERVED')).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search bank items' }).fill('bow')
  await expect(page.getByRole('button', { name: /Bow \+2/ })).not.toHaveClass(/opacity-25/)
  await expect(page.getByRole('button', { name: /Iron Ore x5/ })).toHaveClass(/opacity-25/)
})

test('Bank: tapping an item opens its options with Item details first; upgrade marks go through withdraw with upgradeTiers', async ({ page }) => {
  const server = bankServer()
  await server.install(page)
  const bodies = posts(page)

  await page.goto('/bank')
  await page.getByRole('button', { name: /Bow \+2/ }).click()
  await expect(page.getByRole('button', { name: 'Item details' })).toBeVisible()
  await page.getByRole('button', { name: 'Mark for Upgrade', exact: true }).click()
  await page.getByRole('button', { name: /\+2 → \+4/ }).click()
  await expect.poll(() => bodies.find((b) => b.path === 'command')?.body).toMatchObject({ character: 'Patinder', type: 'withdraw', pack: 'items1', slot: 1, upgradeTiers: 2 })
})

test('Bank: Auto mark for upgrade, auto sell to NPC and Clear all marks act as the merchant', async ({ page }) => {
  const server = bankServer()
  await server.install(page)
  const bodies = posts(page)

  await page.goto('/bank')
  await page.getByRole('button', { name: /Bow \+2/ }).click()
  await page.getByRole('button', { name: 'Auto-mark for Upgrade' }).click()
  await page.getByRole('button', { name: /\+2 → \+3/ }).click()
  await expect.poll(() => bodies.find((b) => b.body.type === 'auto-upgrade-mark')?.body).toMatchObject({ character: 'Patinder', slot: -1, tiers: 1 })

  await page.getByRole('button', { name: /Iron Ore x5/ }).click()
  await page.getByRole('button', { name: 'Auto sell to NPC…' }).click()
  await expect.poll(() => bodies.find((b) => b.path === 'merchant/auto-npc-sale')?.body).toMatchObject({ character: 'Patinder', action: 'set' })

  await page.getByRole('button', { name: /Iron Ore x5/ }).click()
  await page.getByRole('button', { name: 'Clear all marks' }).click()
  await expect.poll(() => bodies.find((b) => b.body.type === 'clear-item-marks')?.body).toMatchObject({ character: 'Patinder', pack: 'items1', slot: 0 })
})
