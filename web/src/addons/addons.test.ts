import { describe, expect, it } from 'vitest'
import { filterRows, normalize, parsePrice } from './marketFilters'
import { nextPurchase, placeOrder, pontyStock, readOrders, type Order } from './npcOrderRules'

// OWNERS-PORT-MAP.md B10: the shipped add-ons' rules the PWA's pieces run
// (market-filters/filters.ts, npc-orders/orders.ts).
describe('Market Filters', () => {
  it("reads the Market's price shorthand and drops empty fields", () => {
    expect([parsePrice('250k'), parsePrice('1.5m'), parsePrice('1,200'), parsePrice('cheap')]).toEqual([250_000, 1_500_000, 1_200, undefined])
    expect(normalize({ minLevel: undefined, server: '', newest: false })).toBeUndefined()
  })
  it('keeps rows inside every bound, reads no level as 0, and keeps the list order unless Newest first', () => {
    const rows = [{ id: 'a', level: 2, price: 10, seen: 1 }, { id: 'b', price: 50, seen: 3 }, { id: 'c', level: 1, seen: 2 }]
    expect(filterRows(rows, { maxLevel: 1 }, (row) => row).map((row) => row.id)).toEqual(['b', 'c'])
    expect(filterRows(rows, { minPrice: 5 }, (row) => row).map((row) => row.id)).toEqual(['a', 'b'])
    expect(filterRows(rows, { newest: true }, (row) => row).map((row) => row.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('NPC Orders', () => {
  const coat = (over: Partial<Order> = {}): Order => ({ id: 'o1', npc: 'ponty', item: 'coat', count: 2, maxPrice: 1000, ...over })
  it('keeps one order per item and drops rows a buy cannot run from', () => {
    expect(placeOrder([coat()], { npc: 'ponty', item: 'coat', count: 0, maxPrice: 900 }, 'o2')).toEqual([{ npc: 'ponty', item: 'coat', count: 0, maxPrice: 900, id: 'o2' }])
    expect(readOrders([{ npc: 'ponty', item: 'coat', count: 1, maxPrice: 5 }, { npc: 'shop', item: 'x', count: 1, maxPrice: 5 }]).map((order) => order.id)).toEqual(['ponty:coat@'])
  })
  it('buys the cheapest whole lot that fits the copies, the cap and the gold above the reserve', () => {
    const stock = pontyStock([
      { rid: 'a', item: { name: 'coat' }, quantity: 1, unitPrice: 900, serverRegion: 'US', serverIdentifier: 'I' },
      { rid: 'b', item: { name: 'coat' }, quantity: 1, unitPrice: 800, serverRegion: 'EU', serverIdentifier: 'I' },
      { rid: 'c', item: { name: 'coat' }, quantity: 3, unitPrice: 100 },
    ])
    const plan = nextPurchase(coat(), stock, 5_000, 0)
    expect('buy' in plan && [plan.buy.rid, plan.buy.realm]).toEqual(['b', 'EUI'])
    expect(nextPurchase(coat(), stock, 1_000, 500)).toEqual({ wait: 'The gold reserve keeps 500g' })
    expect(nextPurchase(coat({ maxPrice: 50 }), stock, null, 0)).toEqual({ wait: 'Over your 50g cap' })
    expect(nextPurchase(coat(), stock, null, 0, 2)).toEqual({ wait: 'Done' })
  })
})
