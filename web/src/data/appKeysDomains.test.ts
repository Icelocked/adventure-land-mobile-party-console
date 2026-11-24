import { describe, expect, it } from 'vitest'
import { affectedDomains } from './queryActions'

// OWNERS-PORT-MAP.md B18 and B10: the app keys screen and the add-on manager reload only their
// own reads (dashboard query-actions.ts), so a key change refreshes no state section.
describe('app key and add-on actions', () => {
  it('refresh no state section', () => {
    expect(affectedDomains('/apps')).toEqual([])
    expect(affectedDomains('/apps/Tracker/revoke')).toEqual([])
    expect(affectedDomains('/apps/Tracker/own-commands')).toEqual([])
    expect(affectedDomains('/addons')).toEqual([])
  })
})
