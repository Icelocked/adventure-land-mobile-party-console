import { describe, expect, it } from 'vitest'
import { aggregateSlotTracking } from './luckySlot'
import { blacklistRecord, groupAlData, groupPonty, priceComparison } from './market'
import { compactInventory, itemActionBanner } from './itemActionBanner'
import { suggestedItemValue, upgradeEstimate, UPGRADE_CHANCES } from './suggestedItemValue'
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

import { merchantJobLabel } from './merchantJobLabel'
import { merchantPartyGroups } from './partyGroups'
import { durationLabel } from './duration'

describe('merchantJobLabel / merchantPartyGroups / durationLabel', () => {
  it('labels jobs like the dashboard', () => {
    expect(merchantJobLabel({ target: 'A', reason: 'restock' })).toBe('Party restock')
    expect(merchantJobLabel({ target: 'A', reason: 'x', operationStage: 'retrieving' })).toBe('Bank retrieval')
    expect(merchantJobLabel({ target: 'A', reason: 'join giveaway', seller: 'Gen', expectedItem: { name: 'gem0' } }, [{ id: 'gem0', name: 'Green Gem' }])).toBe("Join Gen's giveaway for Green Gem")
    expect(merchantJobLabel({ target: 'A', reason: 'merchant commerce', order: { buys: [{ desiredLevel: 2 }] } })).toBe('Buy and upgrade')
  })
  it('groups followers under the leader, skipping the merchant and bankbois', () => {
    expect(merchantPartyGroups({ leader: 'L', followers: { F: true }, merchantCharacter: 'M', bankbois: [{ name: 'B' }] }, ['F', 'L', 'S', 'M', 'B'])).toEqual([
      { id: 'L', members: ['L', 'F'] },
      { id: 'S', members: ['S'] },
    ])
  })
  it('formats durations', () => {
    expect([null, 0, 125_000, 3_600_500].map(durationLabel)).toEqual(['Active', 'Expiring', '2m 5s', '1h 1s'])
  })
})

import { conflictingItems, describeRule, itemRuleConflicts } from './ruleConflicts'
import { emptyPartyStateDynamic } from '@/models'

describe('itemRuleConflicts / conflictingItems / describeRule (shared-rules.ts, shared-rule-conflicts.tsx)', () => {
  const key = automaticCommerceRuleKey({ name: 'ore' })
  const shared = { ...emptyPartyStateDynamic(), merchantCharacter: 'M', merchantRules: { version: 1 as const, owner: 'M', members: ['A'], conflicts: [] } }
  it('flags an item two shared rules would both act on', () => {
    const state = { ...shared, autoNpcSales: { [key]: { item: { name: 'ore' } } }, autoStandMarks: { [key]: { item: { name: 'ore' }, price: 5 } } }
    expect(itemRuleConflicts(state, { name: 'ore' })).toEqual(['NPC sale', 'Stand sale'])
    expect(conflictingItems(state).map((row) => row.item.name)).toEqual(['ore'])
  })
  it('ignores items outside shared mode or with a single rule', () => {
    expect(itemRuleConflicts({ ...emptyPartyStateDynamic(), autoNpcSales: { [key]: { item: { name: 'ore' } } } }, { name: 'ore' })).toEqual([])
    expect(itemRuleConflicts({ ...shared, autoNpcSales: { [key]: { item: { name: 'ore' } } } }, { name: 'ore' })).toEqual([])
  })
  it('describes rule values', () => {
    expect(describeRule({ tiers: 3, quantity: -1 })).toBe('3 upgrade levels · Unlimited')
    expect(describeRule({ targetTier: 4, quantity: 2 })).toBe('Compound to +4 · 2 remaining')
    expect(describeRule({ price: 12000 })).toBe('12,000g')
    expect(describeRule({})).toBe('Automatic rule')
  })
})

describe('item-action-banner.ts', () => {
  it('ranks manual marks over automatic, delivery over bank, and drops merchant marks on the merchant', () => {
    expect(itemActionBanner([{ action: 'bank', label: 'Bank' }, { action: 'stand', automatic: true, label: 'Auto stand' }, { action: 'upgrade', label: '+0 → +1' }], false)?.label).toBe('+0 → +1')
    expect(itemActionBanner([{ action: 'bank', label: 'Bank' }, { action: 'delivery', label: 'To X' }], false)?.label).toBe('To X')
    expect(itemActionBanner([{ action: 'merchant', label: 'Mark for merchant' }], true)).toBeNull()
  })
  it('flags two automatic families as a rule conflict, but not two processing rules', () => {
    const conflict = itemActionBanner([{ action: 'npc', automatic: true, label: 'NPC sale' }, { action: 'deconstruction', automatic: true, label: 'Auto deconstruction' }], true)
    expect(conflict).toMatchObject({ label: 'Rule conflict', title: 'npc · deconstruction', border: 'border-red-400' })
    expect(itemActionBanner([{ action: 'upgrade', automatic: true, label: 'Auto → +3' }, { action: 'compound', automatic: true, label: 'Auto compound → +2' }], true)?.label).toBe('Auto → +3')
  })
})

