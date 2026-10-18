// Failure inventory for item titles (item.p, such as "shiny"). The game's
// calculate_item_properties (js/old_common_functions.js) adds a title's stats before the
// upgrade scaling, and render_item (js/html.js) puts the title before the name.
//
// 1. The name hides the title: "Shiny Blade +7", and an unknown title in title case.
// 2. A shiny item misses its bonus: attack +4 (+3 more for an axe, basher or great staff),
//    else stat +2, else armor +12 and resistance +10, else dex, int and str +1 each.
// 3. The bonus lands twice on a live copy, whose reported properties already include it.
// 4. The extras box drops the title: "Title: Shiny", and a glitched copy's random +1 note.
// The console sends no G.titles, so other titles (superfast, sniper) only get their name.
import { describe, expect, it } from 'vitest'
import { calculatedLevelProperties, propertiesAtLevel } from './itemFormulas'
import { itemSlotExtras, titledName } from './itemCardLines'
import type { ItemMeta } from '@/models'

const meta = (definition: Record<string, unknown>, extra: Partial<ItemMeta> = {}): ItemMeta => ({ definition, upgradeable: true, scaling: { attack: 2, armor: 1 }, ...extra })

describe('item titles', () => {
  it('puts the title before the name', () => {
    expect(titledName('Blade +7', 'shiny')).toBe('Shiny Blade +7')
    expect(titledName('Blade', 'superfast')).toBe('Superfast Blade')
    expect(titledName('Blade', undefined)).toBe('Blade')
  })

  it('adds the shiny bonus by the definition, as calculate_item_properties does', () => {
    expect(calculatedLevelProperties(meta({ attack: 20, wtype: 'sword' }), undefined, 0, 'shiny').attack).toBe(24)
    expect(calculatedLevelProperties(meta({ attack: 50, wtype: 'axe' }), undefined, 0, 'shiny').attack).toBe(57)
    expect(calculatedLevelProperties(meta({ attack: 40, wtype: 'great_staff' }), undefined, 3, 'shiny').attack).toBe(53)
    expect(calculatedLevelProperties(meta({ stat: 3, armor: 10 }), undefined, 0, 'shiny')).toMatchObject({ stat: 5, armor: 10 })
    // A stat scroll folds the shiny stat into the scrolled stat.
    expect(calculatedLevelProperties(meta({ stat: 3 }), 'int', 0, 'shiny').int).toBe(5)
    expect(calculatedLevelProperties(meta({ armor: 10 }), undefined, 0, 'shiny')).toMatchObject({ armor: 22, resistance: 10 })
    expect(calculatedLevelProperties(meta({ hp: 100 }), undefined, 0, 'shiny')).toMatchObject({ hp: 100, dex: 1, int: 1, str: 1 })
    expect(calculatedLevelProperties(meta({ attack: 20 }), undefined, 0, undefined).attack).toBe(20)
    expect(calculatedLevelProperties(meta({ attack: 20 }), undefined, 0, 'glitched').attack).toBe(20)
  })

  it('keeps a live copy at its reported stats and previews a catalog copy with the bonus', () => {
    const live = meta({ attack: 20, wtype: 'sword' }, { properties: { attack: 30 } })
    expect(propertiesAtLevel(live, { level: 3, p: 'shiny' }, 3).attack).toBe(30)
    expect(propertiesAtLevel(live, { level: 3, p: 'shiny' }, 4).attack).toBe(32)
    expect(propertiesAtLevel(meta({ attack: 20 }), { level: 0, p: 'shiny' }, 2).attack).toBe(28)
  })

  it('names the title in the extras', () => {
    expect(itemSlotExtras({ name: 'blade', p: 'shiny' })).toEqual([['title', 'Shiny']])
    expect(itemSlotExtras({ name: 'ring', p: 'glitched' })).toEqual([
      ['title', 'Glitched'],
      ['title_bonus', '+1 DEX, INT or STR, rolled at random'],
    ])
  })
})
