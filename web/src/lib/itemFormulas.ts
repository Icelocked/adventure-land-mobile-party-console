import type { ItemDropSource, ItemMeta, MerchantExchangeItem } from '@/models'

/** Item-detail math: stat scaling, NPC sale value, costs, drop rates.
 *  Pure functions. Game-balance constants (grade thresholds, stat-scroll
 *  and tier multipliers) come from the console source and the game, not
 *  derived here. Console: calculated-level-properties.tsx and neighbours. */

// The game server's can_equip_item types. Elixirs are consumed effects, not equipment.
const equipmentTypes = new Set(['helmet', 'pants', 'chest', 'weapon', 'amulet', 'earring', 'shoes', 'gloves', 'ring', 'shield', 'belt', 'source', 'orb', 'quiver', 'cape', 'misc_offhand', 'tool'])
export const isEquipment = (definition?: Record<string, unknown>): boolean => equipmentTypes.has(String(definition?.type ?? ''))
export const isUsable = (definition?: Record<string, unknown>): boolean =>
  ['elixir', 'licence', 'spawner'].includes(String(definition?.type || '')) || Array.isArray(definition?.gives)
/** A rule is either a bare tier count or an object with `tiers`. */
export const upgradeRuleTiers = (rule?: unknown): number => Number(typeof rule === 'object' && rule ? (rule as { tiers?: unknown }).tiers : rule) || 0

/** Which equip slot(s) an item type could replace, for "Compare with equipped". */
const COMPARISON_SLOTS: Record<string, string[]> = {
  weapon: ['mainhand'],
  shield: ['offhand'],
  source: ['offhand'],
  quiver: ['offhand'],
  misc_offhand: ['offhand'],
  chest: ['chest'],
  pants: ['pants'],
  helmet: ['helmet'],
  gloves: ['gloves'],
  shoes: ['shoes'],
  cape: ['cape'],
  belt: ['belt'],
  orb: ['orb'],
  amulet: ['amulet'],
  ring: ['ring1', 'ring2'],
  earring: ['earring1', 'earring2'],
}

/** A weapon that is 1-handed for this character's class can replace either
 *  hand; otherwise it only replaces mainhand. */
export function comparisonSlotsFor(meta: ItemMeta | undefined, characterCtype: string): string[] {
  const type = String(meta?.definition.type ?? '')
  if (type === 'weapon') {
    const usage = meta?.usage?.classes.find((entry) => entry.id === characterCtype)
    return usage?.hands === 1 ? ['mainhand', 'offhand'] : ['mainhand']
  }
  return COMPARISON_SLOTS[type] ?? []
}

const asNumber = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)
const asBoolean = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined)
const asString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)
const asIntList = (value: unknown): number[] | undefined => (Array.isArray(value) ? value.map((v) => Math.trunc(Number(v))) : undefined)

const isTruthy = (value: unknown): boolean => {
  if (value == null) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value.length > 0
  return true
}

/** Definition/scaling keys that are numeric stats; everything else (name,
 *  skin, type, grades, ...) is metadata, not previewed at other levels. */
const ITEM_PROPERTY_KEYS = new Set([
  'gold', 'luck', 'xp', 'int', 'str', 'dex', 'vit', 'for', 'charisma', 'cuteness', 'awesomeness',
  'bling', 'hp', 'mp', 'attack', 'range', 'armor', 'incdmgamp', 'resistance', 'pnresistance',
  'firesistance', 'fzresistance', 'phresistance', 'stresistance', 'stun', 'blast', 'explosion',
  'breaks', 'stat', 'speed', 'evasion', 'miss', 'reflection', 'lifesteal', 'manasteal', 'attr0',
  'attr1', 'rpiercing', 'apiercing', 'crit', 'critdamage', 'dreturn', 'frequency', 'mp_cost',
  'mp_reduction', 'output', 'courage', 'mcourage', 'pcourage',
])

/** Multiplier applied when the generic "stat" value is redirected into the
 *  stat named by an item's `stat_type`. */
