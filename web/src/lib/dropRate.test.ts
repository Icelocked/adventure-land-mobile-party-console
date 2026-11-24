import { describe, expect, it } from 'vitest'
import { effectiveDropRate, formatDropRate, isDirectDrop } from './itemFormulas'

// Console 1.5 dashboard drop-rate.ts.
describe('drop odds', () => {
  it('shows reduced ratio odds, not percentages', () => {
    expect(formatDropRate({ rate: 1 / 1250, quantity: 1 })).toBe('1/1,250')
    expect(formatDropRate({ rate: 15 / 100000, quantity: 3 })).toBe('3/20,000 ×3')
    expect(formatDropRate({ rate: 2.5, quantity: 1 })).toBe('1/1')
    expect(formatDropRate({ rate: 0, quantity: 1 })).toBe('0/1')
  })

  it('uses the original rate for a direct monster or home roll', () => {
    expect(effectiveDropRate({ rate: 0.5, originRate: 0.001, sourceType: 'home', quantity: 1 })).toBe(0.001)
    expect(effectiveDropRate({ rate: 0.5, originRate: 0.001, sourceType: 'zone', quantity: 1 })).toBe(0.5)
  })

  it('counts chest opens and world tables as direct, an exchange step as not', () => {
    expect(isDirectDrop({ acquisitionPath: ['open Monster Chest', 'Ring'] })).toBe(true)
    expect(isDirectDrop({ acquisitionPath: ['HP-scaled world drop', 'Ring'] })).toBe(true)
    expect(isDirectDrop({ acquisitionPath: ['Gem', 'Ring'] })).toBe(false)
    expect(isDirectDrop({})).toBe(true)
  })
})
