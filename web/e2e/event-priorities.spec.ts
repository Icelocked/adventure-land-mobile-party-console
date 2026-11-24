import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

// Console 1.4 event-selection-control.tsx and event-limits-dialog.tsx:
// priority order, per-event limits and skipped instances.

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
  server.addCharacter({ name: 'Folla', ctype: 'priest', level: 60 })
  server.leader = 'Leada'
  server.followers = { Folla: true }
  return server
}

const priority = (page: Page, name: string) => page.locator(`[aria-label="${name} priority"]`)

test('Event priorities: arrows send the full supportedEvents permutation; the saved order renumbers the list', async ({ page }) => {
  const server = partyServer()
  await server.install(page)
  const bodies = postBodies(page, 'formation')

  await page.goto('/characters/Leada')
  await page.getByRole('button', { name: 'Events (1) ▾' }).click()
  const events = page.getByRole('group', { name: 'Events' })
  await expect(events.getByText('Higher numbers attend first. Use the arrows to reorder.')).toBeVisible()
  await expect(priority(page, 'Anniversary')).toHaveText('14')
  await expect(priority(page, 'Goobrawl')).toHaveText('12')
  await expect(priority(page, 'Mr. Pumpkin')).toHaveText('5')
  await expect(priority(page, "Witch's Cipher")).toHaveText('1')
  await expect(events.getByRole('button', { name: 'Move Anniversary up' })).toBeDisabled()
  await expect(events.getByRole('button', { name: "Move Witch's Cipher down" })).toBeDisabled()

  await events.getByRole('button', { name: 'Move Goobrawl up' }).click()
  await expect.poll(() => bodies[0]).toEqual({
    character: 'Leada',
    eventPriorities: ['anniversary', 'goobrawl', 'abtesting', 'crabxx', 'franky', 'icegolem', 'snowman', 'slenderman', 'mrgreen', 'mrpumpkin', 'horseman', 'graveyard', 'trickortreat', 'witchcipher'],
  })
  await expect(priority(page, 'Goobrawl')).toHaveText('13')
  await expect(priority(page, 'A/B Testing')).toHaveText('12')

  await events.getByRole('button', { name: 'Move Anniversary down' }).click()
  await expect.poll(() => (bodies[1]?.eventPriorities as string[] | undefined)?.slice(0, 2)).toEqual(['goobrawl', 'anniversary'])
  await expect(events.getByRole('checkbox').first()).toHaveAccessibleName('Goobrawl')
})

test('Event priorities: a reorder keeps the saved October order (console formation.ts completeOrder)', async ({ page }) => {
  const server = partyServer()
  const saved = ['witchcipher', 'graveyard', 'anniversary', 'abtesting', 'goobrawl', 'crabxx', 'franky', 'icegolem', 'snowman', 'slenderman', 'mrgreen', 'mrpumpkin', 'horseman', 'trickortreat']
  server.extraState = { eventPrioritiesByCharacter: { Leada: saved } }
  await server.install(page)
  const bodies = postBodies(page, 'formation')

  await page.goto('/characters/Leada')
  await page.getByRole('button', { name: 'Events (1) ▾' }).click()
  const events = page.getByRole('group', { name: 'Events' })
  await expect(priority(page, "Witch's Cipher")).toHaveText('14')
  await events.getByRole('button', { name: 'Move Goobrawl up' }).click()
  await expect.poll(() => bodies[0]?.eventPriorities).toEqual([...saved.slice(0, 3), 'goobrawl', 'abtesting', ...saved.slice(5)])
})

test('Event selections: a checkbox POST keeps the saved October selections', async ({ page }) => {
  const server = partyServer()
  server.extraState = { eventSelectionsByCharacter: { Leada: ['anniversary', 'graveyard', 'witchcipher'] } }
  await server.install(page)
  const bodies = postBodies(page, 'formation')

  await page.goto('/characters/Leada')
  await page.getByRole('button', { name: 'Events (3) ▾' }).click()
  const events = page.getByRole('group', { name: 'Events' })
  await expect(events.getByText('Graveyard Rising —')).toBeVisible()
  await expect(events.getByText(/Unsupported/)).toHaveCount(0)
  await events.getByRole('checkbox', { name: 'Crabxx' }).click()
  await expect.poll(() => bodies[0]?.eventSelections).toEqual(['anniversary', 'graveyard', 'witchcipher', 'crabxx'])
})

