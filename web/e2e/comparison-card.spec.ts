// Failure inventory: the equipment comparison sheet keeps its two panels, headers, stat
// scroll buttons and level sliders, and each panel's grid of stat tiles becomes one box
// in the game's item card style. Ported from the console's docs/comparison-card.md
// (branch bestiary-card); each line has a check below.
//
// 1. A stat disappears. All 26 rows must still render in each panel, in the same order,
//    with the same formatting.
// 2. Labels lose their meaning. Each label must use its stat's color from the shared
//    palette (HP in #FF2E46, INT in #3E6EED, Lifesteal in #C8323E).
// 3. Changes lose their direction. In the proposed panel, an improvement shows
//    "(+x · +y%)" in green #85C76B and a reduction "(-x · -y%)" in red #E13758; the
//    equipped panel shows no change text.
// 4. Set changes lose their outcome. GAINED renders in green and LOST in red, with the
//    same text as before.
// 5. The panels stop being the sheet's regions. The new stat boxes are labelled groups,
//    so the two panels and Set changes stay the sheet's only regions.
// 6. The layout breaks. On a phone the panels stack and nothing scrolls sideways.
// 7. The two stat boxes drift out of line. A notice on one side only (the offhand
//    checkbox on the left, the two-handed note on the right) must not push one box
//    lower: the panels share rows for the header, stat scroll buttons, notice, level
//    slider and stats, so both boxes start at the same height and each stat sits beside
//    its counterpart.
// 8. The level sliders disappear. Upgradeable gear shows a preview slider in each panel,
//    as before.
import { test, expect, type Locator } from '@playwright/test'
import { MockPartyServer, type MockCatalogEntry } from './fixtures/mockPartyServer'

