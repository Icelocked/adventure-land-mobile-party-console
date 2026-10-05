import { test, expect, type Request } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function formationBodies(page: import('@playwright/test').Page): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request: Request) => {
    if (request.method() === 'POST' && request.url().endsWith('/party-api/formation'))
      bodies.push(request.postDataJSON() as Record<string, unknown>)
  })
  return bodies
}

test('Formation: Follow sends only {character, follow} and leaves the party leader alone', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'MainLeader', ctype: 'warrior', level: 60 })
  server.addCharacter({ name: 'Follower1', ctype: 'ranger', level: 50 })
  server.leader = 'MainLeader'
  await server.install(page)
  const bodies = formationBodies(page)

  await page.goto('/characters/Follower1')
  await page.getByRole('button', { name: 'Follow', exact: true }).click()

  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toEqual({ character: 'Follower1', follow: true })
  expect(server.leader).toBe('MainLeader')
  expect(server.followers.Follower1).toBe(true)
})

test('Formation: Leader sends only {leader}; tapping the current leader sends nothing', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'MainLeader', ctype: 'warrior', level: 60 })
  server.addCharacter({ name: 'Follower1', ctype: 'ranger', level: 50 })
  server.leader = 'MainLeader'
  server.followers = { Follower1: true }
  await server.install(page)
  const bodies = formationBodies(page)

  await page.goto('/characters/Follower1')
  await page.getByRole('button', { name: 'Leader', exact: true }).click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toEqual({ leader: 'Follower1' })
  expect(server.followers.Follower1).toBe(true)

  // Follower1 is now the leader; re-tapping it is a no-op (there is no
  // "clear leader" control).
  const leaderChip = page.getByRole('button', { name: 'Leader', exact: true })
  await expect(leaderChip).toHaveAttribute('aria-pressed', 'true')
  await leaderChip.click()
  await page.waitForTimeout(500)
  expect(bodies.length).toBe(1)
  expect(server.leader).toBe('Follower1')
})
