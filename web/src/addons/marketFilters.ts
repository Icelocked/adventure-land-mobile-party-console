import { useState } from 'react'

// The Market Filters add-on's value and row test (console runtime/addons/market-filters/filters.ts).
// The value is one object per Market tab.

export const MARKET_FILTERS = 'market-filters'

// The row fields the bar reads (console addon-kit.ts AddonListRow).
export interface MarketRow {
  level?: number
  grade?: number
  price?: number
  seen?: number
  realm?: string
}

export interface MarketFilter {
  minLevel?: number
  maxLevel?: number
  minPrice?: number
  maxPrice?: number
  // A row's realm as the Market writes it, "<region> <identifier>", such as "US I".
  server?: string
  // The game's item grade, 0 to 4, which the Market shows as the item name's colour.
  grade?: number
  // Newest first sorts the tab by when the Market last saw each row.
  newest?: boolean
}

const FIELDS = ['minLevel', 'maxLevel', 'minPrice', 'maxPrice', 'server', 'grade', 'newest'] as const

// The names the game gives grades 0 to 4.
export const GRADE_NAMES = ['Normal', 'High', 'Rare', 'Legendary', 'Exotic'] as const

/** Drops empty fields and an unticked Newest first; undefined when none is left, so the tab shows every row. */
export function normalize(value: MarketFilter | undefined): MarketFilter | undefined {
  if (!value || typeof value !== 'object') return undefined
  const kept: MarketFilter = {}
  for (const field of FIELDS) {
    const entry = value[field] as unknown
    if (entry === undefined || entry === null || entry === '' || entry === false || (typeof entry === 'number' && !Number.isFinite(entry))) continue
    ;(kept as Record<string, unknown>)[field] = entry
  }
  return Object.keys(kept).length ? kept : undefined
}

/** Reads the Market's price shorthand: "250k" is 250,000 and "1.5m" is 1,500,000. Commas and
 *  spaces are ignored. Anything else reads as no bound. */
export function parsePrice(text: string): number | undefined {
  const match = /^(\d+(?:\.\d+)?)([kmb]?)$/i.exec(text.replace(/[,\s]/g, ''))
  if (!match) return undefined
  const scale = { '': 1, k: 1e3, m: 1e6, b: 1e9 }[match[2].toLowerCase() as '' | 'k' | 'm' | 'b']
  return Math.round(Number(match[1]) * scale)
}

export function parseLevel(text: string): number | undefined {
  return /^\d+$/.test(text.trim()) ? Number(text.trim()) : undefined
}

/** Tests one row against the value. A row with no level takes no upgrade, so a level bound reads
 *  it as level 0. A row with no price, realm or grade fails a bound on that field. */
export function keep(row: MarketRow, raw: MarketFilter | undefined): boolean {
  const value = normalize(raw)
  if (!value) return true
  const level = row.level ?? 0
  if (value.minLevel !== undefined && level < value.minLevel) return false
  if (value.maxLevel !== undefined && level > value.maxLevel) return false
  if (value.minPrice !== undefined && (row.price === undefined || row.price < value.minPrice)) return false
  if (value.maxPrice !== undefined && (row.price === undefined || row.price > value.maxPrice)) return false
  if (value.server !== undefined && row.realm !== value.server) return false
  if (value.grade !== undefined && row.grade !== value.grade) return false
  return true
}

/** Puts the most recently seen row first while Newest first is ticked; a row with no seen time goes last. */
export function order(a: MarketRow, b: MarketRow, raw: MarketFilter | undefined): number {
  if (!normalize(raw)?.newest) return 0
  return (b.seen ?? -Infinity) - (a.seen ?? -Infinity) || 0
}

/** The grades the tab's rows carry, lowest first. */
export function grades(rows: readonly MarketRow[]): number[] {
  return [...new Set(rows.flatMap((row) => (row.grade === undefined ? [] : [row.grade])))].sort((a, b) => a - b)
}

/** The realms the tab's rows come from, in name order. Classifieds carry no realm. */
export function servers(rows: readonly MarketRow[]): string[] {
  return [...new Set(rows.flatMap((row) => (row.realm ? [row.realm] : [])))].sort()
}

/** Keeps the rows the value passes and orders them; ties keep the list's own order. */
export function filterRows<T>(entries: readonly T[], value: MarketFilter | undefined, row: (entry: T) => MarketRow): T[] {
  if (!normalize(value)) return [...entries]
  return entries
    .map((entry, index) => ({ entry, index, row: row(entry) }))
    .filter((pair) => keep(pair.row, value))
    .sort((a, b) => order(a.row, b.row, value) || a.index - b.index)
    .map((pair) => pair.entry)
}

const storageKey = (tab: string) => `party-console-companion:market-filters-${tab}`
function read(tab: string): MarketFilter | undefined {
  try {
    return normalize(JSON.parse(localStorage.getItem(storageKey(tab)) ?? 'null') as MarketFilter | undefined)
  } catch {
    return undefined
  }
}

/** Each tab's value. The console's slot keeps it while the Market stays open; the PWA also keeps
 *  it on this device, since a phone reloads the page more often. */
export function useMarketFilterValue(tab: string) {
  const [values, setValues] = useState<Record<string, MarketFilter | undefined>>({})
  const value = tab in values ? values[tab] : read(tab)
  const set = (next: MarketFilter | undefined) => {
    setValues((previous) => ({ ...previous, [tab]: next }))
    try {
      if (next) localStorage.setItem(storageKey(tab), JSON.stringify(next))
      else localStorage.removeItem(storageKey(tab))
    } catch {
      // Storage unavailable: the value still applies this visit.
    }
  }
  return [value, set] as const
}
