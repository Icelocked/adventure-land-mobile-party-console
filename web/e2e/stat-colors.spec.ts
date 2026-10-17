// Failure inventory: every game-style card colors a stat from one palette,
// lib/statColors.ts, so a stat reads the same color in every screen. Ported from the
// console's docs/stat-colors.md (branch bestiary-card); each line has a check below.
//
// 1. A stat changes color between screens. Attack, MP, Armor, Resistance, Lifesteal and
//    Range must read the same color on the item card, the monster card, the character
//    card or its extras, the equipment comparison and the skill card wherever each
//    appears.
// 2. The character card stays gray. Its ATTSPD, RANGE, RUNSPD, ARMOR and RESIST. labels
//    take the attack speed, range, speed, armor and resistance colors.
// 3. Two stats share a color. A skill's Cooldown differs from Evasion.
// 4. A dark game color stays unreadable. Armor, Resistance, Fortitude, Lifesteal and
//    Manasteal use their brighter shades.
import { test, expect, type Locator } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

const color = (locator: Locator) => locator.first().evaluate((node) => getComputedStyle(node).color)
const rgb = (hex: string) => {
  const value = Number.parseInt(hex.slice(1), 16)
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`
}
const PALETTE = {
  attack: '#DB2900', mp: '#3A62CE', armor: '#A3A9B0', resistance: '#8B74C9', lifesteal: '#C8323E', range: '#93A6A2', frequency: '#3BE681', speed: '#36B89E',
  fortitude: '#9A6BC9', manasteal: '#5C66D9', evasion: '#7AC0F5', cooldown: '#4EB7DE',
}
const label = (box: Locator, key: string) => color(box.locator(`[data-line="${key}"] [data-label]`))

test('Stat colors: each stat reads the same color in every game-style card', async ({ page }) => {
  const stats = { attack: 30, mp: 50, armor: 20, resistance: 10, lifesteal: 2, range: 5, evasion: 3, frequency: 1, speed: 4 }
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({
    name: 'Mage1',
    ctype: 'mage',
    level: 50,
    items: [{ name: 'testgear', level: 0 }, { name: 'newchest', level: 0 }],
    slots: { chest: { item: { name: 'oldchest', level: 0 } } },
    diagnostics: { primaryStat: 'int', attack: 30, frequency: 1, range: 5, speed: 4, armor: 20, resistance: 10, str: 1, int: 1, dex: 1, vit: 1, fortitude: 1, luck: 100, combatStats: { lifesteal: 2, manasteal: 1 } },
  })
  server.addCatalogEntry({ id: 'testgear', name: 'Test Gear', definition: { type: 'chest', ...stats }, properties: stats })
  server.addCatalogEntry({ id: 'oldchest', name: 'Old Chest', definition: { type: 'chest' }, properties: { armor: 5 } })
  server.addCatalogEntry({ id: 'newchest', name: 'New Chest', definition: { type: 'chest' }, properties: { armor: 8 } })
  server.bestiaryCatalog = [
    { id: 'testmob', name: 'Test Mob', hp: 100, attack: 30, xp: 1, range: 5, threat: 0, drops: [], spawnRecords: [], definition: { name: 'Test Mob', hp: 100, xp: 1, attack: 30, armor: 20, resistance: 10, range: 5, speed: 4, frequency: 1, mp: 50 } },
  ]
  server.skillCatalog = [{ id: 'x', name: 'X', skills: [{ id: 'zap', name: 'Zap', definition: { name: 'Zap', explanation: 'Zap.', mp: 100, cooldown: 2000, range: 300 } }] }]
  await server.install(page)

  // 1, 4: the item card.
  await page.goto('/characters/Mage1')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Item details' }).click()
  const itemCard = page.getByRole('region', { name: 'Item card', exact: true })
  await expect(itemCard).toBeVisible()
  for (const key of ['attack', 'mp', 'armor', 'resistance', 'lifesteal', 'range', 'evasion', 'frequency', 'speed'] as const) expect(await label(itemCard, key), `item ${key}`).toBe(rgb(PALETTE[key]))

  // 1, 4: the equipment comparison.
  await page.goto('/characters/Mage1')
  await page.getByTestId('inventory-slot-1').click()
  await page.getByRole('button', { name: 'Compare with equipped' }).click()
  const equipped = page.getByRole('group', { name: 'Equipped stats', exact: true })
  await expect(equipped).toBeVisible()
  for (const [key, stat] of [
    ['attack', 'attack'],
    ['max_mp', 'mp'],
    ['armor', 'armor'],
    ['resistance', 'resistance'],
    ['lifesteal', 'lifesteal'],
    ['range', 'range'],
    ['frequency', 'frequency'],
    ['speed', 'speed'],
    ['fortitude', 'fortitude'],
    ['manasteal', 'manasteal'],
  ] as const)
    expect(await label(equipped, key), `comparison ${key}`).toBe(rgb(PALETTE[stat]))

  // 1, 2, 4: the character card and its extras.
  await page.goto('/characters/Mage1')
  await page.getByRole('button', { name: 'View Mage1 stats' }).click()
  const characterCard = page.getByRole('region', { name: 'Character card', exact: true })
  const characterExtras = page.getByRole('region', { name: 'Character extras', exact: true })
  await expect(characterCard).toBeVisible()
  for (const [key, stat] of [
    ['attack', 'attack'],
    ['mp', 'mp'],
    ['frequency', 'frequency'],
    ['range', 'range'],
    ['speed', 'speed'],
    ['armor', 'armor'],
    ['resistance', 'resistance'],
  ] as const)
    expect(await label(characterCard, key), `character ${key}`).toBe(rgb(PALETTE[stat]))
  for (const [key, stat] of [
    ['lifesteal', 'lifesteal'],
    ['manasteal', 'manasteal'],
    ['for', 'fortitude'],
    ['armor', 'armor'],
    ['resistance', 'resistance'],
  ] as const)
    expect(await label(characterExtras, key), `character extras ${key}`).toBe(rgb(PALETTE[stat]))

  // 1: the monster card.
  await page.goto('/bestiary')
  await page.getByRole('button', { name: /^Test Mob/ }).click()
  const monsterCard = page.getByRole('region', { name: 'Monster card', exact: true })
  await expect(monsterCard).toBeVisible()
  for (const key of ['attack', 'mp', 'armor', 'resistance', 'range', 'frequency', 'speed'] as const) expect(await label(monsterCard, key), `monster ${key}`).toBe(rgb(PALETTE[key]))

  // 1, 3: the skill card; Cooldown no longer shares Evasion's color.
  await page.goto('/skills')
  await page.getByRole('button', { name: /^Zap/ }).click()
  const skillCard = page.getByRole('region', { name: 'Skill card', exact: true })
  await expect(skillCard).toBeVisible()
  expect(await label(skillCard, 'mp')).toBe(rgb(PALETTE.mp))
  expect(await label(skillCard, 'range')).toBe(rgb(PALETTE.range))
  expect(await label(skillCard, 'cooldown')).toBe(rgb(PALETTE.cooldown))
  expect(PALETTE.cooldown).not.toBe(PALETTE.evasion)
})
