// Failure inventory: the item details sheet's "Item stats" table becomes the game's item
// card beside an extras box. Ported from the console's docs/item-card.md (branch
// bestiary-card); each line has a check below.
//
// 1. Stats render in one color under raw keys. Each game stat must use the game's label
//    and color, in the game's order (for example "Damage" in #DB2900, "Crit Damage" after
//    "Crit").
// 2. A stat the game shows as a card line lands in the extras box. Lifesteal, the
//    resistances, Explosion and the other render_item stats must render on the card
//    (Vampiric Gloves' Freeze Res., the Lolipop Mace's Explosion), never as raw keys.
// 3. A built-in ability prints its raw id and attr0. Sugar Rush, Burn and the other
//    abilities with a game description must show their name, color and effect text with
//    the chance filled in.
// 4. An item that grants a skill pastes the skill's text or shows its id. The Zapper's
//    zapperzap must show one "Ability: Zap" link with the skill's explanation on hover,
//    and tapping it must open that skill's details in the item sheet, with Back
//    returning to the item.
// 5. Nested definition fields vanish. Class-only and map-only bonuses (meta.bonuses: the
//    Zapper for warriors, the Mothstep Boots' Cave of Darkness bonus) must show as
//    "Bonus: ... [Only]" lines with their stats.
// 6. Grade disappears or ignores the preview. Grade must come from the item's grades
//    (default 9, 10, 11, 12) at the preview level, and boosters show none.
// 7. A field from the old table goes missing. Every table entry must appear on the card
//    or in the extras box.
// 8. The rest of the sheet changes. The header, context line, explanation, NPC prices,
//    eligible classes, level stat preview and the section chips must render as before,
//    and Item details stays one entry in the item options list.
// 9. The layout breaks. On a wide sheet the boxes sit side by side with aligned tops; on
//    a phone the extras box sits below the card, and nothing scrolls sideways.
// 10. The card ignores the preview. Moving the level slider must update the card's stats
//     and grade, and stats the level calculation doesn't cover keep their live value.
// 11. Item state disappears or lands in the wrong box. Sealed, locked, account bound and
//     expiry show on the card. Quantity and stat scroll show in the extras box, since the
//     game shows them on the inventory slot. "Locked" uses #8C8C8C: the game's #404141 is
//     close to invisible on black.
// 12. Booleans print "true" and "false". They read Yes and No.
// 13. A scrolled stat shows twice. Once a copy has a stat scroll (stat_type), the game
//     folds its "stat" into that stat and shows no Stat line (calculate_item_properties
//     sets prop.stat=0). Winged Boots +7 read "Intelligence: 9" on an
//     intelligence-scrolled copy and "Dexterity: 9" on a dexterity-scrolled one, with no
//     "Stat: 1" from the base definition.
// 14. Non-equipment loses the game's lines or invents equipment ones. Potions show
//     "HP: +400", elixirs their effect and hours, boosters their gain with no grade, and
//     the "[i]" line says what the game says: Exchangeable, Upgradeable, Compoundable,
//     Collectable (a collector-quest ingredient, world.usedIn[].quest "mcollector"),
//     Usable (any other crafting ingredient) or Information.
import { test, expect, type Locator, type Page } from '@playwright/test'
import { MockPartyServer, type MockCatalogEntry, type MockItem } from './fixtures/mockPartyServer'

