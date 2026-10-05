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
  // The vitals header ("fighting Crabxx") and the Farming section ("Fighting
  // Crabxx") show the same name; an exact, case-sensitive match picks the latter.
  await expect(page.getByText('Fighting Crabxx', { exact: true })).toBeVisible()
  // farming-mode-control.tsx hunt status block.
  const hunt = page.getByRole('region', { name: 'Hunt status' })
  await expect(hunt.getByText('Chasing the next spawn')).toBeVisible()
  await expect(hunt.getByText('Target: crabx')).toBeVisible()
  // active-statuses.tsx: conditions live in the collapsed "Active status" section.
  const statuses = page.getByRole('region', { name: 'Active status' })
  await statuses.getByRole('button', { name: /Active status/ }).click()
  await expect(statuses.getByText('Critical Strike')).toBeVisible()
  await expect(statuses.getByText(/^1m/)).toBeVisible()
})

test('Character detail: shows nothing extra for a fighter with no current target, conditions, or active Hunt', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  await server.install(page)

  await page.goto('/characters/Ranger1')
  await expect(page.getByText(/^Fighting /)).not.toBeVisible()
  await expect(page.getByRole('region', { name: 'Hunt status' })).toHaveCount(0)
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
  await expect(page.getByText(/My quest: crabx · 3 left · 2m/)).toBeVisible()
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
  // The leader's blacklist lacks crabx, so the flag below only shows if the
  // resolver uses the independent character's own profile.
  server.huntBlacklist = {}
  // Independent1 is neither leader nor follower, so its blacklist comes from
  // its own farmingProfiles entry.
  server.farmingProfiles = {
    Independent1: { huntBlacklist: { crabx: { monsterId: 'crabx', at: Date.now(), deaths: 3, reason: 'deaths' } } },
  }
  await server.install(page)

  await page.goto('/characters/Independent1')
  await expect(page.getByText(/My quest: crabx · 2 left/)).toBeVisible()
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

test('Character detail: the leader\'s own focus button falls back to the flat field, not "No monsters selected"', async ({ page }) => {
  // The console keeps monsterFocusByCharacter[leader] empty and stores the
  // leader's focus in the flat monsterFocus field, so the leader's screen
  // must fall back to it.
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.leader = 'Ranger1'
  server.bestiaryCatalog = [{ id: 'crabx', name: 'Crabxx', hp: 100, attack: 10, xp: 5, threat: 1, drops: [] }]
  server.monsterFocusByCharacter = {}
  server.monsterFocus = ['crabx']
  await server.install(page)

  await page.goto('/characters/Ranger1')
  await expect(page.getByRole('button', { name: /^Crabxx/ })).toBeVisible()
  await expect(page.getByText('No monsters selected')).not.toBeVisible()
})

test('Character detail: resolves the real monster name from the live map stream, without opening one itself', async ({ page }) => {
  // vitals.target is a per-instance entity id; the map/entities feed pairs
  // that id with the monster type, which useTargetMonsterType shows instead
  // of the raw id.
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50, target: '2951603' })
  server.bestiaryCatalog = [{ id: 'crabx', name: 'Crabxx', hp: 100, attack: 10, xp: 5, threat: 1, drops: [] }]
  await server.install(page)
  server.setMapFrameEntities('Ranger1', [{ id: '2951603', mtype: 'crabx' }])

  const streams: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/map-stream/')) streams.push(request.url())
  })
  await page.goto('/characters/Ranger1')
  // No map stream opens until a map is shown: an open stream makes the
  // character POST frames to the console continuously.
  await expect(page.getByText('Fighting', { exact: true })).toBeVisible()
  expect(streams).toEqual([])
  // The live map opens it; the target name then resolves from its frames.
  await page.getByRole('button', { name: 'Expand live map' }).click()
  await expect(page.getByText('Fighting Crabxx', { exact: true })).toBeVisible()
  await expect(page.getByText('fighting Crabxx', { exact: true })).toBeVisible()
})

test('Character detail: a numeric target does not crash the page (activityLine must never assume target is a string)', async ({ page }) => {
  // vitals.target isn't coerced server-side, so a numeric target must not
  // crash the page (`.trim()` on a number throws).
  const pageErrors: string[] = []
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50, target: 2951603 })
  await server.install(page)
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.goto('/characters/Ranger1')
  await expect(page.getByText('fighting', { exact: true })).toBeVisible()
  expect(pageErrors).toEqual([])
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

