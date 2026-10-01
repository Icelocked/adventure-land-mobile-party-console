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
  server.bestiaryCatalog = [{ id: 'crabx', name: 'Crabxx', hp: 100, attack: 10, xp: 5, threat: 1, drops: [] }]
  server.monsterHunt = { target: 'crabx', message: 'Chasing the next spawn', currentIndex: 0, missions: [{ target: 'crabx', owners: ['Ranger1'] }] }
  await server.install(page)

  await page.goto('/characters/Ranger1')
  await expect(page.getByText('Fighting Crabxx')).toBeVisible()
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
  server.bestiaryCatalog = [{ id: 'crabx', name: 'Crabxx', hp: 100, attack: 10, xp: 5, threat: 1, drops: [] }]
  server.huntBlacklist = { crabx: { monsterId: 'crabx', at: Date.now(), deaths: 3, reason: 'deaths' } }
  await server.install(page)

  await page.goto('/characters/Ranger1')
  await expect(page.getByText(/My quest: Crabxx.*3 left.*2m/)).toBeVisible()
  await expect(page.getByText(/Blacklisted — skipped for Hunt/)).toBeVisible()
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
