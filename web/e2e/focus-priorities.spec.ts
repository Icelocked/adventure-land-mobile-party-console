import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function postBodies(page: Page, path: string): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/party-api/${path}`)) bodies.push(request.postDataJSON())
  })
  return bodies
}

test('Monster focus: per-monster priorities (default 50, clamped) are sent with the focus; the follower sees the leader radius', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Warrior1', ctype: 'warrior', level: 60 })
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.leader = 'Warrior1'
  server.followers = { Ranger1: true }
  server.monsterChoices = [
    { id: 'goo', name: 'Goo', locations: [] },
    { id: 'bee', name: 'Bee', locations: [] },
  ] as never
  server.extraState = {
    monsterSearchRadiusByCharacter: { Warrior1: 650, Ranger1: 300 },
    monsterPrioritiesByCharacter: { Ranger1: { bee: 120 } },
    monsterFocusByCharacter: { Ranger1: ['goo'] },
  }
  await server.install(page)
  const bodies = postBodies(page, 'focus')

  await page.goto('/characters/Ranger1')
  await expect(page.getByText('Monster focus - 650')).toBeVisible()
  await page.getByRole('button', { name: 'goo', exact: true }).click()
  const form = page.getByRole('group', { name: 'Monster focus' })
  await expect(form.getByText('Following Warrior1: effective radius 650. This input saves Ranger1’s own radius.'.replace('’', "'"), { exact: false })).toBeVisible()
  await expect(form.getByLabel('Goo · goo priority')).toHaveValue('50')
  await expect(form.getByLabel('Bee · bee priority')).toHaveValue('120')
  await form.getByLabel('Goo · goo priority').fill('2000')
  await form.getByRole('button', { name: 'Save' }).click()
  await expect.poll(() => bodies[0]).toEqual({ character: 'Ranger1', monsterFocus: ['goo'], monsterPriorities: { bee: 120, goo: 1000 } })
})

test('Farming area: the saved waypoint is preferred; with no ordinary routes the recorded spawns explain why', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Warrior1', ctype: 'warrior', level: 60, map: 'main', x: 0, y: 0 })
  server.leader = 'Warrior1'
  server.monsterChoices = [
    { id: 'goo', name: 'Goo', locations: [{ map: 'main', x: 10, y: 10, mapName: 'Mainland' }, { map: 'main', x: 900, y: 900, mapName: 'Mainland' }] },
    { id: 'rare', name: 'Rare', locations: [], spawnRecords: [{ sourceMap: 'cave', map: 'cave', mapName: 'Cave', x: 1, y: 2, count: 0, restrictions: ['zero-count'] }] },
  ] as never
  server.extraState = { monsterFocusByCharacter: {}, monsterFocus: ['goo'], characterLocations: { Warrior1: { map: 'main', x: 900, y: 900 } } }
  await server.install(page)

  await page.goto('/characters/Warrior1')
  await page.getByRole('button', { name: 'Find selected monster' }).click()
  await expect(page.getByRole('button', { pressed: true, name: /Mainland/ })).toContainText('(900, 900)')
})
