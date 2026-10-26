/** Ponty and Ron watches and buy-now orders, from the console fork's
 *  dashboard/features/party/npc-shop-dialog.tsx (topic15/ponty-ron-buys). */
import type { MarketListing } from '@/models'

export type NpcShopNpc = 'ponty' | 'ron'
/** One entry of Ron's last-visit stock (`npcShop.ron.listings`). */
export type NpcShopOffer = Pick<MarketListing, 'item' | 'quantity' | 'price'> & {
  rid: string
  unitPrice: number
  firstSeenAt?: number
}
export interface NpcShopOrder {
  id: string
  npc: NpcShopNpc
  kind: 'watch' | 'now'
  item: string
  levelMin: number
  levelMax: number
  /** null keeps a watch buying until the user stops it. */
  quantity: number | null
  spendCap: number | null
  bought: number
  spent: number
  status: 'active' | 'paused' | 'done' | 'stopped'
  lastBoughtAt?: number
  lastRealm?: string
}
/** market `npcShop` (runtime/coordinator/commerce/npc-shop.ts npcShopView). */
export interface NpcShopView {
  orders: NpcShopOrder[]
  settings: { goldReserve: number; ronDonation: boolean; ronVisitMinutes: number }
  ron?: { listings: NpcShopOffer[]; updatedAt?: number; error?: string | null } | null
  ronVisitedAt?: number
  merchantRealm: string | null
  spendable: number
}
/** The body of POST /party-api/npc-shop/orders. */
export interface NpcShopOrderRequest {
  npc: NpcShopNpc
  kind: 'watch' | 'now'
  item: string
  levelMin: number
  levelMax: number
  quantity: number | null
  spendCap: number | null
}

export const gold = (value: number) => `${value.toLocaleString()}g`

export function orderLevels(order: Pick<NpcShopOrder, 'levelMin' | 'levelMax'>): string {
  return order.levelMin === order.levelMax ? `+${order.levelMin}` : `+${order.levelMin} to +${order.levelMax}`
}

export function orderSummary(order: NpcShopOrder, name: string): string {
  const cap = order.spendCap !== null ? ` · cap ${gold(order.spendCap)}` : ''
  return `${name} ${orderLevels(order)} · ${order.npc === 'ponty' ? 'Ponty' : 'Ron'} · ${order.kind === 'watch' ? 'watch' : 'buy now'}${cap}`
}

export function orderProgress(order: NpcShopOrder): string {
  const target = order.quantity !== null ? `/${order.quantity}` : ' (until stopped)'
  const last = order.lastBoughtAt ? ` · last ${new Date(order.lastBoughtAt).toLocaleTimeString()}${order.lastRealm ? ` on ${order.lastRealm}` : ''}` : ''
  return `${order.bought}${target} bought · ${gold(order.spent)} spent${last} · ${order.status}`
}
