import type { Item, ItemMeta } from '@/models'
import { STAT_COLORS as S } from '@/lib/statColors'

// A port of the console's item-card-lines.ts (dashboard/features/party), which ports the
// game's item card (render_item in the game's js/html.js): its line order, English labels
// (languages/en/interface.js) and colors (colors in js/old_common_functions.js plus the
// literals in render_item). Console docs: docs/item-card.md and docs/monster-card.md.
export type ItemCardLine =
  | { kind: 'prop'; key: string; label: string; value: string; color: string; valueColor?: string; skill?: string; monster?: string }
  | { kind: 'text'; key: string; text: string; color: string }

type Values = Record<string, unknown>
// Definition values are loosely typed game data; only primitives print.
const text = (value: unknown) => (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '')

const COLORS = {
  hp: S.hp,
  mp: S.mp,
  attack: S.attack,
  range: S.range,
  armor: S.armor,
  resistance: S.resistance,
  str: S.str,
  int: S.int,
  dex: S.dex,
  for: S.for,
  speed: S.speed,
  lifesteal: S.lifesteal,
  manasteal: S.manasteal,
  poison: '#41834A',
  ability: '#ff9100',
  gold: 'gold',
  gray: 'gray',
  text: '#C3C3C3',
}

export const WEAPON_TYPES: Record<string, string> = {
  sword: 'Sword',
  short_sword: 'Short Sword',
  great_sword: 'Great Sword',
  axe: 'Axe',
  wblade: 'Magical Sword',
  basher: 'Basher',
  dartgun: 'Dart Gun',
  bow: 'Bow',
  crossbow: 'Crossbow',
  rapier: 'Rapier',
  spear: 'Spear',
  fist: 'Fist Weapon',
  dagger: 'Dagger',
  stars: 'Throwing Stars',
  mace: 'Mace',
  pmace: 'Priest Mace',
  staff: 'Staff',
  wand: 'Wand',
  quiver: 'Quiver',
  shield: 'Shield',
  misc_offhand: 'Misc Offhand',
  source: 'Source',
}
const OFFHAND_TYPES = new Set(['quiver', 'shield', 'misc_offhand', 'source'])
export const STAT_NAMES: Record<string, string> = { str: 'Strength', int: 'Intelligence', dex: 'Dexterity', vit: 'Vitality', for: 'Fortitude' }

// Abilities with their own game description; {value} is attr0 and {value2} attr1.
const ABILITIES: Record<string, { name: string; color: string; text?: string }> = {
  bash: { name: 'Bash', color: COLORS.ability, text: 'Stuns the opponent for {value} seconds with {value2}% chance.' },
  freeze: { name: 'Freeze', color: '#2EBCE2', text: 'Freezes the opponent with a {value}% chance.' },
  poison: { name: 'Poison', color: COLORS.poison, text: 'Poisons the opponent with a {value}% chance.' },
  burn: { name: 'Burn', color: '#E03D31', text: 'Burns the opponent with a {value}% chance. Deals damage over time.' },
  weave: { name: 'Weave', color: '#AAA9D2', text: 'Each hit slows the opponent more and more.' },
  secondchance: { name: 'Second Chance', color: COLORS.ability, text: 'Avoid death with a {value}% chance.' },
  sugarrush: { name: 'Sugar Rush', color: '#D64770', text: 'Trigger a Sugar Rush on attack with {value}% chance. Gain 240 Attack Speed for 10 seconds!' },
  charm: { name: 'Charm', color: '#D64770', text: "Charm an enemy with {value}% chance. Activate the ability from the 'SKILLS' system." },
  restore_mp: { name: 'Restore MP', color: '#5D9ED9', text: 'Instead of using MP, skills restore 2X the amount with {value}% chance.' },
}

const GRADES = [null, { name: 'High', color: '#696354' }, { name: 'Rare', color: '#6668AC' }, { name: 'Legendary', color: '#39A868' }, { name: 'Exalted', color: '#2875F9' }]

// to_pretty_float and to_pretty_num in the game's js/old_common_functions.js.
export const prettyFloat = (value: number) => (0 + Math.trunc((value || 0) * 100) / 100).toLocaleString('en-US')
export const prettyNum = (value: number) => (Math.floor(value || 0) + 0).toLocaleString('en-US')
const signed = (value: number, shown = String(value)) => (value > 0 ? '+' : '') + shown
export const titleCase = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

