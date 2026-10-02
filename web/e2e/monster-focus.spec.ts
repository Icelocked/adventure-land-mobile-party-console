import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function focusBodies(page: Page): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/party-api/focus')) bodies.push(request.postDataJSON() as Record<string, unknown>)
  })
  return bodies
}

function setup(focus: string[], radius?: number) {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'MainLeader', ctype: 'warrior', level: 60 })
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.leader = 'MainLeader'
  server.monsterChoices = [
    { id: 'bat', name: 'Bat' },
    { id: 'goo', name: 'Goo' },
    { id: 'tinyp', name: 'Fairy' },
  ] as typeof server.monsterChoices
  server.monsterFocusByCharacter = { Ranger1: focus }
  if (radius !== undefined) server.monsterSearchRadiusByCharacter = { Ranger1: radius }
  return server
}

async function openFocus(page: Page, label: RegExp) {
  await page.goto('/characters/Ranger1')
  await page.getByRole('button', { name: label }).click()
}

test('Monster focus: unticking everything saves an empty focus, not "all"', async ({ page }) => {
  const server = setup(['bat'], 250)
  await server.install(page)
  const bodies = focusBodies(page)

  await openFocus(page, /^bat$/)
  await page.getByRole('checkbox', { name: /Bat · bat/ }).uncheck()
  await page.getByRole('group', { name: 'Monster focus' }).getByRole('button', { name: 'Save', exact: true }).click()

  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toEqual({ character: 'Ranger1', monsterFocus: [] })
  expect(server.monsterSearchRadiusByCharacter.Ranger1).toBe(250)
})

test('Monster focus: from "All monsters", ticking a monster replaces all', async ({ page }) => {
  const server = setup(['all'])
  await server.install(page)
  const bodies = focusBodies(page)

  await openFocus(page, /^All monsters$/)
  await page.getByRole('checkbox', { name: /Bat · bat/ }).check()
  await expect(page.getByRole('checkbox', { name: 'All monsters' })).not.toBeChecked()
  await page.getByRole('group', { name: 'Monster focus' }).getByRole('button', { name: 'Save', exact: true }).click()

  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toEqual({ character: 'Ranger1', monsterFocus: ['bat'] })
})

test('Monster focus: Fairy cannot be picked, and an out-of-range radius is refused locally', async ({ page }) => {
  const server = setup(['bat'], 250)
  await server.install(page)
  const bodies = focusBodies(page)

  await openFocus(page, /^bat$/)
  await expect(page.getByRole('checkbox', { name: /Fairy/ })).toHaveCount(0)
  await page.getByRole('button', { name: /Fairy · tinyp/ }).click({ force: true })
  await expect(page.getByText(/no verified regular spawn route/)).toBeVisible()

  await page.getByRole('textbox', { name: 'Monster search radius' }).fill('0')
  await page.getByRole('group', { name: 'Monster focus' }).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Enter a radius from 1 to 10,000.')).toBeVisible()
  expect(bodies).toHaveLength(0)

  await page.getByRole('textbox', { name: 'Monster search radius' }).fill('600')
  await page.getByRole('group', { name: 'Monster focus' }).getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toEqual({ character: 'Ranger1', monsterFocus: ['bat'], monsterSearchRadius: 600 })
})
