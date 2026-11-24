import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

// Console 2db4d763: event-limits-dialog.tsx, cipher-controls.tsx and
// event-selection-control.tsx. The cipher view mirrors a live
// core eventSchedules[witchcipher].cipher read on 2026-10-22.

function postBodies(page: Page, path: string): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/party-api/${path}`)) bodies.push(request.postDataJSON() as Record<string, unknown>)
  })
  return bodies
}

const sprite = { url: '/icons/icon-192.png', tileSize: 20, columns: 1, rows: 1, x: 0, y: 0 }
const clue = ['verdantspore', 'verdantspore', 'verdantspore', 'verdantspore', 'verdantspore']
const cipherView = {
  board: { live: true, phase: 'brewing', id: 'USIII-2026-10-22-1800-witchcipher', board: [{ mix: clue, right: 4 }], mixes: 1, possible: 15, cracks: 0 },
  ingredients: [
    { id: 'verdantspore', name: 'Verdant Spore', sprite },
    { id: 'frostscale', name: 'Frost Scale', sprite },
    { id: 'embercoal', name: 'Ember Coal', sprite },
    { id: 'gloomfeather', name: 'Gloom Feather', sprite },
  ],
  gathering: [
    ['verdantspore', ['goo', 'bee', 'spider', 'croc']],
    ['frostscale', ['arcticbee', 'boar', 'wolfie', 'iceroamer']],
    ['embercoal', ['plantoid', 'porcupine', 'fireroamer', 'gscorpion']],
    ['gloomfeather', ['snake', 'osnake', 'minimush', 'ghost']],
  ],
  sources: [
    { ingredient: 'verdantspore', id: 'goo', name: 'Goo', sprite, rate: 0.0003 },
    { ingredient: 'frostscale', id: 'wolfie', name: 'Wolfie', sprite, rate: 0.002 },
  ],
  stock: { verdantspore: 3, frostscale: 0 },
  gatheringPlan: null,
  merchant: 'Merchy',
  runtime: { phase: 'brewing', detail: 'waiting for clues', day: { mixes_left: 4 } },
}

function octoberServer() {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60 })
  server.addCharacter({ name: 'Merchy', ctype: 'merchant', level: 40 })
  server.leader = 'Leada'
  server.extraState = {
    eventSchedules: [
      { id: 'graveyard', name: 'Graveyard', next: Date.now() + 60 * 60_000 },
      { id: 'trickortreat', name: 'Trick or Treat' },
      { id: 'witchcipher', name: 'Witch Cipher', next: Date.now() + 30 * 60_000, cipher: cipherView },
    ],
    eventSelectionsByCharacter: { Leada: ['anniversary', 'graveyard'] },
    eventLimitsByCharacter: { Leada: { graveyard: { deathLimit: 2, timeLimitMinutes: null } } },
  }
  return server
}

async function openSettings(page: Page, name: string, events: number, event: string) {
  await page.goto(`/characters/${name}`)
  await page.getByRole('button', { name: `Events (${events}) ▾` }).click()
  const group = page.getByRole('group', { name: 'Events' })
  await group.getByRole('button', { name: `${event} settings` }).click()
  return group.getByRole('group', { name: `${event} settings` })
}

test('October events: graveyard monster filter saves the spread limits, Trick or Treat explains its route', async ({ page }) => {
  const server = octoberServer()
  await server.install(page)
  const bodies = postBodies(page, 'formation')

  const graveyard = await openSettings(page, 'Leada', 2, 'Graveyard Rising')
  await expect(graveyard.getByRole('checkbox', { name: 'Zombie' })).toBeChecked()
  await graveyard.getByRole('checkbox', { name: 'Ghoul' }).click()
  await graveyard.getByRole('button', { name: 'Save event settings' }).click()
  await expect
    .poll(() => bodies[0])
    .toEqual({ character: 'Leada', eventLimits: { event: 'graveyard', limits: { deathLimit: 2, timeLimitMinutes: null, monsters: ['zombie', 'gargoyle'] } } })

  const events = page.getByRole('group', { name: 'Events' })
  await events.getByRole('button', { name: 'Trick or Treat settings' }).click()
  await expect(events.getByRole('group', { name: 'Trick or Treat settings' }).getByText(/Visits all seven doors/)).toBeVisible()
})

test("Witch's Cipher: the board, gathering targets, clue minimum and automatic solving save as cipher limits", async ({ page }) => {
  const server = octoberServer()
  await server.install(page)
  const bodies = postBodies(page, 'formation')

  const cipher = await openSettings(page, 'Leada', 2, "Witch's Cipher")
  const board = cipher.getByRole('region', { name: 'Shared realm board' })
  await expect(board.getByText('1 clues · 15 possible recipes · recipe 1')).toBeVisible()
  await expect(board.getByText('4/5')).toBeVisible()
  await expect(cipher.getByRole('status')).toHaveText('Merchy: brewing · waiting for clues · 4 mixes left')
  await expect(cipher.getByText('Carried: 3')).toBeVisible()

  await cipher.getByRole('combobox', { name: 'frostscale farming monster' }).selectOption('wolfie')
  await expect(cipher.getByRole('combobox', { name: 'frostscale farming monster' })).toHaveValue('wolfie')
  await expect(cipher.getByRole('option', { name: 'Wolfie (0.2%)' })).toBeAttached()
  await cipher.getByRole('spinbutton', { name: 'Minimum clues' }).fill('3')
  await cipher.getByRole('checkbox', { name: 'Automatically try solutions' }).click()
  await cipher.getByRole('button', { name: 'Save event settings' }).click()
  await expect.poll(() => bodies[0]).toEqual({
    character: 'Leada',
    eventLimits: {
      event: 'witchcipher',
      limits: { deathLimit: null, timeLimitMinutes: null, cipher: { minClues: 3, automatic: false, gatherMonsters: ['goo', 'wolfie', 'plantoid', 'snake'] } },
    },
  })
})

test("Witch's Cipher: a manual solution must fit the clues and selects the event for the leader", async ({ page }) => {
  const server = octoberServer()
  server.extraState = {
    ...server.extraState,
    eventLimitsByCharacter: { Leada: { witchcipher: { deathLimit: null, timeLimitMinutes: 20, cipher: { minClues: 1, automatic: false } } } },
  }
  await server.install(page)
  const bodies = postBodies(page, 'formation')

  const cipher = await openSettings(page, 'Leada', 2, "Witch's Cipher")
  await cipher.getByRole('button', { name: 'Manually enter solution' }).click()
  const manual = cipher.getByRole('group', { name: 'Enter a five-ingredient solution' })
  const send = manual.getByRole('button', { name: 'Send solution to merchant' })
  // Five verdantspore is the clue itself.
  await expect(manual.getByText('This mix was already tried.')).toBeVisible()
  await expect(send).toBeDisabled()
  await manual.getByRole('combobox', { name: 'Ingredient 1' }).selectOption('frostscale')
  await manual.getByRole('combobox', { name: 'Ingredient 2' }).selectOption('frostscale')
  await expect(manual.getByText('Does not fit the current clues, or complete clues are unavailable.')).toBeVisible()
  await manual.getByRole('combobox', { name: 'Ingredient 2' }).selectOption('verdantspore')
  await expect(manual.getByText('Fits every known clue.')).toBeVisible()
  await send.click()

  await expect.poll(() => bodies.length).toBe(1)
  const body = bodies[0] as { eventLimits: { limits: { cipher: { manual: { id: string } } } } }
  expect(body.eventLimits.limits.cipher.manual.id).toMatch(/^[0-9a-f-]{36}$/)
  expect(body).toEqual({
    character: 'Leada',
    eventSelections: ['anniversary', 'graveyard', 'witchcipher'],
    eventLimits: {
      event: 'witchcipher',
      limits: {
        deathLimit: null,
        timeLimitMinutes: 20,
        cipher: {
          minClues: 1,
          automatic: false,
          gatherMonsters: ['goo', 'arcticbee', 'plantoid', 'snake'],
          manual: { id: body.eventLimits.limits.cipher.manual.id, round: 'USIII-2026-10-22-1800-witchcipher', cracks: 0, mix: ['frostscale', ...clue.slice(1)] },
        },
      },
    },
  })
})

test("Witch's Cipher: the merchant shares the leader's cipher policy and saves it on the leader", async ({ page }) => {
  const server = octoberServer()
  server.extraState = { ...server.extraState, eventSelectionsByCharacter: { Leada: ['anniversary', 'witchcipher'] } }
  await server.install(page)
  const bodies = postBodies(page, 'formation')

  const cipher = await openSettings(page, 'Merchy', 2, "Witch's Cipher")
  await expect(cipher.getByText('Shared Cipher policy with Leada. Changes here apply to the party.')).toBeVisible()
  await cipher.getByRole('spinbutton', { name: 'Minimum clues' }).fill('2')
  await cipher.getByRole('button', { name: 'Save event settings' }).click()
  await expect.poll(() => bodies[0]).toEqual({
    character: 'Leada',
    eventLimits: { event: 'witchcipher', limits: { deathLimit: null, timeLimitMinutes: null, cipher: { minClues: 2, automatic: true, gatherMonsters: ['goo', 'arcticbee', 'plantoid', 'snake'] } } },
  })
})