test('Event priorities: a rejected move shows the server error; followers use the leader order and cannot reorder', async ({ page }) => {
  const server = partyServer()
  server.extraState = { eventPrioritiesByCharacter: { Leada: ['mrpumpkin'] } }
  await server.install(page)

  await page.goto('/characters/Leada')
  await page.getByRole('button', { name: 'Events (1) ▾' }).click()
  const events = page.getByRole('group', { name: 'Events' })
  server.failOnce['formation'] = 'using leader events'
  await events.getByRole('button', { name: 'Move Anniversary up' }).click()
  await expect(events.getByRole('alert')).toHaveText('using leader events')
  await expect(priority(page, 'Mr. Pumpkin')).toHaveText('14')

  await page.goto('/characters/Folla')
  await page.getByRole('button', { name: 'Events (1) ▾' }).click()
  const follower = page.getByRole('group', { name: 'Events' })
  await expect(follower.getByText('Using Leada’s events')).toBeVisible()
  await expect(priority(page, 'Mr. Pumpkin')).toHaveText('14')
  await expect(follower.getByRole('button', { name: 'Move Anniversary up' })).toBeDisabled()
  await expect(follower.getByRole('button', { name: 'Move Anniversary down' })).toBeDisabled()
})

test('Event limits: Save sends {event, limits} with blanks as null, validates, and shows server errors', async ({ page }) => {
  const server = partyServer()
  await server.install(page)
  const bodies = postBodies(page, 'formation')

  await page.goto('/characters/Leada')
  await page.getByRole('button', { name: 'Events (1) ▾' }).click()
  await page.getByRole('button', { name: 'Crabxx settings' }).click()
  const panel = page.getByRole('group', { name: 'Crabxx settings' })
  await expect(panel.getByText(/^Blank means unlimited\./)).toBeVisible()
  await expect(panel.getByLabel('Death limit')).toHaveValue('')
  await expect(panel.getByLabel('Death limit')).toHaveAttribute('placeholder', 'Unlimited')

  // validEventLimits: a death limit is a whole number >= 0, a time limit is positive.
  await panel.getByLabel('Death limit').fill('-1')
  await expect(panel.getByRole('button', { name: 'Save event settings' })).toBeDisabled()
  await panel.getByLabel('Death limit').fill('2')
  await panel.getByLabel('Time limit (mins)').fill('0')
  await expect(panel.getByRole('button', { name: 'Save event settings' })).toBeDisabled()
  await panel.getByLabel('Time limit (mins)').fill('')
  await panel.getByRole('button', { name: 'Save event settings' }).click()
  await expect.poll(() => bodies[0]).toEqual({ character: 'Leada', eventLimits: { event: 'crabxx', limits: { deathLimit: 2, timeLimitMinutes: null } } })
  await expect(panel).toBeHidden()

  await page.getByRole('button', { name: 'Crabxx settings' }).click()
  await expect(panel.getByLabel('Death limit')).toHaveValue('2')
  await panel.getByLabel('Time limit (mins)').fill('1.5')
  server.failOnce['formation'] = 'invalid event limits'
  await panel.getByRole('button', { name: 'Save event settings' }).click()
  await expect(panel.getByRole('alert')).toHaveText('invalid event limits')
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: 'Save event settings' }).click()
  await expect.poll(() => bodies[2]).toEqual({ character: 'Leada', eventLimits: { event: 'crabxx', limits: { deathLimit: 2, timeLimitMinutes: 1.5 } } })
  await expect(panel).toBeHidden()

  await page.getByRole('button', { name: 'Crabxx settings' }).click()
  await panel.getByRole('button', { name: 'Close event settings' }).click()
  await expect(panel).toBeHidden()
  expect(bodies).toHaveLength(3)
})

test('Event limits: a save keeps the saved monsters and cipher fields (formation.ts stores the whole limits)', async ({ page }) => {
  const server = partyServer()
  const cipher = { automatic: true, minClues: 12, gatherMonsters: ['bat', 'bee', 'crab', 'goo'] }
  server.extraState = {
    eventLimitsByCharacter: { Leada: { graveyard: { deathLimit: 1, timeLimitMinutes: null, monsters: ['zombie'] }, witchcipher: { deathLimit: null, timeLimitMinutes: null, cipher } } },
  }
  await server.install(page)
  const bodies = postBodies(page, 'formation')

  await page.goto('/characters/Leada')
  await page.getByRole('button', { name: 'Events (1) ▾' }).click()
  await page.getByRole('button', { name: 'Graveyard Rising settings' }).click()
  const graveyard = page.getByRole('group', { name: 'Graveyard Rising settings' })
  await graveyard.getByLabel('Death limit').fill('2')
  await graveyard.getByRole('button', { name: 'Save event settings' }).click()
  await expect.poll(() => bodies[0]).toEqual({
    character: 'Leada',
    eventLimits: { event: 'graveyard', limits: { deathLimit: 2, timeLimitMinutes: null, monsters: ['zombie'] } },
  })

  await page.getByRole('button', { name: "Witch's Cipher settings" }).click()
  const witch = page.getByRole('group', { name: "Witch's Cipher settings" })
  await witch.getByLabel('Time limit (mins)').fill('5')
  await witch.getByRole('button', { name: 'Save event settings' }).click()
  await expect.poll(() => bodies[1]).toEqual({ character: 'Leada', eventLimits: { event: 'witchcipher', limits: { deathLimit: null, timeLimitMinutes: 5, cipher } } })
})

