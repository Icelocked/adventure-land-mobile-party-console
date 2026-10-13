import { describe, expect, it } from 'vitest'
import { aggregateSlotTracking, emptyRolls, luckySlotSearch, mergeSlotStream, normalizeSlotTracking } from './luckySlot'
import type { LuckySlotTracking, SlotRollStatistics } from '@/models'

// Cases follow the console's scripts/tests/lucky-slot-tracker.test.cjs and
// e2e/lucky-slot-{elimination,lock}.spec.ts at 50c4cb0 (console 1.4).

const stats = (totalRolls: number, sumRolls: number, rollsAbove96_3: number, perfectRolls: number): SlotRollStatistics => ({ totalRolls, sumRolls, rollsAbove96_3, perfectRolls })
const ledger = (fill: (slot: number) => SlotRollStatistics, cursor?: LuckySlotTracking['cursor']): LuckySlotTracking => ({
  version: 1,
  ...(cursor ? { cursor } : {}),
  slots: Object.fromEntries(Array.from({ length: 42 }, (_, slot) => [String(slot), fill(slot)])),
})

describe('luckySlotSearch next slot', () => {
  it('starts at slot 0 with no evidence', () => {
    const search = luckySlotSearch({ version: 1, slots: {} })
    expect(search.slot).toBeNull()
    expect(search.nextSlot).toBe(0)
    expect(search.ruledOutCount).toBe(0)
  })

  // Console: "a high roll advances exploration one square". The tracker
  // writes cursor = observed slot + 1, and the 1.3 least-sampled rule
  // would have picked slot 0 here instead.
  it('follows the cursor one square past the last roll', () => {
    const tracking: LuckySlotTracking = { version: 1, cursor: { slot: 8, at: 1000, rolls: 1 }, slots: { '7': stats(1, 0.9999, 1, 0) } }
    expect(luckySlotSearch(tracking).nextSlot).toBe(8)
  })

  // Console: "each sampled slot advances the next test across all 42 slots".
  it('walks all 42 squares and wraps to 0', () => {
    const tracking: LuckySlotTracking = { version: 1, slots: {} }
    for (let slot = 0; slot < 42; slot++) {
      expect(luckySlotSearch(tracking).nextSlot).toBe(slot)
      tracking.slots[slot] = stats(1, 0.1234, 0, 0)
      tracking.cursor = { slot: (slot + 1) % 42, at: slot + 1, rolls: slot + 1 }
    }
    expect(luckySlotSearch(tracking).nextSlot).toBe(0)
  })

  // Console e2e: "lucky discovery rules out ordinary slots and recomputes
  // after new evidence".
  it('skips a ruled-out square only once it has 100 rolls, and un-rules it on new evidence', () => {
    const tracking = ledger((slot) => (slot === 0 ? stats(99, 60, 20, 0) : stats(100, 50, 3, 0)))
    let search = luckySlotSearch(tracking)
    expect(search.ruledOutCount).toBe(0)
    expect(search.nextSlot).toBe(0)

    tracking.slots['0'] = stats(100, 60, 20, 0)
    search = luckySlotSearch(tracking)
    expect(search.ruledOutCount).toBe(1)
    expect(search.slots[0]!.ruledOut).toBe(true)
    expect(search.nextSlot).toBe(1)

    for (let slot = 1; slot < 42; slot++) tracking.slots[slot] = stats(10000, 6000, 4000, 0)
    search = luckySlotSearch(tracking)
    expect(search.slots[0]!.ruledOut).toBe(false)
    expect(search.ruledOutCount).toBe(41)
    expect(search.nextSlot).toBe(0)
  })

  // Console e2e: "unlocked lucky inference overrides cursor and lapsing
  // confidence resumes sequential discovery".
  it('uses an inferred slot over the cursor, then resumes from the cursor when confidence lapses', () => {
    const tracking = ledger((slot) => (slot === 19 ? stats(100, 50, 0, 5) : stats(100, 50, 4, 0)), { slot: 41, at: Date.now(), rolls: 4200 })
    let search = luckySlotSearch(tracking)
    expect(search.inferred).toBe(true)
    expect(search.slot).toBe(19)
    expect(search.nextSlot).toBe(19)

    tracking.slots['19'] = stats(10000, 6000, 4000, 5)
    tracking.slots['41'] = stats(10000, 6000, 4000, 0)
    tracking.slots['0'] = stats(10000, 6000, 4000, 0)
    search = luckySlotSearch(tracking)
    expect(search.inferred).toBe(false)
    // Squares 41 and 0 are ruled out, so the scan from the cursor lands on 1.
    expect(search.nextSlot).toBe(1)
  })

  // Console e2e lucky-slot-lock.spec.ts confidence ledger.
  it('reports the leading candidate confidence the dashboard shows', () => {
    const search = luckySlotSearch({ version: 1, slots: { '0': stats(100, 50, 3, 2) } })
    expect(search.slot).toBe(0)
    expect(search.inferred).toBe(false)
    expect((search.confidence * 100).toFixed(2)).toBe('97.37')
  })

  // Console: "source-derived likelihoods do not treat one zero or a low
  // average as proof".
  it('does not treat one zero or a low average as proof', () => {
    const first = luckySlotSearch({ version: 1, slots: { '7': stats(1, 0, 0, 1) } })
    expect(first.slot).toBe(7)
    expect(first.inferred).toBe(false)
    expect(first.confidence).toBeLessThan(0.7)
    const ordinary = luckySlotSearch({ version: 1, slots: { '7': stats(1000, 100, 37, 0) } })
    expect(ordinary.slot).not.toBe(7)
    expect(ordinary.inferred).toBe(false)
  })

  // Console: "rotating search converges on a simulated lucky slot using
  // only scheduled attempts", same seeded generator.
  it('converges on a simulated lucky slot using only the scheduled squares', () => {
    let seed = 12345
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967296
    }
    const tracking: LuckySlotTracking = { version: 1, slots: {} }
    let decision = luckySlotSearch(tracking)
    for (let attempt = 0; attempt < 25000 && !decision.inferred; attempt++) {
      const slot = decision.nextSlot
      let roll = random()
      if (slot === 23 && random() < 0.6) roll = Math.max(random() / 10000, roll * 0.975 - 0.012)
      roll = Math.floor(roll * 10000) / 10000
      const entry = (tracking.slots[slot] ??= emptyRolls())
      entry.totalRolls++
      entry.sumRolls += roll
      if (roll === 0) entry.perfectRolls++
      if (roll > 0.963) entry.rollsAbove96_3++
      tracking.cursor = { slot: (slot + 1) % 42, at: attempt + 1, rolls: attempt + 1 }
      decision = luckySlotSearch(tracking)
    }
    expect(decision.inferred).toBe(true)
    expect(decision.slot).toBe(23)
    expect(decision.confidence).toBeGreaterThanOrEqual(0.999)
    expect(luckySlotSearch(JSON.parse(JSON.stringify(tracking)))).toEqual(decision)
  })
})

