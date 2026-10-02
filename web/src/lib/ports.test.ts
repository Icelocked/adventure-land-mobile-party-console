import { describe, expect, it } from 'vitest'
import { routineFor } from './routineLabels'
import { bankSaleCopies, same } from './bankSaleCopies'
import { recoveryDelay } from './dashboardRecovery'
import { automaticCommerceRuleKey } from '@/models'

// Golden tests: expected values worked by hand from the party-console
// v1.2.0 sources each module is ported from.
describe('routineFor (merchant/routines.ts)', () => {
  it('names exchange jobs by whether they are automatic', () => {
    expect(routineFor({ reason: 'exchange', autoExchangeKeys: ['gem0@0'] })).toBe('automatic exchange')
    expect(routineFor({ reason: 'exchange' })).toBe('manual exchange')
  })
  it('prefers an explicit routine, then purchase/commerce rules, then aliases', () => {
    expect(routineFor({ reason: 'merchant commerce', routine: 'manual crafting' })).toBe('manual crafting')
    expect(routineFor({ reason: 'stand bid purchases', bidItemId: 'x' })).toBe('stand bid purchases')
    expect(routineFor({ reason: 'stand purchases' })).toBe('manual marketplace purchases')
    expect(routineFor({ reason: 'merchant commerce', order: { crafts: [{}] } })).toBe('manual crafting')
    expect(routineFor({ reason: 'merchant commerce', order: { crafts: [] } })).toBe('manual buying')
    expect(routineFor({ reason: 'marked items' })).toBe('party collection')
    expect(routineFor({ reason: 'restock' })).toBe('restock')
  })
})

describe('same / bankSaleCopies (same.tsx, bank-sale-copies.ts)', () => {
  it('ignores quantity but nothing else', () => {
    expect(same({ name: 'a', level: 1, q: 5 }, { name: 'a', level: 1, q: 2 })).toBe(true)
    expect(same({ name: 'a', level: 1 }, { name: 'a', level: 2 })).toBe(false)
  })
  it('collects unlocked copies across bank packs and bankbois', () => {
    const selected = { slot: 0, item: { name: 'ore', q: 3 } }
    const copies = bankSaleCopies(
      { gold: 0, packs: { items1: [selected, { slot: 1, item: { name: 'ore', q: 1, l: 'l' } }, null] } },
      [{ name: 'B0', state: 'idle', items: [{ slot: 4, item: { name: 'ore', q: 9 } }] }],
      selected,
    )
    expect(copies.map((copy) => `${copy.pack}:${copy.entry.slot}`)).toEqual(['items1:0', 'bankboi:B0:4'])
  })
})

describe('recoveryDelay (dashboard-recovery.ts)', () => {
  it('retries every second, then backs off to a minute', () => {
    expect([0, 9, 10, 11, 15, 30].map(recoveryDelay)).toEqual([1000, 1000, 2000, 4000, 60000, 60000])
  })
})

describe('automaticCommerceRuleKey (automatic-commerce-rule-key.tsx)', () => {
  it('normalises level and missing fields', () => {
    expect(automaticCommerceRuleKey({ name: 'ore' })).toBe('{"name":"ore","level":0,"p":null,"stat_type":null}')
    expect(automaticCommerceRuleKey({ name: 'bow', level: -2, stat_type: 'dex' })).toBe('{"name":"bow","level":0,"p":null,"stat_type":"dex"}')
  })
})

import { abbreviatedGold, goldTotals, partyGoldNames } from './gold'

describe('abbreviatedGold / partyGoldNames / goldTotals (abbreviated-gold.tsx, party-gold.tsx)', () => {
  it('abbreviates like the dashboard header', () => {
    expect([99_999, 100_000, 12_345_678, 2_500_000_000].map(abbreviatedGold)).toEqual(['99,999', '100.0K', '12.346m', '2.500b'])
  })
  it('counts only loaded, non-bankboi slots', () => {
    const names = partyGoldNames({
      activeSlots: [
        { index: 0, kind: 'headless', character: 'A', state: 'online' },
        { index: 1, kind: 'headless', character: 'B', state: 'offline' },
        { index: 2, kind: 'headless', character: 'C', state: 'online' },
        { index: 3, kind: 'headless', character: null, state: 'empty' },
      ],
      bankbois: [{ name: 'C', state: 'idle' }],
    })
    expect(names).toEqual(['A'])
  })
  it('is unknown while any balance is unknown', () => {
    expect(goldTotals(100, [1, 2])).toEqual({ carried: 3, total: 103 })
    expect(goldTotals(100, [1, undefined])).toEqual({ carried: null, total: null })
    expect(goldTotals(null, [1])).toEqual({ carried: 1, total: null })
  })
})

import { orderCharacters } from './characterOrder'

describe('orderCharacters (runtime/roster/character-order.ts)', () => {
  it('puts the primary first, then Steam, then headless, merchants last', () => {
    const chars = [{ name: 'M', ctype: 'merchant' }, { name: 'H', ctype: 'ranger' }, { name: 'S', ctype: 'mage' }, { name: 'P', ctype: 'priest' }]
    expect(orderCharacters(chars, [], 'P', 'M', ['S']).map((c) => c.name)).toEqual(['P', 'S', 'H', 'M'])
  })
  it('breaks ties by roster order, then name', () => {
    const chars = [{ name: 'B' }, { name: 'A' }, { name: 'C' }]
    expect(orderCharacters(chars, [{ name: 'C' }, { name: 'B' }], null, null).map((c) => c.name)).toEqual(['C', 'B', 'A'])
  })
})