const color = (locator: Locator) => locator.evaluate((node) => getComputedStyle(node).color)
const rgb = (hex: string) => {
  const value = Number.parseInt(hex.slice(1), 16)
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`
}
const line = (box: Locator, key: string) => box.locator(`[data-line="${key}"]`)
const label = (box: Locator, key: string) => color(box.locator(`[data-line="${key}"] [data-label]`))
const lines = (box: Locator) => box.locator('[data-line]').evaluateAll((nodes) => nodes.map((node) => node.textContent))

function serverWith(items: MockItem[], entries: MockCatalogEntry[], ctype = 'mage') {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Mage1', ctype, level: 80, items })
  for (const entry of entries) server.addCatalogEntry(entry)
  return server
}

async function openDetails(page: Page, slot = 0) {
  await page.goto('/characters/Mage1')
  await page.getByTestId(`inventory-slot-${slot}`).click()
  await page.getByRole('button', { name: 'Item details' }).click()
  const card = page.getByRole('region', { name: 'Item card', exact: true })
  // The item options sheet stays open underneath; only the details sheet has Add to WTB.
  const sheet = page.locator('[data-slot="sheet-content"]').filter({ has: page.getByRole('button', { name: 'Add to WTB' }) })
  return { sheet, card, extras: page.getByRole('region', { name: 'Item extras', exact: true }) }
}

const mothsteps: MockCatalogEntry = {
  id: 'cave_mothsteps',
  name: 'Mothstep Boots',
  upgradeable: true,
  maxLevel: 13,
  definition: {
    type: 'shoes', tier: 2, scroll: true, stat: 2, armor: 8, resistance: 13, evasion: 4, speed: 8, exclusive: true, extra_stat: 1,
    explanation: 'Cave of Darkness: +35% Evasion and +20 Speed.', g: 90000, upgrade: { armor: 1, stat: 1 },
  },
  properties: { stat: 2, armor: 8, resistance: 13, evasion: 4, speed: 8 },
  scaling: { armor: 1, stat: 1 },
  bonuses: [{ kind: 'map', id: 'cave', name: 'Cave of Darkness', stats: { evasion: 35, speed: 20 } }],
  usage: { classes: [{ id: 'warrior', name: 'Warrior', hands: null }, { id: 'mage', name: 'Mage', hands: null }] },
  world: { recipe: { cost: 12000, quest: null, materials: [{ id: 'shoes', name: 'Shoes', quantity: 1, level: 0, sprite: null, drops: [] }] } },
}

test('Item card: game lines, a map bonus and the extras box beside it, then stacked on a phone', async ({ page }, info) => {
  await serverWith([{ name: 'cave_mothsteps', level: 0 }], [mothsteps]).install(page)
  const { sheet, card, extras } = await openDetails(page)

  // 1, 5: game lines and the map bonus with its stats.
  await expect(line(card, 'evasion')).toHaveText('Evasion: 4%')
  expect(await label(card, 'evasion')).toBe(rgb('#7AC0F5'))
  await expect(line(card, 'armor')).toHaveText('Armor: 8')
  await expect(line(card, 'resistance')).toHaveText('Resistance: 13')
  await expect(line(card, 'speed')).toHaveText('Speed: +8')
  await expect(line(card, 'stat')).toHaveText('Stat: 2')
  await expect(line(card, 'bonus_cave')).toHaveText('Bonus: Cave of Darkness [Only] Evasion +35% · Speed +20')
  // 7, 12: table fields without a card line, readable and color coded.
  await expect(line(extras, 'equip_slot')).toHaveText('Equip Slot: Shoes')
  await expect(line(extras, 'stackable')).toHaveText('Stackable: No')
  await expect(line(extras, 'tier')).toHaveText('Tier: 2')
  await expect(line(extras, 'scroll')).toHaveText('Scroll: Yes')
  await expect(line(extras, 'exclusive')).toHaveText('Exclusive: Yes')
  await expect(line(extras, 'extra_stat')).toHaveText('Extra Stat: 1')
  expect(await label(extras, 'tier')).toBe(rgb('#56A244'))
  for (const key of ['armor', 'resistance', 'evasion', 'speed', 'stat']) await expect(line(extras, key)).toHaveCount(0)
  // 8: the rest of the sheet renders as before.
  for (const text of ['Mage1 · slot 0', 'Cave of Darkness: +35% Evasion and +20 Speed.', 'Buy from NPC', 'Sell to NPC', 'Eligible classes', 'Level stat preview', 'Item stats'])
    await expect(sheet.getByText(text, { exact: true }).first()).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Craftable', exact: true })).toBeVisible()
  await expect(card).not.toContainText('Cave of Darkness: +35%')
  // 9: side by side on a wide sheet.
  await page.setViewportSize({ width: 1400, height: 1000 })
  await expect
    .poll(async () => {
      const cardBox = (await card.boundingBox())!,
        extrasBox = (await extras.boundingBox())!
      return extrasBox.x >= cardBox.x + cardBox.width - 1 && Math.abs(extrasBox.y - cardBox.y) < 2
    })
    .toBe(true)
  await sheet.screenshot({ path: info.outputPath('item-card-wide.png') })
  // 9: stacked on a phone, without sideways scrolling.
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(async () => {
      const cardBox = (await card.boundingBox())!,
        extrasBox = (await extras.boundingBox())!
      return extrasBox.y >= cardBox.y + cardBox.height - 1
    })
    .toBe(true)
  expect(await sheet.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await sheet.screenshot({ path: info.outputPath('item-card-phone.png') })
})

test('Item card: a stat scroll folds Stat into the scrolled stat and moves to the extras box', async ({ page }) => {
  const gloves: MockCatalogEntry = {
    id: 'vgloves',
    name: 'Vampiric Gloves',
    upgradeable: true,
    maxLevel: 12,
    definition: { type: 'gloves', set: 'vampires', int: 3, str: 3, fzresistance: 4, tier: 3, scroll: true, upgrade: { stat: 1, resistance: 5.5, armor: 5.5 }, g: 340000, grades: [0, 0, 9, 10], stat: 3, extra_stat: 2, armor: 28, resistance: 14 },
    properties: { str: 14, int: 3, armor: 68, resistance: 54, fzresistance: 4 },
    scaling: { stat: 1, resistance: 5.5, armor: 5.5 },
    usage: { classes: [{ id: 'warrior', name: 'Warrior', hands: null }] },
  }
  await serverWith([{ name: 'vgloves', level: 8, stat_type: 'str' }], [gloves]).install(page)
  const { card, extras } = await openDetails(page)
  // 13: the strength scroll folds the base Stat 3 into Strength 14.
  await expect(line(card, 'str')).toHaveText('Strength: 14')
  await expect(line(card, 'stat')).toHaveCount(0)
  // 2: every game stat stays on the card.
  for (const [key, text] of [
    ['int', 'Intelligence: 3'],
    ['armor', 'Armor: 68'],
    ['resistance', 'Resistance: 54'],
    ['fzresistance', 'Freeze Res.: 4'],
  ] as const)
    await expect(line(card, key)).toHaveText(text)
  expect(await label(card, 'str')).toBe(rgb('#F07F2F'))
  // 11: the stat scroll is a slot property, so it reads in the extras box.
  await expect(line(card, 'stat_type')).toHaveCount(0)
  await expect(line(extras, 'stat_type')).toHaveText('Stat Scroll: Strength')
  await expect(line(extras, 'extra_stat')).toHaveText('Extra Stat: 2')
  await expect(line(extras, 'equip_slot')).toHaveText('Equip Slot: Gloves')
})

for (const [statType, statLine] of [
  ['int', 'Intelligence: 9'],
  ['dex', 'Dexterity: 9'],
] as const) {
  test(`Item card: Winged Boots +7 with a ${statType} scroll read like the game's card`, async ({ page }) => {
    const winged: MockCatalogEntry = {
      id: 'wingedboots',
      name: 'Winged Boots',
      upgradeable: true,
      maxLevel: 13,
      definition: {
        set: 'swift', tier: 1.5, type: 'shoes', frequency: 3, speed: 8, resistance: 20, scroll: true,
        upgrade: { frequency: 0.625, speed: 1, stat: 1, resistance: 1.5, armor: 1.5 }, g: 150000, credit: 'Pluet', grades: [4, 8, 10, 12], stat: 1, armor: 6,
      },
      properties: { [statType]: 9, armor: 17, resistance: 31, speed: 15, frequency: 8 },
      scaling: { frequency: 0.625, speed: 1, stat: 1, resistance: 1.5, armor: 1.5 },
      world: { set: { id: 'swift', name: 'Swift Judgement', explanation: '', items: [{ id: 'wingedboots', name: 'Winged Boots', quantity: 1, sprite: null }], bonuses: [{ pieces: 2, stats: { dex: 1 } }] } },
      usage: { classes: [{ id: 'mage', name: 'Mage', hands: null }] },
    }
    await serverWith([{ name: 'wingedboots', level: 7, stat_type: statType }], [winged]).install(page)
    const { card, extras } = await openDetails(page)
    // 1, 6, 13: the scrolled stat replaces Stat; Grade, A.Speed, Speed and Set follow the game's card.
    await expect.poll(() => lines(card)).toEqual([statLine, 'Armor: 17', 'Resistance: 31', 'Speed: +15', 'A.Speed: 8', 'Grade: High', 'Set: Swift Judgement', '[i]: Upgradeable'])
    await expect(line(extras, 'credit')).toHaveText('Credit: Pluet')
    await expect(line(extras, 'stat_type')).toHaveText('Stat Scroll: ' + (statType === 'int' ? 'Intelligence' : 'Dexterity'))
  })
}