// calculate_item_grade in the game's js/old_common_functions.js.
export function itemGrade(definition: Values, level: number): number {
  if (!(definition.upgrade || definition.compound)) return 0
  const grades = Array.isArray(definition.grades) ? definition.grades.map(Number) : [9, 10, 11, 12]
  for (let grade = 4; grade >= 1; grade--) if (level >= grades[grade - 1]) return grade
  return 0
}

function fill(template: string, values: { value?: unknown; value2?: unknown }) {
  return template.replace('{value2}', text(values.value2)).replace('{value}', text(values.value))
}

// monster: render_item's monster mode, where XP is a plain number, Range and Speed carry
// no plus sign and A.Speed always shows as frequency × 100.
function statLines(prop: Values, definition: Values, monster = false): ItemCardLine[] {
  const lines: ItemCardLine[] = []
  const add = (key: string, label: string, value: string, color: string) => lines.push({ kind: 'prop', key, label, value, color })
  const n = (key: string) => Number(prop[key]) || 0
  const percent = (key: string, label: string, color: string, sign = false) => {
    if (n(key)) add(key, label, (sign ? signed(n(key), prettyFloat(n(key))) : prettyFloat(n(key))) + '%', color)
  }
  const plain = (key: string, label: string, color: string) => {
    if (n(key)) add(key, label, text(prop[key]), color)
  }
  if (n('miss') && definition.type === 'elixir') add('miss', 'Alcohol', n('miss') + '%', '#7CAAF6')
  for (const gift of Array.isArray(definition.gives) ? definition.gives : []) {
    const [stat, amount] = Array.isArray(gift) ? gift : []
    if (stat === 'hp') add('gives_hp', 'HP', Number(amount) < 0 ? prettyNum(Number(amount)) : '+' + prettyNum(Number(amount)), COLORS.hp)
    if (stat === 'mp') add('gives_mp', 'MP', '+' + prettyNum(Number(amount)), COLORS.mp)
  }
  if (definition.debuff) add('debuff', 'Effect', 'Debuff', '#343792')
  if (n('gold')) add('gold', 'Gold', signed(n('gold')) + '%', COLORS.gold)
  if (n('luck')) add('luck', 'Luck', signed(n('luck')) + '%', S.luck)
  if (n('xp')) add('xp', 'XP', monster ? text(prop.xp) : signed(n('xp')) + '%', S.xp)
  percent('lifesteal', 'Lifesteal', COLORS.lifesteal)
  percent('manasteal', 'Manasteal', COLORS.manasteal)
  if (definition.goldsteal) add('goldsteal', 'Goldsteal', 'Dynamic', COLORS.gold)
  percent('evasion', 'Evasion', S.evasion)
  percent('avoidance', 'Avoidance', S.avoidance)
  if (n('miss') && definition.type !== 'elixir') add('miss', 'Miss', n('miss') + '%', S.miss)
  percent('reflection', 'Reflection', S.reflection)
  percent('dreturn', 'D.Return', S.dreturn)
  percent('crit', 'Crit', S.crit)
  if (n('critdamage')) add('critdamage', 'Crit Damage', '+' + prettyFloat(n('critdamage')) + '%', S.critdamage)
  plain('attack', 'Damage', COLORS.attack)
  const damageTypes: Record<string, [string, string]> = { pure: ['Pure', '#AA9B55'], magical: ['Magical', '#8998AA'], physical: ['Physical', '#93AB98'] }
  const damageType = damageTypes[text(definition.damage_type)]
  if (damageType) add('damage_type', 'Type', damageType[0], damageType[1])
  if (n('range')) add('range', 'Range', (monster ? '' : '+') + text(prop.range), COLORS.range)
  plain('hp', 'HP', COLORS.hp)
  plain('str', 'Strength', COLORS.str)
  plain('int', 'Intelligence', COLORS.int)
  plain('dex', 'Dexterity', COLORS.dex)
  plain('vit', 'Vitality', COLORS.hp)
  plain('for', 'Fortitude', COLORS.for)
  plain('mp', 'MP', COLORS.mp)
  if (n('mp_cost')) add('mp_cost', 'Attack MP Cost', signed(n('mp_cost')), COLORS.mp)
  if (n('mp_reduction') > 0) add('mp_reduction', 'Skill MP Reduction', '%' + n('mp_reduction'), COLORS.mp)
  else if (n('mp_reduction')) add('mp_reduction', 'Skill MP Increase', '%' + -n('mp_reduction'), COLORS.mp)
  if (n('stat')) add('stat', 'Stat', text(prop.stat), COLORS.gray)
  plain('armor', 'Armor', COLORS.armor)
  plain('apiercing', 'A.Piercing', COLORS.armor)
  plain('rpiercing', 'R.Piercing', COLORS.resistance)
  plain('resistance', 'Resistance', COLORS.resistance)
  plain('pnresistance', 'Poison Res.', S.pnresistance)
  plain('firesistance', 'Fire Res.', S.firesistance)
  plain('fzresistance', 'Freeze Res.', S.fzresistance)
  plain('phresistance', 'Impact Res.', S.phresistance)
  plain('stresistance', 'Status Res.', S.stresistance)
  if (definition.wspeed) add('wspeed', 'Speed', titleCase(text(definition.wspeed)), COLORS.gray)
  if (n('speed')) add('speed', definition.wtype ? 'Run Speed' : 'Speed', monster ? prettyFloat(n('speed')) : signed(n('speed')), COLORS.speed)
  if (n('frequency') || monster) add('frequency', 'A.Speed', monster ? prettyFloat((n('frequency') || 1) * 100) : text(prop.frequency), S.frequency)
  if (n('output')) add('output', 'Damage Output', signed(n('output')) + '%', S.output)
  if (n('incdmgamp')) add('incdmgamp', 'Incoming Damage', n('incdmgamp') + '%', '#D93319')
  for (const [key, label, color] of [
    ['stun', 'Stun', '#784224'],
    ['explosion', 'Explosion', '#782D33'],
    ['blast', 'Blast', '#685079'],
  ] as const)
    if (n(key)) add(key, label, n(key) + '%', color)
  if (n('breaks') > 0) add('breaks', 'Breaks', prettyFloat(n('breaks')) + '%', '#782D33')
  for (const [key, label, color] of [
    ['charisma', 'Charisma', '#4DB174'],
    ['awesomeness', 'Awesomeness', '#FFDE2F'],
    ['bling', 'Bling', '#A4E6FF'],
    ['cuteness', 'Cuteness', '#FD82F0'],
    ['intensity', 'Intensity', '#786D6A'],
    ['courage', 'Courage', '#9E1813'],
    ['mcourage', 'M.Courage', '#4628A0'],
    ['pcourage', 'P.Courage', '#D19D32'],
  ] as const)
    plain(key, label, color)
  return lines
}

