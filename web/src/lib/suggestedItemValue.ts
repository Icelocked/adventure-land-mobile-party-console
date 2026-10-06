import type { InventoryEntry, MerchantBuyItem, Sprite } from '@/models'

// Console: suggested-item-value.tsx and the helpers it imports.

export type ItemSuggestedPrice = {
  monsterId: string
  monsterName: string
  sprite?: Sprite | null
  mapId?: string
  mapName?: string
  rate: number
  quantity: number
  kills: number
  goldPerKill: number
  suggested: number
  paths?: string[]
  worldDrop?: boolean
  purchase?: boolean
  attempts?: number
  scrolls?: number[]
  luckMultiplier?: number
}

export type StandPriceHistory = {
  lowest: number
  lowestLevel?: number
  recent: number
  recentLevel?: number
  seenAt: number
  marketLow?: number
  marketLowLevel?: number
  highestPublicWTB?: number
  highestPublicWTBLevel?: number
}

export const UPGRADE_CHANCES: Record<number, number[]> = {
  0: [1, 0.9999999, 0.98, 0.95, 0.7, 0.6, 0.4, 0.25, 0.15, 0.07, 0.024, 0.14, 0.11],
  1: [1, 0.99998, 0.97, 0.94, 0.68, 0.58, 0.38, 0.24, 0.14, 0.066, 0.018, 0.13, 0.1],
  2: [1, 0.97, 0.94, 0.92, 0.64, 0.52, 0.32, 0.232, 0.13, 0.062, 0.015, 0.12, 0.09],
}

export function exactLevelPrice(price: number | undefined, observedLevel: number | undefined, itemLevel: number) {
  return price && observedLevel != null && Number(observedLevel) === itemLevel ? price : undefined
}

export type UpgradeEstimate = { attempts: number; gold: number; scrolls: number[]; unlikely?: boolean }
const upgradeEstimateCache = new Map<string, UpgradeEstimate>()
// Simulated upgrade rolls allowed per estimate (about a second). A staff to
// +9 needs well under this; +10 and up can need billions and froze the page,
// so they stop at the budget with however many runs finished.
const ROLL_BUDGET = 60_000_000
// Fewer finished runs than this can't support a 90th percentile.
const MIN_RUNS = 30

/** The 90th-percentile cost of producing `quantity` items at +target,
 *  from a seeded 3000-run simulation (fewer when the roll budget runs out;
 *  `unlikely` when too few runs finish to estimate at all). */