test('Item card: a weapon keeps the game order, Burn reads as an ability and the slider moves stats and grade', async ({ page }, info) => {
  const staff: MockCatalogEntry = {
    id: 'firestaff',
    name: 'Fire Staff',
    upgradeable: true,
    maxLevel: 12,
    definition: { type: 'weapon', wtype: 'staff', tier: 2, damage_type: 'magical', g: 50000, grades: [6, 8, 10, 12], upgrade: { attack: 4, int: 1 }, ability: 'burn', attack: 20, int: 3 },
    properties: { attack: 61, int: 14, crit: 1.2, critdamage: 5, speed: 4, attr0: 3, lifesteal: 2, fzresistance: 4 },
    scaling: { attack: 4, int: 1 },
    usage: { classes: [{ id: 'mage', name: 'Mage', hands: 2 }], hands: [2] },
  }
  await serverWith([{ name: 'firestaff', level: 9 }], [staff]).install(page)
  const { sheet, card } = await openDetails(page)
  await expect(line(card, 'attack')).toHaveText('Damage: 61')
  const order = await card.locator('[data-line]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-line')))
  expect(order.indexOf('lifesteal')).toBeLessThan(order.indexOf('crit'))
  expect(order.indexOf('crit')).toBeLessThan(order.indexOf('critdamage'))
  expect(order.indexOf('critdamage')).toBeLessThan(order.indexOf('attack'))
  expect(order.indexOf('attack')).toBeLessThan(order.indexOf('int'))
  expect(await label(card, 'attack')).toBe(rgb('#DB2900'))
  await expect(line(card, 'critdamage')).toHaveText('Crit Damage: +5%')
  expect(await label(card, 'critdamage')).toBe(rgb('#C2366A'))
  await expect(line(card, 'lifesteal')).toHaveText('Lifesteal: 2%')
  expect(await label(card, 'lifesteal')).toBe(rgb('#C8323E'))
  await expect(line(card, 'fzresistance')).toHaveText('Freeze Res.: 4')
  expect(await label(card, 'fzresistance')).toBe(rgb('#69B1B6'))
  await expect(line(card, 'damage_type')).toHaveText('Type: Magical')
  await expect(line(card, 'speed')).toHaveText('Run Speed: +4')
  await expect(line(card, 'grade')).toHaveText('Grade: Rare')
  // 3: Burn with its chance filled in.
  await expect(line(card, 'ability')).toHaveText('Ability: Burn')
  await expect(card).toContainText('Burns the opponent with a 3% chance. Deals damage over time.')
  await expect(line(card, 'weapon_type')).toHaveText('Type: T2 Staff')
  expect(await label(card, 'weapon_type')).toBe(rgb('#808080'))
  // A mage can wield the staff, so the game colors the type green.
  expect(await color(line(card, 'weapon_type').locator('[data-value]'))).toBe(rgb('#56A244'))
  await sheet.screenshot({ path: info.outputPath('item-card-fire-staff.png') })
  // 10: the preview level moves the card.
  await sheet.getByRole('slider').focus()
  await page.keyboard.press('ArrowRight')
  await expect(line(card, 'grade')).toHaveText('Grade: Legendary')
  await expect(line(card, 'attack')).not.toHaveText('Damage: 61')
  await expect(line(card, 'lifesteal')).toHaveText('Lifesteal: 2%')
})

