import { describe, expect, it } from 'vitest'
import { characterProblems, liveCharacters, merchantNotice, newEntries, newMail, problemTransitions } from '../../notifier/detect.mjs'

const now = 1_000_000
const core = {
  activeSlots: [{ character: 'Leada' }, { character: 'Folla' }, { character: 'Bankboi0' }, { character: null }],
  bankbois: [{ name: 'Bankboi0' }],
  characterDetails: { Leada: { seenAt: now - 5_000 }, Folla: { seenAt: now - 180_000 }, Bankboi0: { seenAt: 1 } },
  characterConnections: [] as { name: string; status: string }[],
}

describe('push notifier detection', () => {
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

  it('pushes stand sales, WTB fills, purchases and merchant errors using the console wording', () => {
    expect(merchantNotice({ at: 1, message: 'Sold 2 × hpot0 at stand (+1,000 gold)', level: 'success' })?.title).toBe('Stand sale')
    expect(merchantNotice({ at: 1, message: 'WTB filled for 1 × bow; order complete', level: 'success' })?.title).toBe('WTB order filled')
    expect(merchantNotice({ at: 1, message: 'Bought 1 × ring from Ponty', level: 'success' })?.title).toBe('Merchant purchase')
    expect(merchantNotice({ at: 1, message: 'Upgrade job failed', level: 'error' })?.title).toBe('Merchant problem')
    expect(merchantNotice({ at: 1, message: 'Banked 12 items', level: 'info' })).toBeNull()
  })

  it('only reports entries and mail that are new', () => {
    expect(newEntries([{ at: 5 }, { at: 3 }, { at: 9 }], 4).map((entry) => entry.at)).toEqual([5, 9])
    expect(newMail([{ id: 'a' }, { id: 'b' }], new Set(['a']))).toEqual([{ id: 'b' }])
  })
})