export function upgradeEstimate(item: MerchantBuyItem, quantity: number, target: number): UpgradeEstimate {
  if (!target || !item.upgradeable)
    return {
      attempts: quantity,
      gold: item.cost * quantity,
      scrolls: [] as number[],
    }
  const cacheKey = `${item.id}:${item.cost}:${item.upgradeGrade || 0}:${quantity}:${target}`
  const cached = upgradeEstimateCache.get(cacheKey)
  if (cached) return cached
  const chances = item.upgradeChances || [],
    grades = item.grades || [9, 10, 11, 12]
  const itemGrade = Math.max(0, Number(item.upgradeGrade) || 0)
  let seed = 2166136261
  for (const char of `${item.id}:${quantity}:${target}`) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619)
  const random = () => {
    seed += 0x6d2b79f5
    let value = seed
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
  const runs: { attempts: number; gold: number; scrolls: number[] }[] = []
  let rolls = 0
  for (let simulation = 0; simulation < 3000 && rolls < ROLL_BUDGET; simulation += 1) {
    const personalGrace = Array(20).fill(0) as number[]
    const scrolls = [0, 0, 0, 0]
    let attempts = 0,
      successes = 0,
      guard = 0
    while (successes < quantity && guard++ < 2_000_000 && rolls < ROLL_BUDGET) {
      attempts += 1
      let level = 0,
        survived = true
      while (level < target && survived) {
        const newLevel = level + 1
        const scrollGrade = level >= (grades[2] ?? 11) ? 3 : level >= (grades[1] ?? 10) ? 2 : level >= (grades[0] ?? 9) ? 1 : 0
        scrolls[scrollGrade] += 1
        rolls += 1
        const base = chances[newLevel] || 0
        const graceNumber = Math.max(0, Math.min(newLevel + 1, Math.min(3, (personalGrace[newLevel] || 0) / 4.5) + itemGrade))
        let graceChance = (base * graceNumber) / newLevel + graceNumber / 1000
        graceChance = Math.max(0, graceChance / 4.8 - 0.4 / (newLevel - 0.999) ** 2)
        const chance = Math.min(base + graceChance, Math.min(base + 0.24, base * 2))
        if (random() <= chance) {
          personalGrace[newLevel] = 0
          level = newLevel
        } else {
          personalGrace[newLevel - 1] += 1
          personalGrace[newLevel] += 1
          if (newLevel >= 8 && newLevel <= 15) {
            personalGrace[newLevel - 1] += 1
            personalGrace[newLevel - 2] += 2
            personalGrace[newLevel - 3] += 2
          }
          survived = false
        }
      }
      if (survived) successes += 1
    }
    // A run cut off by the budget never finished; it isn't a sample.
    if (successes < quantity) break
    const scrollGold = scrolls.reduce((sum, count, grade) => sum + count * (item.scrollCosts?.[grade] || 0), 0)
    runs.push({ attempts, gold: attempts * item.cost + scrollGold, scrolls })
  }
  if (runs.length < MIN_RUNS) {
    const unlikely = { attempts: 0, gold: 0, scrolls: [] as number[], unlikely: true }
    upgradeEstimateCache.set(cacheKey, unlikely)
    return unlikely
  }
  runs.sort((a, b) => a.gold - b.gold)
  const result = runs[Math.min(runs.length - 1, Math.ceil(runs.length * 0.9) - 1)]
  upgradeEstimateCache.set(cacheKey, result)
  return result
}

export function suggestedItemValue(entry: InventoryEntry, buyable: MerchantBuyItem[]) {
  const definition = entry.meta?.definition || {}
  const defaultPrice = Math.max(1, Number(definition.g) || 1)
  const precomputed = entry.meta?.world?.suggestedPrices || []
  const level = Math.max(0, Number(entry.item.level) || 0)
  const catalogItem = buyable.find((item) => item.id === entry.item.name)
  const sources = precomputed.map((source) => {
    let suggested = Math.max(defaultPrice, Number(source.suggested) || defaultPrice)
    if (level > 0 && entry.meta?.upgradeable) {
      const grade = Math.max(0, Math.min(2, Number(catalogItem?.upgradeGrade ?? definition.igrade) || 0))
      const estimated = upgradeEstimate(
        {
          id: entry.item.name,
          name: String(definition.name || entry.item.name),
          cost: suggested,
          seller: '',
          sprite: entry.meta?.sprite || null,
          upgradeable: true,
          upgradeGrade: grade,
          grades: catalogItem?.grades || (definition.grades as number[] | undefined),
          upgradeChances: catalogItem?.upgradeChances || UPGRADE_CHANCES[grade],
          scrollCosts: catalogItem?.scrollCosts || [1000, 40000, 1600000, 64000000],
        },
        1,
        level,
      )
      suggested = Math.max(suggested, estimated.gold)
    }
    return {
      ...source,
      suggested: Math.max(1, Math.ceil(suggested)),
      purchase: false,
    } as ItemSuggestedPrice
  })
  const estimated = catalogItem ? upgradeEstimate(catalogItem, 1, level) : null
  // A level too unlikely to estimate has no buy-and-upgrade price.
  if (estimated && !estimated.unlikely) {
    sources.push({
      monsterId: '__buy__',
      monsterName: level > 0 ? 'buy + upgrade' : 'buy',
      sprite: null,
      rate: level > 0 ? 0.9 : 1,
      quantity: 1,
      kills: estimated.attempts,
      goldPerKill: 0,
      suggested: Math.max(1, estimated.gold),
      paths: [],
      purchase: true,
      attempts: estimated.attempts,
      scrolls: estimated.scrolls,
    })
  }
  sources.sort((a, b) => a.suggested - b.suggested || a.monsterName.localeCompare(b.monsterName))
  return {
    suggested: sources[0]?.suggested || defaultPrice,
    defaultPrice,
    sources,
  }
}