const STAT_SCROLL_MULTIPLIER: Record<string, number> = {
  str: 1.0, int: 1.0, dex: 1.0, vit: 1.0, for: 1.0,
  evasion: 0.325, reflection: 0.15, gold: 0.5, luck: 1.0, xp: 0.5,
  armor: 2.25, resistance: 2.25, speed: 0.325, lifesteal: 0.15, manasteal: 0.04,
  rpiercing: 2.25, apiercing: 2.25, crit: 0.125, dreturn: 0.5, frequency: 0.325,
  mp_cost: 0.6, output: 0.175,
}

const NO_ROUND_KEYS = new Set(['evasion', 'miss', 'reflection', 'dreturn', 'lifesteal', 'manasteal', 'attr0', 'attr1', 'crit', 'critdamage', 'breaks'])

/** An item's stat block at [level]: base definition plus per-level scaling.
 *  Multipliers step up from tier 7 for upgrades and tier 5 for compounds. */
export function calculatedLevelProperties(meta: ItemMeta | undefined, statType: string | undefined, level: number): Record<string, number> {
  const definition = meta?.definition ?? {}
  const scaling = meta?.scaling ?? {}
  const values: Record<string, number> = {}
  for (const key of ITEM_PROPERTY_KEYS) {
    const base = asNumber(definition[key])
    if (base !== undefined) values[key] = base
  }
  for (let step = 1; step <= level; step += 1) {
    let multiplier = 1.0
    if (meta?.upgradeable) {
      multiplier = step === 7 ? 1.25 : step === 8 ? 1.5 : step === 9 ? 2.0 : step === 10 ? 3.0 : step >= 11 ? 1.25 : 1.0
    } else if (meta?.compoundable) {
      multiplier = step === 5 ? 1.25 : step === 6 ? 1.5 : step === 7 ? 2.0 : step >= 8 ? 3.0 : 1.0
    }
    for (const [key, rawValue] of Object.entries(scaling)) {
      const amount = asNumber(rawValue)
      if (amount === undefined) continue
      const delta = key === 'stat' ? Math.round(amount * multiplier) : amount * multiplier
      values[key] = (values[key] ?? 0) + delta
      if (key === 'stat' && step >= 7) values.stat = (values.stat ?? 0) + 1
    }
  }
  const tier = asNumber(definition.tier) ?? 0
  if (level === 10 && (values.stat ?? 0) !== 0 && tier >= 3) {
    values.stat = (values.stat ?? 0) + 2
  }
  for (const key of Object.keys(values)) {
    if (!NO_ROUND_KEYS.has(key)) values[key] = Math.round(values[key])
  }
  if (statType && (values.stat ?? 0) !== 0) {
    const multiplier = STAT_SCROLL_MULTIPLIER[statType] ?? 1.0
    values[statType] = (values[statType] ?? 0) + (values.stat ?? 0) * multiplier
    delete values.stat
  }
  return values
}

/** The server-reported stat block, shifted by the formula's difference
 *  between the actual item and the preview (level and stat scroll). */
export function propertiesAtLevel(meta: ItemMeta | undefined, item: { level?: number; stat_type?: string }, level: number, statType?: string | null) {
  const actualLevel = Math.max(0, Number(item.level) || 0)
  const actualCalculated = calculatedLevelProperties(meta, item.stat_type, actualLevel)
  const previewCalculated = calculatedLevelProperties(meta, statType || undefined, level)
  const reported = (meta?.properties || {}) as Record<string, unknown>
  return Object.keys({ ...actualCalculated, ...previewCalculated, ...reported }).reduce<Record<string, string | number | boolean>>((out, key) => {
    const reportedValue = reported[key]
    if (reportedValue !== undefined && typeof reportedValue !== 'number' && typeof reportedValue !== 'string') {
      out[key] = reportedValue as boolean
      return out
    }
    const current = Number(reportedValue ?? actualCalculated[key] ?? 0)
    const value = current + Number(previewCalculated[key] || 0) - Number(actualCalculated[key] || 0)
    if (value) out[key] = value
    return out
  }, {})
}

/** Catalog meta with the live instance's meta over it, keeping the
 *  catalog's world info when the live one has none. */
