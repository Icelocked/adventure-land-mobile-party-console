import { describe, expect, it } from 'vitest'
import { orderLevels, orderProgress, orderSummary, type NpcShopOrder } from './npcShop'

// Labels follow the console fork's dashboard/features/party/npc-shop-dialog.tsx
// OrderRow (topic15/ponty-ron-buys).

const order = (fields: Partial<NpcShopOrder>): NpcShopOrder => ({
  id: 'npc-order-1', npc: 'ponty', kind: 'watch', item: 'stramulet', levelMin: 0, levelMax: 0, quantity: 300,
  spendCap: null, bought: 0, spent: 0, status: 'active', ...fields,
})

describe('watch labels', () => {
  it('names one level or a level range', () => {
    expect(orderLevels(order({}))).toBe('+0')
    expect(orderLevels(order({ levelMin: 0, levelMax: 2 }))).toBe('+0 to +2')
  })

  it('summarises the shop, kind and spend cap', () => {
    expect(orderSummary(order({}), 'Amulet of Strength')).toBe('Amulet of Strength +0 · Ponty · watch')
    expect(orderSummary(order({ npc: 'ron', kind: 'now', spendCap: 50000 }), 'Ring')).toBe('Ring +0 · Ron · buy now · cap 50,000g')
  })

  it('shows progress against a target or until stopped, with the last purchase and its realm', () => {
    expect(orderProgress(order({ bought: 12, spent: 60000 }))).toBe('12/300 bought · 60,000g spent · active')
    const last = new Date(2026, 9, 22, 9, 30).getTime()
    expect(orderProgress(order({ quantity: null, bought: 2, spent: 10, status: 'paused', lastBoughtAt: last, lastRealm: 'USIII' }))).toBe(
      `2 (until stopped) bought · 10g spent · last ${new Date(last).toLocaleTimeString()} on USIII · paused`,
    )
  })
})
