import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

const UUID = /^[0-9a-f-]{36}$/

function member(name: string, fresh = true, observation: Record<string, unknown> = {}) {
  return {
    name,
    fresh,
    observation: { protocol: 1, at: Date.now(), supported: true, alive: true, ready: true, members: [], cave: null, visit: { available: true, resets: 0, home: 'EU I', checkedAt: Date.now() }, ...observation },
  }
}

function partyServer() {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60 })
  server.addCharacter({ name: 'Folla', ctype: 'priest', level: 60 })
  server.leader = 'Leada'
  return server
}

function activeCave(choice?: Record<string, unknown>) {
  const cave = {
    run: 'ab12',
    floor: 1,
    expires: Date.now() + 9 * 60_000 + 30_000,
    remainingMs: 120_000,
    paused: !!choice && !choice.resolved,
    gold: 100,
    amber: 3,
    points: [
      { id: 'p1', room: 'r1', label: 'Fountain', map: 'zone_ab12_1', x: 0, y: 0, required: true },
      { id: 'p2', room: 'r2', label: 'Library', map: 'zone_ab12_1', x: 10, y: 0, done: true },
      { id: 'p3', room: 'r3', label: 'Vault', map: 'zone_ab12_1', x: 20, y: 0, locked: true },
      { id: 'p4', room: 'r4', label: 'Stairs', map: 'zone_ab12_2', x: 0, y: 0 },
      { id: 'p5', label: 'Exit', map: 'zone_ab12_1', x: 0, y: 0, exit: true },
    ],
    ...(choice ? { choice } : {}),
  }
  return {
    state: { phase: 'active', participants: ['Leada', 'Folla'], protectFromEvents: true, commands: {}, run: 'ab12' },
    members: [member('Leada', true, { cave }), member('Folla', false)],
  }
}

test('Cave row: availability, settings sheet enters, toggles event protection, and releases a held visit', async ({ page }) => {
  const server = partyServer()
  server.dailyDungeon = { state: { phase: 'idle', participants: ['Leada', 'Folla'], protectFromEvents: true, commands: {} }, members: [member('Leada'), member('Folla')] }
  await server.install(page)

  await page.goto('/characters/Leada')
  await page.getByRole('button', { name: /^Events \(\d+\) ▾$/ }).click()
  const events = page.getByRole('group', { name: 'Events' })
  await expect(events.getByText('Cave of Many Dreams — Available now')).toBeVisible()
  await events.getByRole('button', { name: 'Cave of Many Dreams settings' }).click()
  const settings = page.getByRole('group', { name: 'Cave of Many Dreams' })
  await expect(settings.getByText('Participants: Leada, Folla.')).toBeVisible()

  await settings.getByRole('checkbox', { name: 'Don’t leave the Cave of Many Dreams for other events' }).click()
  await expect.poll(() => server.dungeonActions[0]).toMatchObject({ action: 'settings', protectFromEvents: false, operationId: expect.stringMatching(UUID) })

  await settings.getByRole('button', { name: 'Enter now' }).click()
  await expect.poll(() => server.dungeonActions[1]).toMatchObject({ action: 'enter', operationId: expect.stringMatching(UUID) })
  expect(server.dungeonActions[0].operationId).not.toEqual(server.dungeonActions[1].operationId)

  server.dailyDungeon = {
    state: { phase: 'held', participants: ['Leada', 'Folla'], protectFromEvents: true, commands: {} },
    members: [member('Leada', true, { visit: { available: false, resets: 0, home: 'EU I', resume: { server: 'US II' }, checkedAt: Date.now() } }), member('Folla', false)],
  }
  await expect(settings.getByText('Resume on US II. Realm changes are manual.')).toBeVisible()
  await expect(settings.getByText('Participants: Leada, Folla (offline).')).toBeVisible()
  await expect(settings.getByRole('button', { name: 'Resume visit' })).toBeDisabled()
  await expect(settings.getByText(/^Entry needs fresh eligible characters/)).toBeVisible()
  await settings.getByRole('button', { name: 'Resume ordinary activity' }).click()
  await expect.poll(() => server.dungeonActions.at(-1)).toMatchObject({ action: 'release' })
})

