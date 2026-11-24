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

test('B16: the top bar counts the characters on Manual and on Pause while any hold stands', async ({ page }) => {
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
  server.handControlByCharacter = { Ranger1: { on: true, usePotions: true, combat: true, party: 'follows-me' } }
  await server.install(page)

  await page.goto('/')
  await expect(page.locator('[data-hand-control]')).toHaveText('1 character on Manual')
  // The config section carries the holds; each load reads them again.
  server.handControlByCharacter.Mage1 = { on: true, usePotions: true, combat: true, party: 'follows-me' }
  await page.goto('/')
  await expect(page.locator('[data-hand-control]')).toHaveText('1 character on Manual, 1 character on Pause')
  server.handControlByCharacter = {}
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Party' })).toBeVisible()
  await expect(page.locator('[data-hand-control]')).toHaveCount(0)
})

// OWNERS-PORT-MAP.md B20 and B21: "Pin top bar" (pin-top-bar.tsx) pins the party header and shows
// the card name strip (card-name-strip.tsx), whose location row docks the one live map
// (map-dock-state.ts).
test('B20/B21: Pin top bar pins the party header and shows the name strip, and the live map docks under the strip', async ({ page }) => {
  const server = new OwnersSet2Mock()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.leader = 'Ranger1'
  server.activity.Ranger1 = { text: 'Fighting Crabxx', task: 'farm', phase: 'fight' }
  await server.install(page)
  await page.setViewportSize({ width: 390, height: 760 })

  // Off by default: nothing sticks and no strip mounts.
  await page.goto('/')
  await expect(page.locator('[data-party-header]')).toHaveCSS('position', 'static')
  await page.goto('/characters/Ranger1')
  await expect(page.locator('[data-card-name-strip]')).toHaveCount(0)

  await page.goto('/settings/menu?tab=account&section=display')
  await page.getByRole('region', { name: 'Display' }).getByRole('checkbox', { name: 'Pin top bar' }).check()
  await page.goto('/')
  await expect(page.locator('[data-party-header]')).toHaveCSS('position', 'sticky')

  await page.goto('/characters/Ranger1')
  const strip = page.locator('[data-card-name-strip="Ranger1"]')
  await expect(strip).toBeHidden()
  // The strip shows once the card's own name scrolls under the title bar.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await expect(strip).toBeVisible()
  await expect(strip.locator('[data-card-activity]')).toHaveText('Fighting Crabxx')
  await expect(strip).toContainText('50 Ranger')

  // One map body: in the strip's dock while the strip shows.
  await strip.getByRole('button', { name: 'Expand live map' }).click()
  await expect(strip.locator('[data-card-strip-map]').getByRole('button', { name: 'Open native-size map' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open native-size map' })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Resize Ranger1 docked map' })).toBeVisible()

  // Back at the top the strip hides and the open map moves back into the card.
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(strip).toBeHidden()
  await expect(page.getByRole('button', { name: 'Open native-size map' })).toHaveCount(1)
  await expect(strip.locator('[data-card-strip-map]').getByRole('button', { name: 'Open native-size map' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Collapse live map' }).first()).toBeVisible()
})
