import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyPartyStateDynamic, type PartyStateDynamic } from '@/models'
import { caveReopenable, cardLine, gatheringJob, marketAge, merchantReadyIds, openMarketWatch, dailyResetLabel, eventListRows, eventRejoinBody, eventSkip, handControl, handControlBody, handControlWord, knocksLabel, standFull, standSlots } from './ownersCards'

// OWNERS-PORT-MAP.md B16 with A24, as the owners release's card reads its fields.

const state = (patch: Record<string, unknown>) => ({ ...emptyPartyStateDynamic(), ...patch }) as PartyStateDynamic

describe('card line (A24)', () => {
  it('reads characterDetails.activity with its notice and add-on lines', () => {
    expect(cardLine({ activity: { text: 'Fighting Goo', task: 'farm', phase: 'fight', notice: 'Stuck - trying town', addons: [{ addon: 'AH', label: 'Goo 1/2' }, { addon: 3 }] } })).toEqual({
      text: 'Fighting Goo',
      task: 'farm',
      phase: 'fight',
      notice: 'Stuck - trying town',
      addons: [{ addon: 'AH', label: 'Goo 1/2' }],
    })
  })
  it('tells a release with no line apart from a console without the field', () => {
    expect(cardLine({ activity: null })).toBeNull()
    expect(cardLine({ name: 'W' })).toBeUndefined()
    expect(cardLine(undefined)).toBeUndefined()
  })
})

describe('hand control (B16)', () => {
  it('fills the saved value over the tasks default', () => {
    expect(handControl(state({}), 'W')).toEqual({ on: false, usePotions: true, combat: true, party: 'follows-me' })
    expect(handControl(state({ handControlByCharacter: { W: { on: true, combat: false } } }), 'W')).toEqual({ on: true, usePotions: true, combat: false, party: 'follows-me' })
  })
  it('reads Manual for a native slot and Pause otherwise', () => {
    const slots = { activeSlots: [{ index: 0, kind: 'native', character: 'W', state: 'online' }, { index: 1, kind: 'headless', character: 'M', state: 'online' }] }
    expect(handControlWord(state(slots), 'W')).toBe('Manual')
    expect(handControlWord(state(slots), 'M')).toBe('Pause')
    expect(handControlWord(state({}), 'X')).toBe('Pause')
  })
  it('sends only the changed keys', () => {
    expect(handControlBody('W', { combat: false })).toEqual({ character: 'W', handControl: { combat: false } })
  })
})

describe('stand slots (B16)', () => {
  it("counts core's standSlots and keeps the phone's count without it", () => {
    expect(standSlots(state({ standSlots: { slots: 20, used: 3, free: 17 } }))).toEqual({ slots: 20, used: 3, free: 17 })
    expect(standFull(state({ standSlots: { slots: 20, used: 20, free: 0 } }), () => false)).toBe(true)
    expect(standFull(state({ standSlots: { slots: 20, used: 3, free: 17 } }), () => true)).toBe(false)
    expect(standFull(state({}), () => true)).toBe(true)
  })
})

describe('event rows (B9)', () => {
  const rows = eventListRows({
    Leada: { goobrawl: { ignored: 'manual travel' }, crabxx: { attending: true }, franky: { ended: true, ignored: 'death limit' } },
    Folla: { goobrawl: { ignored: 'time limit' } },
  })
  it('gives each open occurrence its state, and Rejoin only to a manual leave', () => {
    expect(rows).toEqual([
      { member: 'Leada', event: 'goobrawl', state: 'left', reason: 'manual travel', rejoin: true },
      { member: 'Leada', event: 'crabxx', state: 'attending', reason: null, rejoin: false },
      { member: 'Folla', event: 'goobrawl', state: 'limit', reason: 'time limit', rejoin: false },
    ])
  })
  it("shows the member's own skip first and never its source's manual leave", () => {
    expect(eventSkip(rows, 'Leada', 'Leada', 'goobrawl')).toEqual({ reason: 'manual travel', rejoin: true })
    expect(eventSkip(rows, 'Folla', 'Leada', 'goobrawl')).toEqual({ reason: 'time limit', rejoin: false })
    expect(eventSkip(rows, 'Other', 'Leada', 'goobrawl')).toEqual({ reason: null, rejoin: false })
    expect(eventRejoinBody('Leada', 'goobrawl')).toEqual({ character: 'Leada', event: 'goobrawl' })
  })
  it('reads the knock counts, and only the limits while the schedule is stale', () => {
    const counts = { day: 'd', observedAt: 0, characterRemaining: 0, characterLimit: 7, accountRemainingUpperBound: 0, accountLimit: 14 }
    expect(knocksLabel(counts, false)).toBe('Knocks left · Character: 0/7 · Account: 0/14')
    expect(knocksLabel(counts, true)).toBe('Knocks left · Character: —/7 · Account: —/14')
    expect(knocksLabel(undefined, false)).toBe('Knocks left · Character: —/— · Account: —/—')
  })
  it('counts down to the next 00:00 UTC on the server clock', () => {
    expect(dailyResetLabel(Date.UTC(2026, 9, 30, 22, 30, 15))).toMatch(/\(1h 29m 45s\)$/)
    expect(dailyResetLabel(Date.UTC(2026, 9, 30, 22, 30, 15), 3600_000)).toMatch(/\(0h 29m 45s\)$/)
  })
})

describe('Cave reopen (B15)', () => {
  it("follows the view's reopenable list and keeps any done shop room without it", () => {
    const shop = { id: 'p6', done: true, room: '3:shop' }
    expect(caveReopenable({ reopenable: [] }, shop)).toBe(false)
    expect(caveReopenable({ reopenable: ['p6'] }, shop)).toBe(true)
    expect(caveReopenable({}, shop)).toBe(true)
    expect(caveReopenable({}, { id: 'p2', done: true, room: 'r2' })).toBe(false)
  })
})

describe('market watch and merchant plan (B17)', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('opens /market-watch on the server and closes it again', () => {
    const opened: { url: string; closed: boolean }[] = []
    vi.stubGlobal('EventSource', class {
      entry: { url: string; closed: boolean }
      constructor(url: string) {
        this.entry = { url, closed: false }
        opened.push(this.entry)
      }
      close() {
        this.entry.closed = true
      }
    })
    const close = openMarketWatch({ baseUrl: 'https://party.example/' })
    expect(opened).toEqual([{ url: 'https://party.example/party-api/market-watch', closed: false }])
    close()
    expect(opened[0].closed).toBe(true)
  })
  it("ages each feed in whole seconds and leaves out a feed that never loaded", () => {
    expect(marketAge(100_000, 100_000 - 65_400, 0)).toBe('ALData 1m 5s old')
    expect(marketAge(100_000, 99_000, 100_000)).toBe('ALData 1s old · Ponty 0s old')
    expect(marketAge(100_000, undefined, undefined)).toBe('')
  })
  it("reads merchantReady's ids and holds only fishing and mining jobs", () => {
    expect(merchantReadyIds(state({ merchantReady: [{ id: 'g1' }] }))).toEqual(new Set(['g1']))
    expect(merchantReadyIds(state({}))).toBeNull()
    expect(gatheringJob({ reason: 'mining', id: 'g2' })).toBe(true)
    expect(gatheringJob({ reason: 'restock', id: 'j1' })).toBe(false)
  })
})
