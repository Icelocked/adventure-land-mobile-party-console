import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function postBodies(page: Page, path: string): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/party-api/${path}`)) bodies.push(request.postDataJSON() as Record<string, unknown>)
  })
  return bodies
}

function bestiaryServer({ tracktrix = true } = {}) {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60, ...(tracktrix ? { diagnostics: { monsterAchievements: { crab: { score: 150 } }, tracktrix: { active: true, bonuses: { str: 2 } } } } : {}) })
  server.leader = 'Leada'
  server.bestiaryCatalog = [
    {
      id: 'crab',
      name: 'Crab',
      hp: 100,
      attack: 10,
      xp: 5,
      range: 20,
      threat: 1,
      definition: { name: 'Crab', hp: 100, respawn: 200, achievements: [[100, 'stat', 'max_hp', 10], [500, 'stat', 'str', 1]] },
      drops: [
        { id: 'shell', name: 'Shell', rate: 0.05, quantity: 1 },
        { id: 'crabclaw', name: 'Crab Claw', rate: 2.5, quantity: 1 },
      ],
      spawnRecords: [{ sourceMap: 'main', map: 'main', mapName: 'Mainland', x: 50, y: 75, count: 4, restrictions: [] }],
    },
    { id: 'goo', name: 'Goo', hp: 50, attack: 5, xp: 2, threat: 0.5, definition: {}, drops: [], spawnRecords: [{ sourceMap: 'halloween', map: 'halloween', x: 0, y: 0, restrictions: ['instance'] }] },
    { id: 'tinyp', name: 'Tiny Phoenix', hp: 1, attack: 1, xp: 1, threat: 0, definition: {}, drops: [], spawnRecords: [] },
  ]
  server.addCatalogEntry({ id: 'shell', name: 'Shell' })
  server.addCatalogEntry({ id: 'crabclaw', name: 'Crab Claw' })
  server.addCatalogEntry({ id: 'seashell', name: 'Seashell', world: { drops: [{ monsterId: 'crab', monsterName: 'Crab', rate: 0.001, quantity: 2, sourceType: 'zone', mapId: 'main', mapName: 'Mainland' }] } })
  server.monsterChoices = [{ id: 'crab', locations: [{ map: 'main', x: 50, y: 75 }] }]
  return server
}

test('Bestiary: map filter, search, sort direction, Tracktrix scores and bonuses', async ({ page }) => {
  const server = bestiaryServer()
  await server.install(page)
  await page.goto('/bestiary')

  const crab = page.getByRole('button', { name: /^Crab 100 HP/ })
  await expect(crab).toContainText('150 / 500 score')
  await expect(crab).toContainText('High score: Leada')
  await expect(crab).toContainText('1 / 2 achievements unlocked')
  await expect(crab).toContainText('350 score to next achievement')

  await page.getByRole('button', { name: 'halloween' }).click()
  await expect(page.getByRole('button', { name: 'halloween' })).toHaveAttribute('aria-pressed', 'true')
  await expect(crab).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Goo/ })).toBeVisible()
  await page.getByRole('button', { name: 'All', exact: true }).click()

  await page.getByLabel('Sort monsters').selectOption('hp')
  const names = () => page.locator('.grid > button > p:first-of-type').allTextContents()
  await expect.poll(names).toEqual(['Tiny Phoenix', 'Goo', 'Crab'])
  await page.getByRole('button', { name: 'Sort highest first' }).click()
  await expect.poll(names).toEqual(['Crab', 'Goo', 'Tiny Phoenix'])
  await page.getByPlaceholder('Search monsters…').fill('go')
  await expect.poll(names).toEqual(['Goo'])
  await page.getByPlaceholder('Search monsters…').fill('zzz')
  await expect(page.getByText('No monsters match this map and search.')).toBeVisible()

  await page.getByRole('button', { name: 'Current Tracktrix bonuses' }).click()
  const bonuses = page.getByRole('region', { name: 'Current bonuses for holding a tracktrix' })
  await expect(bonuses.getByText('STR')).toBeVisible()
  await expect(bonuses.getByText('+2')).toBeVisible()
})

test('Bestiary without Tracktrix data: score sorts warn and cards say Tracktrix is required', async ({ page }) => {
  const server = bestiaryServer({ tracktrix: false })
  await server.install(page)
  await page.goto('/bestiary')
  await expect(page.getByRole('button', { name: /^Crab 100 HP/ })).toContainText('Tracktrix required for score totals')
  await page.getByLabel('Sort monsters').selectOption('next')
  await expect(page.getByText('Tracktrix data unavailable; total scores use zero and score to next is unavailable.')).toBeVisible()
})

test('Monster detail: achievements, spawns, definition, formatted drops with zone drops, drop details and navigation', async ({ page }) => {
  const server = bestiaryServer()
  await server.install(page)
  const navigate = postBodies(page, 'navigate-to-monster')
  await page.goto('/bestiary')

  await page.getByRole('button', { name: /^Crab 100 HP/ }).click()
  await expect(page.getByText('G.monsters.crab')).toBeVisible()
  const achievements = page.getByRole('region', { name: 'Monster achievements' })
  await expect(achievements.getByText('1/2 unlocked · 150 score · Leada')).toBeVisible()
  await expect(achievements.getByText('✓ Unlocked · +10 MAX HP')).toBeVisible()
  await expect(achievements.getByText('○ Locked · +1 STR')).toBeVisible()
  await expect(page.getByText('Mainland (main) · (50, 75) · Count: 4')).toBeVisible()
  await expect(page.getByText('Available for ordinary hunt routing.')).toBeVisible()
  await expect(page.getByText(/^respawn$/i)).toBeVisible()
  await expect(page.getByText('Monster-specific drops (2)')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Shell 5%$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Crab Claw 100% ×2 \+ 50%$/ })).toBeVisible()
  await expect(page.getByText('Zone & world drops (1)')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Seashell 0\.1% ×2 Mainland zone drop$/ })).toBeVisible()

  await page.getByRole('button', { name: 'Navigate to Crab' }).click()
  const picker = page.getByRole('group', { name: 'Navigate to Crab' })
  await picker.getByRole('button', { name: /main \(50, 75\)/ }).click()
  await picker.getByRole('button', { name: 'Start farming' }).click()
  await expect.poll(() => navigate[0]).toMatchObject({ monsterId: 'crab', location: { map: 'main', x: 50, y: 75 } })
  await expect(picker).toHaveCount(0)
  await expect(page.getByText('G.monsters.crab')).toHaveCount(0)

  await page.getByRole('button', { name: /^Crab 100 HP/ }).click()
  await page.getByRole('button', { name: /^Shell 5%$/ }).click()
  await expect(page.getByText('Shell', { exact: true }).last()).toBeVisible()
  await expect(page.getByText('G.monsters.crab')).toHaveCount(0)
})

test('Monster detail: Tiny Phoenix has no regular route; item drops open the unified monster detail', async ({ page }) => {
  const server = bestiaryServer()
  await server.install(page)
  await page.goto('/bestiary')
  await page.getByRole('button', { name: /^Tiny Phoenix/ }).click()
  await expect(page.getByRole('button', { name: 'Navigate to Tiny Phoenix' })).toBeDisabled()
  await expect(page.getByText('No static spawn recorded in game data.')).toBeVisible()
  await page.keyboard.press('Escape')

  // Item details → Drops → monster opens the same monster detail inside the item browser.
  await page.getByRole('button', { name: /^Crab 100 HP/ }).click()
  await page.getByRole('button', { name: /^Seashell / }).click()
  await page.getByRole('button', { name: 'Drops', exact: true }).click()
  await page.getByRole('button', { name: /Crab/ }).last().click()
  await expect(page.getByText('G.monsters.crab')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible()
})

test('Hunt blacklist: a blacklisted monster opens its details; an unknown one explains why not', async ({ page }) => {
  const server = bestiaryServer()
  server.huntBlacklist = { crab: { at: Date.now(), reason: 'deaths' }, ghost: { at: Date.now(), reason: 'deaths' } }
  await server.install(page)
  await page.goto('/characters/Leada/hunt-settings')
  await page.getByRole('button', { name: 'Inspect Crab' }).click()
  await expect(page.getByText('G.monsters.crab')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Inspect ghost' }).click()
  await expect(page.getByRole('alert')).toHaveText('Monster details are not available for ghost yet.')
})
