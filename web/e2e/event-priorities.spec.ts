import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

// Console 1.4 event-selection-control.tsx and event-limits-dialog.tsx:
// priority order, per-event limits, skipped instances and predictions.

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
  await expect(priority(page, 'Anniversary')).toHaveText('10')
  await expect(priority(page, 'Goobrawl')).toHaveText('8')
  await expect(priority(page, 'Mr. Pumpkin')).toHaveText('1')
  await expect(events.getByRole('button', { name: 'Move Anniversary up' })).toBeDisabled()
  await expect(events.getByRole('button', { name: 'Move Mr. Pumpkin down' })).toBeDisabled()

  await events.getByRole('button', { name: 'Move Goobrawl up' }).click()
  await expect.poll(() => bodies[0]).toEqual({
    character: 'Leada',
    eventPriorities: ['anniversary', 'goobrawl', 'abtesting', 'crabxx', 'franky', 'icegolem', 'snowman', 'slenderman', 'mrgreen', 'mrpumpkin'],
  })
  await expect(priority(page, 'Goobrawl')).toHaveText('9')
  await expect(priority(page, 'A/B Testing')).toHaveText('8')

  await events.getByRole('button', { name: 'Move Anniversary down' }).click()
  await expect.poll(() => (bodies[1]?.eventPriorities as string[] | undefined)?.slice(0, 2)).toEqual(['goobrawl', 'anniversary'])
  await expect(events.getByRole('checkbox').first()).toHaveAccessibleName('Goobrawl')
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
  await expect(priority(page, 'Mr. Pumpkin')).toHaveText('10')

  await page.goto('/characters/Folla')
  await page.getByRole('button', { name: 'Events (1) ▾' }).click()
  const follower = page.getByRole('group', { name: 'Events' })
  await expect(follower.getByText('Using Leada’s events')).toBeVisible()
  await expect(priority(page, 'Mr. Pumpkin')).toHaveText('10')
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

test('Event prediction: daily chase upcoming slots mark the current realm’s predicted rotation event', async ({ page }) => {
  const server = partyServer()
  server.realmControl = { activeRealm: 'SR_USI', currentRealm: 'SR_USI', homeRealm: 'SR_USI', split: false, characters: [], realms: [] }
  server.dailyChase = {
    ...server.dailyChase,
    upcoming: [
      { rotation: 'daily', region: 'US', slotAt: Date.now() + 3_600_000, predictions: [{ realm: 'SR_USI', event: 'goobrawl' }] },
      { rotation: 'nightly', region: 'US', slotAt: Date.now() + 7_200_000, predictions: [{ realm: 'SR_USII', event: 'franky' }] },
    ],
  }
  server.extraState = { eventSchedules: [{ id: 'icegolem', name: 'Ice Golem', live: true }] }
  await server.install(page)

  await page.goto('/characters/Leada')
  await page.getByRole('button', { name: 'Events (1) ▾' }).click()
  const events = page.getByRole('group', { name: 'Events' })
  await expect(events.getByText('Goobrawl — Time not announced · predicted here')).toBeVisible()
  await expect(events.getByText('Crabxx — Time not announced · not here this slot')).toBeVisible()
  await expect(events.getByText('A/B Testing — Time not announced · not here this slot')).toBeVisible()
  // The nightly slot predicts nothing for this realm; a live event shows no prediction.
  await expect(events.getByText('Franky — Time not announced · not predicted yet')).toBeVisible()
  await expect(events.getByText('Ice Golem — LIVE')).toBeVisible()
  await expect(events.getByText('Snowman — Time not announced')).toBeVisible()
})
