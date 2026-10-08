import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function bodies(page: Page, path: string) {
  const sent: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/party-api/${path}`)) sent.push(request.postDataJSON())
  })
  return sent
}
const ladder = (...counts: number[]) => counts.map((count) => [count, 'stat', 'hp', 10])
const at = [{ map: 'main', x: 0, y: 0 }]
const selection = { monsters: ['goo'], blacklistDeaths: true, deathThreshold: 3 }

function setup(withAchievements: boolean) {
  const server = new MockPartyServer()
  server.paired = true
  server.leader = 'Leada'
  server.followers = { Folla: true }
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 70 })
  server.addCharacter({ name: 'Folla', ctype: 'priest', level: 70 })
  server.addCharacter({ name: 'Solo', ctype: 'ranger', level: 60 })
  server.bestiaryCatalog = [
    { id: 'bee', name: 'Bee', xp: 400, hp: 100, threat: 5, definition: { achievements: ladder(10, 100) } },
    { id: 'goo', name: 'Goo', xp: 100, hp: 50, threat: 1, definition: { achievements: ladder(10, 100) } },
    { id: 'wolf', name: 'White Wolf', xp: 48800, hp: 48000, threat: 50, definition: { achievements: ladder(1, 100) } },
    { id: 'dragold', name: 'Dragold', hp: 25600000, threat: 800, definition: { achievements: ladder(1, 10), special: true } },
    { id: 'phoenix', name: 'Phoenix', hp: 36000, threat: 300, definition: { achievements: ladder(1, 10) } },
  ]
  server.monsterChoices = [{ id: 'goo', locations: at }, { id: 'bee', locations: at }, { id: 'wolf', locations: at }]
  if (withAchievements) {
    server.extraState = {
      farmingPolicy: 'achievements',
      achievementHunt: selection,
      achievementBlacklist: { bee: { monsterId: 'bee', at: 1, reason: '3 deaths while farming for achievements' } },
      achievementMessage: 'Farming goo: 4 / 10 kills (step 1)',
    }
    server.farmingProfiles = { Solo: { achievementHunt: { monsters: [], blacklistDeaths: false, deathThreshold: 5 }, achievementBlacklist: {} } }
  }
  return server
}

test('Achievement Hunt lives in Farming settings: weakest-first selector, Up to here, blacklist and threshold', async ({ page }) => {
  const server = setup(true)
  await server.install(page)
  const sent = bodies(page, 'achievement-hunt')
  await page.goto('/characters/Leada/hunt-settings')
  const section = page.getByRole('region', { name: 'Achievement Hunt settings' })
  await expect(section.getByText('3 deaths while farming for achievements', { exact: false })).toBeVisible()

  await section.getByRole('button', { name: 'Monsters (1)' }).click()
  const regular = page.getByRole('region', { name: 'Regular monsters' })
  await expect(regular.getByRole('checkbox')).toHaveCount(3)
  const names = await regular.locator('p.font-medium').allTextContents()
  expect(names).toEqual(['Goo', 'Bee', 'White Wolf'])
  // Dragold is special; Phoenix can't be targeted at all.
  await expect(page.getByRole('region', { name: 'Special monsters' }).getByText('Dragold')).toBeVisible()
  await expect(page.getByText('Phoenix')).toHaveCount(0)
  await regular.getByRole('button', { name: 'Up to here' }).nth(1).click()
  await expect.poll(() => sent.at(-1)).toEqual({ settings: { monsters: ['goo', 'bee'] }, character: 'Leada' })
  await page.keyboard.press('Escape')

  await section.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect.poll(() => sent.at(-1)).toEqual({ blacklist: { action: 'remove', monsterId: 'bee' }, character: 'Leada' })
  const deaths = section.getByRole('textbox', { name: 'Achievement Hunt deaths before blacklisting' })
  await deaths.fill('5')
  await deaths.blur()
  await expect.poll(() => sent.at(-1)).toEqual({ settings: { deathThreshold: 5 }, character: 'Leada' })
})

test('Achievements is a farming mode on every character, with its status under the chips', async ({ page }) => {
  const server = setup(true)
  await server.install(page)
  const modes = bodies(page, 'farming-mode')
  await page.goto('/characters/Leada')
  const farming = page.getByRole('region', { name: 'Farming' })
  await expect(farming.getByRole('region', { name: 'Achievement Hunt status' })).toContainText('Farming goo: 4 / 10 kills (step 1)')
  await page.goto('/characters/Solo')
  await farming.getByRole('button', { name: 'Achievements' }).click()
  await expect.poll(() => modes.at(-1)).toEqual({ mode: 'achievements', character: 'Solo' })
})

test("An independent character edits its own Achievement Hunt; a follower sees the leader's read-only", async ({ page }) => {
  const server = setup(true)
  await server.install(page)
  const sent = bodies(page, 'achievement-hunt')
  await page.goto('/characters/Solo/hunt-settings')
  const section = page.getByRole('region', { name: 'Achievement Hunt settings' })
  await expect(section.getByRole('button', { name: 'Monsters (0)' })).toBeVisible()
  await section.getByRole('checkbox').first().click()
  await expect.poll(() => sent.at(-1)).toEqual({ settings: { blacklistDeaths: true }, character: 'Solo' })

  await page.goto('/characters/Folla/hunt-settings')
  await expect(page.getByText('Farming settings · Leada')).toBeVisible()
  await expect(section.getByRole('button', { name: 'Monsters (1)' })).toBeVisible()
  await expect(section.getByRole('textbox', { name: 'Achievement Hunt deaths before blacklisting' })).toBeDisabled()
})

test('Achievement Hunt is absent on a console without it', async ({ page }) => {
  const server = setup(false)
  await server.install(page)
  await page.goto('/characters/Leada')
  await expect(page.getByRole('region', { name: 'Formation' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Farming' }).getByRole('button', { name: 'Achievements' })).toHaveCount(0)
  await page.goto('/characters/Leada/hunt-settings')
  await expect(page.getByText('Farming settings · Leada')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Achievement Hunt settings' })).toHaveCount(0)
})
