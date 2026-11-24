import { describe, expect, it } from 'vitest'
import { cipherCandidates, cipherScore, defaultCipherSettings, validMix } from './cipher'

// Cases follow the console's runtime/events/october.ts at 2db4d763.

describe('cipher helpers', () => {
  it('accepts only five known ingredients as a mix', () => {
    expect(validMix(['verdantspore', 'frostscale', 'embercoal', 'gloomfeather', 'verdantspore'])).toBe(true)
    expect(validMix(['verdantspore', 'frostscale', 'embercoal', 'gloomfeather'])).toBe(false)
    expect(validMix(['verdantspore', 'frostscale', 'embercoal', 'gloomfeather', 'goo'])).toBe(false)
  })

  it('scores a mix by ingredients in the right place', () => {
    expect(cipherScore(['a', 'b', 'c', 'd', 'e'], ['a', 'x', 'c', 'x', 'x'])).toBe(2)
  })

  it('lists all 1024 recipes for an empty board and narrows them by clues', () => {
    expect(cipherCandidates({ board: [], mixes: 0 })).toHaveLength(1024)
    const clue = ['verdantspore', 'verdantspore', 'verdantspore', 'verdantspore', 'verdantspore']
    const all = cipherCandidates({ board: [{ mix: clue, right: 5 }], mixes: 1 })
    expect(all).toEqual([clue])
    // Four of five in place leaves 5 positions x 3 other ingredients.
    expect(cipherCandidates({ board: [{ mix: clue, right: 4 }], mixes: 1 })).toHaveLength(15)
  })

  it('returns nothing when the board reports clues it did not send', () => {
    expect(cipherCandidates({ board: [], mixes: 3 })).toEqual([])
  })

  it('applies the 256-hex fit mask', () => {
    // Only recipe 0 (five verdantspore) survives a mask with bit 0 set.
    const fit = '1' + '0'.repeat(255)
    expect(cipherCandidates({ board: [], mixes: 4, fit })).toEqual([Array(5).fill('verdantspore')])
  })

  it('defaults to automatic solving with one clue and the first monster per ingredient', () => {
    expect(defaultCipherSettings).toEqual({ minClues: 1, automatic: true, gatherMonsters: ['goo', 'arcticbee', 'plantoid', 'snake'] })
  })
})