describe('cursor persistence', () => {
  it('keeps a valid cursor and drops one that claims more rolls than the stream has', () => {
    const slots = { '7': stats(2, 0.5, 0, 0) }
    expect(normalizeSlotTracking({ version: 1, slots, cursor: { slot: 8, at: 5, rolls: 2 } }).cursor).toEqual({ slot: 8, at: 5, rolls: 2 })
    expect(normalizeSlotTracking({ version: 1, slots, cursor: { slot: 8, at: 5, rolls: 3 } }).cursor).toBeUndefined()
    expect(normalizeSlotTracking({ version: 1, slots, cursor: { slot: 42, at: 5, rolls: 1 } }).cursor).toBeUndefined()
  })

  it('merges in the cursor with more rolls', () => {
    const previous: LuckySlotTracking = { version: 1, cursor: { slot: 3, at: 10, rolls: 5 }, slots: {} }
    expect(mergeSlotStream(previous, { version: 1, cursor: { slot: 9, at: 20, rolls: 4 }, slots: {} })).toBe(false)
    expect(previous.cursor?.slot).toBe(3)
    expect(mergeSlotStream(previous, { version: 1, cursor: { slot: 9, at: 20, rolls: 6 }, slots: {} })).toBe(true)
    expect(previous.cursor?.slot).toBe(9)
  })

  it('aggregates to the most recent cursor across streams, including the live local one', () => {
    const streams = {
      'a-1': { version: 1 as const, cursor: { slot: 4, at: 100, rolls: 1 }, slots: { '3': stats(1, 0.5, 0, 0) } },
      'b-1': { version: 1 as const, cursor: { slot: 11, at: 50, rolls: 1 }, slots: { '10': stats(1, 0.5, 0, 0) } },
    }
    expect(aggregateSlotTracking(streams).cursor?.slot).toBe(4)
    const local: LuckySlotTracking = { version: 1, streamId: 'b-1', cursor: { slot: 12, at: 200, rolls: 2 }, slots: { '10': stats(1, 0.5, 0, 0), '11': stats(1, 0.5, 0, 0) } }
    const merged = aggregateSlotTracking(streams, local)
    expect(merged.cursor?.slot).toBe(12)
    expect(luckySlotSearch(merged).nextSlot).toBe(12)
  })
})
