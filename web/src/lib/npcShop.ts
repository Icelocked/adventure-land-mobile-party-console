/** Ponty and Ron standing buy orders, from the console fork's
 *  dashboard/features/party/npc-shop-dialog.tsx (live build 2db4d763). */
import type { MarketListing } from '@/models'

export type NpcShopNpc = 'ponty' | 'ron'
/** One NPC stock entry. Ponty's come from market `ponty.listings`, Ron's from `npcShop.ron.listings`. */
export type NpcShopOffer = Pick<MarketListing, 'item' | 'quantity' | 'price'> & {
  rid?: string
  unitPrice: number
  serverRegion?: string
  serverIdentifier?: string
}
export interface NpcShopOrder {
  id: string
  npc: NpcShopNpc
  item: string
  level: number
  mode: 'count' | 'all'
  quantity: number
  maxUnitPrice: number
  bought: number
  spent: number
  status: 'active' | 'done' | 'stopped'
}
/** market `npcShop` (runtime/coordinator/commerce/npc-shop.ts). */
export interface NpcShopView {
  orders: NpcShopOrder[]
  settings: { goldReserve: number; ronDonation: boolean; ronVisitMinutes: number }
  ron?: { listings: NpcShopOffer[]; updatedAt?: number; error?: string | null } | null
  ronVisitedAt?: number
  merchantRealm: string | null
  spendable: number
}
export interface NpcShopRow {
  key: string
  name: string
  level: number
  copies: number
  low: number
}

/** Groups one NPC's stock by item and level, with the cheapest unit price. */
export function npcShopRows(offers: NpcShopOffer[]): NpcShopRow[] {
  const groups = new Map<string, NpcShopRow>()
  for (const offer of offers) {
    const level = Number(offer.item.level) || 0
    const key = `${offer.item.name}@${level}`
    const row = groups.get(key) ?? { key, name: offer.item.name, level, copies: 0, low: Infinity }
    row.copies += offer.quantity
    row.low = Math.min(row.low, offer.unitPrice)
    groups.set(key, row)
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name) || a.level - b.level)
}

/** The Ponty tab shows only listings on the merchant's realm (`serverRegion` + `serverIdentifier`, e.g. "USIII"). */
export function npcShopOffers(npc: NpcShopNpc, pontyListings: NpcShopOffer[], shop: Pick<NpcShopView, 'merchantRealm' | 'ron'> | null | undefined): NpcShopOffer[] {
  if (npc === 'ron') return shop?.ron?.listings ?? []
  return pontyListings.filter((entry) => `${entry.serverRegion}${entry.serverIdentifier}` === shop?.merchantRealm)
}