test('Event limits: a follower sees the leader’s limits read-only', async ({ page }) => {
  const server = partyServer()
  server.extraState = { eventLimitsByCharacter: { Leada: { franky: { deathLimit: 0, timeLimitMinutes: 30 } } } }
  await server.install(page)

  await page.goto('/characters/Folla')
  await page.getByRole('button', { name: 'Events (1) ▾' }).click()
  await page.getByRole('button', { name: 'Franky settings' }).click()
  const panel = page.getByRole('group', { name: 'Franky settings' })
  await expect(panel.getByLabel('Death limit')).toHaveValue('0')
  await expect(panel.getByLabel('Death limit')).toBeDisabled()
  await expect(panel.getByLabel('Time limit (mins)')).toHaveValue('30')
  await expect(panel.getByText('Using the leader’s event settings.')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Save event settings' })).toHaveCount(0)
})

test('Event attendance: a skipped, unfinished instance shows its reason, including the leader’s for a follower', async ({ page }) => {
  const server = partyServer()
  server.eventAttendance = {
    Leada: { crabxx: { ended: false, ignored: 'death limit' }, goobrawl: { ended: true, ignored: 'time limit' } },
  }
  await server.install(page)

  await page.goto('/characters/Leada')
  await page.getByRole('button', { name: 'Events (1) ▾' }).click()
  const events = page.getByRole('group', { name: 'Events' })
  await expect(events.getByText('Skipped this instance: death limit')).toBeVisible()
  // An ended instance no longer counts as skipped.
  await expect(events.getByText('Skipped this instance: time limit')).toHaveCount(0)

  await page.goto('/characters/Folla')
  await page.getByRole('button', { name: 'Events (1) ▾' }).click()
  await expect(page.getByRole('group', { name: 'Events' }).getByText('Skipped this instance: death limit')).toBeVisible()
})

test('Event list: rotation events show no realm prediction suffix', async ({ page }) => {
  const server = partyServer()
  server.realmControl = { activeRealm: 'SR_USI', currentRealm: 'SR_USI', homeRealm: 'SR_USI', split: false, characters: [], realms: [] }
  server.extraState = { eventSchedules: [{ id: 'icegolem', name: 'Ice Golem', live: true }] }
  await server.install(page)

  await page.goto('/characters/Leada')
  await page.getByRole('button', { name: 'Events (1) ▾' }).click()
  const events = page.getByRole('group', { name: 'Events' })
  // Console 6fa7b0f removed the daily chase predictions these rows once carried.
  await expect(events.getByText('Goobrawl — Time not announced', { exact: true })).toBeVisible()
  await expect(events.getByText('Franky — Time not announced', { exact: true })).toBeVisible()
  await expect(events.getByText('Ice Golem — LIVE', { exact: true })).toBeVisible()
  await expect(events.getByText(/predicted|this slot/)).toHaveCount(0)
})

test('Event attendance: a leader’s manual travel skip shows on the leader but not on its followers', async ({ page }) => {
  const server = partyServer()
  server.eventAttendance = {
    Leada: { crabxx: { ended: false, ignored: 'manual travel' }, goobrawl: { ended: false, ignored: 'death limit' } },
    Folla: { franky: { ended: false, ignored: 'manual travel' } },
  }
  await server.install(page)

  await page.goto('/characters/Leada')
  await page.getByRole('button', { name: 'Events (1) ▾' }).click()
  await expect(page.getByRole('group', { name: 'Events' }).getByText('Skipped this instance: manual travel')).toBeVisible()

  await page.goto('/characters/Folla')
  await page.getByRole('button', { name: 'Events (1) ▾' }).click()
  const events = page.getByRole('group', { name: 'Events' })
  // attendance-limits.ts lets followers attend through the leader's manual travel skip; other leader skips still apply.
  await expect(events.getByText('Skipped this instance: death limit')).toBeVisible()
  // Folla's own manual travel skip on Franky still shows; the leader's on Crabxx does not.
  await expect(events.getByText('Skipped this instance: manual travel')).toHaveCount(1)
})