test('Selecting Hunt with an existing backup already configured activates it directly - no picker shown', async ({ page }) => {
  // Hunt is tried directly and the picker opens only if the server rejects
  // it. Always showing the picker would force re-selecting the focus, and a
  // different selection overwrites every participant's monsterFocusByCharacter.
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.leader = 'Ranger1'
  server.monsterFocusByCharacter = { Ranger1: ['phoenix'] }
  // use-party-console.tsx setFarmingPolicy: a saved waypoint is the backup location.
  server.extraState = { partyLocation: { map: 'main', x: 100, y: 200 } }
  await server.install(page)

  let submittedBody: Record<string, unknown> | null = null
  await page.route('**/party-api/farming-mode', async (route) => {
    submittedBody = route.request().postDataJSON() as Record<string, unknown>
    return route.fulfill({ json: { ok: true, farmingPolicy: 'hunt', monsterHunt: null } })
  })

  await page.goto('/characters/Ranger1')
  await page.getByRole('button', { name: 'Hunt', exact: true }).click()
  await expect(page.getByText('Getting ready to hunt')).not.toBeVisible()
  // Without `character` the server edits the leader's profile instead of
  // this character's (http/farming-scope.ts).
  await expect.poll(() => submittedBody).toEqual({ mode: 'hunt', character: 'Ranger1' })
})

test('Hunt backup picker, when the server actually requires one, starts from the character\'s existing monster focus - not blank', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.leader = 'Ranger1'
  server.bestiaryCatalog = [{ id: 'phoenix', name: 'Phoenix', hp: 100, attack: 10, xp: 5, threat: 1, drops: [] }]
  server.monsterChoices = [{ id: 'phoenix', locations: [{ map: 'main', x: 100, y: 200 }] }]
  server.monsterFocusByCharacter = { Ranger1: ['phoenix'] }
  server.extraState = { partyLocation: { map: 'main', x: 100, y: 200 } }
  await server.install(page)

  let callCount = 0
  let submittedBody: Record<string, unknown> | null = null
  await page.route('**/party-api/farming-mode', async (route) => {
    callCount += 1
    submittedBody = route.request().postDataJSON() as Record<string, unknown>
    if (callCount === 1) return route.fulfill({ status: 409, json: { error: 'Choose a backup farming location before starting Hunt' } })
    return route.fulfill({ json: { ok: true, farmingPolicy: 'hunt', monsterHunt: null } })
  })

  await page.goto('/characters/Ranger1')
  await page.getByRole('button', { name: 'Hunt', exact: true }).click()
  await expect(page.locator('label', { hasText: 'Phoenix' }).getByRole('checkbox')).toBeChecked()

  await page.getByRole('button', { name: /main \(100, 200\)/ }).click()
  await page.getByRole('button', { name: 'Save backup and start Hunt' }).click()
  await expect(page.getByText('Getting ready to hunt')).not.toBeVisible()
  const body = submittedBody as unknown as { character?: string; backup?: { monsterFocus?: string[] } } | null
  expect(body?.character).toBe('Ranger1')
  expect(body?.backup?.monsterFocus).toEqual(['phoenix'])
})

test('Route button opens the general farming-area picker and routes this character to the chosen area', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.leader = 'Ranger1'
  server.bestiaryCatalog = [{ id: 'crabx', name: 'Crabxx', hp: 100, attack: 10, xp: 5, threat: 1, drops: [] }]
  server.monsterChoices = [{ id: 'crabx', locations: [{ map: 'main', x: 50, y: 75 }] }]
  server.monsterFocusByCharacter = { Ranger1: ['crabx'] }
  await server.install(page)

  let submittedBody: Record<string, unknown> | null = null
  await page.route('**/party-api/command', async (route) => {
    submittedBody = route.request().postDataJSON() as Record<string, unknown>
    return route.fulfill({ json: { ok: true } })
  })

  await page.goto('/characters/Ranger1')
  await page.getByRole('button', { name: 'Find selected monster' }).click()
  await expect(page.getByText('Choose a farming area')).toBeVisible()
  await page.getByRole('button', { name: /main \(50, 75\)/ }).click()
  await page.getByRole('button', { name: 'Start farming' }).click()
  await expect(page.getByText('Choose a farming area')).not.toBeVisible()
  await expect.poll(() => submittedBody).toEqual({
    character: 'Ranger1',
    type: 'party-monster-travel',
    location: { map: 'main', x: 50, y: 75 },
    farmingMonsterIds: ['crabx'],
    // use-party-console.tsx startFarmingArea's label.
    label: expect.stringMatching(/^the selected farming area in /),
  })
})

