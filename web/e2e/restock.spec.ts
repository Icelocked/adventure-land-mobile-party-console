import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function restockBodies(page: Page): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/party-api/restock')) bodies.push(request.postDataJSON() as Record<string, unknown>)
  })
  return bodies
}

test('Restock: editing one field keeps the other real values (and the potion items)', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.extraState = {
    restockPolicies: { Ranger1: { hp: { min: 100, max: 300, item: 'hpot1' }, mp: { min: 50, max: 200, item: 'mpot1' } } },
  }
  await server.install(page)
  const bodies = restockBodies(page)

  await page.goto('/characters/Ranger1')
  const hpMax = page.getByRole('textbox', { name: 'HP max' })
  await expect(hpMax).toHaveValue('300')
  await hpMax.fill('400')
  await page.getByRole('region', { name: 'Restock' }).getByRole('button', { name: 'Save' }).click()

  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toEqual({
    character: 'Ranger1',
    hp: { min: 100, max: 400, item: 'hpot1' },
    mp: { min: 50, max: 200, item: 'mpot1' },
  })
})

test('Restock: a save keeps the saved elixir policy (console 1.5 http/restock.ts drops an unsent elixir)', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  const elixir = { item: 'elixirluck', min: 1, max: 3, autoConsume: true, autoAcquire: false }
  server.extraState = {
    restockPolicies: { Ranger1: { hp: { min: 100, max: 300, item: 'hpot1' }, mp: { min: 50, max: 200, item: 'mpot1' }, elixir } },
  }
  await server.install(page)
  const bodies = restockBodies(page)

  await page.goto('/characters/Ranger1')
  await page.getByRole('textbox', { name: 'HP max' }).fill('400')
  await page.getByRole('region', { name: 'Restock' }).getByRole('button', { name: 'Save' }).click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toEqual({ character: 'Ranger1', hp: { min: 100, max: 400, item: 'hpot1' }, mp: { min: 50, max: 200, item: 'mpot1' }, elixir })
})

test("Restock: a character without a policy starts from the dashboard's defaults", async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  await server.install(page)

  await page.goto('/characters/Ranger1')
  await expect(page.getByRole('textbox', { name: 'HP min' })).toHaveValue('5')
  await expect(page.getByRole('textbox', { name: 'HP max' })).toHaveValue('20')
})

test('Restock: the elixir policy picks a catalog elixir, its min/max and flags, and Disable sends item ""', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.addCatalogEntry({ id: 'elixirluck', name: 'Elixir of Luck', definition: { type: 'elixir' } })
  server.addCatalogEntry({ id: 'hpot1', name: 'Health Potion', definition: { type: 'pot' } })
  server.extraState = { restockPolicies: { Ranger1: { hp: { min: 100, max: 300, item: 'hpot1' }, mp: { min: 50, max: 200, item: 'mpot1' } } } }
  await server.install(page)
  const bodies = restockBodies(page)

  await page.goto('/characters/Ranger1')
  const restock = page.getByRole('region', { name: 'Restock' })
  const picker = restock.getByRole('combobox', { name: 'Select elixir type' })
  // restock-controls.tsx lists catalog items of type "elixir" only.
  await expect(picker.locator('option')).toHaveText(['None', 'Elixir of Luck'])
  await picker.selectOption('elixirluck')
  await expect(restock.getByLabel('Elixir min')).toHaveValue('1')
  await expect(restock.getByLabel('Elixir max')).toHaveValue('2')
  await restock.getByLabel('Elixir max').fill('4')
  await expect(restock.getByRole('checkbox', { name: 'Automatically consume elixirs' })).toBeChecked()
  await restock.getByRole('checkbox', { name: 'Buy or craft elixir when out of stock' }).check()
  await restock.getByRole('button', { name: 'Save' }).click()
  await expect.poll(() => bodies[0]).toEqual({
    character: 'Ranger1',
    hp: { min: 100, max: 300, item: 'hpot1' },
    mp: { min: 50, max: 200, item: 'mpot1' },
    elixir: { item: 'elixirluck', min: 1, max: 4, autoConsume: true, autoAcquire: true },
  })

  await expect(picker).toHaveValue('elixirluck')
  await restock.getByRole('button', { name: 'Disable elixir restock' }).click()
  await restock.getByRole('button', { name: 'Save' }).click()
  await expect.poll(() => (bodies[1]?.elixir as { item?: string } | undefined)?.item).toBe('')
  await expect(picker).toHaveValue('')
})