test('Item card: the Lolipop Mace shows Explosion and Sugar Rush as game lines, not raw keys', async ({ page }) => {
  const mace: MockCatalogEntry = {
    id: 'glolipop',
    name: 'Lolipop Mace',
    upgradeable: true,
    maxLevel: 12,
    definition: { type: 'weapon', wtype: 'mace', tier: 0, dex: 24, explosion: 20, ability: 'sugarrush', attr0: 0.25, damage_type: 'physical', upgrade: { explosion: 2, range: 1, attack: 2.9 }, g: 16000, grades: [8, 9, 10, 12], range: 4, attack: 14 },
    properties: { attack: 34, dex: 24, explosion: 34, range: 11, attr0: 0.25 },
    scaling: { explosion: 2, range: 1, attack: 2.9 },
    usage: { classes: [{ id: 'warrior', name: 'Warrior', hands: 1 }], hands: [1] },
  }
  await serverWith([{ name: 'glolipop', level: 7 }], [mace]).install(page)
  const { sheet, card } = await openDetails(page)
  await expect(line(card, 'explosion')).toHaveText('Explosion: 34%')
  expect(await label(card, 'explosion')).toBe(rgb('#782D33'))
  await expect(line(card, 'ability')).toHaveText('Ability: Sugar Rush')
  expect(await label(card, 'ability')).toBe(rgb('#D64770'))
  await expect(card).toContainText('Trigger a Sugar Rush on attack with 0.25% chance. Gain 240 Attack Speed for 10 seconds!')
  for (const raw of ['attr0', 'sugarrush']) await expect(sheet).not.toContainText(raw)
  // A mage can't wield the mace, so the game colors the type red.
  expect(await color(line(card, 'weapon_type').locator('[data-value]'))).toBe(rgb('#CC3837'))
})