test('Selecting a farming mode sends THIS character, not silently defaulting to the account leader', async ({ page }) => {
  // Failure mode: without body.character the server edits the leader's
  // profile, and the viewed independent character's chip never changes.
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'MainLeader', ctype: 'warrior', level: 60 })
  server.addCharacter({ name: 'Independent1', ctype: 'ranger', level: 50 })
  server.leader = 'MainLeader'
  await server.install(page)

  let submittedBody: Record<string, unknown> | null = null
  await page.route('**/party-api/farming-mode', async (route) => {
    submittedBody = route.request().postDataJSON() as Record<string, unknown>
    return route.fulfill({ json: { ok: true, farmingPolicy: 'default' } })
  })

  await page.goto('/characters/Independent1')
  await page.getByRole('button', { name: 'Default', exact: true }).click()
  await expect.poll(() => submittedBody).toEqual({ mode: 'default', character: 'Independent1' })
})

test('An independent character (not the leader, not following) routes via character-travel, not party-monster-travel', async ({ page }) => {
  // party-monster-travel is rejected unless `name === state.leader`, so an
  // independent character must send character-travel.
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'MainLeader', ctype: 'warrior', level: 60 })
  server.addCharacter({ name: 'Independent1', ctype: 'ranger', level: 50 })
  server.leader = 'MainLeader'
  server.bestiaryCatalog = [{ id: 'crabx', name: 'Crabxx', hp: 100, attack: 10, xp: 5, threat: 1, drops: [] }]
  server.monsterChoices = [{ id: 'crabx', locations: [{ map: 'main', x: 50, y: 75 }] }]
  server.monsterFocusByCharacter = { Independent1: ['crabx'] }
  await server.install(page)

  let submittedBody: Record<string, unknown> | null = null
  await page.route('**/party-api/command', async (route) => {
    submittedBody = route.request().postDataJSON() as Record<string, unknown>
    return route.fulfill({ json: { ok: true } })
  })

  await page.goto('/characters/Independent1')
  await page.getByRole('button', { name: 'Find selected monster' }).click()
  await page.getByRole('button', { name: /main \(50, 75\)/ }).click()
  await page.getByRole('button', { name: 'Start farming' }).click()
  await expect.poll(() => submittedBody).toEqual({
    character: 'Independent1',
    type: 'character-travel',
    location: { map: 'main', x: 50, y: 75 },
    farmingMonsterIds: ['crabx'],
    // use-party-console.tsx startFarmingArea's label.
    label: expect.stringMatching(/^the selected farming area in /),
  })
})

test('Phoenix search order pre-fills from a previously saved order, not the computed default', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.leader = 'Ranger1'
  server.bestiaryCatalog = [{ id: 'phoenix', name: 'Phoenix', hp: 100, attack: 10, xp: 5, threat: 1, drops: [] }]
  const locations = [
    { map: 'main', x: 641, y: 1803 },
    { map: 'cave', x: -180, y: -1164 },
    { map: 'main', x: -1184, y: 781 },
    { map: 'main', x: 1188, y: -193 },
    { map: 'halloween', x: 8, y: 631 },
  ]
  server.monsterChoices = [{ id: 'phoenix', locations }]
  server.monsterFocusByCharacter = { Ranger1: ['phoenix'] }
  // The default order starts with main(641,1803); a saved reversed order
  // must put halloween(8,631) first.
  server.phoenixRouteOrder = [
    JSON.stringify(['halloween', [8, 631]]),
    JSON.stringify(['main', [1188, -193]]),
    JSON.stringify(['main', [-1184, 781]]),
    JSON.stringify(['cave', [-180, -1164]]),
    JSON.stringify(['main', [641, 1803]]),
  ]
  await server.install(page)

  await page.goto('/characters/Ranger1')
  await page.getByRole('button', { name: 'Find selected monster' }).click()
  await expect(page.getByText('Choose Phoenix search order')).toBeVisible()
  // Region 1's badge should be on halloween(8,631), not the default order's main(641,1803).
  const halloweenRegion = page.getByRole('button', { name: /halloween \(8, 631\)/ })
  await expect(halloweenRegion.getByText('1', { exact: true })).toBeVisible()
})

