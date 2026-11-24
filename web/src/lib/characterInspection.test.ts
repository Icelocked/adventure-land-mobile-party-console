import { describe, expect, it } from 'vitest'
import { validInspection } from './characterInspection'

const base = {
  name: 'Remote', ctype: 'mage', map: 'main', level: 50, xp: 1, max_xp: 2, hp: 1, max_hp: 0, mp: 1, max_mp: 0, gold: 5, x: 0, y: 0, seenAt: 0,
  rip: false, banking: false, items: [{ slot: 0, item: { name: 'staff' } }, null], slots: {},
  inspection: { source: 'account-snapshot', calculated: false, synchronizedAt: null, note: 'Derived stats unavailable for this saved profile.' },
}

// Console 1.5 dashboard load-character-inspection.ts inspection().
describe('validInspection', () => {
  it('accepts the account-snapshot shape for the requested name', () => {
    expect(validInspection(base, 'Remote')).toBe(true)
  })
  it('rejects another name, a missing numeric field, a bad item and another source', () => {
    expect(validInspection(base, 'Other')).toBe(false)
    expect(validInspection({ ...base, gold: undefined }, 'Remote')).toBe(false)
    expect(validInspection({ ...base, items: [{ slot: 'x', item: { name: 'staff' } }] }, 'Remote')).toBe(false)
    expect(validInspection({ ...base, inspection: { ...base.inspection, source: 'live' } }, 'Remote')).toBe(false)
  })
})