test('Item card: a granted skill links to its details, Back returns, and a class bonus keeps its stats', async ({ page }, info) => {
  const zapper: MockCatalogEntry = {
    id: 'zapper',
    name: 'The Zapper',
    compoundable: true,
    definition: { type: 'ring', ability: 'zapperzap', int: 10, str: 5, rpiercing: 10, resistance: 30, compound: { int: 3, rpiercing: 4 }, grades: [0, 0, 1, 3] },
    properties: { int: 10, str: 5, rpiercing: 10, resistance: 30 },
    bonuses: [{ kind: 'class', id: 'warrior', name: 'Warrior', stats: { str: 10, apiercing: 40 } }],
  }
  const server = serverWith([{ name: 'zapper', level: 0 }], [zapper])
  server.skillCatalog = [
    {
      id: 'shared',
      name: 'Shared / system',
      skills: [{ id: 'zapperzap', name: 'Zap', definition: { name: 'Zap', explanation: 'Zap your target for 200 damage', mp: 140, cooldown: 200, range: 420, damage: 200 } }],
    },
  ]
  await server.install(page)
  const { sheet, card } = await openDetails(page)
  await expect(line(card, 'ability')).toHaveText('Ability: Zap')
  await expect(card).not.toContainText('zapperzap')
  await expect(line(card, 'bonus_warrior')).toHaveText('Bonus: Warrior [Only] Strength +10 · A.Piercing +40')
  const zap = card.getByRole('button', { name: 'Zap', exact: true })
  await expect(zap).toHaveAttribute('title', 'Zap your target for 200 damage')
  await zap.click()
  await expect(sheet.getByText('G.skills.zapperzap')).toBeVisible()
  await expect(sheet.getByText('Zap your target for 200 damage')).toBeVisible()
  await expect(sheet.getByRole('region', { name: 'Skill card', exact: true })).toBeVisible()
  await sheet.screenshot({ path: info.outputPath('item-card-skill-link.png') })
  await sheet.getByRole('button', { name: 'Back' }).click()
  await expect(line(card, 'ability')).toHaveText('Ability: Zap')
})

