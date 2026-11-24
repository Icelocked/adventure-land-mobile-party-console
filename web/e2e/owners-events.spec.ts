import { test, expect } from '@playwright/test'
import { OwnersSet2Mock } from './fixtures/ownersSet2Mock'

// OWNERS-PORT-MAP.md B9: the owners release's event-selection-control.tsx rows - Rejoin for an
// occurrence left by a manual move, and the Trick or Treat knock counts with the daily reset.

function eventsServer() {
  const server = new OwnersSet2Mock()
  server.paired = true
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60 })
  server.addCharacter({ name: 'Folla', ctype: 'priest', level: 60 })
  server.leader = 'Leada'
  server.followers = { Folla: true }
  server.extraState = {
    eventSchedules: [
      { id: 'goobrawl', name: 'Goo Brawl', live: true },
      { id: 'trickortreat', name: 'Trick or Treat', trickOrTreat: { characters: { Leada: { day: '2026-10-30', observedAt: Date.now(), characterRemaining: 5, characterLimit: 7, accountRemainingUpperBound: 9, accountLimit: 14 } } } },
    ],
    eventSelectionsByCharacter: { Leada: ['goobrawl', 'trickortreat'] },
  }
  return server
}

test('B9: Rejoin posts {character, event} for an event left by a manual move, and the skip clears', async ({ page }) => {
  const server = eventsServer()
  server.eventAttendance = { Leada: { goobrawl: { ended: false, ignored: 'manual travel' } } }
  await server.install(page)

  await page.goto('/characters/Leada')
  await page.getByRole('button', { name: 'Events (2) ▾' }).click()
  const events = page.getByRole('group', { name: 'Events' })
  await expect(events.getByText('Skipped this instance: manual travel')).toBeVisible()
  await events.getByRole('button', { name: 'Rejoin' }).click()
  await expect.poll(() => server.eventRejoins).toEqual([{ character: 'Leada', event: 'goobrawl' }])
  await expect(events.getByText('Skipped this instance: manual travel')).toHaveCount(0, { timeout: 12_000 })
  await expect(events.getByRole('button', { name: 'Rejoin' })).toHaveCount(0)
})

test("B9: a follower sees no Rejoin for its leader's manual leave, and a limit skip offers none", async ({ page }) => {
  const server = eventsServer()
  server.eventAttendance = {
    Leada: { goobrawl: { ended: false, ignored: 'manual travel' } },
    Folla: { trickortreat: { ended: false, ignored: 'death limit' } },
  }
  await server.install(page)

  await page.goto('/characters/Folla')
  await page.getByRole('button', { name: /Events \(\d+\) ▾/ }).click()
  const events = page.getByRole('group', { name: 'Events' })
  await expect(events.getByText('Skipped this instance: death limit')).toBeVisible()
  await expect(events.getByText('Skipped this instance: manual travel')).toHaveCount(0)
  await expect(events.getByRole('button', { name: 'Rejoin' })).toHaveCount(0)
})

test('B9: Trick or Treat shows the knocks left and the next daily reset', async ({ page }) => {
  const server = eventsServer()
  await server.install(page)

  await page.goto('/characters/Leada')
  await page.getByRole('button', { name: 'Events (2) ▾' }).click()
  const events = page.getByRole('group', { name: 'Events' })
  await expect(events.getByText('Knocks left · Character: 5/7 · Account: up to 9/14')).toBeVisible()
  await expect(events.getByText(/^Next daily reset: /)).toBeVisible()
  await expect(events.getByText('Once daily at 00:00 UTC · Available during Halloween')).toBeVisible()
})
