import type { ItemDropSource, ItemMeta, MerchantExchangeItem } from '@/models'

/** Faithful TypeScript port of the item-detail math already ported once
 *  to Kotlin (ui/itemdetail/ItemFormulas.kt) from party-console's own
 *  source (calculated-level-properties.tsx, npc-sale-value.tsx, item-
 *  maximum-level.tsx, format-duration.ts, item-detail-property-order.tsx,
 *  drop-rate.ts). Pure functions, no UI. Every game-balance constant here
 *  (grade thresholds, stat-scroll multipliers, upgrade/compound tier
 *  multipliers) is copied verbatim rather than re-derived. */

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

/** The subset of a definition/scaling record that represents a numeric
 *  in-game stat (item-property-keys.tsx) - everything else (name, skin,
 *  type, grades, ...) is metadata, not a stat to preview at other levels. */
const ITEM_PROPERTY_KEYS = new Set([
  'gold', 'luck', 'xp', 'int', 'str', 'dex', 'vit', 'for', 'charisma', 'cuteness', 'awesomeness',
  'bling', 'hp', 'mp', 'attack', 'range', 'armor', 'incdmgamp', 'resistance', 'pnresistance',
  'firesistance', 'fzresistance', 'phresistance', 'stresistance', 'stun', 'blast', 'explosion',
  'breaks', 'stat', 'speed', 'evasion', 'miss', 'reflection', 'lifesteal', 'manasteal', 'attr0',
  'attr1', 'rpiercing', 'apiercing', 'crit', 'critdamage', 'dreturn', 'frequency', 'mp_cost',
  'mp_reduction', 'output', 'courage', 'mcourage', 'pcourage',
])

/** stat-scrolls.tsx's per-stat multiplier, used when a generic "stat"
 *  scaling value needs to redirect into the specific stat a stat-scroll-
 *  marked item's `stat_type` names. */
const STAT_SCROLL_MULTIPLIER: Record<string, number> = {
  str: 1.0, int: 1.0, dex: 1.0, vit: 1.0, for: 1.0,
  evasion: 0.325, reflection: 0.15, gold: 0.5, luck: 1.0, xp: 0.5,
  armor: 2.25, resistance: 2.25, speed: 0.325, lifesteal: 0.15, manasteal: 0.04,
  rpiercing: 2.25, apiercing: 2.25, crit: 0.125, dreturn: 0.5, frequency: 0.325,
  mp_cost: 0.6, output: 0.175,
}

const NO_ROUND_KEYS = new Set(['evasion', 'miss', 'reflection', 'dreturn', 'lifesteal', 'manasteal', 'attr0', 'attr1', 'crit', 'critdamage', 'breaks'])

/** Recomputes an item's stat block AT [level] from its base definition
 *  plus per-level scaling deltas - upgrade/compound tiers apply different
 *  multipliers at specific breakpoints (tier 7+ for upgrades, 5+ for
 *  compounds), matching the game's own progression curve exactly. */
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

/** The stat block to actually display at [previewLevel]: the server's own
 *  current-level `properties` (authoritative) adjusted by the DELTA
 *  between the formula evaluated at the preview level vs. the actual
 *  level, rather than the formula's raw output - mirrors item-
 *  details.tsx's `previewProperties` exactly so a "no scaling data" stat
 *  doesn't silently vanish. */
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

/** upgrade-scroll-cost.tsx ported verbatim, including its hardcoded
 *  scroll-price fallback (not the live catalog price - this function has
 *  no catalog access at its call site in the dashboard either, so the
 *  approximation is intentional, not a bug to "fix" here). */
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

/** lib/compound-cost.ts's compoundPassCost ported verbatim - minimum
 *  scroll spend to build one target item entirely from +0 copies, using
 *  real compound-scroll ("cscroll0".."cscroll3") prices from the live
 *  merchant catalog rather than a hardcoded approximation. */
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

/** stat-scrolls.tsx's table - `purchasable` stats (str/int/dex/vit) are
 *  bought outright for gold; the rest require already owning the scroll
 *  (stat-scroll-quantity.tsx/primary-stat-scroll-cost.tsx). */
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

/** stat-scroll-quantity.tsx ported verbatim - how many scrolls of a stat
 *  type a mark at this item's current level requires. */
