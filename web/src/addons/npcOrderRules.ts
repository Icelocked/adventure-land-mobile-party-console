// The NPC Orders add-on's order list and buy rule as its dialog reads them (console
// runtime/addons/npc-orders/orders.ts). The list lives in the add-on's `orders` records setting;
// the bought counts and tried lots live in its party store.

export const NPC_ORDERS = 'npc-orders'
export type Npc = 'ponty' | 'ron'
// One standing order. `count` holds X for "Buy X" and 0 for "Buy all"; `level` is unset for an item
// with no level; `stopped` marks an order the player paused.
export interface Order {
  id: string
  npc: Npc
  item: string
  level?: number
  count: number
  maxPrice: number
  stopped?: boolean
}
// One lot, a Ponty listing or a lot on Ron's list. A Ponty lot's realm is "<region><identifier>".
export interface StockRow {
  key: string
  rid: string
  item: string
  level: number | null
  quantity: number
  unitPrice: number
  realm?: string
}
export type Plan = { buy: StockRow; quantity: number } | { wait: string }
export interface RonListed {
  rid: string
  name: string
  level: number | null
  quantity: number
  price: number
}

const whole = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value)

/** The rows a buy can run from. A row with no id gets its item's identity as its id. */
export function readOrders(value: unknown): Order[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((row): Order[] => {
    const o = (row ?? {}) as Record<string, unknown>
    if ((o.npc !== 'ponty' && o.npc !== 'ron') || typeof o.item !== 'string' || !o.item) return []
    if (!whole(o.count) || o.count < 0 || !whole(o.maxPrice) || o.maxPrice < 1) return []
    if (o.level !== undefined && !(whole(o.level) && o.level >= 0)) return []
    const level = o.level as number | undefined
    return [{
      id: typeof o.id === 'string' && o.id ? o.id : `${o.npc}:${o.item}@${level ?? ''}`, npc: o.npc, item: o.item,
      ...(level === undefined ? {} : { level }), count: o.count, maxPrice: o.maxPrice, ...(o.stopped === true ? { stopped: true } : {}),
    }]
  })
}

const sameItem = (order: Pick<Order, 'item' | 'level'>, item: string, level: number | null | undefined) => order.item === item && (order.level ?? null) === (level ?? null)

/** Replaces the item's order, so one item holds one order; the new id starts its count at zero. */
export function placeOrder(orders: readonly Order[], ask: Omit<Order, 'id' | 'stopped'>, id: string): Order[] {
  return [...orders.filter((order) => !(order.npc === ask.npc && sameItem(order, ask.item, ask.level))), { ...ask, id }]
}
export const stopOrder = (orders: readonly Order[], id: string): Order[] => orders.map((order) => (order.id === id ? { ...order, stopped: true } : order))
export const resumeOrder = (orders: readonly Order[], id: string): Order[] =>
  orders.map((order) =>
    order.id === id
      ? { id: order.id, npc: order.npc, item: order.item, ...(order.level === undefined ? {} : { level: order.level }), count: order.count, maxPrice: order.maxPrice }
      : order,
  )
export const removeOrder = (orders: readonly Order[], id: string): Order[] => orders.filter((order) => order.id !== id)

/** Ponty's lots from the `market.ponty` read; a row without `unitPrice` prices each copy at its `price`. */
export function pontyStock(listings: unknown): StockRow[] {
  if (!Array.isArray(listings)) return []
  return listings.flatMap((entry): StockRow[] => {
    const l = (entry ?? {}) as Record<string, unknown>
    const item = (l.item ?? {}) as Record<string, unknown>
    const unitPrice = Number(l.unitPrice ?? l.price)
    const quantity = Number(l.quantity ?? 1)
    if (typeof item.name !== 'string' || typeof l.rid !== 'string' || !(unitPrice > 0) || !(quantity > 0)) return []
    return [{
      key: String(l.key ?? l.rid), rid: l.rid, item: item.name, level: whole(item.level) ? item.level : null, quantity, unitPrice,
      realm: `${String(l.serverRegion ?? '')}${String(l.serverIdentifier ?? '')}`,
    }]
  })
}
/** Ron's lots, priced per copy. */
export const ronStock = (list: readonly RonListed[]): StockRow[] =>
  list.map((lot) => ({ key: lot.rid, rid: lot.rid, item: lot.name, level: lot.level, quantity: lot.quantity, unitPrice: lot.price / lot.quantity }))

/** The order's next buy: a lot that fits the copies still wanted, at or under the cap, paid by the
 *  gold above the reserve; the cheapest wins. With `gold` unknown the buy's own gold bound holds
 *  the reserve. */
export function nextPurchase(order: Order, stock: readonly StockRow[], gold: number | null, reserve: number, bought = 0, tried: readonly string[] = []): Plan {
  if (order.stopped) return { wait: 'Stopped' }
  const wanted = order.count === 0 ? Infinity : order.count - bought
  if (wanted <= 0) return { wait: 'Done' }
  const here = stock.filter((row) => sameItem(order, row.item, row.level) && !tried.includes(row.rid))
  if (!here.length) return { wait: order.npc === 'ron' ? "Not on Ron's last list" : 'None in stock' }
  const capped = here.filter((row) => row.unitPrice <= order.maxPrice)
  if (!capped.length) return { wait: `Over your ${order.maxPrice.toLocaleString()}g cap` }
  const sized = capped.filter((row) => row.quantity <= wanted)
  if (!sized.length) return { wait: `Every lot holds more than the ${wanted} still wanted` }
  const spendable = gold === null ? Infinity : Math.max(0, gold - reserve)
  const paid = sized.filter((row) => row.quantity * row.unitPrice <= spendable).sort((a, b) => a.unitPrice - b.unitPrice)
  if (!paid.length) return { wait: `The gold reserve keeps ${reserve.toLocaleString()}g` }
  return { buy: paid[0], quantity: paid[0].quantity }
}

/** Each order's bought copies by id, Ponty's and Ron's keys together. */
export const boughtOf = (party: Record<string, unknown>): Record<string, number> => ({
  ...((party.bought ?? {}) as Record<string, number>),
  ...((party.ronBought ?? {}) as Record<string, number>),
})
/** The Ponty lots a job already went for. */
export const triedOf = (party: Record<string, unknown>): string[] => (Array.isArray(party.tried) ? (party.tried as string[]) : [])
