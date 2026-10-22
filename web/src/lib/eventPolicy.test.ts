import { describe, expect, it } from 'vitest'
import { eventDisplayNames, eventPriorityOrder, selectedEvents, supportedEvents } from './eventPolicy'

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
