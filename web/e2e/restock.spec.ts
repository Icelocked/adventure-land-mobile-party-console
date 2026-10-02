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

test("Restock: a character without a policy starts from the dashboard's defaults", async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  await server.install(page)

  await page.goto('/characters/Ranger1')
  await expect(page.getByRole('textbox', { name: 'HP min' })).toHaveValue('5')
  await expect(page.getByRole('textbox', { name: 'HP max' })).toHaveValue('20')
})