function abilityLines(prop: Values, definition: Values, skillName: (id: string) => string | undefined): ItemCardLine[] {
  const lines: ItemCardLine[] = []
  const id = definition.ability ? text(definition.ability) : ''
  const value = prop.attr0 ?? definition.attr0,
    value2 = prop.attr1 ?? definition.attr1
  if (id) {
    const known = ABILITIES[id],
      skill = known ? undefined : skillName(id)
    // A granted skill links to its details, as the game's card opens render_skill.
    lines.push({ kind: 'prop', key: 'ability', label: 'Ability', value: known?.name || skill || titleCase(id), color: known?.color || '#E1924D', ...(skill ? { skill: id } : {}) })
    if (known?.text) lines.push({ kind: 'text', key: 'ability_text', text: fill(known.text, { value, value2 }), color: COLORS.text })
    else {
      if (value) lines.push({ kind: 'prop', key: 'ability_chance', label: 'Chance', value: '%' + text(value), color: 'grey' })
      lines.push({ kind: 'text', key: 'ability_text', text: "Activate the ability from the 'SKILLS' system.", color: COLORS.text })
    }
  }
  if (definition.aura) {
    lines.push({ kind: 'prop', key: 'aura', label: 'Aura', value: titleCase(text(definition.aura)), color: '#E1924D' })
    if (value) lines.push({ kind: 'prop', key: 'aura_amount', label: 'Amount', value: '%' + text(value), color: 'grey' })
  }
  return lines
}

function hoursLine(hours: number): ItemCardLine {
  if (hours <= 1 / 60) return { kind: 'prop', key: 'duration', label: 'Seconds', value: prettyFloat(hours * 3600), color: COLORS.gray }
  if (hours < 1) return { kind: 'prop', key: 'duration', label: 'Minutes', value: prettyFloat(hours * 60), color: COLORS.gray }
  return { kind: 'prop', key: 'duration', label: 'Hours', value: prettyFloat(hours), color: COLORS.gray }
}

