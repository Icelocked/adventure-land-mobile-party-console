import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function bodies(page: Page) {
  const sent: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/party-api/achievement-hunt')) sent.push(request.postDataJSON())
  })
  return sent
}
const ladder = (...counts: number[]) => counts.map((count) => [count, 'stat', 'hp', 10])
const at = [{ map: 'main', x: 0, y: 0 }]

function setup(settings: Record<string, unknown> | null) {
  const server = new MockPartyServer()
  server.paired = true
  server.leader = 'Leada'
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 70 })
  server.addCharacter({ name: 'Folla', ctype: 'priest', level: 70 })
  server.bestiaryCatalog = [
    { id: 'bee', name: 'Bee', hp: 100, threat: 5, definition: { achievements: ladder(10, 100) } },
    { id: 'goo', name: 'Goo', hp: 50, threat: 1, definition: { achievements: ladder(10, 100) } },
    { id: 'wolf', name: 'White Wolf', hp: 48000, threat: 50, definition: { achievements: ladder(1, 100) } },
    { id: 'dragold', name: 'Dragold', hp: 25600000, threat: 800, definition: { achievements: ladder(1, 10), special: true } },
    { id: 'phoenix', name: 'Phoenix', hp: 36000, threat: 300, definition: { achievements: ladder(1, 10) } },
  ]
  server.monsterChoices = [{ id: 'goo', locations: at }, { id: 'bee', locations: at }, { id: 'wolf', locations: at }]
  if (settings) server.extraState = { achievementHunt: settings, achievementBlacklist: { bee: { monsterId: 'bee', at: 1, reason: '3 deaths while farming for achievements' } }, achievementMessage: 'Farming goo: 4 / 10 kills (step 1)' }
  return server
}

test('Achievement Hunt: weakest-first selector, Up to here, skip, start and the status line', async ({ page }) => {
  const server = setup({ enabled: false, monsters: ['goo'], blacklistDeaths: true, deathThreshold: 3 })
  await server.install(page)
  const sent = bodies(page)
  await page.goto('/characters/Leada')
  const section = page.getByRole('region', { name: 'Achievement Hunt' })
  await expect(section.getByText('Farming goo: 4 / 10 kills (step 1)')).toBeVisible()
  await expect(section.getByText('Bee · 3 deaths while farming for achievements')).toBeVisible()

  await section.getByRole('button', { name: 'Choose monsters…' }).click()
  const regular = page.getByRole('region', { name: 'Regular monsters' })
  await expect(regular.getByRole('checkbox')).toHaveCount(3)
  const names = await regular.locator('span.text-sm').allTextContents()
  expect(names.map((name) => name.split(/\d/)[0].trim())).toEqual(['Goo', 'Bee', 'White Wolf'])
  // Dragold is special; Phoenix can't be targeted at all.
  await expect(page.getByRole('region', { name: 'Special monsters' }).getByText('Dragold')).toBeVisible()
  await expect(page.getByText('Phoenix')).toHaveCount(0)

  await regular.getByRole('button', { name: 'Up to here' }).nth(1).click()
  await expect.poll(() => sent.at(-1)).toEqual({ settings: { monsters: ['goo', 'bee'] } })
  await regular.getByRole('button', { name: 'Skip White Wolf' }).click()
  await expect.poll(() => sent.at(-1)).toEqual({ blacklist: { action: 'add', monsterId: 'wolf' } })
  await page.keyboard.press('Escape')

  await section.getByRole('button', { name: 'Start' }).click()
  await expect.poll(() => sent.at(-1)).toEqual({ settings: { enabled: true } })
  await section.getByRole('button', { name: 'Unskip' }).first().click()
  await expect.poll(() => sent.at(-1)).toEqual({ blacklist: { action: 'remove', monsterId: 'bee' } })
})

test('Achievement Hunt is absent on a console without it, and only on the leader', async ({ page }) => {
  const stock = setup(null)
  await stock.install(page)
  await page.goto('/characters/Leada')
  await expect(page.getByRole('region', { name: 'Formation' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Achievement Hunt' })).toHaveCount(0)
})

test('Achievement Hunt shows only on the party leader', async ({ page }) => {
  const server = setup({ enabled: true, monsters: ['goo'], blacklistDeaths: true, deathThreshold: 3 })
  await server.install(page)
  await page.goto('/characters/Folla')
  await expect(page.getByRole('region', { name: 'Formation' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Achievement Hunt' })).toHaveCount(0)
})
