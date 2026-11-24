import { describe, expect, it } from 'vitest'
import { eventDisplayNames, eventLimits, eventPolicy, eventPriorityOrder, selectedEvents, supportedEvents } from './eventPolicy'

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

describe("eventPolicy the merchant's Witch's Cipher", () => {
  const party = {
    leader: 'Leada',
    merchantCharacter: 'Mercer',
    eventSelectionsByCharacter: { Leada: ['witchcipher'] },
    eventLimitsByCharacter: { Leada: { witchcipher: { deathLimit: 2, timeLimitMinutes: null, cipher: { automatic: true, minClues: 3 } } }, Mercer: { goobrawl: { deathLimit: 1, timeLimitMinutes: 5 } } },
  }
  it("selects the leader's cipher for the merchant with the leader's limits", () => {
    expect(selectedEvents(party, 'Mercer')).toEqual(['anniversary', 'witchcipher'])
    expect(eventPolicy(party, 'Mercer').enabled).toBe(true)
    expect(eventLimits(party, 'Mercer')).toEqual({ goobrawl: { deathLimit: 1, timeLimitMinutes: 5 }, witchcipher: party.eventLimitsByCharacter.Leada.witchcipher })
  })
})
