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
  // Both the vitals header ("fighting Crabxx") and the Farming section's own
  // combat-status line ("Fighting Crabxx") now resolve the same target name -
  // exact+case-sensitive distinguishes the Farming section's capitalized one.
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
  // The account leader's OWN blacklist does NOT include crabx - if the
  // resolver wrongly fell back to this top-level field for a non-leader,
  // non-follower character, the blacklist flag below would never show.
  server.huntBlacklist = {}
  // Independent1 is in neither `followers` nor is it the leader - it runs
  // its own farming independently, so resolveFarmingContext must resolve
  // its blacklist from its OWN farmingProfiles entry, not the account's.
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
  // navigation/focus.ts's characterFocus() deliberately keeps
  // monsterFocusByCharacter[leader] EMPTY (the leader's effective focus
  // lives in the flat monsterFocus field instead, which is what
  // followers/others inherit from) - a leader's own screen must fall back
  // to that flat field, matching connected-character-card.tsx's
  // `monsterFocusByCharacter?.[char.name] || selectedFocus`.
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.leader = 'Ranger1'
  server.bestiaryCatalog = [{ id: 'crabx', name: 'Crabxx', hp: 100, attack: 10, xp: 5, threat: 1, drops: [] }]
  server.monsterFocusByCharacter = {}
  server.monsterFocus = ['crabx']
  await server.install(page)

  await page.goto('/characters/Ranger1')
  await expect(page.getByRole('button', { name: 'Crabxx', exact: true })).toBeVisible()
  await expect(page.getByText('No monsters selected')).not.toBeVisible()
})

test('Character detail: resolves the real monster name via the live map/entities stream', async ({ page }) => {
  // End-to-end proof the subscription/frame-parsing/resolution pipeline
  // genuinely works: vitals.target is a per-instance id ("2951603" - a raw
  // game entity id, confirmed string in production since a real number
  // would crash activityLine.ts's `.trim()` call, which it doesn't), and
  // the live map/entities feed carries that same id alongside the actual
  // monster type (mtype) - useTargetMonsterType looks it up there instead
  // of ever showing the raw id.
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50, target: '2951603' })
  server.bestiaryCatalog = [{ id: 'crabx', name: 'Crabxx', hp: 100, attack: 10, xp: 5, threat: 1, drops: [] }]
  await server.install(page)
  server.setMapFrameEntities('Ranger1', [{ id: '2951603', mtype: 'crabx' }])

  await page.goto('/characters/Ranger1')
  await expect(page.getByText('Fighting Crabxx', { exact: true })).toBeVisible()
  await expect(page.getByText('fighting Crabxx', { exact: true })).toBeVisible()
})

test('Character detail: a numeric target does not crash the page (activityLine must never assume target is a string)', async ({ page }) => {
  // Found while testing the above: vitals.target is never coerced
  // server-side (characters/shared.js's publishMapFrame just does `target:
  // character.target || null`), so if the native game field is ever a raw
  // number instead of a string, `vitals.target?.trim()` throws - a full
  // page crash, not a cosmetic issue. Defensive fix: String() it first.
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
  // use-party-console.tsx's setFarmingPolicy tries Hunt directly first and
  // only opens the picker if the server actually rejects it - showing the
  // picker unconditionally would force re-selecting an already-configured
  // focus every time, and (per hunt/mode.ts's setBackup) submitting a
  // DIFFERENT selection than what's already there silently overwrites
  // every participant's own monsterFocusByCharacter.
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.leader = 'Ranger1'
  server.monsterFocusByCharacter = { Ranger1: ['phoenix'] }
  await server.install(page)

  let submittedBody: Record<string, unknown> | null = null
  await page.route('**/party-api/farming-mode', async (route) => {
    submittedBody = route.request().postDataJSON() as Record<string, unknown>
    return route.fulfill({ json: { ok: true, farmingPolicy: 'hunt', monsterHunt: null } })
  })

  await page.goto('/characters/Ranger1')
  await page.getByRole('button', { name: 'Hunt', exact: true }).click()
  await expect(page.getByText('Getting ready to hunt')).not.toBeVisible()
  // `character` matters here beyond just being present in the payload -
  // omitting it makes the server silently edit the ACCOUNT LEADER's
  // profile instead of this character's own (http/farming-scope.ts's
  // createScopedFarmingRoute defaults to ports.mainOwner() when absent).
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
  // The actual bug: http/farming-scope.ts's createScopedFarmingRoute reads
  // body.character to decide whose profile to edit, defaulting to the
  // account leader when it's missing. Viewing an independent (non-leader)
  // character's screen and selecting a mode previously edited the LEADER's
  // profile instead - the viewed character's own chip never changed,
  // because nothing had actually been sent for THEM at all.
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
  // `canRouteToMonster` allows this (not just the leader), but the travel
  // command type must still match: party-monster-travel is rejected
  // server-side unless `name === state.leader` exactly (confirmed against
  // runtime/coordinator/navigation/manual-commands.ts's partyTravel) - an
  // independent, non-leader character needs character-travel instead, same
  // as any other non-leader character.
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
  // The default order (anchors in farmingAreas.ts's defaultPhoenixOrder)
  // starts with the main(641,1803) region; a saved order reversing that
  // should show halloween(8,631) as region 1 instead if it's actually used.
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
