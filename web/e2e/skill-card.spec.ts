// Failure inventory: a skill's details show the game's skill card beside an extras box
// wherever the app shows a skill: the Class skills screen and the skill an item grants
// (the Zapper's "Ability: Zap" link in item details). Ported from the console's
// docs/skill-card.md (branch bestiary-card); each line has a check below.
//
// 1. The card drifts from the game's. Lines, labels, colors and order must match
//    render_skill: Supershot reads "MP: 400", "Cooldown: 30 seconds", "Range: Character
//    Range", "Range: 3X + 20", "Weapon Requirement: "Bow", "Crossbow"" and "Damage Type:
//    Physical", with MP in the MP color.
// 2. Levelled values collapse. Party Heal shows one Output line per level ("Output: 600
//    (Lv. 60)"), and a level 0 value without the level.
// 3. Shared cooldowns lose the skill's name. 3-Shot reads "Cooldown: 1× Attack", naming
//    the shared skill from the catalog.
// 4. A field from the old definition grid goes missing. Every definition field must
//    appear on the card or in the extras box, except the name, skin and explanation the
//    header shows.
// 5. The two places drift apart. The Class skills screen and the item's skill link must
//    render the same card and extras for the same skill.
// 6. The layout breaks. The boxes sit side by side when the sheet has room and stack on a
//    phone, with nothing scrolling sideways.
// 7. The card reads as a wall of gray. Its lines and the extras labels carry their
//    meaning colors.
// 8. The rest of the Skills sheet changes. The header with G.skills.<id>, the
//    explanation and the range note stay.
import { test, expect, type Locator } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