export function detailMeta(known: ItemMeta | null | undefined, live: ItemMeta | null | undefined): ItemMeta | undefined {
  if (!known) return live ?? undefined
  if (!live) return known
  return { ...known, ...live, world: live.world || known.world }
}

/** The stat block to display at [previewLevel]: the server's current
 *  `properties` plus the formula's delta between the two levels. Using the
 *  delta rather than the raw formula keeps stats with no scaling data. */
export function previewProperties(meta: ItemMeta | undefined, actualLevel: number, previewLevel: number, statType: string | undefined): Record<string, number> {
  const current = calculatedLevelProperties(meta, statType, actualLevel)
  const preview = calculatedLevelProperties(meta, statType, previewLevel)
  const properties = meta?.properties ?? {}
  const keys = new Set([...Object.keys(current), ...Object.keys(preview)])
  const result: Record<string, number> = {}
  for (const key of keys) {
    const currentValue = asNumber(properties[key]) ?? current[key] ?? 0
    const delta = (preview[key] ?? 0) - (current[key] ?? 0)
    const value = currentValue + delta
    if (value !== 0) result[key] = value
  }
  return result
}

export const definitionNumber = (meta: ItemMeta | undefined, key: string): number | undefined => asNumber(meta?.definition[key])
export const definitionString = (meta: ItemMeta | undefined, key: string): string | undefined => asString(meta?.definition[key])

export function itemMaximumLevel(meta: ItemMeta | undefined): number {
  const maxLevel = meta?.maxLevel
  if (maxLevel != null && maxLevel > 0) return maxLevel
  return meta?.compoundable ? 7 : meta?.upgradeable ? 13 : 0
}

/** Uses hardcoded scroll prices, not the live catalog. The console does
 *  the same; the approximation is intentional. */
export function upgradeScrollCost(meta: ItemMeta | undefined, startLevel: number, tiers: number): number {
  const grades = asIntList(meta?.definition.grades) ?? [9, 10, 11, 12]
  const scrollCosts = [1_000, 40_000, 1_600_000, 64_000_000]
  let total = 0
  for (let level = startLevel; level < startLevel + tiers; level += 1) {
    const grade = level >= (grades[2] ?? 11) ? 3 : level >= (grades[1] ?? 10) ? 2 : level >= (grades[0] ?? 9) ? 1 : 0
    total += scrollCosts[grade] || 0
  }
  return total
}

export interface CompoundCost {
  gold: number
  scrolls: number
}

/** Minimum scroll spend to build one target item from +0 copies, priced
 *  from the live catalog's cscroll0..cscroll3. Null if a price is missing. */
export function compoundPassCost(grades: number[] | undefined, targetLevel: number, buyable: { id: string; cost: number }[]): CompoundCost | null {
  const thresholds = Array.isArray(grades) ? grades : [9, 10, 11, 12]
  const prices = new Map(buyable.map((item) => [item.id, item.cost]))
  let gold = 0
  let scrolls = 0
  for (let level = 0; level < targetLevel; level += 1) {
    let grade = 0
    for (let index = 0; index < thresholds.length; index += 1) {
      if (level >= thresholds[index]) grade = index + 1
    }
    const price = prices.get('cscroll' + grade)
    if (price === undefined || !Number.isFinite(price) || price < 0) return null
    const count = 3 ** (targetLevel - level - 1)
    gold += count * price
    scrolls += count
  }
  return { gold, scrolls }
}

