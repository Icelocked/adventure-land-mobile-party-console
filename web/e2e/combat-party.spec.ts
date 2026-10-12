import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

// Console 1.4 combat and party features: designated tank, gear sets, the
// Franky routine and the escape hold's Resume automation.

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
  server.addCharacter({
    name: 'Leada',
    ctype: 'warrior',
    level: 60,
    slots: { chest: { item: { name: 'coat', level: 7 } }, ring1: { item: { name: 'ringsj', level: 3 } } },
    items: [{ name: 'hpot0', q: 50 }],
  })
  server.addCharacter({ name: 'Folla', ctype: 'priest', level: 58 })
  server.addCharacter({ name: 'Merchy', ctype: 'merchant', level: 40 })
  server.leader = 'Leada'
  return server
}

test('Designated tank: the party list picks a tank, None clears it, and a refusal shows the server’s reason', async ({ page }) => {
  const server = partyServer()
  await server.install(page)
  const bodies = postBodies(page, 'formation')

  await page.goto('/')
  await expect(page.getByText('Holds melee range for the party regardless of class')).toBeVisible()
  const choices = page.getByRole('group', { name: 'Tank' })
  await page.getByRole('button', { name: 'Tank: None ▾' }).click()
  // Every connected character is a choice, the merchant included (party-workspace.tsx chars).
  await expect(choices.getByRole('button')).toHaveText(['None', 'Leada', 'Folla', 'Merchy'])
  await choices.getByRole('button', { name: 'Folla' }).click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toEqual({ tank: 'Folla' })
  expect(server.designatedTank).toBe('Folla')
  await expect(page.getByRole('button', { name: 'Tank: Folla ▾' })).toBeVisible()

  // Choosing the current tank sends nothing.
  await page.getByRole('button', { name: 'Tank: Folla ▾' }).click()
  await expect(choices.getByRole('button', { name: 'Folla' })).toHaveAttribute('aria-pressed', 'true')
  await choices.getByRole('button', { name: 'Folla' }).click()
  await page.getByRole('button', { name: 'Tank: Folla ▾' }).click()
  await choices.getByRole('button', { name: 'None' }).click()
  await expect.poll(() => bodies.length).toBe(2)
  expect(bodies[1]).toEqual({ tank: null })
  expect(server.designatedTank).toBeNull()
  await expect(page.getByRole('button', { name: 'Tank: None ▾' })).toBeVisible()

  server.failOnce['formation'] = 'unknown tank'
  await page.getByRole('button', { name: 'Tank: None ▾' }).click()
  await choices.getByRole('button', { name: 'Leada' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'unknown tank' })).toBeVisible()
})

test('Gear sets: saving captures the worn gear, shows worn/bag/missing pieces, clears, and shows a 409', async ({ page }) => {
  const server = partyServer()
  // Folla's tank set has one worn piece, one in the bag and one missing.
  server.characters[1].slots = { helmet: { item: { name: 'helmet', level: 5 } } }
  server.characters[1].items = [{ name: 'gloves', level: 4 }]
  server.gearSets = {
    Folla: {
      tank: { slots: { helmet: { name: 'helmet', level: 5 }, gloves: { name: 'gloves', level: 4 }, shoes: { name: 'shoes', level: 6 } }, savedAt: 1 },
    },
  }
  await server.install(page)
  const bodies = postBodies(page, 'gear-sets')

  await page.goto('/characters/Leada')
  await page.getByRole('button', { name: 'Gear sets (0) ▾' }).click()
  const luck = page.getByRole('region', { name: 'Luck gear set' })
  await expect(luck).toContainText('Worn by the designated tank right before a kill')
  await expect(luck).toContainText('Not saved')
  await luck.getByRole('button', { name: 'Save current gear as Luck' }).click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toEqual({ character: 'Leada', set: 'luck', action: 'save' })
  expect(server.gearSets.Leada.luck.slots).toEqual({ chest: { name: 'coat', level: 7 }, ring1: { name: 'ringsj', level: 3 } })
  await expect(luck).toContainText('2/2 pieces available (2 worn, 0 in bag)')
  await expect(page.getByRole('button', { name: 'Gear sets (1) ▾' })).toBeVisible()

  await luck.getByRole('button', { name: 'Clear' }).click()
  await expect.poll(() => bodies.length).toBe(2)
  expect(bodies[1]).toEqual({ character: 'Leada', set: 'luck', action: 'clear' })
  await expect(luck).toContainText('Not saved')

  // gear-sets.ts refuses a save without an equipment report from the last 10s.
  server.staleEquipment = ['Leada']
  await page.getByRole('region', { name: 'Tank gear set' }).getByRole('button', { name: 'Save current gear as Tank' }).click()
  await expect(page.getByRole('group', { name: 'Gear sets' }).getByRole('alert')).toHaveText('no fresh equipment report for Leada')
  expect(server.gearSets.Leada.tank).toBeUndefined()

  await page.goto('/characters/Folla')
  await page.getByRole('button', { name: 'Gear sets (1) ▾' }).click()
  await expect(page.getByRole('region', { name: 'Tank gear set' })).toContainText('2/3 pieces available (1 worn, 1 in bag) · missing shoes')

  // Merchant-class characters have no gear sets.
  await page.goto('/characters/Merchy')
  await expect(page.getByRole('button', { name: 'Leader', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Gear sets/ })).toHaveCount(0)
})