test('Route button is disabled for a follower - only the leader can route to a monster', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'MainLeader', ctype: 'warrior', level: 60 })
  server.addCharacter({ name: 'Follower1', ctype: 'ranger', level: 50 })
  server.leader = 'MainLeader'
  server.followers = { Follower1: true }
  await server.install(page)

  await page.goto('/characters/Follower1')
  // monster-route-button.tsx: aria-disabled with FOLLOWER_ROUTE_MESSAGE.
  const route = page.getByRole('button', { name: 'only leader can route to monster' })
  await expect(route).toHaveAttribute('aria-disabled', 'true')

})

test('Phoenix search order requires exactly 5 regions before starting the patrol', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.leader = 'Ranger1'
  server.bestiaryCatalog = [{ id: 'phoenix', name: 'Phoenix', hp: 100, attack: 10, xp: 5, threat: 1, drops: [] }]
  server.monsterChoices = [
    {
      id: 'phoenix',
      locations: [
        { map: 'main', x: 641, y: 1803 },
        { map: 'cave', x: -180, y: -1164 },
        { map: 'main', x: -1184, y: 781 },
      ],
    },
  ]
  server.monsterFocusByCharacter = { Ranger1: ['phoenix'] }
  await server.install(page)

  await page.goto('/characters/Ranger1')
  await page.getByRole('button', { name: 'Find selected monster' }).click()
  await expect(page.getByText('Choose Phoenix search order')).toBeVisible()
  const startButton = page.getByRole('button', { name: 'Start Phoenix patrol' })
  await expect(startButton).toBeDisabled()
  await page.getByRole('button', { name: /main \(641, 1803\)/ }).click()
  await page.getByRole('button', { name: /cave \(-180, -1164\)/ }).click()
  await page.getByRole('button', { name: /main \(-1184, 781\)/ }).click()
  await expect(startButton).toBeDisabled() // only 3 of 5 regions chosen
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

test('Selecting Hunt with no backup location opens the setup picker without posting (use-party-console.tsx setFarmingPolicy)', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.leader = 'Ranger1'
  server.bestiaryCatalog = [{ id: 'phoenix', name: 'Phoenix', hp: 100, attack: 10, xp: 5, threat: 1, drops: [] }, { id: 'tinyp', name: 'Fairy', hp: 1, attack: 1, xp: 1, threat: 0, drops: [] }]
  server.monsterChoices = [{ id: 'phoenix', locations: [{ map: 'main', x: 100, y: 200 }] }, { id: 'tinyp', locations: [{ map: 'main', x: 5, y: 5 }] }]
  server.monsterFocusByCharacter = { Ranger1: ['phoenix'] }
  await server.install(page)
  let posts = 0
  await page.route('**/party-api/farming-mode', (route) => {
    posts++
    return route.fulfill({ json: { ok: true } })
  })

  await page.goto('/characters/Ranger1')
  await page.getByRole('button', { name: 'Hunt', exact: true }).click()
  await expect(page.getByText('Getting ready to hunt')).toBeVisible()
  expect(posts).toBe(0)
  // monster-focus-picker.tsx: Fairy is disabled with its explanation; Clear all empties the selection.
  await page.getByRole('button', { name: /· tinyp/ }).click({ force: true })
  await expect(page.getByText('Fairy has no verified regular spawn route. Enable “Passively hunt fairy” to attack on sight.')).toBeVisible()
  await expect(page.getByLabel('Selected monster count').first()).toHaveText('1')
  await page.getByRole('button', { name: 'Clear all' }).first().click()
  await expect(page.getByText('No monsters selected').first()).toBeVisible()
})
