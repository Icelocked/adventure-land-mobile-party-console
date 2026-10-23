/** Copied from the console fork's dashboard/features/party/market-filter.ts
 *  (topic15/ponty-ron-buys); keep the two in step. */
/**
 * One filter for the Market tabs, the Ponty section and Ron's stock. Every
 * bound is inclusive. A row without the field a bound tests fails that bound,
 * except a missing level, which counts as +0 like an unupgraded item.
 */
export type MarketSort = 'newest' | 'price' | 'level'
export interface MarketFilter {
  keywords: string
  minLevel: number | null
  maxLevel: number | null
  minPrice: number | null
  maxPrice: number | null
  minTier: number | null
  maxTier: number | null
  sort: MarketSort
}
export interface MarketRow {
  name: string
  key: string
  level?: number | null
  price?: number | null
  tier?: number | null
  firstSeenAt?: number | null
}

export const emptyMarketFilter: MarketFilter = {
  keywords: '', minLevel: null, maxLevel: null, minPrice: null, maxPrice: null, minTier: null, maxTier: null, sort: 'newest',
}
const bounds = ['minLevel', 'maxLevel', 'minPrice', 'maxPrice', 'minTier', 'maxTier'] as const

function within(value: number | null | undefined, min: number | null, max: number | null): boolean {
  if (min === null && max === null) return true
  if (typeof value !== 'number' || !Number.isFinite(value)) return false
  return (min === null || value >= min) && (max === null || value <= max)
}

export function passesMarketFilter(row: MarketRow, filter: MarketFilter): boolean {
  const text = (row.name + ' ' + row.key).toLowerCase()
  const words = filter.keywords.toLowerCase().split(/\s+/).filter(Boolean)
  return (
    words.every((word) => text.includes(word)) &&
    within(row.level ?? 0, filter.minLevel, filter.maxLevel) &&
    within(row.price, filter.minPrice, filter.maxPrice) &&
    within(row.tier, filter.minTier, filter.maxTier)
  )
}

const sorts: Record<MarketSort, (a: MarketRow, b: MarketRow) => number> = {
  newest: (a, b) => (b.firstSeenAt ?? -Infinity) - (a.firstSeenAt ?? -Infinity) || 0,
  price: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || 0,
  level: (a, b) => (b.level ?? 0) - (a.level ?? 0),
}

/** Filters and sorts; rows that tie keep their input order. */
export function filterMarket<T>(entries: T[], filter: MarketFilter, row: (entry: T) => MarketRow): T[] {
  return entries
    .map((entry) => ({ entry, row: row(entry) }))
    .filter((pair) => passesMarketFilter(pair.row, filter))
    .sort((a, b) => sorts[filter.sort](a.row, b.row))
    .map((pair) => pair.entry)
}

/** Reads a filter saved in browser storage; a malformed field falls back to its default. */
export function parseMarketFilter(raw: string | null): MarketFilter {
  let value: Record<string, unknown> = {}
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    if (parsed && typeof parsed === 'object') value = parsed as Record<string, unknown>
  } catch {
    return emptyMarketFilter
  }
  const filter: MarketFilter = { ...emptyMarketFilter }
  if (typeof value.keywords === 'string') filter.keywords = value.keywords
  for (const field of bounds) {
    const bound = value[field]
    if (typeof bound === 'number' && Number.isFinite(bound)) filter[field] = bound
  }
  if (value.sort === 'price' || value.sort === 'level') filter.sort = value.sort
  return filter
}