test('Item card: non-equipment shows only the game lines and the quantity in the extras box', async ({ page }, info) => {
  const entries: [MockCatalogEntry, string[]][] = [
    [{ id: 'tracker', name: 'Tracktrix', definition: { type: 'tracker', special: true, g: 12, explanation: 'A tool that tracks all your experiences.' } }, ['[i]: Information']],
    [
      { id: 'spidersilk', name: 'Spider Silk', definition: { type: 'material', explanation: 'A durable yet sticky material', s: 9999, g: 300 }, world: { usedIn: [{ id: 'wbook1', name: "Wanderer's Book", quantity: 3, level: 0, cost: 0, quest: null, sprite: null }] } },
      ['[i]: Usable'],
    ],
    [
      { id: 'rattail', name: 'Rat Tail', definition: { type: 'material', s: 9999, g: 50 }, world: { usedIn: [{ id: 'wcap', name: 'Cap', quantity: 3, level: 0, cost: 0, quest: 'mcollector', sprite: null }] } },
      ['An unknown material, as in, you have no idea what to do with it!', '[i]: Collectable'],
    ],
    [{ id: 'hpot1', name: 'HP Potion', definition: { type: 'pot', gives: [['hp', 400]], cooldown: 2000, s: 9999, g: 100 } }, ['HP: +400', '[i]: Information']],
    [{ id: 'elixirluck', name: 'Liquid Luck', definition: { type: 'elixir', luck: 16, duration: 12, s: 9999, g: 240000 } }, ['Luck: +16%', 'Hours: 12', '[i]: Information']],
    [{ id: 'xpbooster', name: 'XP Booster', compoundable: true, definition: { type: 'booster', gain: 'xp', xp: 20, compound: { xp: 1 }, grades: [0, 10, 6, 7], days: 30, g: 79840000 } }, ['XP: +20%', '[i]: Compoundable']],
    [{ id: 'candy', name: 'Candy', definition: { type: 'gem', e: 1, s: 9999, g: 24000 } }, ['[i]: Exchangeable']],
  ]
  const server = serverWith(
    entries.map(([entry]) => ({ name: entry.id, q: 5 })),
    entries.map(([entry]) => entry),
  )
  await server.install(page)
  for (const [index, [entry, expected]] of entries.entries()) {
    const { sheet, card, extras } = await openDetails(page, index)
    await expect.poll(() => lines(card), { message: entry.name }).toEqual(expected)
    await expect(line(extras, 'quantity')).toHaveText('Quantity: 5')
    if (entry.id === 'hpot1') await sheet.screenshot({ path: info.outputPath('item-card-hp-potion.png') })
  }
})

test('Item card: lock, account binding and expiry show on the card; quantity and scroll in the extras', async ({ page }, info) => {
  const ring: MockCatalogEntry = { id: 'dexring', name: 'Ring of Dexterity', compoundable: true, maxLevel: 7, definition: { type: 'ring', compound: { dex: 1 }, dex: 1 }, properties: { dex: 6 }, scaling: { dex: 1 } }
  await serverWith([{ name: 'dexring', level: 5, stat_type: 'dex', l: 'l', acl: 1, q: 2, expires: '2099-01-01T00:00:00.000Z' }], [ring]).install(page)
  const { card, extras } = await openDetails(page)
  for (const text of ['Locked', 'Account Bound', 'Expires']) await expect(card).toContainText(text)
  expect(await color(line(card, 'lock'))).toBe(rgb('#8C8C8C'))
  for (const text of ['Quantity', 'Stat Scroll']) await expect(card).not.toContainText(text)
  await expect(line(extras, 'quantity')).toHaveText('Quantity: 2')
  await expect(line(extras, 'stat_type')).toHaveText('Stat Scroll: Dexterity')
  await card.screenshot({ path: info.outputPath('item-card-ring.png') })
  // 8: Item details is still one entry in the item options list.
  await expect(page.getByRole('button', { name: 'Item details', exact: true })).toHaveCount(1)
})