// The item card's label and color for one stat key, or undefined when the card has no line for it.
export function itemCardStat(key: string): { label: string; color: string } | undefined {
  const line = statLines({ [key]: 1 }, {}).find((entry) => entry.kind === 'prop' && entry.key === key)
  return line?.kind === 'prop' ? { label: line.label, color: line.color } : undefined
}

// render_item's name line: the title before the name ("Shiny Blade +7"). The console sends
// no G.titles, so every title prints as the id in title case, which matches G.titles' own
// names for shiny and glitched.
export const titledName = (name: string, title: string | undefined) => (title ? `${titleCase(title)} ${name}` : name)

// "Strength +10 · A.Piercing +40" for a bonus's stats, with the card's labels.
export function statSummary(stats: Values): string {
  return statLines(stats, {})
    .map((line) => (line.kind === 'prop' ? `${line.label} ${/^[+-]/.test(line.value) ? line.value : '+' + line.value}` : ''))
    .filter(Boolean)
    .join(' · ')
}

export function itemCardLines({
  meta,
  item,
  level,
  properties,
  setName,
  usable,
  skillName = () => undefined,
}: {
  meta: ItemMeta | null | undefined
  item: Item
  level: number
  // Stats at the shown level: live item properties, or the level preview.
  properties: Values
  setName?: string
  // Whether a party class can wield the weapon; the game colors the type line by it.
  usable: boolean
  skillName?: (id: string) => string | undefined
}): ItemCardLine[] {
  const definition: Values = meta?.definition || {}
  const prop: Values = { ...definition, ...properties }
  // A stat scroll folds the base stat into the scrolled stat (calculate_item_properties sets prop.stat=0).
  if (item.stat_type) prop.stat = 0
  const lines: ItemCardLine[] = [...statLines(prop, definition)]
  const grade = GRADES[itemGrade(definition, level)]
  if (grade && definition.type !== 'booster') lines.push({ kind: 'prop', key: 'grade', label: 'Grade', value: grade.name, color: grade.color })
  if (definition.poisonous) lines.push({ kind: 'text', key: 'poisonous', text: 'Poisonous', color: COLORS.poison })
  if (definition.cooperative) lines.push({ kind: 'text', key: 'cooperative', text: 'Cooperative', color: '#aeaeae' })
  if (definition.peaceful) lines.push({ kind: 'text', key: 'peaceful', text: 'Peaceful', color: '#54B25F' })
  if (definition.supporter) lines.push({ kind: 'text', key: 'supporter', text: 'Supporter', color: '#CA5931' })
  for (const bonus of meta?.bonuses || [])
    lines.push({ kind: 'prop', key: `bonus_${bonus.id}`, label: 'Bonus', value: `${bonus.name} [Only] ${statSummary(bonus.stats)}`.trim(), color: '#7738E8' })
  const classes = Array.isArray(definition.class) ? definition.class : definition.class ? [definition.class] : []
  if (classes.length) lines.push({ kind: 'prop', key: 'class', label: 'Class', value: classes.map((name) => titleCase(text(name))).join(', '), color: COLORS.gray })
  if (definition.type === 'elixir' && Number(definition.duration)) lines.push(hoursLine(Number(definition.duration)))
  lines.push(...abilityLines(prop, definition, skillName))
  if (definition.explanation) lines.push({ kind: 'text', key: 'explanation', text: text(definition.explanation), color: COLORS.text })
  else if (definition.type === 'material') lines.push({ kind: 'text', key: 'unknown_material', text: 'An unknown material, as in, you have no idea what to do with it!', color: COLORS.text })
  if (Number(definition.multiplier) && Number(definition.multiplier) !== 1) lines.push({ kind: 'prop', key: 'multiplier', label: 'Multiplier', value: text(definition.multiplier), color: COLORS.gray })
  if (setName) lines.push({ kind: 'prop', key: 'set', label: 'Set', value: setName, color: '#f1c054' })
  lines.push(...stateLines(item))
  const wtype = text(definition.wtype || definition.type)
  if (definition.type === 'weapon' || OFFHAND_TYPES.has(text(definition.type)))
    lines.push({
      kind: 'prop',
      key: 'weapon_type',
      label: 'Type',
      value: `T${prettyFloat(Number(definition.tier) || 0)} ${WEAPON_TYPES[wtype] || titleCase(wtype)}`,
      color: COLORS.gray,
      valueColor: usable ? '#56A244' : '#CC3837',
    })
  lines.push({ kind: 'prop', key: 'info', label: '[i]', value: infoPhrase(meta, level), color: COLORS.gray })
  return lines
}