/** `purchasable` scrolls are bought for gold; the rest must already be owned. */
export const STAT_SCROLLS: { stat: string; scroll: string; label: string; purchasable: boolean }[] = [
  { stat: 'str', scroll: 'strscroll', label: 'STR', purchasable: true },
  { stat: 'int', scroll: 'intscroll', label: 'INT', purchasable: true },
  { stat: 'dex', scroll: 'dexscroll', label: 'DEX', purchasable: true },
  { stat: 'vit', scroll: 'vitscroll', label: 'VIT', purchasable: true },
  { stat: 'for', scroll: 'forscroll', label: 'FOR', purchasable: false },
  { stat: 'evasion', scroll: 'evasionscroll', label: 'Evasion', purchasable: false },
  { stat: 'reflection', scroll: 'reflectionscroll', label: 'Reflection', purchasable: false },
  { stat: 'gold', scroll: 'goldscroll', label: 'Gold', purchasable: false },
  { stat: 'luck', scroll: 'luckscroll', label: 'Luck', purchasable: false },
  { stat: 'xp', scroll: 'xpscroll', label: 'XP', purchasable: false },
  { stat: 'armor', scroll: 'armorscroll', label: 'Armor', purchasable: false },
  { stat: 'resistance', scroll: 'resistancescroll', label: 'Resistance', purchasable: false },
  { stat: 'speed', scroll: 'speedscroll', label: 'Speed', purchasable: false },
  { stat: 'lifesteal', scroll: 'lifestealscroll', label: 'Lifesteal', purchasable: false },
  { stat: 'manasteal', scroll: 'manastealscroll', label: 'Manasteal', purchasable: false },
  { stat: 'rpiercing', scroll: 'rpiercingscroll', label: 'Resistance piercing', purchasable: false },
  { stat: 'apiercing', scroll: 'apiercingscroll', label: 'Armor piercing', purchasable: false },
  { stat: 'crit', scroll: 'critscroll', label: 'Critical hit', purchasable: false },
  { stat: 'dreturn', scroll: 'dreturnscroll', label: 'Damage return', purchasable: false },
  { stat: 'frequency', scroll: 'frequencyscroll', label: 'Attack speed', purchasable: false },
  { stat: 'mp_cost', scroll: 'mpcostscroll', label: 'MP cost reduction', purchasable: false },
  { stat: 'output', scroll: 'outputscroll', label: 'Output', purchasable: false },
]

/** How many stat scrolls an item at this level needs. */
export function statScrollQuantity(meta: ItemMeta | undefined, level: number): number {
  const grades = asIntList(meta?.definition.grades) ?? [9, 10, 11, 12]
  const lvl = Math.max(0, level)
  const grade = lvl >= (grades[2] ?? 11) ? 3 : lvl >= (grades[1] ?? 10) ? 2 : lvl >= (grades[0] ?? 9) ? 1 : 0
  return [1, 10, 100, 1000][grade] || 1
}

export function primaryStatScrollCost(meta: ItemMeta | undefined, level: number): number {
  return statScrollQuantity(meta, level) * 8_000
}

/** The game's NPC sale value, including its upgrade/compound tier curve. */
export function npcSaleValue(level: number, gift: boolean, expires: unknown, meta: ItemMeta | undefined): number {
  const definition = meta?.definition ?? {}
  if (gift) return 1
  let value = asNumber(definition.g) ?? 0
  const isCash = asBoolean(definition.cash) === true
  value *= isCash ? 1.0 : 0.6
  const markup = asNumber(definition.markup)
  if (markup != null && markup !== 0) value /= markup
  const effectiveLevel = Math.max(0, level)
  const grades = asIntList(definition.grades) ?? [11, 12]
  const gradeAt = (tier: number) => (tier > (grades[1] ?? 12) ? 2 : tier > (grades[0] ?? 11) ? 1 : 0)
  const defType = asString(definition.type)

  if ((asBoolean(definition.compound) === true || meta?.compoundable) && effectiveLevel > 0) {
    for (let tier = 1; tier <= effectiveLevel; tier += 1) {
      const grade = gradeAt(tier)
      value *= isCash ? 1.5 : 3.2
      if (defType !== 'booster') value += [1000, 40000, 1600000][grade] / 2.4
      else value *= 0.75
    }
  }
  if ((asBoolean(definition.upgrade) === true || meta?.upgradeable) && effectiveLevel > 0) {
    let scrollValue = 0
    for (let tier = 1; tier <= effectiveLevel; tier += 1) {
      const grade = gradeAt(tier)
      scrollValue += [1000, 40000, 1600000][grade] / 2.0
      if (tier >= 7) {
        value *= 3.0
        scrollValue *= 1.32
      } else if (tier === 6) value *= 2.4
      else if (tier >= 4) value *= 2.0
      if (tier === 9) {
        value *= 2.64
        value += 400000
      }
      if (tier === 10) value *= 5.0
      if (tier === 12) value *= 0.8
    }
    value += scrollValue
  }
  if (isTruthy(expires)) value /= 8.0
  return Math.max(0, Math.round(value))
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return 'Unknown'
  if (ms <= 0) return '0s'
  if (ms < 1) return '<0.001s'
  const total = Math.round(ms)
  const hours = Math.floor(total / 3600000)
  const minutes = Math.floor((total % 3600000) / 60000)
  const seconds = (total % 60000) / 1000
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (seconds > 0) parts.push(`${formatSeconds(seconds)}s`)
  return parts.length === 0 ? '0s' : parts.join(' ')
}

