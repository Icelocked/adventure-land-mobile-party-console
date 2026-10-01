import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

test('Character detail: shows the current target, active conditions, and the party Hunt quest for a fighter', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({
    name: 'Ranger1',
    ctype: 'ranger',
    level: 50,
    target: 'crabx',
    conditions: [{ id: 'crit', name: 'Critical Strike', remainingMs: 65000 }],
  })
  server.leader = 'Ranger1' // resolveFarmingContext only falls back to the top-level fields below for the leader
  server.bestiaryCatalog = [{ id: 'crabx', name: 'Crabxx', hp: 100, attack: 10, xp: 5, threat: 1, drops: [] }]
  server.monsterHunt = { target: 'crabx', message: 'Chasing the next spawn', currentIndex: 0, missions: [{ target: 'crabx', owners: ['Ranger1'] }] }
  await server.install(page)

  await page.goto('/characters/Ranger1')
  // Both the vitals header ("fighting Crabxx") and the Farming section's own
  // combat-status line ("Fighting Crabxx") now resolve the same target name -
  // exact+case-sensitive distinguishes the Farming section's capitalized one.
  await expect(page.getByText('Fighting Crabxx', { exact: true })).toBeVisible()
  await expect(page.getByText(/Party Hunt: Crabxx.*Chasing the next spawn/)).toBeVisible()
  await expect(page.getByText(/Critical Strike.*1m/)).toBeVisible()
})

test('Character detail: shows nothing extra for a fighter with no current target, conditions, or active Hunt', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  await server.install(page)

  await page.goto('/characters/Ranger1')
  await expect(page.getByText(/^Fighting /)).not.toBeVisible()
  await expect(page.getByText(/^Party Hunt:/)).not.toBeVisible()
})

test('Character detail: shows this character\'s own Hunt quest, flagged when its target is blacklisted', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({
    name: 'Ranger1',
    ctype: 'ranger',
    level: 50,
    monsterHunt: { id: 'crabx', count: 3, remainingMs: 125000 },
  })
  server.leader = 'Ranger1'
  server.bestiaryCatalog = [{ id: 'crabx', name: 'Crabxx', hp: 100, attack: 10, xp: 5, threat: 1, drops: [] }]
  server.huntBlacklist = { crabx: { monsterId: 'crabx', at: Date.now(), deaths: 3, reason: 'deaths' } }
  await server.install(page)

  await page.goto('/characters/Ranger1')
  await expect(page.getByText(/My quest: Crabxx.*3 left.*2m/)).toBeVisible()
  await expect(page.getByText(/Blacklisted — skipped for Hunt/)).toBeVisible()
})

test('Character detail: a character running independently (not the leader, not following) sees ITS OWN farming profile, not the leader\'s', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'MainLeader', ctype: 'warrior', level: 60 })
  server.addCharacter({
    name: 'Independent1',
    ctype: 'ranger',
    level: 50,
    monsterHunt: { id: 'crabx', count: 2, remainingMs: 60000 },
  })
  server.bestiaryCatalog = [{ id: 'crabx', name: 'Crabxx', hp: 100, attack: 10, xp: 5, threat: 1, drops: [] }]
  server.leader = 'MainLeader'
  // The account leader's OWN blacklist does NOT include crabx - if the
  // resolver wrongly fell back to this top-level field for a non-leader,
  // non-follower character, the blacklist flag below would never show.
  server.huntBlacklist = {}
  // Independent1 is in neither `followers` nor is it the leader - it runs
  // its own farming independently, so resolveFarmingContext must resolve
  // its blacklist from its OWN farmingProfiles entry, not the account's.
  server.farmingProfiles = {
    Independent1: { huntBlacklist: { crabx: { monsterId: 'crabx', at: Date.now(), deaths: 3, reason: 'deaths' } } },
  }
  await server.install(page)

  await page.goto('/characters/Independent1')
  await expect(page.getByText(/My quest: Crabxx.*2 left/)).toBeVisible()
  await expect(page.getByText(/Blacklisted — skipped for Hunt/)).toBeVisible()
})

test('Character detail: monster focus button shows what\'s actually selected, not a static label', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.leader = 'Ranger1'
  server.bestiaryCatalog = [
    { id: 'crabx', name: 'Crabxx', hp: 100, attack: 10, xp: 5, threat: 1, drops: [] },
    { id: 'crab', name: 'Crab', hp: 80, attack: 8, xp: 3, threat: 1, drops: [] },
  ]
  server.monsterFocusByCharacter = { Ranger1: ['crabx', 'crab'] }
  await server.install(page)

  await page.goto('/characters/Ranger1')
  await expect(page.getByRole('button', { name: 'Crabxx, Crab' })).toBeVisible()
})

test('Character list and vitals header never show the raw target id - resolved name when it matches the bestiary, plain "fighting" otherwise', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50, target: 'crabx' }) // resolvable
  server.addCharacter({ name: 'Ranger2', ctype: 'ranger', level: 45, target: '2951603' }) // raw per-instance id, like real game data
  server.bestiaryCatalog = [{ id: 'crabx', name: 'Crabxx', hp: 100, attack: 10, xp: 5, threat: 1, drops: [] }]
  await server.install(page)

  await page.goto('/')
  await expect(page.getByText('fighting Crabxx')).toBeVisible()
  await expect(page.getByText('fighting', { exact: true })).toBeVisible()
  await expect(page.getByText('2951603')).not.toBeVisible()

  await page.goto('/characters/Ranger2')
  await expect(page.getByText('fighting', { exact: true })).toBeVisible()
  await expect(page.getByText('2951603')).not.toBeVisible()
})

test('Character detail: a merchant never shows combat/hunt status at all', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, target: 'crabx' })
  server.bestiaryCatalog = [{ id: 'crabx', name: 'Crabxx', hp: 100, attack: 10, xp: 5, threat: 1, drops: [] }]
  await server.install(page)

  await page.goto('/characters/Merchantina')
  await expect(page.getByText(/^Fighting /)).not.toBeVisible()
})
