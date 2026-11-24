import { describe, expect, it } from 'vitest'
import { settingsChangeMessage } from '@/models'

// OWNERS-PORT-MAP.md B19: a settings audit line in log-sidebar.tsx's words.
describe('settings change line', () => {
  it("names an add-on setting by its add-on and key, with the character, old and new values and the source", () => {
    expect(settingsChangeMessage({ at: 1, field: 'addons', addon: 'tank-hold', key: 'tank', character: 'Leada', old: 'auto', new: 'hold', by: 'app:Tracker' }))
      .toBe('tank-hold tank (Leada): "auto" -> "hold" by app:Tracker')
  })
  it('shows a missing old value as null', () => {
    expect(settingsChangeMessage({ at: 1, field: 'homeRealm', new: 'USI', by: 'dashboard:settings' })).toBe('homeRealm: null -> "USI" by dashboard:settings')
  })
})
