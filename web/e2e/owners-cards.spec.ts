import { test, expect } from '@playwright/test'
import { OwnersSet2Mock } from './fixtures/ownersSet2Mock'

// OWNERS-PORT-MAP.md B16 with A24: the card's activity line, hand control and the stand count,
// as the owners release's connected-character-card.tsx, hand-control.tsx and party-header.tsx
// read them.

test('B16/A24: the activity line is core characterDetails.activity, with its stuck notice and add-on lines', async ({ page }) => {
  const server = new OwnersSet2Mock()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.leader = 'Ranger1'
  server.monsterHunt = { target: 'crabx', currentIndex: 0, missions: [{ target: 'crabx', owners: ['Ranger1'] }] }
  server.activity.Ranger1 = {
    text: 'Walking to Hunt target - Crabxx',
    task: 'hunt',
    phase: 'travel',
    notice: 'Stuck - trying town',
    addons: [{ addon: 'Achievement Hunt', label: 'Goo 120/1000' }],
  }
  await server.install(page)

  await page.goto('/')
  await expect(page.locator('[data-character-activity]')).toHaveText('Walking to Hunt target - CrabxxStuck - trying town')
  await expect(page.locator('[data-character-addon-line]')).toHaveText('Achievement Hunt: Goo 120/1000')

  await page.goto('/characters/Ranger1')
  await expect(page.locator('[data-character-activity-notice]')).toHaveText('Stuck - trying town')
  // farming-mode-control.tsx huntLine: the Hunt status shows the card line while the Hunt task holds it.
  await expect(page.getByRole('region', { name: 'Hunt status' }).getByText('Walking to Hunt target - Crabxx')).toBeVisible()

  // A null line shows no activity at all; the phone builds no label of its own.
  server.activity.Ranger1 = null
  await expect(page.locator('[data-character-activity]')).toHaveCount(0, { timeout: 12_000 })
})

test('B16: Pause on a headless character and Manual on a Steam one send only the changed handControl keys', async ({ page }) => {
  const server = new OwnersSet2Mock()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.addCharacter({ name: 'Mage1', ctype: 'mage', level: 50 })
  server.leader = 'Ranger1'
  server.extraState = {
    activeSlots: [
      { index: 0, kind: 'native', primary: true, character: 'Ranger1', state: 'online' },
      { index: 1, kind: 'headless', character: 'Mage1', state: 'online' },
    ],
  }
  await server.install(page)

  await page.goto('/characters/Mage1')
  const formation = page.getByRole('region', { name: 'Formation' })
  await expect(formation.getByRole('button', { name: 'Manual' })).toHaveCount(0)
  await formation.getByRole('button', { name: 'Pause' }).click()
  await expect.poll(() => server.handControlWrites).toEqual([{ character: 'Mage1', handControl: { on: true } }])
  await expect(formation.getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'true')
  // Pause has no "still runs" switches.
  await expect(formation.locator('[data-hand-switches]')).toHaveCount(0)

  await page.goto('/characters/Ranger1')
  const steam = page.getByRole('region', { name: 'Formation' })
  await expect(steam.locator('[data-hand-switches]')).toHaveCount(0)
  await steam.getByRole('button', { name: 'Manual' }).click()
  await expect(steam.locator('[data-hand-switches]')).toBeVisible()
  // The switches follow the saved value, so each one changes once the poll after its write lands.
  await steam.getByRole('checkbox', { name: 'Combat' }).click()
  await expect(steam.getByRole('checkbox', { name: 'Combat' })).not.toBeChecked()
  await steam.getByRole('combobox').selectOption('carries-on')
  await expect.poll(() => server.handControlWrites.slice(1)).toEqual([
    { character: 'Ranger1', handControl: { on: true } },
    { character: 'Ranger1', handControl: { combat: false } },
    { character: 'Ranger1', handControl: { party: 'carries-on' } },
  ])
  expect(server.handControlByCharacter.Ranger1).toEqual({ on: true, usePotions: true, combat: false, party: 'carries-on' })
})

test("B16: the stand count is core's standSlots", async ({ page }) => {
  const server = new OwnersSet2Mock()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.standSlots = { slots: 20, used: 3, free: 17 }
  await server.install(page)

  await page.goto('/')
  await page.getByRole('button', { name: 'Menu' }).click()
  await expect(page.getByRole('button', { name: 'Inspect stand · 3/20' })).toBeVisible()
})
