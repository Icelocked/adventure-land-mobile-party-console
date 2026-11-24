import { describe, expect, it } from 'vitest'
import { characterSections, parseSettingsTarget, settingsMenuPath } from './settingsTarget'
import { reflectChoices } from '@/screens/settings-menu/CombatSettingsSection'
import type { BestiaryMonster } from '@/models'

// OWNERS-PORT-MAP.md B2: the settings menu's targets (console settings-target.ts) and the Combat
// section's reflect choices (characters/targeting/reflect.ts).

describe('settings menu target', () => {
  it("round-trips a character's section through the menu's address", () => {
    const path = settingsMenuPath({ tab: 'character', character: 'Leada', section: 'combat' })
    expect(path).toBe('/settings/menu?tab=character&character=Leada&section=combat')
    expect(parseSettingsTarget(new URLSearchParams(path.split('?')[1]))).toEqual({ tab: 'character', character: 'Leada', section: 'combat' })
  })
  it('opens Account for an address with no tab', () => {
    expect(parseSettingsTarget(new URLSearchParams(''))).toEqual({ tab: 'account', section: undefined })
  })
  it('gives the merchant Merchant and Routines in place of Farming', () => {
    expect(characterSections(true).map((s) => s.id)).toEqual(['combat', 'restock', 'merchant', 'routines'])
    expect(characterSections(false).map((s) => s.id)).toEqual(['farming', 'combat', 'restock'])
  })
})

describe('reflect choices', () => {
  it('lists the monsters whose game data rates the list above zero, sorted', () => {
    const monsters = [
      { id: 'tiger', definition: { reflection: 20 } },
      { id: 'goo', definition: {} },
      { id: 'goblin', definition: { reflection: 5, dreturn: 0 } },
      { id: 'porcupine', definition: { dreturn: 30 } },
    ] as unknown as BestiaryMonster[]
    expect(reflectChoices(monsters, 'reflection')).toEqual(['goblin', 'tiger'])
    expect(reflectChoices(monsters, 'dreturn')).toEqual(['porcupine'])
  })
})
