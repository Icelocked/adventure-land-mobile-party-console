import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function postBodies(page: Page, path: string): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/party-api/${path}`)) bodies.push(request.postDataJSON())
  })
  return bodies
}

test('Deconstruction: the confirmation lists each reward roll, the cost, and only then marks', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [{ name: 'wcoat', level: 0, q: 2 }, { name: 'ringsj', level: 2 }] })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat' })
  server.addCatalogEntry({ id: 'leather', name: 'Leather' })
  server.addCatalogEntry({ id: 'ringsj', name: 'Ring', compoundable: true })
  server.deconstructionCatalog = {
    wcoat: { compound: false, cost: 500, rewards: [{ name: 'leather', quantity: 2, chance: 0.75 }, { name: 'wcoat', quantity: 1, chance: 0.0125 }] },
    ringsj: { compound: true },
  }
  await server.install(page)
  const bodies = postBodies(page, 'deconstruction/mark')

  await page.goto('/characters/Merchantina')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Mark for deconstruction', exact: true }).click()
  const dialog = page.getByRole('group', { name: 'Mark for deconstruction?' })
  await expect(dialog.getByText('The merchant will deconstruct 2 × Wolf Coat. This consumes the original items.')).toBeVisible()
  await expect(dialog.getByText('2 × Leather')).toBeVisible()
  await expect(dialog.getByText('75%')).toBeVisible()
  await expect(dialog.getByText('1.25%')).toBeVisible()
  await expect(dialog.getByText('Each reward row is a separate roll. Percentages are per item deconstructed.')).toBeVisible()
  await expect(dialog.getByText('Cost per item: 500g')).toBeVisible()
  expect(bodies).toHaveLength(0)
  await dialog.getByRole('button', { name: 'Mark for deconstruction' }).click()
  await expect.poll(() => bodies[0]).toMatchObject({ character: 'Merchantina', slot: 0, item: { name: 'wcoat' } })

  // deconstruction.ts: a compounded item returns three at one lower level.
  await page.getByTestId('inventory-slot-1').click()
  await page.getByRole('button', { name: 'Auto mark for deconstruction' }).click()
  const auto = page.getByRole('group', { name: 'Enable auto deconstruction?' })
  await expect(auto.getByText('3 × Ring +1')).toBeVisible()
  await expect(auto.getByText('100%')).toBeVisible()
})

test('Deconstruction: without reward data the confirm stays disabled', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [{ name: 'wcoat', level: 0 }] })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat' })
  server.deconstructionCatalog = { wcoat: { compound: false } }
  await server.install(page)

  await page.goto('/characters/Merchantina')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Mark for deconstruction', exact: true }).click()
  const dialog = page.getByRole('group', { name: 'Mark for deconstruction?' })
  await expect(dialog.getByText('Reward data is unavailable. Refresh after the coordinator updates.')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Mark for deconstruction' })).toBeDisabled()
})

test('Automatic rules: pending deconstruction and NPC-sale marks are listed; blocked retries, running cannot be removed', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat' })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.deconstructionMarks = [
    { id: 'd1', owner: 'Ranger1', slot: 3, item: { name: 'wcoat' }, quantity: 1, state: 'blocked' },
    { id: 'd2', owner: 'Merchantina', slot: 4, item: { name: 'wcoat' }, quantity: 2, state: 'running' },
  ]
  server.npcSaleMarks = [{ id: 'n1', source: 'character', character: 'Ranger1', slot: 1, item: { name: 'ironore' }, quantity: 5 }]
  await server.install(page)
  const decon = postBodies(page, 'deconstruction/mark')
  const npc = postBodies(page, 'merchant/npc-sale')

  await page.goto('/characters/Merchantina')
  await page.getByRole('button', { name: /Auto deconstruction \(2\)/ }).click()
  const blocked = page.getByText('Wolf Coat · Ranger1 · 1 × · blocked').locator('..')
  await blocked.getByRole('button', { name: 'Retry' }).click()
  await expect.poll(() => decon[0]).toEqual({ character: 'Ranger1', id: 'd1', retry: true })
  await expect(page.getByText('Wolf Coat · Merchantina · 2 × · running').locator('..').getByRole('button', { name: 'Remove' })).toBeDisabled()
  // Retried marks go back to collecting; Retry is only offered while blocked.
  const collecting = page.getByText('Wolf Coat · Ranger1 · 1 × · collecting').locator('..')
  await expect(collecting.getByRole('button', { name: 'Retry' })).toHaveCount(0)
  await collecting.getByRole('button', { name: 'Remove' }).click()
  await expect.poll(() => decon[1]).toMatchObject({ character: 'Ranger1', id: 'd1', remove: true, slot: 3 })

  await page.getByRole('button', { name: /Auto NPC sales \(1\)/ }).click()
  await page.getByText('Iron Ore · Ranger1 · 5 × · queued').locator('..').getByRole('button', { name: 'Remove' }).click()
  await expect.poll(() => npc[0]).toEqual({ character: 'Ranger1', id: 'n1', remove: true })
})

test('Auto sell to NPC asks first, with the proceeds and the rule scope', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50, items: [{ name: 'ironore', q: 5 }] })
  server.merchantCharacter = 'Merchantina'
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore', value: 100 })
  await server.install(page)

  await page.goto('/characters/Ranger1')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Auto sell to NPC…' }).click()
  const dialog = page.getByRole('group', { name: 'Automatically sell to NPC?' })
  await expect(dialog.getByText('Matching items on Ranger1 will be collected and sold by the merchant. This remains active until you clear the rule.')).toBeVisible()
  await expect(dialog.getByText(/You will receive [\d,]+g per sale\./)).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).not.toBeVisible()
  expect(Object.keys(server.autoNpcSales)).toHaveLength(0)
})
