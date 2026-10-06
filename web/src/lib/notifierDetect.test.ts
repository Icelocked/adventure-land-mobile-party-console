import { describe, expect, it } from 'vitest'
import {
  activityTimes,
  bankFreeSlots,
  bursts,
  characterProblems,
  completedRules,
  deathTimes,
  endedEvents,
  errorTimes,
  finishedUpgradeOrders,
  trackedOrders,
  fullInventories,
  idleCharacters,
  inQuietHours,
  isRareDrop,
  liveCharacters,
  mergeSettings,
  newEntries,
  newlyAdded,
  newMail,
  problemTransitions,
  rareIndex,
  recipients,
  selectedEventIds,
  joinedEvents,
  eventSpans,
  deathsOutsideEvents,
  tradeNotice,
  tradeDigest,
  latestError,
} from '../../notifier/detect.mjs'

const now = 1_000_000_000
const core = {
  activeSlots: [{ character: 'Leada' }, { character: 'Folla' }, { character: 'Bankboi0' }, { character: null }],
  bankbois: [{ name: 'Bankboi0' }],
  characterDetails: { Leada: { seenAt: now - 5_000 }, Folla: { seenAt: now - 180_000 }, Bankboi0: { seenAt: 1 } },
  characterConnections: [] as { name: string; status: string }[],
}

describe('push notifier: character health', () => {
  it('watches live party characters, never bankbois', () => {
    expect(liveCharacters(core)).toEqual(['Leada', 'Folla'])
  })

  it('flags a character that stopped reporting, and lost or stopped connections', () => {
    expect(characterProblems(core, now, 120_000)).toEqual({ Folla: 'No update for 3 min — may be hung' })
    const lost = { ...core, characterConnections: [{ name: 'Leada', status: 'lost' }, { name: 'Folla', status: 'stopped' }] }
    expect(characterProblems(lost, now, 120_000)).toEqual({ Leada: 'Connection lost', Folla: 'CODE stopped' })
  })

  it('notifies once per problem, not every minute, and again on recovery', () => {
    expect(problemTransitions({}, { Folla: 'No update for 2 min — may be hung' })).toEqual([{ name: 'Folla', problem: 'No update for 2 min — may be hung' }])
    expect(problemTransitions({ Folla: 'No update for 2 min — may be hung' }, { Folla: 'No update for 3 min — may be hung' })).toEqual([])
    expect(problemTransitions({ Folla: 'No update for 3 min — may be hung' }, { Folla: 'Connection lost' })).toEqual([{ name: 'Folla', problem: 'Connection lost' }])
    expect(problemTransitions({ Folla: 'Connection lost' }, {})).toEqual([{ name: 'Folla', problem: null }])
  })

  it('counts error bursts (game-log errors and the merchant’s error activity) once per burst; failed rolls are not errors', () => {
    const times = errorTimes(
      { Leada: [{ at: now - 60_000, message: 'Route rejected' }, { at: now - 50_000, message: 'Killed a goo' }, { at: now - 40_000, message: 'Upgrade failed: no scroll' }, { at: now - 35_000, message: 'Item upgrade failed' }, { at: now - 33_000, message: 'Item combination failed' }] },
      [{ at: now - 30_000, message: 'Exchange failed', level: 'error' }],
      'Merchy',
    )
    expect(times).toEqual({ Leada: [now - 60_000, now - 40_000], Merchy: [now - 30_000] })
    expect(bursts(times, now, 2, 600_000)).toEqual({ Leada: 2 })
    // After alerting at now-35s, only later errors count toward the next alert.
    expect(bursts(times, now, 2, 600_000, { Leada: now - 35_000 })).toEqual({})
  })

  it('counts repeated deaths within the window', () => {
    const times = deathTimes({ Folla: [{ at: now - 100_000, type: 'death' }, { at: now - 50_000, type: 'kill' }, { at: now - 10_000, type: 'death' }, { at: now - 5_000_000, type: 'death' }] })
    expect(bursts(times, now, 2, 30 * 60_000)).toEqual({ Folla: 2 })
    expect(bursts(times, now, 3, 30 * 60_000)).toEqual({})
  })

  it('treats log entries and movement as activity, and flags idle characters except the merchant', () => {
    const before = activityTimes({}, { Leada: [{ at: now - 400_000 }] }, null, { Leada: { map: 'main', x: 0, y: 0 }, Merchy: { map: 'main', x: 0, y: 0 } }, {}, now - 400_000)
    expect(before).toEqual({ Leada: now - 400_000, Merchy: now - 400_000 })
    const still = activityTimes(before, null, null, { Leada: { map: 'main', x: 1, y: 1 } }, { Leada: { map: 'main', x: 0, y: 0 } }, now)
    expect(idleCharacters(still, ['Leada', 'Merchy'], 'Merchy', now, 300_000)).toEqual(['Leada'])
    const moved = activityTimes(before, null, null, { Leada: { map: 'main', x: 40, y: 0 } }, { Leada: { map: 'main', x: 0, y: 0 } }, now)
    expect(idleCharacters(moved, ['Leada'], 'Merchy', now, 300_000)).toEqual([])
  })
})

