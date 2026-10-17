// Failure inventory: a monster's details show the game's monster card beside an extras
// box wherever the app shows a monster: the Bestiary's monster sheet and a monster opened
// from an item's drops in item details. Ported from the console's docs/monster-card.md
// (branch bestiary-card); each line has a check below.
//
// 1. The card drifts from the game's monster mode. Goo reads "XP: 100", "Damage: 5",
//    "Type: Physical", "Range: 15", "HP: 100", "MP: 2", "Speed: 6" and "A.Speed: 40", in
//    the game's order and colors.
// 2. Defensive stats lose their game names. Mr. Green's phresistance reads "Impact Res.:
//    100" and apiercing "A.Piercing: 320".
// 3. Flags and spawns vanish. Mr. Green shows "Cooperative" and three "Spawns: Green Jr."
//    lines, and a spawn opens that monster.
// 4. Abilities lose their kind. The Black Scorpion's weakness_aura is a skill and an aura,
//    so it reads "Aura: Weakness Aura"; the Harpy's warp_on_hit isn't a skill, so it moves
//    to the extras box instead of disappearing.
// 5. A field from the old definition grid goes missing. Every definition field must
//    appear on the card, in the extras box or in the sheet's existing sections; only the
//    name, skin and achievements, which those sections show, leave the grid.
// 6. The two places drift apart. The Bestiary sheet and the monster opened from item
//    details render the same card and extras for the same monster.
// 7. The layout breaks. The boxes sit side by side when the sheet has room and stack on a
//    phone, with nothing scrolling sideways.
// 8. The extras read as a wall of gray. Their labels carry meaning colors.
// 9. The level preview drifts from the game's rules (level_monster and
//    calculate_monster_stats in the game's node/server.js). At level 9 Goo reads HP 500,
//    XP 900, Damage 10, Speed 8.16 and A.Speed 70.6; at level 15 the combat stats stop at
//    their level-12 values while HP (800) and XP (1500) keep growing. Level 1 shows the
//    base stats, and the preview names the gold and drop multiplier.
// 10. The rest of the sheet changes. The header with G.monsters.<id>, Navigate, the
//     Monster achievements box, the spawns and the drops stay.
import { test, expect, type Locator, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

const color = (locator: Locator) => locator.evaluate((node) => getComputedStyle(node).color)
const rgb = (hex: string) => {
  const value = Number.parseInt(hex.slice(1), 16)
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`
}
const lines = (box: Locator) => box.locator('[data-line]').evaluateAll((nodes) => nodes.map((node) => node.textContent))

// Monster definitions from the live game data (G.monsters).
const monster = (id: string, definition: Record<string, unknown>) => ({
  id,
  name: String(definition.name),
  hp: Number(definition.hp),
  attack: Number(definition.attack),
  xp: Number(definition.xp),
  range: Number(definition.range),
  threat: 0,
  definition,
  drops: [],
  spawnRecords: [],
})
const goo = monster('goo', { name: 'Goo', speed: 6, charge: 12, hp: 100, xp: 100, attack: 5, damage_type: 'physical', respawn: 1, range: 15, frequency: 0.4, aggro: 0, aa: 1, achievements: [[10, 'stat', 'hp', 5]], skin: 'goo', rage: 0, mp: 2 })
const greenjr = monster('greenjr', { name: 'Green Jr.', speed: 30, hp: 120000, xp: 0, attack: 300, damage_type: 'physical', respawn: -1, range: 50, frequency: 1, aggro: 1, skin: 'greenjr' })
const mrgreen = monster('mrgreen', {
  name: 'Mr. Green', speed: 40, charge: 90, hp: 36000000, xp: 48000000, attack: 1200, damage_type: 'physical', respawn: 5640, phresistance: 100, range: 620,
  frequency: 1.6, aggro: 1, rage: 1, apiercing: 320, resistance: 900, cooperative: true, announce: '#256943',
  spawns: [['hp:0.75', 'greenjr', 5], ['hp:0.50', 'greenjr', 5], ['hp:0.25', 'greenjr', 5]], skin: 'mrgreen',
})
const bscorpion = monster('bscorpion', {
  name: 'Black Scorpion', speed: 24, hp: 1200000, xp: 900000, attack: 2400, damage_type: 'physical', respawn: 3600, range: 40, frequency: 1, aggro: 1, skin: 'bscorpion',
  abilities: { weakness_aura: { aura: true, condition: 'weakness', radius: 100, cooldown: 4000 } },
})
const harpy = monster('harpy', { name: 'Harpy', speed: 30, hp: 32000, xp: 24000, attack: 160, damage_type: 'physical', respawn: 60, range: 30, frequency: 1, aggro: 0.5, skin: 'harpy', abilities: { warp_on_hit: { unlimited: true, attr0: 0.08 } } })

function monsterServer() {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Mage1', ctype: 'mage', level: 80, items: [{ name: 'candypop', q: 1 }] })
  server.leader = 'Mage1'
  server.bestiaryCatalog = [goo, greenjr, mrgreen, bscorpion, harpy]
  server.skillCatalog = [{ id: 'shared', name: 'Shared', skills: [{ id: 'weakness_aura', name: 'Weakness Aura', definition: { name: 'Weakness Aura', explanation: 'Weakens nearby enemies.', type: 'skill' } }] }]
  server.addCatalogEntry({ id: 'candypop', name: 'Candy Pop', definition: { type: 'gem' }, world: { drops: [{ monsterId: 'mrgreen', monsterName: 'Mr. Green', rate: 0.01, quantity: 1 }] } })
  return server
}

async function openMonster(page: Page, name: RegExp) {
  await page.getByRole('button', { name }).first().click()
  const card = page.getByRole('region', { name: 'Monster card', exact: true })
  const sheet = page.locator('[data-slot="sheet-content"]').filter({ has: page.getByText(/^G\.monsters\./) })
  return { sheet, card, extras: page.getByRole('region', { name: 'Monster extras', exact: true }) }
}

test("Monster card: Goo in the game's monster mode, its extras and the level preview", async ({ page }, info) => {
  await monsterServer().install(page)
  await page.goto('/bestiary')
  const { sheet, card, extras } = await openMonster(page, /^Goo/)

  // 1: the game's monster mode, with the game's colors.
  await expect.poll(() => lines(card)).toEqual(['XP: 100', 'Damage: 5', 'Type: Physical', 'Range: 15', 'HP: 100', 'MP: 2', 'Speed: 6', 'A.Speed: 40'])
  expect(await color(card.locator('[data-line="attack"] [data-label]'))).toBe(rgb('#DB2900'))
  expect(await color(card.locator('[data-line="hp"] [data-label]'))).toBe(rgb('#FF2E46'))
  // 5: the rest of the definition, readable, without the name, skin and achievements.
  expect(await lines(extras)).toEqual(['Aa: 1', 'Aggro: 0', 'Charge: 12', 'Rage: 0', 'Respawn: 1'])
  // 8: meaning colors on the extras labels.
  for (const [key, hex] of [
    ['aggro', '#E13758'],
    ['respawn', '#7AC0F5'],
    ['charge', '#36B89E'],
    ['rage', '#F36C6E'],
  ] as const)
    expect(await color(extras.locator(`[data-line="${key}"] [data-label]`))).toBe(rgb(hex))
  // 10: the header, Navigate and achievements stay.
  await expect(sheet.getByText('G.monsters.goo')).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Navigate to Goo' })).toBeVisible()
  await expect(sheet.getByRole('region', { name: 'Monster achievements' })).toBeVisible()
  await expect(sheet.getByText('Monster-specific drops (0)')).toBeVisible()
  await sheet.screenshot({ path: info.outputPath('monster-card-goo.png') })

  // 9: the level preview follows level_monster and calculate_monster_stats.
  const level = sheet.getByRole('slider', { name: 'Monster level preview' })
  await expect(sheet.getByText('Level 1', { exact: true })).toBeVisible()
  await level.focus()
  for (let step = 1; step < 9; step++) await page.keyboard.press('ArrowRight')
  await expect(sheet.getByText('Level 9', { exact: true })).toBeVisible()
  expect(await lines(card)).toEqual(['XP: 900', 'Damage: 10', 'Type: Physical', 'Range: 15', 'HP: 500', 'MP: 2', 'Speed: 8.16', 'A.Speed: 70.6'])
  await expect(sheet).toContainText('Gold and drop chance ×9')
  for (let step = 9; step < 15; step++) await page.keyboard.press('ArrowRight')
  await expect(sheet.getByText('Level 15', { exact: true })).toBeVisible()
  expect(await lines(card)).toEqual(['XP: 1500', 'Damage: 12', 'Type: Physical', 'Range: 15', 'HP: 800', 'MP: 2', 'Speed: 8.88', 'A.Speed: 80.8'])
  await sheet.screenshot({ path: info.outputPath('monster-card-goo-level-15.png') })
})

test("Monster card: Mr. Green's game names, flags and spawns; a spawn opens that monster", async ({ page }, info) => {
  await monsterServer().install(page)
  await page.goto('/bestiary')
  const { sheet, card, extras } = await openMonster(page, /^Mr\. Green/)
  // 2, 3: game names, the Cooperative flag and the spawns.
  await expect
    .poll(() => lines(card))
    .toEqual([
      'XP: 48000000', 'Damage: 1200', 'Type: Physical', 'Range: 620', 'HP: 36000000', 'A.Piercing: 320', 'Resistance: 900', 'Impact Res.: 100', 'Speed: 40',
      'A.Speed: 160', 'Cooperative', 'Spawns: Green Jr.', 'Spawns: Green Jr.', 'Spawns: Green Jr.',
    ])
  expect(await color(card.locator('[data-line="spawn_0"] [data-label]'))).toBe(rgb('#237B2A'))
  expect(await lines(extras)).toContain('Respawn: 5640')
  await sheet.screenshot({ path: info.outputPath('monster-card-mrgreen.png') })
  await card.getByRole('button', { name: 'Green Jr.' }).first().click()
  await expect(page.getByText('G.monsters.greenjr')).toBeVisible()
})

test('Monster card: a skill aura reads as an Aura line; an ability that is not a skill moves to the extras', async ({ page }) => {
  await monsterServer().install(page)
  await page.goto('/bestiary')
  const scorpion = await openMonster(page, /^Black Scorpion/)
  await expect.poll(() => lines(scorpion.card)).toContain('Aura: Weakness Aura')
  expect(await color(scorpion.card.locator('[data-line="ability_weakness_aura"] [data-label]'))).toBe(rgb('#FC5F39'))
  await page.keyboard.press('Escape')
  const harpy = await openMonster(page, /^Harpy/)
  await expect.poll(() => lines(harpy.extras)).toContain('Abilities: warp_on_hit')
  expect(await lines(harpy.card)).not.toContainEqual(expect.stringContaining('warp'))
})

test('Monster card: side by side in a wide sheet and stacked on a phone without sideways scrolling', async ({ page }, info) => {
  await monsterServer().install(page)
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.goto('/bestiary')
  const { sheet, card, extras } = await openMonster(page, /^Harpy/)
  await expect
    .poll(async () => {
      const cardBox = (await card.boundingBox())!,
        extrasBox = (await extras.boundingBox())!
      return extrasBox.x >= cardBox.x + cardBox.width - 1
    })
    .toBe(true)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(async () => {
      const cardBox = (await card.boundingBox())!,
        extrasBox = (await extras.boundingBox())!
      return extrasBox.y >= cardBox.y + cardBox.height - 1
    })
    .toBe(true)
  expect(await sheet.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  await sheet.screenshot({ path: info.outputPath('monster-card-phone.png') })
})

test("Monster card: Mr. Green from an item's drops shows the same card, and a spawn drills in", async ({ page }, info) => {
  await monsterServer().install(page)
  await page.goto('/bestiary')
  const fromBestiary = await openMonster(page, /^Mr\. Green/)
  await expect(fromBestiary.card).toBeVisible()
  const expected = { card: await lines(fromBestiary.card), extras: await lines(fromBestiary.extras) }

  await page.goto('/characters/Mage1')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Item details' }).click()
  await page.getByRole('button', { name: 'Drops', exact: true }).click()
  await page.getByRole('button', { name: /^Mr\. Green/ }).click()
  // 6: the same card and extras inside the item sheet.
  const card = page.getByRole('region', { name: 'Monster card', exact: true })
  await expect.poll(() => lines(card)).toEqual(expected.card)
  expect(await lines(page.getByRole('region', { name: 'Monster extras', exact: true }))).toEqual(expected.extras)
  await card.getByRole('button', { name: 'Green Jr.' }).first().click()
  await expect(page.getByText('G.monsters.greenjr')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible()
  await page.locator('[data-slot="sheet-content"]').filter({ has: page.getByText('G.monsters.greenjr') }).screenshot({ path: info.outputPath('monster-card-from-item.png') })
})