test('Dungeon panel: run status, rooms, exploration, exit confirmation, and Escape exits the dungeon', async ({ page }) => {
  const server = partyServer()
  server.dailyDungeon = activeCave()
  await server.install(page)

  await page.goto('/')
  const panel = page.getByRole('region', { name: 'Cave of Many Dreams controls' })
  await expect(panel.getByText(/^Floor 2 · 0h 9m \d+s remaining · 100 gold · 3 Amber$/)).toBeVisible()
  await expect(panel.getByText('Leada · Folla — awaiting connection')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Library — complete' })).toBeDisabled()
  await expect(panel.getByRole('button', { name: 'Vault — locked' })).toBeDisabled()
  await expect(panel.getByRole('button', { name: 'Stairs — different floor' })).toBeEnabled()
  await expect(panel.getByRole('button', { name: 'Exit', exact: true })).toHaveCount(0)

  await panel.getByRole('button', { name: 'Fountain' }).click()
  await expect.poll(() => server.dungeonActions[0]).toMatchObject({ action: 'move', target: 'p1', run: 'ab12' })
  await panel.getByRole('button', { name: 'Start automatic exploration' }).click()
  await expect.poll(() => server.dungeonActions[1]).toMatchObject({ action: 'progress', enabled: true, run: 'ab12' })

  await panel.getByRole('button', { name: 'Exit dungeon' }).click()
  const confirm = panel.getByRole('group', { name: 'Exit the dungeon?' })
  await confirm.getByRole('button', { name: 'Stay in dungeon' }).click()
  await expect(confirm).toHaveCount(0)
  await panel.getByRole('button', { name: 'Exit dungeon' }).click()
  await panel.getByRole('button', { name: 'Confirm exit' }).click()
  await expect.poll(() => server.dungeonActions[2]).toMatchObject({ action: 'exit', run: 'ab12' })

  server.failOnce['daily-dungeons'] = 'Party is busy'
  await page.getByRole('button', { name: 'Escape — exit dungeon' }).click()
  await expect.poll(() => server.dungeonActions[3]).toMatchObject({ action: 'exit' })
  await expect(page.getByRole('alert').filter({ hasText: 'Party is busy' }).first()).toBeVisible()
})

test('Encounter: free and paid votes, then a resolved shop encounter with inspection and confirmed purchase', async ({ page }) => {
  const server = partyServer()
  server.addCatalogEntry({ id: 'ringsj', name: 'Ring of Sweet Jacko' })
  server.dailyDungeon = activeCave({
    id: 'c1',
    title: 'A Talking Mushroom',
    text: 'It asks for gold.',
    deadline: Date.now() + 60_000,
    resolved: false,
    votes: { Leada: 'pay' },
    options: [
      { id: 'leave', label: 'Walk away' },
      { id: 'pay', label: 'Pay it', cost: 50, amber: 1 },
      { id: 'steal', label: 'Steal', unavailable: 'Needs a rogue' },
    ],
  })
  await server.install(page)

  await page.goto('/')
  const encounter = page.getByRole('group', { name: 'Cave choice' })
  await expect(encounter.getByText('Party funds: 100 gold · 3 Amber')).toBeVisible()
  await expect(encounter.getByText('The cave timer and route are paused until the party answers.')).toBeVisible()
  await expect(encounter.getByRole('button', { name: 'Close encounter' })).toHaveCount(0)
  await expect(encounter.getByRole('button', { name: /^Steal — Needs a rogue/ })).toBeDisabled()
  await expect(encounter.getByRole('button', { name: /^Pay it — 50 shared gold — 1 Amber\s*Leada$/ })).toBeVisible()

  await encounter.getByRole('button', { name: /^Walk away/ }).click()
  await expect.poll(() => server.dungeonActions[0]).toMatchObject({ action: 'vote', choice: 'c1', option: 'leave' })
  await encounter.getByRole('button', { name: /^Pay it/ }).click()
  const paid = encounter.getByRole('group', { name: 'Confirm paid dungeon choice' })
  await expect(paid.getByText('Spend 50 shared gold and 1 Amber if this choice wins?')).toBeVisible()
  await paid.getByRole('button', { name: 'Confirm vote' }).click()
  await expect.poll(() => server.dungeonActions[1]).toMatchObject({ action: 'vote', choice: 'c1', option: 'pay', cost: 50, amber: 1, confirmed: true })

  server.dailyDungeon = activeCave({
    id: 'c1', title: 'A Talking Mushroom', text: 'It sells a ring.', deadline: 0, resolved: true, resultLabel: 'You paid.', summary: ['A shop opens.'], votes: {}, options: [],
    shop: { room: 'r1', name: 'ringsj', price: 80, sold: false, nearby: true },
  })
  await expect(encounter).toHaveCount(0)
  const panel = page.getByRole('region', { name: 'Cave of Many Dreams controls' })
  await panel.getByRole('button', { name: 'View encounter — A Talking Mushroom' }).click()
  await expect(encounter.getByText('You paid. A shop opens.')).toBeVisible()
  await expect(encounter.getByText('Ring of Sweet Jacko — 80 shared gold')).toBeVisible()
  await encounter.getByRole('button', { name: 'Inspect cave shop item' }).click()
  await expect(page.getByText('Ring of Sweet Jacko', { exact: true }).last()).toBeVisible()
  await page.keyboard.press('Escape')
  await encounter.getByRole('button', { name: 'Buy…' }).click()
  await encounter.getByRole('group', { name: 'Confirm dungeon purchase' }).getByRole('button', { name: 'Confirm purchase' }).click()
  await expect.poll(() => server.dungeonActions[2]).toMatchObject({ action: 'buy', choice: 'c1', cost: 80, confirmed: true })
  await encounter.getByRole('button', { name: 'Close encounter' }).click()
  await expect(encounter).toHaveCount(0)
})

test('Revival: a dead member offers Call Nera and shows the priest recovery status', async ({ page }) => {
  const server = partyServer()
  const view = activeCave()
  view.members[1] = member('Folla', true, { alive: false })
  server.dailyDungeon = view
  await server.install(page)

  await page.goto('/')
  const panel = page.getByRole('region', { name: 'Cave of Many Dreams controls' })
  await expect(panel.getByText('Waiting for an available priest with an Essence of Life. Call Nera if needed.')).toBeVisible()
  await panel.getByRole('button', { name: 'Call Nera — revival choices' }).click()
  await expect.poll(() => server.dungeonActions[0]).toMatchObject({ action: 'revival', run: 'ab12' })

  server.dailyDungeon = { ...view, state: { ...view.state, priestRecovery: { id: 'r1', run: 'ab12', priest: 'Leada', target: 'Folla', authorized: true } } }
  await expect(panel.getByText('Leada reviving Folla: Preparing priest recovery')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Call Nera — revival choices' })).toBeDisabled()
})

test('Cave map: full floor from the participants’ streams, waypoint placement and Set waypoint', async ({ page }) => {
  const server = partyServer()
  server.dailyDungeon = activeCave()
  const definition = { name: 'zone_ab12_1', min_x: -200, min_y: -200, max_x: 200, max_y: 200, default: null, tiles: [], placements: [], groups: [], tilesets: {} }
  server.setMapFrame('Leada', { name: 'Leada', map: 'zone_ab12_1', at: Date.now(), x: 0, y: 0, definition, entities: [] })
  await server.install(page)

  await page.goto('/')
  await page.getByRole('button', { name: 'View full map' }).click()
  const map = page.getByRole('group', { name: 'Cave map' })
  await expect(map.getByText('Cave of Many Dreams — Floor 2')).toBeVisible()
  await expect(map.getByText('Leada', { exact: true })).toBeVisible()
  await expect(map.getByRole('button', { name: 'Set waypoint' })).toBeDisabled()
  await map.getByRole('button', { name: 'Add waypoint' }).click()
  await expect(map.getByText('Click the map to place your waypoint.')).toBeVisible()
  const box = (await map.locator('canvas').boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(map.getByText(/^-?\d+, -?\d+$/)).toBeVisible()
  await map.getByRole('button', { name: 'Set waypoint' }).click()
  await expect.poll(() => server.dungeonActions[0]).toMatchObject({ action: 'waypoint', map: 'zone_ab12_1', run: 'ab12', x: expect.any(Number), y: expect.any(Number) })
  await expect(map).toHaveCount(0)
})