describe('push notifier: storage', () => {
  it('flags a bag with no free slot up to the inventory size, once per fill', () => {
    const inventory = {
      Leada: { items: [{ slot: 0 }, { slot: 1 }, null] },
      Folla: { items: [{ slot: 0 }, { slot: 1 }, { slot: 2 }] },
      Merchy: { items: [{ slot: 0 }, { slot: 1 }, null, null] },
    }
    // Merchy's game bag reports 2 slots: both taken.
    expect(fullInventories(inventory, { Merchy: { inventorySize: 2 } }, ['Leada', 'Folla', 'Merchy', 'Gone'])).toEqual(['Folla', 'Merchy'])
    expect(newlyAdded(['Folla'], ['Folla', 'Merchy'])).toEqual(['Merchy'])
    expect(newlyAdded(['Folla', 'Merchy'], ['Folla'])).toEqual([])
  })

  it('counts free bank slots across unlocked packs', () => {
    expect(bankFreeSlots(null)).toBeNull()
    expect(bankFreeSlots({ packs: {} })).toBeNull()
    expect(bankFreeSlots({ packs: { items0: [{ slot: 0 }, null], items1: [null] } })).toBe(2)
    expect(bankFreeSlots({ packs: { items0: [{ slot: 0 }, { slot: 1 }] } })).toBe(0)
  })
})

