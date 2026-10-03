import type { CatalogItem, InventoryEntry, Item, MerchantBuyItem } from '@/models'

/** aldata-listing.tsx. */
export interface AlDataListing {
  key: string
  source?: 'aldata'
  seller: string
  slot?: string
  serverRegion: string
  serverIdentifier: string
  map: string
  x?: number
  y?: number
  lastSeen?: string
  seenAt: number
  price: number
  quantity: number
  item: Item & { data?: unknown }
  groupedListings?: AlDataListing[]
}
/** aldata-buy-order.ts. */
export interface AlDataBuyOrder {
  key: string
  source?: 'aldata'
  buyer: string
  slot?: string
  serverRegion: string
  serverIdentifier: string
  map: string
  seenAt: number
  price: number
  quantity: number
  item: Item
}
/** ponty-listing.ts. */
export interface PontyListing {
  key: string
  rid?: string
  item: Item
  quantity: number
  unitPrice: number
  price: number
  groupKey?: string
  serverRegion?: string
  serverIdentifier?: string
  seenAt?: number
  keys?: string[]
  realmLabel?: string
  minimumLot?: number
}
/** aldata-public-trade.ts. */
export interface AlDataPublicTrade {
  owner: string
  label?: string
  characters?: string[]
  lastUpdated?: number
  listings?: {
    name: string
    level?: number
    p?: string
    note?: string
    wts?: { price?: number; quantity?: number; priceNegotiable?: boolean }
    wtb?: { price?: number; quantity?: number; priceNegotiable?: boolean }
  }[]
}
export interface BlacklistRecord {
  reason?: string
  until?: number
  [field: string]: unknown
}

// stand-sheet.tsx, verbatim logic from here down.

/** The value a listing is judged against: the cheapest of the farm-price
 *  sources and the vendor cost, never below the item's own value. */
export function dealValuesByItem(catalog: CatalogItem[], buyable: MerchantBuyItem[]) {
  const buyableById = new Map(buyable.map((item) => [item.id, item]))
  return new Map(
    catalog.map((item) => {
      const definition = item.meta?.definition || {}
      const defaultPrice = Math.max(1, Number(definition.g) || 1)
      const candidates = (item.meta?.world?.suggestedPrices || []).map((source) => Math.max(defaultPrice, Number(source.suggested) || defaultPrice))
      const vendor = buyableById.get(item.id)
      if (vendor) candidates.push(Math.max(1, Number(vendor.cost) || defaultPrice))
      return [item.id, candidates.length ? Math.min(...candidates) : defaultPrice] as const
    }),
  )
}

/** Same seller/realm/map/price/identity listings become one row with the
 *  quantity summed; purchases are split back across them. */
export function groupAlData(listings: AlDataListing[]): AlDataListing[] {
  const groups = new Map<string, AlDataListing[]>()
  listings.forEach((entry) => {
    const identity = JSON.stringify({
      name: entry.item.name,
      level: Number(entry.item.level) || 0,
      p: entry.item.p || null,
      stat_type: entry.item.stat_type || null,
      data: entry.item.data || null,
    })
    const key = `${entry.seller}|${entry.serverRegion}|${entry.serverIdentifier}|${entry.map}|${entry.price}|${identity}`
    groups.set(key, [...(groups.get(key) || []), entry])
  })
  return [...groups.values()].map((members) => ({
    ...members[0],
    key: members.map((entry) => entry.key).join('|'),
    quantity: members.reduce((sum, entry) => sum + Math.max(1, Number(entry.quantity) || 1), 0),
    groupedListings: members,
  }))
}

/** Fresh first (seen within 2 minutes of the 30 s market cutoff), then price. */
export function filterAlData(grouped: AlDataListing[], query: string, now: number, nameFor: (id: string) => string | undefined) {
  const marketCutoff = Math.floor(now / 30000) * 30000
  const text = query.trim().toLowerCase()
  return grouped
    .filter((entry) => `${nameFor(entry.item.name) || ''} ${entry.item.name} ${entry.seller} ${entry.serverRegion} ${entry.serverIdentifier}`.toLowerCase().includes(text))
    .sort((a, b) => Number(b.seenAt >= marketCutoff - 120000) - Number(a.seenAt >= marketCutoff - 120000) || a.price - b.price)
}

export function blacklistRecord(blacklist: Record<string, BlacklistRecord>, autoBlacklistMerchants: boolean, now: number, seller: string, region: string, identifier: string) {
  const exact = blacklist[`${seller}|${region}|${identifier}`]
  const wildcard = blacklist[`${seller}||`]
  return [exact, wildcard].find((record) => record && (autoBlacklistMerchants || record.reason === 'manual') && (record.until === -1 || Number(record.until) > now))
}