// render_item's "[i]" phrase: exchange, then upgrade below +10, compound, then
// collector-quest and other crafting uses.
function infoPhrase(meta: ItemMeta | null | undefined, level: number): string {
  const definition: Values = meta?.definition || {}
  if (definition.e) return 'Exchangeable'
  if (definition.upgrade && level < 10) return 'Upgradeable'
  if (definition.compound) return 'Compoundable'
  const uses = meta?.world?.usedIn || []
  if (uses.some((use) => use.quest === 'mcollector')) return 'Collectable'
  return uses.length ? 'Usable' : 'Information'
}

// The game's monster card: render_item in monster mode (render_monster_info). The
// monster detail already shows the name, G.monsters id, Navigate, score and achievements.
export function monsterCardLines(definition: Values, skillName: (id: string) => string | undefined, monsterName: (id: string) => string | undefined): ItemCardLine[] {
  const lines = statLines(definition, definition, true)
  for (const [key, label, color] of [
    ['poisonous', 'Poisonous', COLORS.poison],
    ['cooperative', 'Cooperative', '#aeaeae'],
    ['peaceful', 'Peaceful', '#54B25F'],
    ['supporter', 'Supporter', '#CA5931'],
  ] as const)
    if (definition[key]) lines.push({ kind: 'text', key, text: label, color })
  for (const [id, ability] of Object.entries(monsterAbilities(definition))) {
    const name = skillName(id)
    // The game lists only abilities that are skills; monsterExtras keeps the rest.
    if (!name) continue
    const aura = !!(ability && typeof ability === 'object' && (ability as Values).aura)
    lines.push({ kind: 'prop', key: `ability_${id}`, label: aura ? 'Aura' : 'Ability', value: name, color: '#FC5F39', skill: id })
  }
  ;(Array.isArray(definition.spawns) ? definition.spawns : []).forEach((spawn, index) => {
    const id = Array.isArray(spawn) ? text(spawn[1]) : ''
    if (id) lines.push({ kind: 'prop', key: `spawn_${index}`, label: 'Spawns', value: monsterName(id) || titleCase(id), color: '#237B2A', monster: id })
  })
  if (definition.explanation) lines.push({ kind: 'text', key: 'explanation', text: text(definition.explanation), color: COLORS.text })
  return lines
}

// A monster's stats at a level: level_monster adds half the base HP and one base XP per
// level, and calculate_monster_stats (both in the game's node/server.js) raises attack
// 12.5%, speed 0.24 and frequency 0.034 per level up to level 12. Speed and frequency
// add one step per level, as the game does: one multiplication lands on the other side
// of the card's truncation (6 + 12 * 0.24 is 8.8799..., which prints as 8.87).
export function monsterAtLevel(definition: Values, level: number): Values {
  if (level <= 1) return definition
  const base = (key: string) => Number(definition[key]) || 0
  const combat = Math.min(level, 12)
  let speed = base('speed'),
    frequency = base('frequency') || 1
  for (let step = 0; step < combat; step++) {
    speed += 0.24
    frequency += 0.034
  }
  return {
    ...definition,
    hp: base('hp') + (level - 1) * Math.floor(base('hp') / 2),
    xp: base('xp') * level,
    attack: Math.floor(base('attack') * (1 + combat * 0.125)),
    speed,
    frequency,
  }
}

const monsterAbilities = (definition: Values) =>
  definition.abilities && typeof definition.abilities === 'object' && !Array.isArray(definition.abilities) ? (definition.abilities as Record<string, unknown>) : {}

