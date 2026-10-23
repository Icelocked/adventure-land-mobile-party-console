import { useState } from 'react'
import { emptyMarketFilter, parseMarketFilter, type MarketFilter, type MarketRow } from '@/lib/marketFilter'

/** The console's per-tab filter key (market-filter-bar.tsx useStoredMarketFilter). */
const storageKey = (tab: string) => `party-market-filter-${tab}`

function readFilter(tab: string): MarketFilter {
  try {
    return parseMarketFilter(localStorage.getItem(storageKey(tab)))
  } catch {
    return emptyMarketFilter
  }
}

/** A per-viewer filter for each tab, kept in browser storage like the console's. */
export function useStoredMarketFilter(tab: string) {
  const [filters, setFilters] = useState<Record<string, MarketFilter>>({})
  const filter = filters[tab] ?? readFilter(tab)
  const set = (next: MarketFilter) => {
    setFilters((previous) => ({ ...previous, [tab]: next }))
    try {
      localStorage.setItem(storageKey(tab), JSON.stringify(next))
    } catch {
      // Private browsing can block storage; the filter still applies this session.
    }
  }
  return [filter, set] as const
}

/** The newest firstSeenAt the coordinator stamped on any of the entries. */
export function latestSeen(entries: readonly object[]): number | null {
  let latest: number | null = null
  for (const entry of entries) {
    const at: unknown = Reflect.get(entry, 'firstSeenAt')
    if (typeof at === 'number' && (latest === null || at > latest)) latest = at
  }
  return latest
}

type CatalogEntry = { name?: string; meta?: { definition?: Record<string, unknown> } | null }
/** The filter's view of a listing: display name, key, level, unit price and tier from G.items. */
export function marketRowFor(entry: CatalogEntry | undefined, item: { name: string; level?: number | null }, price: number | null | undefined, firstSeenAt: number | null): MarketRow {
  const tier = entry?.meta?.definition?.tier
  return {
    name: entry?.name || item.name,
    key: item.name,
    level: Number(item.level) || 0,
    price: typeof price === 'number' ? price : null,
    tier: typeof tier === 'number' ? tier : null,
    firstSeenAt,
  }
}
