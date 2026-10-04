import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function postBodies(page: Page, path: string): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/party-api/${path}`)) bodies.push(request.postDataJSON())
  })
  return bodies
}

test('Farming card: Copy leader badge for followers, live mode for the leader, backup batch countdown and the Daisy wait', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Warrior1', ctype: 'warrior', level: 60, diagnostics: { farmingMode: 'scatter' } })
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.leader = 'Warrior1'
  server.followers = { Ranger1: true }
  server.monsterHunt = {
    target: 'crabx',
    stage: 'waiting',
    message: 'All quests blacklisted',
    currentIndex: 0,
    missions: [],
    backup: { members: { Warrior1: { target: 'goo', remainingMs: 90_000, ready: false, fresh: true }, Ranger1: { target: null, remainingMs: 0, ready: true, fresh: true } } },
    turnIn: { owner: 'Warrior1', phase: 'claiming' },
  } as never
  server.extraState = { farmingPolicy: 'hunt' }
  await server.install(page)

  await page.goto('/characters/Warrior1')
  await expect(page.getByText('hunt · scatter', { exact: true })).toBeVisible()
  const hunt = page.getByRole('region', { name: 'Hunt status' })
  await expect(hunt.getByText('Hunt status · waiting')).toBeVisible()
  await expect(hunt.getByText(/^Next batch after every blacklisted quest expires · 1m 30s/)).toBeVisible()
  await expect(hunt.getByText('Warrior1: goo · 1m 30s')).toBeVisible()
  await expect(hunt.getByText('Ranger1: ready')).toBeVisible()
  await expect(hunt.getByText('Events wait until Daisy reward claims finish.')).toBeVisible()

  await page.goto('/characters/Ranger1')
  await expect(page.getByText('Copy leader', { exact: true })).toBeVisible()
  await expect(page.getByText('Used when Follow is off.')).toBeVisible()
})

test('Hunt settings: blacklist labels, Add to blacklist, preferred spawn and passive hunting saves', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Warrior1', ctype: 'warrior', level: 60 })
  server.leader = 'Warrior1'
  server.monsterChoices = [
    { id: 'goo', name: 'Goo', locations: [{ map: 'main', x: 10, y: 10, mapName: 'Mainland' }, { map: 'cave', x: 50, y: 60, mapName: 'Cave' }] },
    { id: 'bee', name: 'Bee', locations: [{ map: 'main', x: 300, y: 300 }] },
  ] as never
  server.huntBlacklist = { crabx: { monsterId: 'crabx', at: 1_700_000_000_000, deaths: 2, reason: 'Too many deaths' } } as never
  await server.install(page)
  const blacklist = postBodies(page, 'hunt-blacklist')
  const settings = postBodies(page, 'hunt-settings')
  const rare = postBodies(page, 'rare-hunting')

  await page.goto('/characters/Warrior1/hunt-settings')
  await expect(page.getByText(/^2 hunt deaths · /)).toBeVisible()

  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByLabel('Search blacklist monsters').fill('be')
  await page.getByRole('button', { name: 'Add Bee to blacklist' }).click()
  await expect.poll(() => blacklist[0]).toEqual({ action: 'add', character: 'Warrior1', monsterId: 'bee' })

  await page.getByRole('button', { name: 'Set preferred hunt spawns' }).click()
  const spawns = page.getByRole('region', { name: 'Preferred hunt spawns' })
  await expect(spawns.getByText('No monsters with multiple available spawns.')).toHaveCount(0)
  await spawns.getByText(/^Goo/).click()
  await spawns.getByLabel(/Cave/).click()
  await expect.poll(() => settings[0]).toEqual({ preferredSpawns: { goo: '["cave",50,60]' }, character: 'Warrior1' })

  const passive = page.getByRole('region', { name: 'Passive hunting' })
  await passive.getByRole('checkbox', { name: 'Use field generators when passively hunting fairy' }).click()
  await expect.poll(() => rare[0]).toEqual({ useFieldGenerators: false })
  await passive.getByRole('button', { name: 'Open passive hunting menu' }).click()
  await passive.getByRole('checkbox', { name: 'Passively hunt Bee' }).click()
  await expect.poll(() => rare[1]).toEqual({ rules: { bee: { enabled: true } } })
  await passive.getByLabel('Bee passive priority').fill('5000')
  await passive.getByLabel('Bee passive priority').press('Enter')
  await expect(passive.getByRole('alert')).toHaveText('Priority must be a whole number from 0 to 1000.')
})

test('Hunt settings parity: intro text, spawn map preview, inspecting from the blacklist picker and passive table, Clear all errors stay in the confirmation', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60 })
  server.leader = 'Leada'
  server.bestiaryCatalog = [{ id: 'crab', name: 'Crab', hp: 100, attack: 10, xp: 5, threat: 1, drops: [], spawnRecords: [] }]
  server.monsterChoices = [{ id: 'crab', name: 'Crab', locations: [{ map: 'main', x: 50, y: 75 }, { map: 'beach', x: 10, y: 10 }] } as never, { id: 'ghost', locations: [{ map: 'main', x: 0, y: 0 }] }]
  server.huntBlacklist = { crab: { at: Date.now(), reason: 'deaths' } }
  server.mapDefinitions = { main: { name: 'main', min_x: -500, min_y: -500, max_x: 500, max_y: 500, default: null, tiles: [], placements: [], groups: [], tilesets: {} } }
  await server.install(page)
  await page.goto('/characters/Leada/hunt-settings')

  await expect(page.getByText('Configure Hunt relocation and automatic blacklisting. Blacklisted quests are skipped until you clear the entry. Normal farming selections are unaffected.')).toBeVisible()

  await page.getByRole('button', { name: 'Set preferred hunt spawns' }).click()
  const preview = page.getByLabel('Preferred hunt spawn map preview')
  await expect(preview.getByText('Expand a monster to preview its spawn areas.')).toBeVisible()
  await page.getByText(/^Crab · 2 spawns/).click()
  await expect(preview.locator('canvas')).toBeVisible()

  await page.getByRole('button', { name: 'Add', exact: true }).click()
  const picker = page.getByRole('group', { name: 'Add to Hunt blacklist' })
  await expect(picker.getByText('Choose any monster to skip its Hunt quests. Click a monster for details.')).toBeVisible()
  await picker.getByRole('button', { name: 'Inspect Crab' }).click()
  await expect(page.getByText('G.monsters.crab')).toBeVisible()
  await page.keyboard.press('Escape')
  await picker.getByRole('button', { name: 'Inspect ghost' }).click()
  await expect(page.getByText('Monster details are not available for ghost yet.')).toBeVisible()

  await page.getByRole('button', { name: 'Open passive hunting menu' }).click()
  await page.getByRole('region', { name: 'Passive hunting' }).getByRole('button', { name: 'Inspect Crab' }).click()
  await expect(page.getByText('G.monsters.crab')).toBeVisible()
  await page.keyboard.press('Escape')

  server.failOnce['hunt-blacklist'] = 'Blacklist is locked'
  await page.getByRole('button', { name: 'Clear all', exact: true }).click()
  const confirm = page.getByRole('group', { name: 'Clear Hunt blacklist?' })
  await confirm.getByRole('button', { name: 'Clear all' }).click()
  await expect(confirm.getByRole('alert')).toHaveText('Blacklist is locked')
  await confirm.getByRole('button', { name: 'Clear all' }).click()
  await expect(confirm).toHaveCount(0)
  await expect(page.getByText('No monsters blacklisted.')).toBeVisible()
})

test('Monster focus: the route button routes the unsaved selection, and an untouched picker follows the server', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.leader = 'Ranger1'
  server.bestiaryCatalog = [{ id: 'crabx', name: 'Crabxx', hp: 100, attack: 10, xp: 5, threat: 1, drops: [] }, { id: 'goo', name: 'Goo', hp: 10, attack: 1, xp: 1, threat: 0, drops: [] }]
  server.monsterChoices = [{ id: 'crabx', locations: [{ map: 'main', x: 50, y: 75 }] }, { id: 'goo', locations: [{ map: 'main', x: 300, y: 300 }] }]
  server.monsterFocus = ['crabx']
  await server.install(page)
  await page.goto('/characters/Ranger1')

  await page.getByRole('button', { name: /^Crabxx/ }).click()
  const focus = page.getByRole('group', { name: 'Monster focus' })
  server.monsterFocus = ['goo']
  await expect(focus.getByRole('checkbox', { name: /goo/i })).toBeChecked({ timeout: 20_000 })
  await expect(focus.getByRole('checkbox', { name: /crabx/i })).not.toBeChecked()

  await focus.getByRole('checkbox', { name: /crabx/i }).check()
  await expect(page.getByLabel('Selected monster count')).toHaveText('2')
  await page.getByRole('button', { name: 'Find selected monster' }).click()
  await expect(page.getByRole('button', { name: /main \(50, 75\)/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /main \(300, 300\)/ })).toBeVisible()
})
