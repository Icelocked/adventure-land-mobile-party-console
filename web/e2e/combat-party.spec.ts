import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

// Console 1.4 combat and party features: designated tank, the Franky
// routine and the escape hold's Resume automation.

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

test('Party roles: Farming settings picks a tank, None clears it, and a refusal shows the server’s reason', async ({ page }) => {
  const server = partyServer()
  await server.install(page)
  const bodies = postBodies(page, 'formation')

  // Console 5b784c28 moved the roles from the party bar into Farming settings.
  await page.goto('/')
  await expect(page.getByText('Leada').first()).toBeVisible()
  await expect(page.getByRole('button', { name: /^Tank:/ })).toHaveCount(0)
  await page.goto('/characters/Leada/hunt-settings')
  const roles = page.getByRole('group', { name: 'Party roles' })
  await expect(roles.getByText('The tank holds its target at its own range and owns taunt and absorb.')).toBeVisible()
  const choices = roles.getByRole('group', { name: 'Tank' })
  await roles.getByRole('button', { name: 'Tank: None ▾', exact: true }).click()
  // Every connected character is a choice, the merchant included (party-workspace.tsx chars).
  await expect(choices.getByRole('button')).toHaveText(['None', 'Leada', 'Folla', 'Merchy'])
  await choices.getByRole('button', { name: 'Folla' }).click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toEqual({ tank: 'Folla' })
  expect(server.designatedTank).toBe('Folla')
  await expect(roles.getByRole('button', { name: 'Tank: Folla ▾', exact: true })).toBeVisible()

  // Choosing the current tank sends nothing.
  await roles.getByRole('button', { name: 'Tank: Folla ▾', exact: true }).click()
  await expect(choices.getByRole('button', { name: 'Folla' })).toHaveAttribute('aria-pressed', 'true')
  await choices.getByRole('button', { name: 'Folla' }).click()
  await roles.getByRole('button', { name: 'Tank: Folla ▾', exact: true }).click()
  await choices.getByRole('button', { name: 'None' }).click()
  await expect.poll(() => bodies.length).toBe(2)
  expect(bodies[1]).toEqual({ tank: null })
  expect(server.designatedTank).toBeNull()
  await expect(roles.getByRole('button', { name: 'Tank: None ▾', exact: true })).toBeVisible()

  server.failOnce['formation'] = 'unknown tank'
  await roles.getByRole('button', { name: 'Tank: None ▾', exact: true }).click()
  await choices.getByRole('button', { name: 'Leada' }).click()
  await expect(roles.getByRole('alert').filter({ hasText: 'unknown tank' })).toBeVisible()
})

test('Party roles: off tank and Pull post their own field, and a follower sees the same party-wide roles', async ({ page }) => {
  const server = partyServer()
  server.followers = { Folla: true }
  await server.install(page)
  const bodies = postBodies(page, 'formation')

  await page.goto('/characters/Leada/hunt-settings')
  const roles = page.getByRole('group', { name: 'Party roles' })
  await expect(roles.getByText("The off tank takes the tank's attackers while the tank is in danger")).toBeVisible()
  await roles.getByRole('button', { name: 'Off tank: None ▾' }).click()
  await roles.getByRole('group', { name: 'Off tank' }).getByRole('button', { name: 'Leada' }).click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toEqual({ offTank: 'Leada' })
  expect(server.offTank).toBe('Leada')
  await expect(roles.getByRole('button', { name: 'Off tank: Leada ▾' })).toBeVisible()

  const pull = roles.getByRole('checkbox', { name: 'Pull' })
  await expect(pull).not.toBeChecked()
  await pull.click()
  await expect.poll(() => bodies.length).toBe(2)
  expect(bodies[1]).toEqual({ pullMode: true })
  expect(server.pullMode).toBe(true)
  await expect(pull).toBeChecked()

  // The roles are party-wide: a follower's Farming settings edits the same values.
  await page.goto('/characters/Folla/hunt-settings')
  await expect(roles.getByRole('button', { name: 'Off tank: Leada ▾' })).toBeEnabled()
  await expect(roles.getByRole('checkbox', { name: 'Pull' })).toBeChecked()
  await roles.getByRole('checkbox', { name: 'Pull' }).click()
  await expect.poll(() => bodies.length).toBe(3)
  expect(bodies[2]).toEqual({ pullMode: false })
})

test("Franky routine: Franky's event settings open the routine; mode and death limit post per character", async ({ page }) => {
  const server = partyServer()
  server.farmingProfiles = { Folla: { encounterAutoDeaths: { franky: 2 } } }
  await server.install(page)
  const bodies = postBodies(page, 'encounter-mode')

  await page.goto('/characters/Folla')
  await page.getByRole('button', { name: /^Events \(\d+\) ▾$/ }).click()
  // As on the console, the routine opens from inside Franky's event settings.
  await page.getByRole('button', { name: 'Franky settings' }).click()
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
  // As on the console, the routine opens from inside Franky's event settings.
  await page.getByRole('button', { name: 'Franky settings' }).click()
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
  await page.getByRole('button', { name: 'Franky settings' }).click()
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