describe('push notifier: progress, loot and trading', () => {
  it('reports auto-upgrade and auto-compound rules reaching zero remaining', () => {
    const before = { autoUpgradeMarks: { Merchy: { 'bow@+0': { tiers: 9, quantity: 1 } } }, autoCompounds: { Merchy: [{ name: 'ringsj', targetTier: 3, quantity: 2 }] } }
    const after = { autoUpgradeMarks: { Merchy: { 'bow@+0': { tiers: 9, quantity: 0 } } }, autoCompounds: { Merchy: [{ name: 'ringsj', targetTier: 3, quantity: 0 }] } }
    expect(completedRules(before, after).map((done) => done.body)).toEqual(['bow reached +9', 'ringsj reached +3'])
    expect(completedRules(after, after)).toEqual([])
  })

  it('reports a buy order with an upgrade target leaving the queue', () => {
    const queue = [{ id: 'j1', order: { buys: [{ id: 'bow', quantity: 1, level: 9 }, { id: 'hpot0', quantity: 5 }] } }]
    expect(finishedUpgradeOrders(queue, queue)).toEqual([])
    expect(finishedUpgradeOrders(queue, [])).toEqual([{ title: 'Buy-and-upgrade order finished', body: '1 × bow to +9' }])
    // Failure mode: the order the merchant starts moves to merchantCurrent and
    // was announced as finished while it was still running.
    const job = { id: 'j1', order: { buys: [{ id: 'staff', quantity: 1, level: 9 }] } }
    const waiting = trackedOrders({ merchantQueue: [job], merchantCurrent: null })
    expect(finishedUpgradeOrders(waiting, trackedOrders({ merchantQueue: [], merchantCurrent: job }))).toEqual([])
    expect(finishedUpgradeOrders(waiting, trackedOrders({ merchantQueue: [], merchantCurrent: null }))).toHaveLength(1)
  })

  it('reports selected events ending', () => {
    const selected = selectedEventIds({ eventSelectionsByCharacter: { Leada: ['goobrawl'] } })
    expect([...selected]).toEqual(['goobrawl'])
    expect(endedEvents([{ id: 'goobrawl', name: 'Goo Brawl', live: true }, { id: 'franky', live: true }], [{ id: 'goobrawl', live: false }], selected)).toEqual([{ id: 'goobrawl', name: 'Goo Brawl', live: true }])
  })

  it('rare drops by chance, by gold value, or both', () => {
    const index = rareIndex([
      { id: 'ring', name: 'Ring', meta: { definition: { g: 5_000_000 }, world: { drops: [{ rate: 0.00001 }, { rate: 0.00002 }] } } },
      { id: 'goo', name: 'Goo Ball', meta: { definition: { g: 10 }, world: { drops: [{ rate: 0.5 }] } } },
      { id: 'gem', name: 'Gem', meta: { definition: { g: 2_000_000 }, world: { drops: [] } } },
    ])
    expect(index.ring).toEqual({ name: 'Ring', gold: 5_000_000, chance: 0.00002 })
    const chance = { mode: 'chance' as const, chanceOneIn: 10_000, minGold: 1_000_000 }
    expect(isRareDrop(index.ring, chance)).toBe(true)
    expect(isRareDrop(index.goo, chance)).toBe(false)
    expect(isRareDrop(index.gem, chance)).toBe(false)
    expect(isRareDrop(index.gem, { ...chance, mode: 'value' })).toBe(true)
    expect(isRareDrop(index.gem, { ...chance, mode: 'both' })).toBe(false)
    expect(isRareDrop(index.ring, { ...chance, mode: 'both' })).toBe(true)
  })

  it('pushes trades using the console wording', () => {
    expect(tradeNotice({ at: 1, message: 'Sold 2 × hpot0 at stand (+1,000 gold)', level: 'success' })?.title).toBe('Stand sale')
    expect(tradeNotice({ at: 1, message: 'WTB filled for 1 × bow; order complete', level: 'success' })?.title).toBe('WTB order filled')
    expect(tradeNotice({ at: 1, message: 'Bought 1 × ring from Ponty', level: 'success' })?.title).toBe('Purchase completed')
    expect(tradeNotice({ at: 1, message: 'Bought 2 × bow from Seller on US I', level: 'success' })?.title).toBe('Purchase completed')
    expect(tradeNotice({ at: 1, message: 'Banked 12 items', level: 'info' })).toBeNull()
    expect(tradeNotice({ at: 1, message: 'Skipped unavailable Ponty listing: bow', level: 'error' })).toBeNull()
    // Failure mode: the merchant's automatic NPC selling sent a "Sale completed" burst.
    expect(tradeNotice({ at: 1, message: 'Sold 3 × hpamulet to NPC for 1,200 gold', level: 'success' })).toBeNull()
  })

  it('combines the trades from one poll into one push', () => {
    const sale = (n: number) => ({ title: 'Stand sale', body: `Sold ${n} × bow at stand` })
    expect(tradeDigest([])).toBeNull()
    expect(tradeDigest([sale(1)])).toEqual(sale(1))
    expect(tradeDigest([1, 2, 3, 4, 5].map(sale))).toEqual({ title: '5 trades', body: 'Sold 1 × bow at stand\nSold 2 × bow at stand\nSold 3 × bow at stand\n…and 2 more' })
  })

  it('names the newest counted error for the alert text, skipping failed rolls', () => {
    const logs = { Merchy: [{ at: 1, message: 'Route rejected' }, { at: 3, message: 'Item upgrade failed' }, { at: 2, message: 'Movement failed: blocked' }] }
    expect(latestError(logs, [], 'Merchy', 'Merchy')).toBe('Movement failed: blocked')
    expect(latestError(logs, [{ at: 4, message: 'Exchange failed', level: 'error' }], 'Merchy', 'Merchy')).toBe('Exchange failed')
    expect(latestError(logs, [], 'Merchy', 'Folla')).toBe('')
    // An upgrade that destroyed the item is an expected outcome, not an error.
    const poof = { at: 9, message: 'wshoes upgrade failed', level: 'error', details: 'wshoes was destroyed' }
    expect(errorTimes({}, [poof], 'Merchy')).toEqual({})
    expect(errorTimes({}, [{ ...poof, details: 'upgrade rejected: busy' }], 'Merchy')).toEqual({ Merchy: [9] })
  })

  it('only reports entries and mail that are new', () => {
    expect(newEntries([{ at: 5 }, { at: 3 }, { at: 9 }], 4).map((entry) => entry.at)).toEqual([5, 9])
    expect(newMail([{ id: 'a' }, { id: 'b' }], new Set(['a']))).toEqual([{ id: 'b' }])
  })
})