export const ownedKey = (item: Item) => `${item.name}@${item.level || 0}@${item.p || ''}`

/** How many of each exact item the merchant and the bank hold. */
export function ownedCounts(merchantItems: (InventoryEntry | null)[], bankPacks: Record<string, (InventoryEntry | null)[]>) {
  const owned = new Map<string, number>()
  const add = (entry: InventoryEntry | null) => {
    if (!entry?.item) return
    const key = ownedKey(entry.item)
    owned.set(key, (owned.get(key) || 0) + Number(entry.item.q || 1))
  }
  Object.values(bankPacks).flat().forEach(add)
  merchantItems.forEach(add)
  return owned
}

/** Where to list an owned copy from: the merchant first, then the bank. */
export function ownedSource(item: Item, merchantItems: (InventoryEntry | null)[], bankPacks: Record<string, (InventoryEntry | null)[]>): { entry: InventoryEntry; bankPack?: string } | null {
  const merchantEntry = merchantItems.find((entry) => entry?.item && ownedKey(entry.item) === ownedKey(item))
  if (merchantEntry) return { entry: merchantEntry }
  for (const [bankPack, entries] of Object.entries(bankPacks)) {
    const entry = entries.find((candidate) => candidate?.item && ownedKey(candidate.item) === ownedKey(item))
    if (entry) return { entry, bankPack }
  }
  return null
}

export function filterBuyOrders(orders: AlDataBuyOrder[], query: string, now: number, hideUnowned: boolean, owned: Map<string, number>, nameFor: (id: string) => string | undefined) {
  const marketCutoff = Math.floor(now / 30000) * 30000
  const text = query.trim().toLowerCase()
  return orders
    .filter((order) => !hideUnowned || (owned.get(ownedKey(order.item)) || 0) > 0)
    .filter((order) => `${nameFor(order.item.name) || ''} ${order.item.name} ${order.buyer} ${order.serverRegion} ${order.serverIdentifier}`.toLowerCase().includes(text))
    .sort((a, b) => Number(b.seenAt >= marketCutoff - 120000) - Number(a.seenAt >= marketCutoff - 120000) || b.price - a.price)
}

export type PontyGroup = PontyListing & { realms: Set<string>; stale: boolean }

/** Ponty listings (no PVP) grouped by groupKey and freshness: quantities
 *  summed, the highest unit price kept, and the smallest lot as the minimum. */
export function groupPonty(listings: PontyListing[], query: string, now: number, nameFor: (id: string) => string | undefined): PontyGroup[] {
  const text = query.trim().toLowerCase()
  const filtered = listings
    .filter((listing) => listing.serverIdentifier !== 'PVP' && `${nameFor(listing.item.name) || ''} ${listing.item.name}`.toLowerCase().includes(text))
    .sort((a, b) => a.unitPrice - b.unitPrice || a.item.name.localeCompare(b.item.name))
  const freshCutoff = now - 120000
  const groups = new Map<string, PontyGroup>()
  filtered.forEach((listing) => {
    const stale = !listing.seenAt || listing.seenAt <= freshCutoff
    const key = `${listing.groupKey || listing.key}|${stale ? 'stale' : 'fresh'}`
    const realm = `${listing.serverRegion || '?'} ${listing.serverIdentifier || '?'}`
    const existing = groups.get(key)
    if (existing) {
      existing.quantity += listing.quantity
      existing.keys!.push(listing.key)
      existing.realms.add(realm)
      existing.unitPrice = Math.max(existing.unitPrice, listing.unitPrice)
      existing.minimumLot = Math.min(existing.minimumLot!, listing.quantity)
      existing.seenAt = Math.max(existing.seenAt || 0, listing.seenAt || 0)
    } else groups.set(key, { ...listing, key, stale, keys: [listing.key], realms: new Set([realm]), minimumLot: listing.quantity })
  })
  return [...groups.values()]
}

/** "deal · N% off" / "N% above" / "N% below" / "at suggested". */
export function priceComparison(price: number, suggested: number) {
  const deal = price < suggested * 0.5
  const badDeal = price > suggested * 2
  const dealDiscount = Math.max(0, Math.round((1 - price / suggested) * 100))
  const priceDifference = Math.round(Math.abs(price / suggested - 1) * 100)
  const comparison = deal ? `deal · ${dealDiscount}% off` : price > suggested ? `${priceDifference}% above` : price < suggested ? `${priceDifference}% below` : 'at suggested'
  return { deal, badDeal, comparison }
}