const formatSeconds = (seconds: number): string => (seconds === Math.floor(seconds) ? String(seconds) : String(seconds))

const DURATION_KEY_REGEX = /^(duration(?:_min|_max)?|cooldown(?:_min|_max)?|reuse_cooldown|ms|remainingMs)$/

export function durationStat(key: string, value: number, definitionType: string | undefined): string | null {
  if (!DURATION_KEY_REGEX.test(key)) return null
  const ms = value * (key === 'duration' && definitionType === 'elixir' ? 3600000 : 1)
  return formatDuration(ms)
}

/** Display order for the "Item stats" table; unlisted keys sort after,
 *  alphabetically. */
const ITEM_DETAIL_PROPERTY_ORDER = [
  'equip_slot', 'stackable', 'max_stack_size', 'tier', 'scroll', 'stat', 'str', 'dex', 'int', 'vit',
  'for', 'hp', 'mp', 'attack', 'frequency', 'range', 'armor', 'resistance', 'apiercing', 'rpiercing',
  'pnresistance', 'firesistance', 'fzresistance', 'phresistance', 'stresistance', 'evasion', 'miss',
  'reflection', 'crit', 'critdamage', 'lifesteal', 'manasteal', 'speed', 'luck', 'gold', 'xp',
  'ability', 'attr0', 'attr1', 'buy', 'id',
]
export const ITEM_DETAIL_PROPERTY_RANK = new Map(ITEM_DETAIL_PROPERTY_ORDER.map((key, index) => [key, index]))

/** Keys never shown in the stats table: shown elsewhere already or purely
 *  internal. `type` is shown as the derived equip slot instead. */
const IGNORED_STAT_KEYS = new Set(['skin', 'skin_a', 'skin_c', 'skin_r', 'name', 'explanation', 'type', 'g', 's', 'grades', 'upgrade', 'compound', 'level', 'set'])

export const comparisonSlotLabel = (slot: string) =>
  slot === 'mainhand' ? 'Main hand' : slot === 'offhand' ? 'Off hand' : slot === 'ring1' ? 'Ring 1' : slot === 'ring2' ? 'Ring 2' : slot === 'earring1' ? 'Earring 1' : slot === 'earring2' ? 'Earring 2' : slot

export interface StatRow {
  key: string
  value: unknown
}

/** The "Item stats" table: the raw definition with [previewProperties]
 *  overlaid, derived equip_slot/stackable/max_stack_size added, ignored
 *  keys stripped, sorted by display rank. */
export function buildStatRows(meta: ItemMeta | undefined, actualLevel: number, previewLevel: number, statType: string | undefined): StatRow[] {
  const definition = meta?.definition ?? {}
  const preview = previewProperties(meta, actualLevel, previewLevel, statType)
  const display: Record<string, unknown> = { ...definition }
  for (const [key, value] of Object.entries(preview)) display[key] = value
  // Equipment shows where it goes instead of its type.
  const type = String(definition.type)
  if ((COMPARISON_SLOTS[type] || []).length)
    display.equip_slot =
      type === 'weapon'
        ? 'Main hand' + (meta?.usage?.hands.includes(1) ? ' (off hand depends on class)' : '')
        : COMPARISON_SLOTS[type]
            .map((slot) => {
              const label = comparisonSlotLabel(slot)
              return label.charAt(0).toUpperCase() + label.slice(1)
            })
            .join(' or ')
  const stackSize = asNumber(definition.s) ?? 1
  display.stackable = stackSize > 1
  if (stackSize > 1) display.max_stack_size = stackSize

  return Object.entries(display)
    .filter(([key]) => !IGNORED_STAT_KEYS.has(key))
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => {
      const rankDiff = (ITEM_DETAIL_PROPERTY_RANK.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (ITEM_DETAIL_PROPERTY_RANK.get(b.key) ?? Number.MAX_SAFE_INTEGER)
      return rankDiff !== 0 ? rankDiff : a.key.localeCompare(b.key)
    })
}

