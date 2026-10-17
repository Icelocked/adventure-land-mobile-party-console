import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

// Console 1.4 combat: the escape hold's Resume automation.

function postBodies(page: Page, path: string): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/party-api/${path}`)) bodies.push(request.postDataJSON() as Record<string, unknown>)
  })
  return bodies
}

function partyServer() {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60 })
  server.addCharacter({ name: 'Folla', ctype: 'priest', level: 58 })
  server.leader = 'Leada'
  return server
}

test('Escape: a held escape shows its error and Resume automation; resuming releases the hold', async ({ page }) => {
  const server = partyServer()
  server.escape = { id: 'escape-1', stage: 'failed-hold', error: 'Rendezvous timed out', progress: {} }
  await server.install(page)
  const bodies = postBodies(page, 'escape/resume')

  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Escape - failed' })).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: 'Rendezvous timed out' })).toBeVisible()
  await expect(page.getByText('Automation is held until you resume it.')).toBeVisible()

  server.failOnce['escape/resume'] = 'Error: dungeon participants are still inside'
  await page.getByRole('button', { name: 'Resume automation' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'dungeon participants are still inside' })).toBeVisible()
  expect(server.escape?.stage).toBe('failed-hold')

  await page.getByRole('button', { name: 'Resume automation' }).click()
  await expect.poll(() => bodies.length).toBe(2)
  expect(bodies[1]).toEqual({})
  expect(server.escapeActions).toEqual(['escape/resume', 'escape/resume'])
  await expect(page.getByText('Automation is held until you resume it.')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Escape', exact: true })).toBeVisible()
  await expect(page.getByText('Rendezvous timed out')).toHaveCount(0)
})

test('Escape: a completed escape also offers Resume automation', async ({ page }) => {
  const server = partyServer()
  server.escape = { id: 'escape-2', stage: 'complete', error: null, progress: {} }
  await server.install(page)

  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Escape - success' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Resume automation' })).toBeVisible()
  server.escape = { ...server.escape, stage: 'recovering' }
  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect(page.getByRole('button', { name: 'Resume automation' })).toHaveCount(0)
})