test('Gear sets: reserved bag slots read "Luck set" or "Swapped-out gear" over automatic rules', async ({ page }) => {
  const server = partyServer()
  const leada = server.characters[0]
  leada.items = [{ name: 'ringsj', level: 3 }, { name: 'coat', level: 2 }, { name: 'hpot0', q: 50 }]
  leada.reservedInventory = [
    { slot: 0, item: { name: 'ringsj', level: 3 } },
    { slot: 1, item: { name: 'coat', level: 2 } },
  ]
  server.gearSets = { Leada: { luck: { slots: { ring1: { name: 'ringsj', level: 3 } }, savedAt: 1 } } }
  // An automatic bank rule on the ring is exempt while the set holds it.
  server.extraState = { autoItemMarks: { Leada: { 'ringsj@+3': 'bank' } } }
  await server.install(page)

  await page.goto('/characters/Leada')
  const inventory = page.getByRole('region', { name: 'Inventory' })
  await expect(inventory.getByTestId('inventory-slot-0').locator('[data-item-action-banner]')).toHaveText('Luck set')
  await expect(inventory.getByTestId('inventory-slot-1').locator('[data-item-action-banner]')).toHaveText('Swapped-out gear')
  await expect(inventory.getByTestId('inventory-slot-2').locator('[data-item-action-banner]')).toHaveCount(0)
})

test('Franky routine: the Franky event opens the routine; mode and death limit post per character', async ({ page }) => {
  const server = partyServer()
  server.farmingProfiles = { Folla: { encounterAutoDeaths: { franky: 2 } } }
  await server.install(page)
  const bodies = postBodies(page, 'encounter-mode')

  await page.goto('/characters/Folla')
  await page.getByRole('button', { name: /^Events \(\d+\) ▾$/ }).click()
  await page.getByRole('button', { name: 'Franky routine settings' }).click()
  const routine = page.getByRole('group', { name: 'Franky routine' })
  await expect(routine).toContainText('Franky routine · Folla')
  // farming-context.ts defaults: Auto, a limit of 3.
  await expect(routine.getByRole('button', { name: /^Auto/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(routine.getByRole('spinbutton', { name: 'Auto-tank death limit' })).toHaveValue('3')
  await expect(routine).toContainText('Deaths while auto-tanking: 2/3')

  await routine.getByRole('button', { name: /^Tank/ }).click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toEqual({ character: 'Folla', encounter: 'franky', mode: 'tank' })
  expect(server.farmingProfiles.Folla.encounterRoutines).toEqual({ franky: 'tank' })
  await expect(routine.getByRole('button', { name: /^Tank/ })).toHaveAttribute('aria-pressed', 'true')

  const limit = routine.getByRole('spinbutton', { name: 'Auto-tank death limit' })
  await limit.fill('5')
  await routine.getByRole('button', { name: 'Set', exact: true }).click()
  await expect.poll(() => bodies.length).toBe(2)
  expect(bodies[1]).toEqual({ character: 'Folla', encounter: 'franky', deathLimit: 5 })
  await expect(routine).toContainText('Deaths while auto-tanking: 2/5')

  // A negative limit never leaves the page.
  await limit.fill('-1')
  await limit.press('Enter')
  await expect(routine.getByRole('alert')).toHaveText('Enter 0 or a positive number of deaths.')
  expect(bodies.length).toBe(2)

  server.failOnce['encounter-mode'] = 'invalid encounter mode'
  await routine.getByRole('button', { name: /^Off-tank/ }).click()
  await expect(routine.getByRole('alert').filter({ hasText: 'invalid encounter mode' })).toBeVisible()
})

test('Franky routine: a follower shows the leader’s routine read-only; merchants have none', async ({ page }) => {
  const server = partyServer()
  server.followers = { Folla: true }
  server.encounterRoutines = { franky: 'offtank' }
  server.encounterAutoDeathLimits = { franky: 0 }
  await server.install(page)
  const bodies = postBodies(page, 'encounter-mode')

  await page.goto('/characters/Folla')
  await page.getByRole('button', { name: /^Events \(\d+\) ▾$/ }).click()
  await page.getByRole('button', { name: 'Franky routine settings' }).click()
  const routine = page.getByRole('group', { name: 'Franky routine' })
  await expect(routine).toContainText('Inherited from the leader.')
  await expect(routine.getByRole('button', { name: /^Off-tank/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(routine.getByRole('button', { name: /^Tank/ })).toBeDisabled()
  await expect(routine.getByRole('spinbutton', { name: 'Auto-tank death limit' })).toBeDisabled()
  // A limit of 0 shows the death count alone.
  await expect(routine).toContainText(/Deaths while auto-tanking: 0$/)
  expect(bodies.length).toBe(0)

  await page.goto('/characters/Merchy')
  await page.getByRole('button', { name: /^Events \(\d+\) ▾$/ }).click()
  await expect(page.getByRole('group', { name: 'Events' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Franky routine settings' })).toHaveCount(0)
})

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
