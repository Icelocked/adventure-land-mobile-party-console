import { prettyFloat, STAT_NAMES, titleCase, WEAPON_TYPES } from '@/lib/itemCardLines'
import { STAT_COLORS as S } from '@/lib/statColors'

// A port of the console's skill-card.tsx line builders (dashboard/features/party), which
// port the game's skill card (render_skill in the game's js/html.js): its line order and
// English labels (interface.skill.*). The game prints most lines gray; each line here
// takes a meaning color from the shared palette. Console docs: docs/skill-card.md.
export type SkillCardLine = { key: string; label: string; value: string; color: string } | { key: string; text: string; color: string }

const MP = S.mp,
  COOLDOWN = S.cooldown,
  RANGE = S.range,
  WEAPON = '#56A244'
const REQUIRED_COLORS: Record<string, string> = { str: S.str, int: S.int, dex: S.dex, vit: S.vit, for: S.for }
// Extras labels colored by meaning; anything else reads light gray.
export const SKILL_EXTRA_COLORS: Record<string, string> = {
  hostile: '#E13758',
  target: S.evasion,
  procs: '#3BE681',
  projectile: '#B484E5',
  party: '#CB83AC',
  heal: '#CB83AC',
  damage: '#DB2900',
  damage_multiplier: '#DB2900',
  ratio: '#DB2900',
  pierces_immunity: '#E52967',
  multi: '#FFDE2F',
  class: '#4EB7DE',
  aura: '#FC5F39',
}
const HEADER_KEYS = new Set(['name', 'skin', 'explanation'])
// Fields the card turns into lines; the rest go to the extras box.
const CARD_KEYS = new Set([
  'mp', 'duration', 'cooldown', 'reuse_cooldown', 'share', 'cooldown_multiplier', 'range', 'use_range', 'range_multiplier', 'range_bonus',
  'level', 'wtype', 'offhand_type', 'max', 'damage_type', 'condition', 'levels', 'mp_return_levels', 'requirements',
])

const text = (value: unknown) => (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '')
const seconds = (ms: unknown) => `${Number(ms) / 1000} seconds`
const weaponType = (type: unknown) => WEAPON_TYPES[text(type)] || titleCase(text(type))
const pairs = (value: unknown) => (Array.isArray(value) ? (value.filter(Array.isArray) as unknown[][]) : [])

export function skillCardLines(definition: Record<string, unknown>, skillName: (id: string) => string | undefined): SkillCardLine[] {
  // The game's card lists stats only for skills with an explanation.
  if (!definition.explanation) return []
  const lines: SkillCardLine[] = []
  const add = (key: string, label: string, value: string, color: string) => lines.push({ key, label, value, color })
  if (Number(definition.mp)) add('mp', 'MP', text(definition.mp), MP)
  if (Number(definition.duration)) add('duration', 'Duration', seconds(definition.duration), S.duration)
  if (Number(definition.cooldown)) add('cooldown', 'Cooldown', seconds(definition.cooldown), COOLDOWN)
  if (Number(definition.reuse_cooldown)) add('reuse_cooldown', 'Reuse Cooldown', seconds(definition.reuse_cooldown), COOLDOWN)
  if (definition.share) add('share', 'Cooldown', `${prettyFloat(Number(definition.cooldown_multiplier) || 1)}× ${skillName(text(definition.share)) || titleCase(text(definition.share))}`, COOLDOWN)
  if (Number(definition.range)) add('range', 'Range', text(definition.range), RANGE)
  if (definition.use_range) add('use_range', 'Range', 'Character Range', RANGE)
  if (Number(definition.range_multiplier) && Number(definition.range_bonus))
    add('range_multiplier', 'Range', `${prettyFloat(Number(definition.range_multiplier))}X + ${text(definition.range_bonus)}`, RANGE)
  else if (Number(definition.range_multiplier)) add('range_multiplier', 'Range', `${prettyFloat(Number(definition.range_multiplier))}× Character Range`, RANGE)
  if (Number(definition.level)) add('level', 'Level Requirement', text(definition.level), S.level)
  if (definition.wtype)
    add(
      'wtype',
      'Weapon Requirement',
      (Array.isArray(definition.wtype) ? definition.wtype : [definition.wtype]).map((type) => `"${weaponType(type)}"`).join(', '),
      WEAPON,
    )
  if (definition.offhand_type) add('offhand_type', 'Offhand Requirement', weaponType(definition.offhand_type), WEAPON)
  if (Number(definition.max)) add('max', 'Max', text(definition.max), '#FFDE2F')
  if (definition.type === 'passive') lines.push({ key: 'passive', text: 'Passive', color: '#9FA7B6' })
  const damageTypes: Record<string, [string, string]> = { pure: ['Pure', '#AA9B55'], magical: ['Magical', '#8998AA'], physical: ['Physical', '#93AB98'] }
  const damageType = damageTypes[text(definition.damage_type)]
  if (damageType) add('damage_type', 'Damage Type', damageType[0], damageType[1])
  if (definition.condition) add('condition', 'Condition', titleCase(text(definition.condition)), '#A59FFF')
  pairs(definition.levels).forEach(([level, value], index) => add(`levels_${index}`, 'Output', Number(level) > 0 ? `${text(value)} (Lv. ${text(level)})` : text(value), S.output))
  pairs(definition.mp_return_levels).forEach(([level, value], index) => add(`mp_return_${index}`, 'HP loss to MP', `${Math.round(Number(value) * 100)}% (Lv. ${text(level)})`, MP))
  const requirements = definition.requirements && typeof definition.requirements === 'object' ? (definition.requirements as Record<string, unknown>) : {}
  for (const [stat, amount] of Object.entries(requirements)) add(`required_${stat}`, `Required ${STAT_NAMES[stat] || titleCase(stat)}`, text(amount), REQUIRED_COLORS[stat] || '#C3C3C3')
  return lines
}

function extraValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.map((entry) => (Array.isArray(entry) ? entry.map(text).join(' ') : text(entry) || JSON.stringify(entry))).join(', ')
  if (value && typeof value === 'object') return JSON.stringify(value)
  return text(value)
}

// Definition fields with no line on the game's card, other than the header's.
export function skillExtras(definition: Record<string, unknown>): [key: string, label: string, value: string][] {
  const shown = definition.explanation ? CARD_KEYS : new Set<string>()
  return Object.entries(definition)
    .filter(
      ([key, value]) =>
        !HEADER_KEYS.has(key) && !shown.has(key) && !(key === 'type' && value === 'passive' && definition.explanation) && value !== null && value !== undefined && value !== '',
    )
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, titleCase(key), extraValue(value)])
}
