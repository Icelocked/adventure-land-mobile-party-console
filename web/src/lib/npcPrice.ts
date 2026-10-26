/** Copied from the console fork's runtime/coordinator/commerce/npc-price.ts
 *  (topic15/ponty-ron-buys); keep the two in step. */
/**
 * Ponty and Ron prices from game definitions. itemValue mirrors
 * calculate_item_value (js/old_common_functions.js:808-847 at
 * adventureland_mongodb 16881a27), which the server evals (node/server.js:114)
 * and the client loads (htmls/index.html:43). sbuy (node/server.js:8306-8388)
 * multiplies it by 2 for Ponty, 3 for Ponty cash items and 4 for Ron.
 */
export interface PriceDefinition {
  g?: unknown
  cash?: unknown
  markup?: unknown
  compound?: unknown
  upgrade?: unknown
  grades?: unknown
  type?: unknown
}
export type PriceDefinitions = Record<string, PriceDefinition | undefined>
export interface LevelPrice {
  level: number
  unitPrice: number
}

const gold = (defs: PriceDefinitions, name: string) => Number(defs[name]?.g) || 0
function grades(def: PriceDefinition): [number, number] {
  const value = Array.isArray(def.grades) ? def.grades : [11, 12]
  return [Number(value[0]) || 11, Number(value[1]) || 12]
}
function grade(level: number, def: PriceDefinition): number {
  const [low, high] = grades(def)
  return level > high ? 2 : level > low ? 1 : 0
}
function compoundValue(defs: PriceDefinitions, def: PriceDefinition, value: number, level: number): number {
  for (let i = 1; i <= level; i += 1) {
    value *= def.cash ? 1.5 : 3.2
    if (def.type !== 'booster') value += gold(defs, 'cscroll' + grade(i, def)) / 2.4
    else value *= 0.75
  }
  return value
}
const upgradeSteps: Record<number, number> = { 4: 2, 5: 2, 6: 2.4 }
function upgradeValue(defs: PriceDefinitions, def: PriceDefinition, value: number, level: number): number {
  let scrolls = 0
  for (let i = 1; i <= level; i += 1) {
    scrolls += gold(defs, 'scroll' + grade(i, def)) / 2
    if (i >= 7) {
      value *= 3
      scrolls *= 1.32
    } else value *= upgradeSteps[i] || 1
    if (i === 9) value = value * 2.64 + 400000
    if (i === 10) value *= 5
    if (i === 12) value *= 0.8
  }
  return value + scrolls
}

function baseValue(def: PriceDefinition): number {
  const value = def.cash && Number(def.g) ? Number(def.g) : Number(def.g) * 0.6 || 0
  return Number(def.markup) ? value / Number(def.markup) : value
}

/** calculate_item_value for an item with only a name and a level. */
export function itemValue(defs: PriceDefinitions, name: string, level: number): number {
  const def = defs[name]
  if (!def) return 0
  const value = baseValue(def)
  if (!level) return Math.round(value) || 0
  const leveled = def.compound ? compoundValue(defs, def, value, level) : value
  return Math.round(def.upgrade ? upgradeValue(defs, def, leveled, level) : leveled) || 0
}

export function npcUnitPrice(defs: PriceDefinitions, name: string, level: number, npc: 'ponty' | 'ron'): number {
  const multiplier = npc === 'ron' ? 4 : defs[name]?.cash ? 3 : 2
  return itemValue(defs, name, level) * multiplier
}

export function levelPrices(defs: PriceDefinitions, name: string, from: number, to: number, npc: 'ponty' | 'ron'): LevelPrice[] {
  const prices: LevelPrice[] = []
  for (let level = Math.min(from, to); level <= Math.max(from, to); level += 1)
    prices.push({ level, unitPrice: npcUnitPrice(defs, name, level, npc) })
  return prices
}

/** All copies at the cheapest included level, up to all at the dearest; null for 'until I stop'. */
export function estimateTotal(prices: LevelPrice[], quantity: number | null): { low: number; high: number } | null {
  if (quantity === null || !prices.length) return null
  const units = prices.map((entry) => entry.unitPrice)
  return { low: Math.min(...units) * quantity, high: Math.max(...units) * quantity }
}