export function statScrollQuantity(meta: ItemMeta | undefined, level: number): number {
  const grades = asIntList(meta?.definition.grades) ?? [9, 10, 11, 12]
  const lvl = Math.max(0, level)
  const grade = lvl >= (grades[2] ?? 11) ? 3 : lvl >= (grades[1] ?? 10) ? 2 : lvl >= (grades[0] ?? 9) ? 1 : 0
  return [1, 10, 100, 1000][grade] || 1
}

export function primaryStatScrollCost(meta: ItemMeta | undefined, level: number): number {
  return statScrollQuantity(meta, level) * 8_000
}

/** npc-sale-value.tsx ported verbatim - the exact upgrade/compound
 *  grade-tier gold curve the game itself uses, not an approximation. */
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

/** item-detail-property-order.tsx's display order for the "Item stats"
 *  table - anything not listed sorts after, alphabetically. */
const ITEM_DETAIL_PROPERTY_ORDER = [
  'equip_slot', 'stackable', 'max_stack_size', 'tier', 'scroll', 'stat', 'str', 'dex', 'int', 'vit',
  'for', 'hp', 'mp', 'attack', 'frequency', 'range', 'armor', 'resistance', 'apiercing', 'rpiercing',
  'pnresistance', 'firesistance', 'fzresistance', 'phresistance', 'stresistance', 'evasion', 'miss',
  'reflection', 'crit', 'critdamage', 'lifesteal', 'manasteal', 'speed', 'luck', 'gold', 'xp',
  'ability', 'attr0', 'attr1', 'buy', 'id',
]
const ITEM_DETAIL_PROPERTY_RANK = new Map(ITEM_DETAIL_PROPERTY_ORDER.map((key, index) => [key, index]))

/** Keys item-details.tsx never shows in the stats table - either shown
 *  elsewhere already (name, explanation, level, g/buy price) or purely
 *  internal. `type` is intentionally left visible (unlike the desktop
 *  version, which replaces it with a derived "equip_slot" label this app
 *  doesn't compute) so the equip slot/category is still readable. */
const IGNORED_STAT_KEYS = new Set(['skin', 'skin_a', 'skin_c', 'skin_r', 'name', 'explanation', 'g', 's', 'grades', 'upgrade', 'compound', 'level', 'set'])

export interface StatRow {
  key: string
  value: unknown
}

/** Builds the "Item stats" table exactly as item-details.tsx does: the
 *  raw definition, with [previewProperties] overlaid on top, plus a
 *  derived stackable/max_stack_size pair, ignored keys stripped, sorted
 *  by display rank. */
export function buildStatRows(meta: ItemMeta | undefined, actualLevel: number, previewLevel: number, statType: string | undefined): StatRow[] {
  const definition = meta?.definition ?? {}
  const preview = previewProperties(meta, actualLevel, previewLevel, statType)
  const display: Record<string, unknown> = { ...definition }
  for (const [key, value] of Object.entries(preview)) display[key] = value
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

/** Renders one stat value the way item-details.tsx's `<dd>` does: a
 *  duration-shaped key/value becomes "1h 30m", arrays join with commas,
 *  everything else is just its plain string form. */
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
function exchangeTarget(reward: string): [string, number] {
  const match = REWARD_TARGET_REGEX.exec(reward)
  const id = match?.[1] && match[1].length > 0 ? match[1] : reward
  const level = match?.[2] ? Number(match[2]) : 0
  return [id, level]
}

/** item-exchange-details.tsx's three groupings, matched against the
 *  whole exchangeable table by [id]+[level]: what it costs to buy this
 *  item from an exchange NPC ([prices]), what an exchange/box keyed by
 *  this item itself gives back ([rewards]), and - for a base (+0) item
 *  only - every box/table this item can be pulled out of as a random
 *  result ([sources], "Reward in" on desktop). */
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

/** drop-rate.ts's `effectiveDropRate` - a direct monster kill retains its
 *  original chance even when the DISPLAYED rate was capped (e.g. by a
 *  luck multiplier elsewhere), but a multi-step acquisition path (a drop
 *  found by opening a box that's itself a drop) shows the actual chance. */
export function effectiveDropRate(drop: ItemDropSource): number {
  return drop.sourceType === 'monster' && (drop.acquisitionPath?.length ?? 0) <= 1 ? (drop.originRate ?? drop.rate) : drop.rate
}

/** drop-rate.ts's `formatDropRate` ported verbatim - rates above 100%
 *  (guaranteed multi-drops) split into a guaranteed count plus a
 *  fractional remainder chance. */
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
