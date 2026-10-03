import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function commandBodies(page: Page): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/party-api/command')) bodies.push(request.postDataJSON())
  })
  return bodies
}

test('Send to…: a known area fills map and coordinates, exact coordinates are validated, the label names the destination', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.extraState = { travelPlaces: [{ id: 'winterland', name: 'Winterland', x: 10, y: 20 }] }
  await server.install(page)
  const bodies = commandBodies(page)

  await page.goto('/characters/Ranger1')
  await page.getByRole('button', { name: 'Send to…' }).click()
  const form = page.getByRole('group', { name: 'Send Ranger1 to…' })
  await expect(form.getByLabel('Map')).toHaveValue('main')
  await form.getByLabel('X', { exact: true }).fill('abc')
  await form.getByRole('button', { name: 'Send character' }).click()
  await expect(form.getByRole('alert')).toHaveText('Enter a map and finite coordinates')

  await form.getByLabel('Known area').selectOption('winterland')
  await expect(form.getByLabel('X', { exact: true })).toHaveValue('10')
  await form.getByRole('button', { name: 'Send character' }).click()
  await expect.poll(() => bodies[0]).toMatchObject({ character: 'Ranger1', type: 'character-travel', location: { map: 'winterland', x: 10, y: 20 }, label: 'Winterland' })
  await expect(form).toHaveCount(0)

  await page.getByRole('button', { name: 'Send to…' }).click()
  await form.getByLabel('Map').fill('cave')
  await form.getByLabel('Y', { exact: true }).fill('-5')
  await form.getByRole('button', { name: 'Send character' }).click()
  await expect.poll(() => bodies[1]).toMatchObject({ location: { map: 'cave', x: -174, y: -5 }, label: 'cave [-174, -5]' })
})

test('Return to leader is disabled unless a different leader is online; a town failure is shown', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Warrior1', ctype: 'warrior', level: 50 })
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.leader = 'Warrior1'
  await server.install(page)

  await page.goto('/characters/Warrior1')
  await expect(page.getByRole('button', { name: 'Return to leader' })).toBeDisabled()
  await page.goto('/characters/Ranger1')
  await expect(page.getByRole('button', { name: 'Return to leader' })).toBeEnabled()

  await page.goto('/')
  server.failOnce['town-party'] = 'No characters can travel right now'
  await page.getByRole('button', { name: 'Send party to town' }).click()
  await expect(page.getByRole('alert')).toHaveText('No characters can travel right now')
})
