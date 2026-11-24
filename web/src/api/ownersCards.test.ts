import { describe, expect, it } from 'vitest'
import { emptyPartyStateDynamic, type PartyStateDynamic } from '@/models'
import { cardLine, handControl, handControlBody, handControlWord, standFull, standSlots } from './ownersCards'

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