/** Duration keys render as "1h 30m", arrays join with commas, everything
 *  else as a plain string. */
export function formatStatValue(key: string, value: unknown, definitionType: string | undefined): string {
  if (typeof value === 'number') {
    const duration = durationStat(key, value, definitionType)
    if (duration != null) return duration
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.map((element) => (Array.isArray(element) ? element.map(String).join(' ') : String(element))).join(', ')
  }
  return String(value)
}

export interface ExchangeSourceRow {
  entry: MerchantExchangeItem
  chance: number
}

export interface ExchangeSections {
  prices: MerchantExchangeItem[]
  rewards: MerchantExchangeItem[]
  sources: ExchangeSourceRow[]
}

const REWARD_TARGET_REGEX = /^(.*)-(\d+)$/
export function exchangeTarget(reward: string): [string, number] {
  const match = REWARD_TARGET_REGEX.exec(reward)
  const id = match?.[1] && match[1].length > 0 ? match[1] : reward
  const level = match?.[2] ? Number(match[2]) : 0
  return [id, level]
}

/** Matches the exchangeable table by [id]+[level]: what buying this item
 *  from an exchange NPC costs ([prices]), what exchanging this item gives
 *  ([rewards]), and, for +0 items only, which boxes can drop it
 *  ([sources], "Reward in"). */
export function exchangeSections(id: string, level: number, exchanges: MerchantExchangeItem[]): ExchangeSections {
  const prices = exchanges.filter((entry) => {
    if (!entry.reward) return false
    const [targetId, targetLevel] = exchangeTarget(entry.reward)
    return targetId === id && targetLevel === level
  })
  const rewards = exchanges.filter((entry) => entry.id === id && entry.level === level)
  const sources: ExchangeSourceRow[] =
    level === 0
      ? exchanges
          .flatMap((entry) => {
            if (entry.reward) return []
            const chance = entry.results.filter((result) => result.id === id && result.kind === id).reduce((sum, result) => sum + result.chance, 0)
            return chance > 0 ? [{ entry, chance }] : []
          })
          .sort((a, b) => b.chance - a.chance || a.entry.name.localeCompare(b.entry.name))
      : []
  return { prices, rewards, sources }
}

export function rewardPercentage(chance: number): string {
  if (chance > 0 && chance < 0.00000001) return '<0.000001%'
  return `${toPrecision(chance * 100, 6)}%`
}

/** A direct monster drop keeps its original chance even when the displayed
 *  rate was capped; a multi-step path (a box that is itself a drop) shows
 *  the actual chance. */
export function effectiveDropRate(drop: ItemDropSource): number {
  return drop.sourceType === 'monster' && (drop.acquisitionPath?.length ?? 0) <= 1 ? (drop.originRate ?? drop.rate) : drop.rate
}

/** Rates above 100% split into a guaranteed count plus a remainder chance. */
export function formatDropRate(drop: ItemDropSource): string {
  const rate = Math.max(0, effectiveDropRate(drop))
  const quantity = Math.max(1, drop.quantity || 1)
  const percent = (chance: number) => `${toPrecision(chance * 100, 6)}%`
  const count = (value: number) => (value > 1 ? ` ×${value.toLocaleString()}` : '')
  if (rate <= 1) return percent(rate) + count(quantity)
  const guaranteed = Math.floor(rate)
  const remainder = rate - guaranteed
  return `100%${count(guaranteed * quantity)}${remainder > 0 ? ` + ${percent(remainder)}${count(quantity)}` : ''}`
}

function toPrecision(value: number, sigFigs: number): string {
  if (value === 0) return '0'
  try {
    return Number(value.toPrecision(sigFigs)).toString()
  } catch {
    return String(value)
  }
}
