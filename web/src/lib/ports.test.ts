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