const color = (locator: Locator) => locator.evaluate((node) => getComputedStyle(node).color)
const rgb = (hex: string) => {
  const value = Number.parseInt(hex.slice(1), 16)
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`
}
const ROWS = [
  'HP', 'MP', 'Attack', 'Attack speed', 'Range', 'Run speed', 'Armor', 'Resistance', 'STR', 'INT', 'DEX', 'VIT', 'Fortitude', 'Luck', 'Gold', 'XP', 'Evasion', 'Reflection',
  'Lifesteal', 'Manasteal', 'Armor piercing', 'Resistance piercing', 'Critical hit', 'Damage return', 'MP cost reduction', 'Output',
]

// A two-handed staff replaces a wand and its book, losing the book set and completing the
// staff set (the same equipment as the console's e2e/comparison-card.case.ts).
const set = (id: string, items: string[], int: number) => ({ id, name: id, items: items.map((item) => ({ id: item, name: item, quantity: 1, sprite: null })), bonuses: [{ pieces: 2, stats: { int } }] })
const bookSet = set('Book set', ['book', 'helmet'], 10),
  staffSet = set('Staff set', ['sparkstaff', 'ring'], 20)
const gear = (id: string, type: string, properties: Record<string, number>, hands: number | null, setInfo?: ReturnType<typeof set>): MockCatalogEntry => ({
  id,
  name: id,
  // Upgradeable weapons, so both panels show their level slider. The definition matches
  // the reported properties, so level 0 previews the same stats.
  ...(hands ? { upgradeable: true, maxLevel: 12, scaling: { attack: 4 } } : {}),
  definition: { type, ...(hands ? properties : {}) },
  properties,
  usage: { classes: [{ id: 'mage', name: 'Mage', hands }] },
  ...(setInfo ? { world: { set: setInfo } } : {}),
})

function comparisonServer() {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({
    name: 'Mage1',
    ctype: 'mage',
    level: 80,
    hp: 1000,
    max_hp: 1000,
    mp: 2000,
    max_mp: 2000,
    items: [{ name: 'sparkstaff', level: 0 }],
    slots: { mainhand: { item: { name: 'wand', level: 0 } }, offhand: { item: { name: 'book', level: 0 } }, helmet: { item: { name: 'helmet', level: 0 } }, ring1: { item: { name: 'ring', level: 0 } } },
    diagnostics: { primaryStat: 'int', int: 100, str: 10, dex: 10, vit: 10, attack: 600, armor: 50, resistance: 100, frequency: 1, speed: 30, range: 100 },
  })
  server.addCatalogEntry(gear('wand', 'weapon', { attack: 100, int: 5 }, 1))
  server.addCatalogEntry(gear('book', 'source', { int: 15, armor: 40 }, null, bookSet))
  server.addCatalogEntry(gear('helmet', 'helmet', {}, null, bookSet))
  server.addCatalogEntry(gear('ring', 'ring', {}, null, staffSet))
  server.addCatalogEntry(gear('sparkstaff', 'weapon', { attack: 150, int: 10 }, 2, staffSet))
  return server
}

test('Comparison card: each panel shows one game-style stat box with colored labels and changes', async ({ page }, info) => {
  await comparisonServer().install(page)
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.goto('/characters/Mage1')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Compare with equipped' }).click()
  const sheet = page.locator('[data-slot="sheet-content"]').filter({ hasText: 'Equipment comparison' })
  const equipped = sheet.getByRole('group', { name: 'Equipped stats', exact: true })
  const proposed = sheet.getByRole('group', { name: 'Proposed stats', exact: true })

  // 1: every row, in order, in both boxes.
  for (const box of [equipped, proposed]) await expect.poll(() => box.locator('[data-line] [data-label]').allTextContents()).toEqual(ROWS)
  // 5: the panels and Set changes stay the sheet's only regions.
  await expect(sheet.getByRole('region')).toHaveCount(3)
  await expect(sheet.getByRole('region', { name: 'Currently equipped' })).toBeVisible()
  await expect(sheet.getByRole('region', { name: 'With this item' })).toBeVisible()
  await expect(equipped.locator('[data-line="int"]')).toHaveText('INT: 100')
  await expect(equipped.locator('[data-line="attack"]')).toHaveText('Attack: 600.0')
  // 2: palette colors on the labels.
  expect(await color(equipped.locator('[data-line="max_hp"] [data-label]'))).toBe(rgb('#FF2E46'))
  expect(await color(equipped.locator('[data-line="int"] [data-label]'))).toBe(rgb('#3E6EED'))
  expect(await color(equipped.locator('[data-line="lifesteal"] [data-label]'))).toBe(rgb('#C8323E'))
  // 3: direction colors in the proposed box only.
  await expect(proposed.locator('[data-line="attack"]')).toHaveText('Attack: 900.0(+300.0 · +50.0%)')
  expect(await color(proposed.locator('[data-line="attack"] [data-change]'))).toBe(rgb('#85C76B'))
  await expect(proposed.locator('[data-line="armor"]')).toHaveText('Armor: 10.0(-40.0 · -80.0%)')
  expect(await color(proposed.locator('[data-line="armor"] [data-change]'))).toBe(rgb('#E13758'))
  await expect(equipped.locator('[data-change]')).toHaveCount(0)
  // 4: set outcomes keep their text and gain their colors.
  const sets = sheet.getByRole('region', { name: 'Set changes' })
  await expect(sets).toContainText('Book set: 2/2 → 1/2')
  await expect(sets).toContainText('2 pieces: INT +10 · LOST')
  await expect(sets).toContainText('2 pieces: INT +20 · GAINED')
  expect(await color(sets.getByText('LOST', { exact: true }))).toBe(rgb('#E13758'))
  expect(await color(sets.getByText('GAINED', { exact: true }))).toBe(rgb('#85C76B'))
  // 8: both level sliders remain.
  await expect(sheet.getByRole('slider')).toHaveCount(2)
  // 7: the checkbox on one side and the two-handed note on the other don't misalign the boxes.
  await expect(sheet.getByRole('checkbox', { name: 'include offhand weapon in comparison', exact: true })).toBeVisible()
  await expect(sheet.getByText(/Two-handed weapon/)).toBeVisible()
  const top = async (box: Locator) => (await box.boundingBox())!.y
  expect(Math.abs((await top(equipped)) - (await top(proposed)))).toBeLessThan(1)
  for (const key of ['max_hp', 'attack', 'armor', 'output'])
    expect(Math.abs((await top(equipped.locator(`[data-line="${key}"]`))) - (await top(proposed.locator(`[data-line="${key}"]`))))).toBeLessThan(1)
  await sheet.screenshot({ path: info.outputPath('comparison-card-wide.png') })

  // 6: stacked on a phone, without sideways scrolling.
  await page.setViewportSize({ width: 390, height: 844 })
  const left = sheet.getByRole('region', { name: 'Currently equipped' }),
    right = sheet.getByRole('region', { name: 'With this item' })
  await expect
    .poll(async () => {
      const leftBox = (await left.boundingBox())!,
        rightBox = (await right.boundingBox())!
      return rightBox.y >= leftBox.y + leftBox.height - 1
    })
    .toBe(true)
  expect(await sheet.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  await sheet.screenshot({ path: info.outputPath('comparison-card-phone.png') })
})