// Definition fields the game's monster card has no line for. Abilities that aren't skills
// stay here by id, so nothing the old definition grid showed disappears.
export function monsterExtras(definition: Values, skillName: (id: string) => string | undefined): [key: string, label: string, value: string][] {
  // Item-only fields such as s (stack size) stay in the extras when a monster has them.
  const itemOnly = new Set(['g', 's', 'grades', 'upgrade', 'compound', 'level', 'set', 'wtype', 'tier', 'class', 'ability', 'aura', 'attr0', 'attr1', 'gives', 'duration', 'multiplier', 'e', 'type'])
  const shown = new Set([
    ...[...CARD_KEYS].filter((key) => !itemOnly.has(key)),
    'name',
    'skin',
    'achievements',
    'abilities',
    'spawns',
    'explanation',
    'poisonous',
    'cooperative',
    'peaceful',
    'supporter',
  ])
  const extras: [string, string, string][] = Object.entries(definition)
    .filter(([key, value]) => !shown.has(key) && value !== null && value !== undefined && value !== '')
    .map(([key, value]) => [
      key,
      key
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
      typeof value === 'boolean' ? (value ? 'Yes' : 'No') : typeof value === 'object' ? JSON.stringify(value) : text(value),
    ])
  const unlisted = Object.keys(monsterAbilities(definition)).filter((id) => !skillName(id))
  if (unlisted.length) extras.push(['abilities', 'Abilities', unlisted.join(', ')])
  return extras.sort(([left], [right]) => left.localeCompare(right))
}

// Per-copy state the game shows on the card. Quantity and stat scroll show on the
// game's inventory slot instead, so the extras box carries them (itemSlotExtras).
function stateLines(item: Item): ItemCardLine[] {
  const lines: ItemCardLine[] = []
  if (item.l === 's') lines.push({ kind: 'text', key: 'lock', text: 'Sealed', color: '#C45F5F' })
  else if (item.l === 'u') lines.push({ kind: 'text', key: 'lock', text: 'Unsealing', color: '#C4A35F' })
  // The game colors Locked #404141, close to invisible on black; #8C8C8C keeps it muted but readable.
  else if (item.l) lines.push({ kind: 'text', key: 'lock', text: 'Locked', color: '#8C8C8C' })
  if (item.acl) lines.push({ kind: 'text', key: 'acl', text: 'Account Bound', color: '#ADA68E' })
  if (item.expires) lines.push({ kind: 'prop', key: 'expires', label: 'Expires', value: new Date(item.expires as string | number).toLocaleString(), color: COLORS.gray })
  return lines
}

// Quantity and stat scroll for the extras box.
export function itemSlotExtras(item: Item): [key: string, value: string][] {
  const extras: [string, string][] = []
  if (item.p) extras.push(['title', titleCase(item.p)])
  // calculate_item_properties rolls a glitched copy's +1 at random, so only the game knows which.
  if (item.p === 'glitched') extras.push(['title_bonus', '+1 DEX, INT or STR, rolled at random'])
  if (Number(item.q) > 1) extras.push(['quantity', prettyNum(Number(item.q))])
  if (item.stat_type) extras.push(['stat_type', STAT_NAMES[item.stat_type] || titleCase(item.stat_type)])
  return extras
}

// Whether the card shows a stats-table field. Tier appears only in a weapon's type line.
export function onItemCard(key: string, definition: Values): boolean {
  if (key === 'tier') return definition.type === 'weapon' || OFFHAND_TYPES.has(text(definition.type))
  return CARD_KEYS.has(key)
}

// Definition fields the card already shows, or that only drive other sections.
export const CARD_KEYS = new Set([
  'name', 'skin', 'skin_a', 'skin_c', 'skin_r', 'explanation', 'type', 'g', 's', 'grades', 'upgrade', 'compound',
  'level', 'set', 'wtype', 'damage_type', 'class', 'ability', 'aura', 'attr0', 'attr1', 'gives', 'debuff',
  'goldsteal', 'wspeed', 'duration', 'multiplier', 'poisonous', 'cooperative', 'peaceful', 'supporter', 'e',
  'miss', 'gold', 'luck', 'xp', 'lifesteal', 'manasteal', 'evasion', 'avoidance', 'reflection', 'dreturn', 'crit',
  'critdamage', 'attack', 'range', 'hp', 'str', 'int', 'dex', 'vit', 'for', 'mp', 'mp_cost', 'mp_reduction', 'stat',
  'armor', 'apiercing', 'rpiercing', 'resistance', 'pnresistance', 'firesistance', 'fzresistance', 'phresistance',
  'stresistance', 'speed', 'frequency', 'output', 'incdmgamp', 'stun', 'explosion', 'blast', 'breaks', 'charisma',
  'awesomeness', 'bling', 'cuteness', 'intensity', 'courage', 'mcourage', 'pcourage',
])
