import { describe, expect, it } from 'vitest'
import { eventDisplayNames, eventPriorityOrder, eventTimeLabel, realmTimeLabel, selectedEvents, supportedEvents } from './eventPolicy'

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