describe('suggested-item-value.tsx / upgrade-estimate.tsx', () => {
  it('a plain buy is one item at cost; precomputed sources never fall below the item value', () => {
    expect(upgradeEstimate({ id: 'x', name: 'x', cost: 50, seller: '' }, 3, 0)).toEqual({ attempts: 3, gold: 150, scrolls: [] })
    const value = suggestedItemValue(
      { slot: 0, item: { name: 'x' }, meta: { definition: { g: 100 }, world: { suggestedPrices: [{ monsterId: 'goo', monsterName: 'Goo', rate: 0.1, quantity: 1, kills: 10, goldPerKill: 1, suggested: 40 }] } } },
      [{ id: 'x', name: 'x', cost: 80, seller: '' }],
    )
    expect(value.defaultPrice).toBe(100)
    expect(value.sources.map((source) => [source.monsterName, source.suggested])).toEqual([['buy', 80], ['Goo', 100]])
    expect(value.suggested).toBe(80)
  })
  it('the +N estimate is deterministic (seeded)', () => {
    const item = { id: 'bow', name: 'Bow', cost: 1000, seller: '', upgradeable: true, upgradeChances: UPGRADE_CHANCES[0], scrollCosts: [1000, 40000, 1600000, 64000000] }
    expect(upgradeEstimate(item, 1, 7)).toEqual(upgradeEstimate({ ...item }, 1, 7))
    expect(upgradeEstimate(item, 1, 7).gold).toBeGreaterThan(1000)
  })
})

describe('stand-sheet.tsx market logic', () => {
  const listing = (key: string, extra: Record<string, unknown> = {}) => ({ key, seller: 'S', serverRegion: 'US', serverIdentifier: 'I', map: 'main', seenAt: 0, price: 10, quantity: 2, item: { name: 'x' }, ...extra })
  it('groups identical seller/realm/map/price/item listings and sums quantity', () => {
    const grouped = groupAlData([listing('a'), listing('b'), listing('c', { price: 11 })])
    expect(grouped.map((entry) => [entry.key, entry.quantity, entry.groupedListings?.length])).toEqual([
      ['a|b', 4, 2],
      ['c', 2, 1],
    ])
  })
  it('compares a price against the suggested value', () => {
    expect(priceComparison(40, 100)).toEqual({ deal: true, badDeal: false, comparison: 'deal · 60% off' })
    expect(priceComparison(250, 100)).toEqual({ deal: false, badDeal: true, comparison: '150% above' })
    expect(priceComparison(80, 100).comparison).toBe('20% below')
    expect(priceComparison(100, 100).comparison).toBe('at suggested')
  })
  it('groups Ponty lots by groupKey and freshness, keeping the highest unit price and the smallest lot', () => {
    const now = 1_000_000
    const rows = groupPonty(
      [
        { key: 'p1', groupKey: 'g', item: { name: 'x' }, quantity: 3, unitPrice: 100, price: 300, serverRegion: 'US', serverIdentifier: 'I', seenAt: now },
        { key: 'p2', groupKey: 'g', item: { name: 'x' }, quantity: 2, unitPrice: 110, price: 220, serverRegion: 'EU', serverIdentifier: 'I', seenAt: now },
        { key: 'p3', groupKey: 'g', item: { name: 'x' }, quantity: 9, unitPrice: 90, price: 810, serverIdentifier: 'PVP', seenAt: now },
      ],
      '',
      now,
      () => undefined,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ quantity: 5, unitPrice: 110, minimumLot: 2, keys: ['p1', 'p2'], stale: false })
    expect(rows[0].realms.size).toBe(2)
  })
  it('honours a blacklist record only while active, and automatic ones only when enabled', () => {
    const list = { 'S||': { reason: 'manual', until: -1 }, 'T|US|I': { reason: 'auto', until: 2000 } }
    expect(blacklistRecord(list, false, 1000, 'S', 'US', 'I')).toBeTruthy()
    expect(blacklistRecord(list, false, 1000, 'T', 'US', 'I')).toBeUndefined()
    expect(blacklistRecord(list, true, 1000, 'T', 'US', 'I')).toBeTruthy()
    expect(blacklistRecord(list, true, 3000, 'T', 'US', 'I')).toBeUndefined()
  })
})

describe('lucky-slot-tracking.ts aggregateSlotTracking', () => {
  const stats = (totalRolls: number) => ({ totalRolls, sumRolls: totalRolls / 2, rollsAbove96_3: 0, perfectRolls: 0 })
  it('merges the live local stream into its own stream without double-counting', () => {
    const streams = { 'abc-1': { version: 1 as const, slots: { '5': stats(10) } }, 'def-2': { version: 1 as const, slots: { '5': stats(4) } } }
    // The local copy of stream abc-1 has moved on to 12 rolls in slot 5 and 3 in slot 7.
    const local = { version: 1 as const, streamId: 'abc-1', slots: { '5': stats(12), '7': stats(3) } }
    const result = aggregateSlotTracking(streams, local)
    expect(result.slots['5'].totalRolls).toBe(16)
    expect(result.slots['7'].totalRolls).toBe(3)
    // An older local snapshot never lowers the persisted counts.
    expect(aggregateSlotTracking(streams, { version: 1, streamId: 'abc-1', slots: { '5': stats(8) } } as never).slots['5'].totalRolls).toBe(14)
  })
})

describe('compactInventory (compact-inventory.tsx, v1.3.0)', () => {
  const entry = (slot: number, name: string) => ({ slot, item: { name } })
  it('keeps a tracker or supercomputer pinned in the last usable slot, overflow after it', () => {
    expect(compactInventory([entry(0, 'hpot0'), null, entry(3, 'tracker'), null], 4).map((e) => e?.item.name ?? null)).toEqual(['hpot0', null, null, 'tracker'])
    expect(compactInventory([entry(0, 'a'), entry(3, 'supercomputer'), entry(5, 'b')], 4).map((e) => e?.item.name ?? null)).toEqual(['a', null, null, 'supercomputer', 'b'])
    expect(compactInventory([null, entry(1, 'a'), entry(2, 'b')]).map((e) => e?.item.name ?? null)).toEqual(['a', 'b', null])
  })
})
