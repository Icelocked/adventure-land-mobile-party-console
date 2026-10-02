import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function huntBodies(page: Page): { path: string; body: Record<string, unknown> }[] {
  const bodies: { path: string; body: Record<string, unknown> }[] = []
  page.on('request', (request) => {
    const match = request.url().match(/\/party-api\/(hunt-settings|hunt-blacklist)$/)
    if (request.method() === 'POST' && match) bodies.push({ path: match[1], body: request.postDataJSON() as Record<string, unknown> })
  })
  return bodies
}

test("Hunt settings: an independent character edits its own profile, never the leader's", async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'MainLeader', ctype: 'warrior', level: 60 })
  server.addCharacter({ name: 'Solo', ctype: 'ranger', level: 50 })
  server.leader = 'MainLeader'
  server.huntSettings = { relocateIfCompeting: true, blacklistDeaths: true, deathThreshold: 2, blacklistExpirations: true, expirationThreshold: 1 }
  server.farmingProfiles = {
    Solo: {
      huntSettings: { relocateIfCompeting: false, blacklistDeaths: true, deathThreshold: 5, blacklistExpirations: false, expirationThreshold: 3 },
      huntBlacklist: { bat: { monsterId: 'bat', at: Date.now(), deaths: 5, reason: 'deaths' } },
    },
  }
  await server.install(page)
  const bodies = huntBodies(page)

  await page.goto('/characters/Solo/hunt-settings')
  await expect(page.getByText('Hunt settings · Solo')).toBeVisible()
  const deaths = page.getByRole('textbox', { name: 'Deaths before blacklisting' })
  await expect(deaths).toHaveValue('5')
  await deaths.fill('7')
  await deaths.blur()

  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toEqual({ path: 'hunt-settings', body: { deathThreshold: 7, character: 'Solo' } })
  expect(server.huntSettings?.deathThreshold).toBe(2)

  await page.getByRole('button', { name: 'Clear all' }).click()
  await page.getByRole('button', { name: 'Clear all', exact: true }).click()
  await expect.poll(() => bodies.length).toBe(2)
  expect(bodies[1]).toEqual({ path: 'hunt-blacklist', body: { action: 'clear', character: 'Solo' } })
})

test('Hunt settings: a follower sees the leader\'s settings read-only', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'MainLeader', ctype: 'warrior', level: 60 })
  server.addCharacter({ name: 'Follower1', ctype: 'ranger', level: 50 })
  server.leader = 'MainLeader'
  server.followers = { Follower1: true }
  server.huntBlacklist = { bat: { monsterId: 'bat', at: Date.now(), deaths: 5, reason: 'deaths' } }
  await server.install(page)

  await page.goto('/characters/Follower1/hunt-settings')
  await expect(page.getByText('Hunt settings · MainLeader')).toBeVisible()
  await expect(page.getByText(/inherited from the leader/)).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Deaths before blacklisting' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Clear all' })).toBeDisabled()
})

test('Hunt settings: an invalid threshold shows an error and saves nothing', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'MainLeader', ctype: 'warrior', level: 60 })
  server.leader = 'MainLeader'
  await server.install(page)
  const bodies = huntBodies(page)

  await page.goto('/characters/MainLeader/hunt-settings')
  const deaths = page.getByRole('textbox', { name: 'Deaths before blacklisting' })
  await expect(deaths).toBeEnabled()
  await deaths.fill('0')
  await deaths.blur()
  await expect(page.getByText('Thresholds must be positive whole numbers.')).toBeVisible()
  expect(bodies).toHaveLength(0)
})
