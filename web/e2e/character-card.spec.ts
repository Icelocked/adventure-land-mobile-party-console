// Failure inventory: the character stats sheet shows the game's character panel beside
// an extras box with collapsible attribute breakdowns. Ported from the console's
// docs/character-card.md (branch bestiary-card); each line has a check below.
//
// 1. The card drifts from the game's panel (render_character in the game's js/html.js).
//    Its lines must be the game's labels, colors and order (NAME, LEVEL, HP, MP, HEAL,
//    ATT, ATTSPD, RANGE, RUNSPD, ARMOR, RESIST., CODE), with ATTSPD as frequency × 100 and
//    RUNSPD as the live speed, both rounded (a merchant with an open stand reads 10, as in
//    game).
// 2. HEAL shows for every class, or never. It appears only when the character's heal is
//    above zero.
// 3. Conditions lose their tags. A cursed character shows "ATT: 33 [C]", a poisoned one
//    "ATTSPD: 73 [P]".
// 4. An entry from the old stats grid disappears. Every value and every effect must
//    appear in the extras box: the attribute effects with their per-point rates, the
//    armor and resistance reductions with the 100-damage example, and the unrestricted
//    run speed.
// 5. Effects lose their meaning. Each effect line must name and color the stat it
//    changes ("+483 Max HP" in the HP color, "+23 Armor" in the armor color).
// 6. A collapse is forgotten. Each breakdown starts open. Collapsing Strength must hide
//    its effects, stay collapsed when another character's sheet opens, and survive a
//    reload; expanding it must stay expanded the same way (localStorage, one key per
//    attribute).
// 7. The layout breaks. On a wide sheet the boxes sit side by side with aligned tops; on
//    a phone the extras box sits below the card, and nothing scrolls sideways.
// 8. Missing data turns into zeros. A run speed the console hasn't received still reads
//    "Waiting for speed data".
// 9. The rest of the sheet changes. The name and the "Level N class primary" line stay
//    above the boxes.
import { test, expect, type Locator, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

const color = (locator: Locator) => locator.evaluate((node) => getComputedStyle(node).color)
const rgb = (hex: string) => {
  const value = Number.parseInt(hex.slice(1), 16)
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`
}
const label = (box: Locator, key: string) => color(box.locator(`[data-line="${key}"] [data-label]`).first())
const lines = (box: Locator) => box.locator('[data-line]').evaluateAll((nodes) => nodes.map((node) => node.textContent))

// A merchant with an open stand: the live speed is the stand-limited 10.
const merchantStats = {
  primaryStat: 'int', attack: 33.4, frequency: 0.73, range: 82, speed: 10, unrestrictedSpeed: 82.1, standOpen: true, armor: 277, resistance: 500,
  str: 23, int: 110, dex: 99, vit: 50, fortitude: 15, luck: 100,
  combatStats: { crit: 1.5, critDamage: 20, lifesteal: 2, evasion: 3, armorPiercing: 10, fireResistance: 4 },
}

function characterServer(merchant: Record<string, unknown> = merchantStats) {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({
    name: 'Merchantina',
    ctype: 'merchant',
    level: 61,
    hp: 4760,
    max_hp: 4760,
    mp: 2120,
    max_mp: 2700,
    slots: { mainhand: { item: { name: 'dartgun', level: 0 }, meta: { definition: {}, properties: { attack: 48 } } } },
    diagnostics: merchant,
  })
  server.addCharacter({
    name: 'Healer1',
    ctype: 'priest',
    level: 61,
    hp: 4760,
    max_hp: 4760,
    mp: 2120,
    max_mp: 2700,
    conditions: [
      { id: 'cursed', name: 'Cursed' },
      { id: 'poisoned', name: 'Poisoned' },
    ],
    diagnostics: { ...merchantStats, speed: 55, unrestrictedSpeed: undefined, standOpen: false, combatStats: { heal: 320 } },
  })
  return server
}

async function openStats(page: Page, name: string) {
  await page.goto(`/characters/${name}`)
  await page.getByRole('button', { name: `View ${name} stats` }).click()
  const sheet = page.getByRole('dialog', { name: `${name} stats` })
  return { sheet, card: sheet.getByRole('region', { name: 'Character card', exact: true }), extras: sheet.getByRole('region', { name: 'Character extras', exact: true }) }
}

test("Character card: the game's panel and every extra, each effect named and colored by its stat", async ({ page }, info) => {
  await characterServer().install(page)
  await page.setViewportSize({ width: 1400, height: 1000 })
  const { sheet, card, extras } = await openStats(page, 'Merchantina')

  // 1: the game's panel, line for line, with RUNSPD as the live stand-limited speed.
  await expect
    .poll(() => lines(card))
    .toEqual(['NAME: Merchantina', 'LEVEL: 61', 'HP: 4760/4760', 'MP: 2120/2700', 'ATT: 33', 'ATTSPD: 73', 'RANGE: 82', 'RUNSPD: 10', 'ARMOR: 277', 'RESIST.: 500', 'CODE: Active'])
  expect(await label(card, 'level')).toBe('rgb(255, 165, 0)')
  expect(await label(card, 'hp')).toBe(rgb('#FF2E46'))
  expect(await label(card, 'mp')).toBe(rgb('#3A62CE'))
  expect(await label(card, 'attack')).toBe(rgb('#DB2900'))
  expect(await label(card, 'code')).toBe('rgb(255, 215, 0)')
  // 2: a merchant without heal shows no HEAL line.
  await expect(card.locator('[data-line="heal"]')).toHaveCount(0)
  // 9: the header stays.
  await expect(sheet.getByText('Level 61 merchant int', { exact: true })).toBeVisible()

  // 4, 5: every entry and effect of the old grid, each effect named and colored by its stat.
  const strength = extras.locator('[data-line="str"]')
  await expect(strength.getByRole('button', { name: /Strength: 23/ })).toHaveAttribute('aria-expanded', 'true')
  await expect(strength.locator('[data-effect="max_hp"]')).toHaveText('+483 Max HP +21 per point')
  expect(await color(strength.locator('[data-effect="max_hp"] [data-value]'))).toBe(rgb('#FF2E46'))
  await expect(strength.locator('[data-effect="armor"]')).toHaveText('+23 Armor +1 per next point')
  expect(await color(strength.locator('[data-effect="armor"] [data-value]'))).toBe(rgb('#A3A9B0'))
  await expect(strength.locator('[data-effect="run_speed"]')).toHaveText('+0.36 Run Speed +0.0156 per next point')
  const intelligence = extras.locator('[data-line="int"]')
  await expect(intelligence.getByRole('button', { name: /Intelligence: 110 Primary/ })).toBeVisible()
  await expect(intelligence.locator('[data-effect="attack"]')).toHaveText('+264.0 Attack +2.40 per point')
  await expect(intelligence.locator('[data-effect="max_mp"]')).toHaveText('+1,650 Max MP +15 per point')
  await expect(intelligence.locator('[data-effect="resistance"]')).toHaveText('+110 Resistance +1 per next point')
  await expect(intelligence.locator('[data-effect="attack_speed"]')).toHaveText('+0.070 Attacks/sec +0.000635 per point')
  await expect(extras.locator('[data-line="dex"] [data-effect="run_speed"]')).toHaveText('+3.09 Run Speed +0.0313 per next point')
  await expect(extras.locator('[data-line="vit"] [data-effect="max_hp"]')).toHaveText('+3,417 Max HP 68.33 HP per VIT at level 61')
  await expect(extras.locator('[data-line="for"] [data-effect="pvp"]')).toHaveText('7.50% less incoming PvP damage no PvE reduction')
  await expect(extras.locator('[data-line="armor"] [data-effect="reduction"]')).toHaveText('27.32% physical damage reduction a 100-damage physical hit becomes 72.7')
  await expect(extras.locator('[data-line="resistance"] [data-effect="reduction"]')).toHaveText('46.70% magical damage reduction a 100-damage magical hit becomes 53.3')
  await expect(extras.locator('[data-line="run_speed"]')).toHaveText('Run Speed: 82.10 before movement restrictions')
  for (const [key, text] of [
    ['luck', 'Luck: 100%'],
    ['crit', 'Crit: 1.5%'],
    ['critdamage', 'Crit Damage: 220%'],
    ['lifesteal', 'Lifesteal: 2%'],
    ['evasion', 'Evasion: 3%'],
    ['apiercing', 'A.Piercing: 10'],
    ['firesistance', 'Fire Res.: 4'],
    ['miss', 'Miss: 0%'],
    ['manasteal', 'Manasteal: 0%'],
    ['rpiercing', 'R.Piercing: 0'],
    ['pnresistance', 'Poison Res.: 0'],
    ['fzresistance', 'Freeze Res.: 0'],
    ['phresistance', 'Physical Res.: 0'],
    ['stresistance', 'Status Res.: 0'],
    ['blastresistance', 'Blast Res.: 0'],
    ['dreturn', 'D.Return: 0%'],
    ['reflection', 'Reflection: 0%'],
    ['mp_cost', 'MP Cost: 0'],
    ['heal', 'Heal: 0'],
    ['output', 'Output: 0%'],
  ] as const)
    await expect(extras.locator(`[data-line="${key}"]`)).toHaveText(text)
  expect(await label(extras, 'lifesteal')).toBe(rgb('#C8323E'))

  // 7: side by side on a wide sheet.
  const cardBox = (await card.boundingBox())!,
    extrasBox = (await extras.boundingBox())!
  expect(extrasBox.x).toBeGreaterThanOrEqual(cardBox.x + cardBox.width - 1)
  expect(Math.abs(extrasBox.y - cardBox.y)).toBeLessThan(2)
  await sheet.screenshot({ path: info.outputPath('character-card-wide.png') })
})

test('Character card: a collapsed breakdown stays collapsed across characters and reloads; HEAL and condition tags', async ({ page }, info) => {
  await characterServer().install(page)
  const merchant = await openStats(page, 'Merchantina')
  const strength = merchant.extras.locator('[data-line="str"]')
  const strengthButton = strength.getByRole('button', { name: /Strength: 23/ })
  // 6: a breakdown starts open.
  await expect(strengthButton).toHaveAttribute('aria-expanded', 'true')
  await strengthButton.click()
  await expect(strengthButton).toHaveAttribute('aria-expanded', 'false')
  await expect(strength.locator('[data-effect]')).toHaveCount(0)
  await expect(merchant.extras.locator('[data-line="int"] [data-effect]')).toHaveCount(4)
  await merchant.sheet.screenshot({ path: info.outputPath('character-card-strength-collapsed.png') })

  // 2, 3: a cursed, poisoned priest shows HEAL and the game's tags; Strength stays collapsed.
  const priest = await openStats(page, 'Healer1')
  await expect.poll(async () => (await lines(priest.card)).slice(3, 7)).toEqual(['MP: 2120/2700', 'HEAL: 320', 'ATT: 33 [C]', 'ATTSPD: 73 [P]'])
  expect(await label(priest.card, 'heal')).toBe(rgb('#CB83AC'))
  const priestStrength = priest.extras.locator('[data-line="str"]')
  await expect(priestStrength.getByRole('button', { name: /Strength: 23/ })).toHaveAttribute('aria-expanded', 'false')
  await expect(priestStrength.locator('[data-effect]')).toHaveCount(0)

  // 6: the choice survives a reload, and expanding is remembered the same way.
  await page.reload()
  const reloaded = await openStats(page, 'Merchantina')
  const reloadedStrength = reloaded.extras.getByRole('button', { name: /Strength: 23/ })
  await expect(reloadedStrength).toHaveAttribute('aria-expanded', 'false')
  await reloadedStrength.click()
  await page.reload()
  const expanded = await openStats(page, 'Merchantina')
  await expect(expanded.extras.getByRole('button', { name: /Strength: 23/ })).toHaveAttribute('aria-expanded', 'true')
})

test('Character card: a missing run speed still says so, and the boxes stack on a phone', async ({ page }, info) => {
  await characterServer({ ...merchantStats, unrestrictedSpeed: undefined }).install(page)
  await page.setViewportSize({ width: 390, height: 844 })
  const { sheet, card, extras } = await openStats(page, 'Merchantina')
  // 8: a merchant with an open stand and no unrestricted speed.
  await expect(extras.locator('[data-line="run_speed"]')).toHaveText('Run Speed: Waiting for speed data')
  // 7: stacked on a phone, without sideways scrolling.
  const cardBox = (await card.boundingBox())!,
    extrasBox = (await extras.boundingBox())!
  expect(extrasBox.y).toBeGreaterThanOrEqual(cardBox.y + cardBox.height - 1)
  expect(await sheet.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  await sheet.screenshot({ path: info.outputPath('character-card-phone.png') })
})
