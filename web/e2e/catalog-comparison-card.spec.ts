// Failure inventory: the Equipment catalog's comparison table keeps its screen, column
// headers and type rows, and its raw stat rows become one game box per column in the
// equipment comparison card's style (comparison-card.spec.ts). Each line has a check below.
//
// 1. A stat disappears. Every stat any column has renders as a line in every column, in
//    the item details order, so a column without the stat reads 0.
// 2. Labels keep the raw keys. Lines use the equipment comparison card's names: "Armor",
//    "Resistance", "Fortitude" for `for`, "STR" for `str`.
// 3. Labels lose their color. Each label uses its stat's palette color, the same as on the
//    equipment comparison (Armor #A3A9B0, Resistance #8B74C9, Fortitude #9A6BC9).
// 4. Deltas lose their direction. B and later columns show "(+x · +y%)" in green #85C76B
//    and "(-x · -y%)" in red #E13758 against A, "new" when A has none of the stat, and
//    nothing when the value matches A; column A shows no delta.
// 5. The columns drift out of line. The same stat sits at the same height in every
//    column, though only some headers carry a level slider or a stat scroll select.
// 6. The box stops being the game's. Each column's box is black with a 5px #808080
//    border and monospace text, and it is a labelled group ("B stats").
// 7. The headers or type rows disappear. Sprite, name, level slider, stat scroll select
//    and Remove stay in each header; the type and damage type rows stay; a slider still
//    moves that column's stats.
// 8. The page overflows on a phone. The table scrolls sideways inside its frame; the page
//    itself never scrolls sideways.
import { test, expect, type Locator, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

const color = (locator: Locator) => locator.evaluate((node) => getComputedStyle(node).color)
const rgb = (hex: string) => {
  const value = Number.parseInt(hex.slice(1), 16)
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`
}
const GAIN = rgb('#85C76B'),
  LOSS = rgb('#E13758')

const warrior = { id: 'warrior', name: 'Warrior' }

// Wolf Coat is A. Plate Armor beats it on armor and adds resistance and a stat scroll
// slot; Coat loses armor; Tunic matches A's armor, adds `for` and has no level slider.
function catalogServer() {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  const chest = (id: string, name: string, definition: Record<string, unknown>, upgradeable = true) =>
    server.addCatalogEntry({ id, name, upgradeable, maxLevel: upgradeable ? 10 : undefined, scaling: upgradeable ? { armor: 2 } : undefined, definition: { type: 'chest', damage_type: 'physical', ...definition }, usage: { classes: [warrior] } })
  chest('wcoat', 'Wolf Coat', { tier: 2, armor: 20, str: 4 })
  chest('plate', 'Plate Armor', { tier: 3, armor: 40, resistance: 5, str: 4, stat: 2 })
  chest('coat', 'Coat', { tier: 1, armor: 10, str: 2 })
  chest('tunic', 'Tunic', { tier: 1, armor: 20, for: 3 }, false)
  return server
}

async function openComparison(page: Page) {
  await page.goto('/catalog')
  await page.getByRole('button', { name: /^Wolf Coat/ }).click()
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await page.getByRole('group', { name: 'Compare for' }).getByRole('button', { name: 'From catalog' }).click()
  const tile = (name: string) => page.locator('.grid > div', { has: page.getByRole('button', { name: new RegExp(`^${name}`) }) })
  for (const name of ['Plate Armor', 'Coat', 'Tunic']) await tile(name).getByRole('button', { name: 'Add to compare' }).click()
  await page.getByRole('group', { name: 'Catalog comparison' }).getByRole('button', { name: 'Compare selected' }).click()
  return page.getByRole('table')
}

const LABELS = ['Stat', 'STR', 'Fortitude', 'Armor', 'Resistance']

test('Catalog comparison card: one game box per column with named, colored, aligned stats and directional deltas', async ({ page }, info) => {
  await catalogServer().install(page)
  await page.setViewportSize({ width: 1400, height: 1000 })
  const table = await openComparison(page)
  const box = (label: string) => table.getByRole('group', { name: `${label} stats`, exact: true })

  // 1 and 2: every stat in every column, named as the comparison card names it.
  for (const label of ['A', 'B', 'C', 'D']) await expect.poll(() => box(label).locator('[data-line] [data-label]').allTextContents()).toEqual(LABELS)
  await expect(table.getByRole('rowheader', { name: /^armor$/i })).toHaveCount(0)
  await expect(box('A').locator('[data-line="armor"]')).toHaveText('Armor: 20')
  await expect(box('A').locator('[data-line="for"]')).toHaveText('Fortitude: 0')

  // 3: palette colors on the labels.
  expect(await color(box('A').locator('[data-line="armor"] [data-label]'))).toBe(rgb('#A3A9B0'))
  expect(await color(box('B').locator('[data-line="resistance"] [data-label]'))).toBe(rgb('#8B74C9'))
  expect(await color(box('D').locator('[data-line="for"] [data-label]'))).toBe(rgb('#9A6BC9'))
  expect(await color(box('C').locator('[data-line="str"] [data-label]'))).toBe(rgb('#F07F2F'))

  // 4: deltas against A in the gain and loss colors; none on A or on a matching value.
  await expect(box('A').locator('[data-change]')).toHaveCount(0)
  await expect(box('B').locator('[data-line="armor"]')).toHaveText('Armor: 40(+20 · +100.0%)')
  expect(await color(box('B').locator('[data-line="armor"] [data-change]'))).toBe(GAIN)
  await expect(box('B').locator('[data-line="resistance"]')).toHaveText('Resistance: 5(+5 · new)')
  await expect(box('B').locator('[data-line="str"] [data-change]')).toHaveCount(0)
  await expect(box('C').locator('[data-line="armor"]')).toHaveText('Armor: 10(-10 · -50.0%)')
  expect(await color(box('C').locator('[data-line="armor"] [data-change]'))).toBe(LOSS)
  await expect(box('D').locator('[data-line="str"]')).toHaveText('STR: 0(-4 · -100.0%)')
  expect(await color(box('D').locator('[data-line="str"] [data-change]'))).toBe(LOSS)
  await expect(box('D').locator('[data-line="armor"] [data-change]')).toHaveCount(0)

  // 5: Tunic has no slider and only Plate Armor has a stat scroll select, yet every stat lines up.
  await expect(table.getByRole('slider')).toHaveCount(3)
  await expect(table.getByRole('combobox')).toHaveCount(1)
  const top = async (locator: Locator) => (await locator.boundingBox())!.y
  for (const key of ['str', 'for', 'armor', 'resistance']) {
    const expected = await top(box('A').locator(`[data-line="${key}"]`))
    for (const label of ['B', 'C', 'D']) expect(Math.abs((await top(box(label).locator(`[data-line="${key}"]`))) - expected)).toBeLessThan(1)
  }

  // 6: the game's box.
  const style = await box('B').evaluate((node) => {
    const computed = getComputedStyle(node)
    return [computed.backgroundColor, computed.borderTopWidth, computed.borderTopColor, computed.fontFamily]
  })
  expect(style.slice(0, 3)).toEqual(['rgb(0, 0, 0)', '5px', 'rgb(128, 128, 128)'])
  expect(style[3]).toMatch(/monospace/)

  // 7: headers and type rows stay, and a slider moves its column.
  await expect(table.getByText('A · Baseline')).toBeVisible()
  await expect(table.getByRole('button', { name: 'Remove B Plate Armor' })).toBeVisible()
  await expect(table.getByRole('row', { name: /^type chest chest chest chest$/i })).toBeVisible()
  await expect(table.getByRole('row', { name: /^damage type physical physical physical physical$/i })).toBeVisible()
  await table.screenshot({ path: info.outputPath('catalog-comparison-wide.png') })
  const slider = table.getByRole('slider', { name: 'B Plate Armor preview level' })
  await slider.focus()
  await page.keyboard.press('ArrowRight')
  await expect(table.getByText('+1', { exact: true })).toBeVisible()
  await expect(box('B').locator('[data-line="armor"]')).toHaveText('Armor: 42(+22 · +110.0%)')
  await table.getByRole('button', { name: 'Remove D Tunic' }).click()
  await expect(box('D')).toHaveCount(0)
  await expect.poll(() => box('C').locator('[data-line] [data-label]').allTextContents()).toEqual(['Stat', 'STR', 'Armor', 'Resistance'])
})

test('Catalog comparison card: on a phone the table scrolls sideways inside its frame, not the page', async ({ page }, info) => {
  await catalogServer().install(page)
  await page.setViewportSize({ width: 390, height: 844 })
  const table = await openComparison(page)
  await expect(table.getByRole('group', { name: 'D stats', exact: true })).toBeAttached()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  const frame = table.locator('xpath=..')
  expect(await frame.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('catalog-comparison-phone.png'), fullPage: true })
})