describe('push notifier: devices and settings', () => {
  it('clamps settings patches to sane values', () => {
    const merged = mergeSettings({}, { idleMinutes: 10, errors: { count: 0, minutes: 15 }, rare: { mode: 'both', minGold: 250000 } })
    expect(merged.idleMinutes).toBe(10)
    expect(merged.errors).toEqual({ count: 5, minutes: 15 })
    expect(merged.rare).toEqual({ mode: 'both', chanceOneIn: 10000, minGold: 250000 })
  })

  it('quiet hours wrap past midnight in the device’s time zone', () => {
    const quiet = { start: '22:00', end: '07:00', offsetMinutes: 240 } // UTC-4
    expect(inQuietHours(quiet, new Date('2026-10-04T03:00:00Z'))).toBe(true) // 23:00 local
    expect(inQuietHours(quiet, new Date('2026-10-04T12:00:00Z'))).toBe(false) // 08:00 local
  })

  it('sends only to devices that want the alert, have not muted the character, and are not in quiet hours unless urgent', () => {
    const night = new Date('2026-10-04T03:00:00Z')
    const devices = [
      { id: 1, alerts: ['stuck', 'trading'], muted: [], quiet: { start: '22:00', end: '07:00', offsetMinutes: 240 } },
      { id: 2, alerts: ['stuck'], muted: ['Folla'], quiet: null },
    ]
    expect(recipients(devices, 'stuck', 'Folla', night).map((device) => device.id)).toEqual([1])
    expect(recipients(devices, 'trading', undefined, night).map((device) => device.id)).toEqual([])
    expect(recipients(devices, 'stuck', 'Leada', night).map((device) => device.id)).toEqual([1, 2])
  })
})

describe('deaths during events', () => {
  const POLL = 15_000

  it('is off by default and keeps its setting through other changes', () => {
    expect(mergeSettings({}).deaths.ignoreDuringEvents).toBe(false)
    const on = mergeSettings({}, { deaths: { ignoreDuringEvents: true } })
    expect(on.deaths).toEqual({ count: 3, minutes: 30, ignoreDuringEvents: true })
    expect(mergeSettings(on, { deaths: { count: 5 } }).deaths.ignoreDuringEvents).toBe(true)
    expect(mergeSettings(on, { deaths: { ignoreDuringEvents: 'yes' } }).deaths.ignoreDuringEvents).toBe(true)
  })

  it('records when each event was live, one span per run', () => {
    let spans = eventSpans(undefined, [{ id: 'crabxx', live: true }, { id: 'franky', live: false }], 100_000, POLL)
    expect(spans).toEqual({ crabxx: [{ start: 85_000, end: 100_000 }] })
    spans = eventSpans(spans, [{ id: 'crabxx', live: true }], 115_000, POLL)
    expect(spans.crabxx).toEqual([{ start: 85_000, end: 115_000 }])
    spans = eventSpans(spans, [{ id: 'crabxx', live: false }], 130_000, POLL)
    spans = eventSpans(spans, [{ id: 'crabxx', live: true }], 1_000_000, POLL)
    expect(spans.crabxx).toEqual([{ start: 85_000, end: 115_000 }, { start: 985_000, end: 1_000_000 }])
    expect(eventSpans(spans, [], 1_000_000 + 86_400_001, POLL)).toEqual({})
  })

  it('ignores only deaths during live events the character joins', () => {
    const joined = joinedEvents({ eventSelectionsByCharacter: { Tank: ['crabxx'], Healer: ['anniversary'] }, eventsByCharacter: { Mage: true } })
    expect(joined.Mage).toContain('crabxx')
    const spans = { crabxx: [{ start: 100_000, end: 200_000 }] }
    const times = { Tank: [50_000, 150_000, 210_000, 300_000], Healer: [150_000], Mage: [150_000], Rogue: [150_000] }
    expect(deathsOutsideEvents(times, spans, joined, POLL)).toEqual({ Tank: [50_000, 300_000], Healer: [150_000], Mage: [], Rogue: [150_000] })
  })
})