const color = (locator: Locator) => locator.evaluate((node) => getComputedStyle(node).color)
const rgb = (hex: string) => {
  const value = Number.parseInt(hex.slice(1), 16)
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`
}
const lines = (box: Locator) => box.locator('[data-line]').evaluateAll((nodes) => nodes.map((node) => node.textContent))

// Skill definitions from the live game data (G.skills).
const skill = (id: string, definition: Record<string, unknown>) => ({ id, name: String(definition.name), definition })
const SKILLS = [
  {
    id: 'ranger',
    name: 'Ranger',
    skills: [
      skill('supershot', {
        type: 'skill', skin: 'skill_supershot', class: ['ranger'], name: 'Supershot', explanation: 'Deals 1.5X instant damage from an incredible distance.',
        wtype: ['bow', 'crossbow'], damage_multiplier: 1.5, cooldown: 30000, range_multiplier: 3, range_bonus: 20, mp: 400, target: true, hostile: true,
        pierces_immunity: true, damage_type: 'physical', procs: true, use_range: true,
      }),
      skill('3shot', {
        type: 'skill', skin: 'skill_3shot', class: ['ranger'], name: '3-Shot', explanation: 'Hits 3 targets at once!', wtype: ['bow', 'crossbow'],
        damage_multiplier: 0.7, level: 60, mp: 200, cooldown_multiplier: 1, multi: true, share: 'attack', hostile: true, pierces_immunity: true,
        damage_type: 'physical', procs: true, use_range: true,
      }),
    ],
  },
  {
    id: 'priest',
    name: 'Priest',
    skills: [
      skill('partyheal', {
        type: 'skill', skin: 'skill_pheal', class: ['priest'], name: 'Party Heal', explanation: 'Heals all the party members.', output: 400, action: 'heal',
        levels: [[0, 400], [60, 600], [72, 720], [80, 800]], mp: 400, cooldown: 200, party: true, projectile: 'partyheal', damage_type: 'magical', heal: true, multi: true,
      }),
    ],
  },
  {
    id: 'shared',
    name: 'Shared',
    skills: [
      skill('attack', { type: 'skill', name: 'Attack', explanation: 'Attack a target.', target: true, hostile: true }),
      skill('zapperzap', {
        type: 'skill', skin: 'trigger', slot: [['ring1', 'zapper'], ['ring2', 'zapper']], name: 'Zap', explanation: 'Zap your target for 200 damage', damage: 200,
        damage_type: 'magical', mp: 140, cooldown: 200, range: 420, projectile: 'gburst', target: true, hostile: true,
      }),
    ],
  },
]

function skillServer() {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Mage1', ctype: 'mage', level: 80, items: [{ name: 'zapper', level: 0 }] })
  server.addCatalogEntry({ id: 'zapper', name: 'The Zapper', compoundable: true, definition: { type: 'ring', ability: 'zapperzap', int: 10 }, properties: { int: 10 } })
  server.skillCatalog = SKILLS
  return server
}

test('Skill card: the Skills screen shows the game card, levelled outputs, shared cooldowns and the extras', async ({ page }, info) => {
  await skillServer().install(page)
  await page.goto('/skills')
  const open = async (name: RegExp) => {
    await page.getByRole('button', { name }).click()
    const details = page.getByRole('group', { name: 'Skill details' })
    return { details, card: details.getByRole('region', { name: 'Skill card', exact: true }), extras: details.getByRole('region', { name: 'Skill extras', exact: true }) }
  }

  // 1: Supershot, line for line, with the game's colors.
  const supershot = await open(/^Supershot/)
  await expect
    .poll(() => lines(supershot.card))
    .toEqual(['MP: 400', 'Cooldown: 30 seconds', 'Range: Character Range', 'Range: 3X + 20', 'Weapon Requirement: "Bow", "Crossbow"', 'Damage Type: Physical'])
  expect(await color(supershot.card.locator('[data-line="mp"] [data-label]'))).toBe(rgb('#3A62CE'))
  expect(await color(supershot.card.locator('[data-line="damage_type"] [data-label]'))).toBe(rgb('#93AB98'))
  // 7: meaning colors instead of the game's gray.
  expect(await color(supershot.card.locator('[data-line="cooldown"] [data-label]'))).toBe(rgb('#4EB7DE'))
  expect(await color(supershot.card.locator('[data-line="use_range"] [data-label]'))).toBe(rgb('#93A6A2'))
  expect(await color(supershot.card.locator('[data-line="wtype"] [data-label]'))).toBe(rgb('#56A244'))
  expect(await color(supershot.extras.locator('[data-line="hostile"] [data-label]'))).toBe(rgb('#E13758'))
  expect(await color(supershot.extras.locator('[data-line="type"] [data-label]'))).toBe(rgb('#C3C3C3'))
  // 4: every other field, readable, in the extras box.
  expect(await lines(supershot.extras)).toEqual(['Class: ranger', 'Damage Multiplier: 1.5', 'Hostile: Yes', 'Pierces Immunity: Yes', 'Procs: Yes', 'Target: Yes', 'Type: skill'])
  // 8: the header, explanation and range note stay.
  await expect(supershot.details.getByText('G.skills.supershot')).toBeVisible()
  await expect(supershot.details.getByText('Deals 1.5X instant damage from an incredible distance.')).toBeVisible()
  await expect(supershot.details.getByText(/Base range in game distance units/)).toBeVisible()
  await supershot.details.screenshot({ path: info.outputPath('skill-card-supershot.png') })
  await page.keyboard.press('Escape')

  // 2: one Output line per level.
  const partyheal = await open(/^Party Heal/)
  await expect
    .poll(() => lines(partyheal.card))
    .toEqual(['MP: 400', 'Cooldown: 0.2 seconds', 'Damage Type: Magical', 'Output: 400', 'Output: 600 (Lv. 60)', 'Output: 720 (Lv. 72)', 'Output: 800 (Lv. 80)'])
  await page.keyboard.press('Escape')

  // 3: a shared cooldown names the shared skill.
  const threeshot = await open(/^3-Shot/)
  await expect.poll(() => lines(threeshot.card)).toContain('Cooldown: 1× Attack')
  expect(await lines(threeshot.card)).toContain('Level Requirement: 60')
})

test('Skill card: side by side in a wide sheet, stacked on a phone, and the same from an item link', async ({ page }, info) => {
  await skillServer().install(page)
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.goto('/skills')
  await page.getByRole('button', { name: /^Zap/ }).click()
  const details = page.getByRole('group', { name: 'Skill details' })
  const card = details.getByRole('region', { name: 'Skill card', exact: true })
  const extras = details.getByRole('region', { name: 'Skill extras', exact: true })
  // 6: side by side when the sheet has room.
  await expect
    .poll(async () => {
      const cardBox = (await card.boundingBox())!,
        extrasBox = (await extras.boundingBox())!
      return extrasBox.x >= cardBox.x + cardBox.width - 1
    })
    .toBe(true)
  const fromSkills = { card: await lines(card), extras: await lines(extras) }
  expect(fromSkills.card).toEqual(['MP: 140', 'Cooldown: 0.2 seconds', 'Range: 420', 'Damage Type: Magical'])
  // 6: stacked on a phone, without sideways scrolling.
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(async () => {
      const cardBox = (await card.boundingBox())!,
        extrasBox = (await extras.boundingBox())!
      return extrasBox.y >= cardBox.y + cardBox.height - 1
    })
    .toBe(true)
  const sheet = page.locator('[data-slot="sheet-content"]').filter({ has: details })
  expect(await sheet.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  await sheet.screenshot({ path: info.outputPath('skill-card-phone.png') })

  // 5: the Zapper's skill link renders the same card and extras.
  await page.goto('/characters/Mage1')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Item details' }).click()
  await page.getByRole('region', { name: 'Item card', exact: true }).getByRole('button', { name: 'Zap', exact: true }).click()
  const linked = page.locator('[data-slot="sheet-content"]').filter({ has: page.getByText('G.skills.zapperzap') })
  await expect.poll(() => lines(linked.getByRole('region', { name: 'Skill card', exact: true }))).toEqual(fromSkills.card)
  expect(await lines(linked.getByRole('region', { name: 'Skill extras', exact: true }))).toEqual(fromSkills.extras)
  await linked.screenshot({ path: info.outputPath('skill-card-item-link.png') })
})
