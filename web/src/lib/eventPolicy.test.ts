import { describe, expect, it } from 'vitest'
import { eventDisplayNames, eventLimits, eventPolicy, eventPriorityOrder, eventTimeLabel, realmTimeLabel, selectedEvents, supportedEvents, validEventLimits } from './eventPolicy'

const october = ['horseman', 'graveyard', 'trickortreat', 'witchcipher']

describe('eventPolicy October events', () => {
  it('lists the four October events after the older ones, as dashboard lib/event-policy.ts does', () => {
    expect(supportedEvents.slice(-4)).toEqual(october)
    expect(supportedEvents).toHaveLength(14)
    expect(eventDisplayNames.witchcipher).toBe("Witch's Cipher")
    expect(eventDisplayNames.horseman).toBe('Headless Horseman')
  })

  it('keeps saved October selections, so a checkbox POST built from them keeps them', () => {
    const party = { eventSelectionsByCharacter: { Leada: ['anniversary', 'graveyard', 'witchcipher'] } }
    expect(selectedEvents(party, 'Leada')).toEqual(['anniversary', 'graveyard', 'witchcipher'])
  })

  it('keeps the saved October priority order in the full list a reorder sends', () => {
    const saved = ['witchcipher', 'anniversary', 'horseman']
    const order = eventPriorityOrder({ eventPrioritiesByCharacter: { Leada: saved } }, 'Leada')
    expect(order).toHaveLength(14)
    expect(order.slice(0, 3)).toEqual(saved)
    expect(order).toEqual(expect.arrayContaining(october))
  })
})

// Cases below follow the console's dashboard/lib/event-policy.ts at 2db4d763.

const cipher = { automatic: true, minClues: 1, gatherMonsters: ['goo', 'arcticbee', 'plantoid', 'snake'] }

describe('validEventLimits for October settings', () => {
  it('accepts a graveyard monster subset and rejects unknown or repeated monsters', () => {
    expect(validEventLimits({ deathLimit: null, timeLimitMinutes: null, monsters: ['zombie', 'gargoyle'] })).toBe(true)
    expect(validEventLimits({ deathLimit: null, timeLimitMinutes: null, monsters: ['zombie', 'zombie'] })).toBe(false)
    expect(validEventLimits({ deathLimit: null, timeLimitMinutes: null, monsters: ['goo'] })).toBe(false)
  })

  it('bounds the cipher clue minimum to 0-1024 and needs four gathering monsters', () => {
    expect(validEventLimits({ deathLimit: null, timeLimitMinutes: null, cipher })).toBe(true)
    expect(validEventLimits({ deathLimit: null, timeLimitMinutes: null, cipher: { ...cipher, minClues: 1025 } })).toBe(false)
    expect(validEventLimits({ deathLimit: null, timeLimitMinutes: null, cipher: { ...cipher, gatherMonsters: ['goo'] } })).toBe(false)
  })

  it('checks a manual solution mix', () => {
    const manual = { id: 'm1', round: 'r1', cracks: 0, mix: Array(5).fill('embercoal') }
    expect(validEventLimits({ deathLimit: null, timeLimitMinutes: null, cipher: { ...cipher, manual } })).toBe(true)
    expect(validEventLimits({ deathLimit: null, timeLimitMinutes: null, cipher: { ...cipher, manual: { ...manual, mix: ['embercoal'] } } })).toBe(false)
  })
})

describe('the merchant inherits the leader’s Witch’s Cipher', () => {
  const party = {
    leader: 'Leada',
    merchantCharacter: 'Merchy',
    followers: {},
    eventSelectionsByCharacter: { Leada: ['anniversary', 'witchcipher'] },
    eventLimitsByCharacter: { Leada: { witchcipher: { deathLimit: null, timeLimitMinutes: null, cipher } }, Merchy: { goobrawl: { deathLimit: 2, timeLimitMinutes: null } } },
  }

  it('selects witchcipher for the merchant and enables its events', () => {
    expect(selectedEvents(party, 'Merchy')).toEqual(['anniversary', 'witchcipher'])
    expect(eventPolicy(party, 'Merchy').enabled).toBe(true)
  })

  it('reads the leader’s cipher limits next to the merchant’s own', () => {
    expect(eventLimits(party, 'Merchy')).toEqual({ goobrawl: { deathLimit: 2, timeLimitMinutes: null }, witchcipher: { deathLimit: null, timeLimitMinutes: null, cipher } })
  })

  it('leaves the merchant alone when the leader has no cipher selected', () => {
    const plain = { ...party, eventSelectionsByCharacter: { Leada: ['anniversary'] } }
    expect(selectedEvents(plain, 'Merchy')).toEqual(['anniversary'])
    expect(eventLimits(plain, 'Merchy').witchcipher).toBeUndefined()
  })
})

describe('event schedule labels (event-selection-control.tsx:17-27)', () => {
  it('names the weekday and subtracts the realm clock offset from the countdown', () => {
    const now = Date.UTC(2026, 9, 22, 12, 0, 0)
    const label = eventTimeLabel(now + 10 * 60000, now, 60000)
    expect(label).toMatch(/\(9m 0s\)$/)
    const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(now + 10 * 60000)
    expect(label.startsWith(weekday)).toBe(true)
  })

  it('shows the realm time in the realm offset as a UTC label', () => {
    expect(realmTimeLabel(Date.UTC(2026, 9, 22, 19, 5), -5)).toBe('Realm: 14:05 (UTC\u22125)')
    expect(realmTimeLabel(Date.UTC(2026, 9, 22, 19, 5) / 1000, 2)).toBe('Realm: 21:05 (UTC+2)')
  })
})
