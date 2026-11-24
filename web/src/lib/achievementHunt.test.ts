import { describe, expect, it } from 'vitest'
import type { BestiaryMonster } from '@/models'
import { achievementMonsters } from './achievementHunt'

// OWNERS-PORT-MAP.md B10: the Achievement Hunt add-on's monster order (achievement-hunt/policy.ts),
// with the boss cut-off from its declared settings and the rares from the `passive.rule` reads.
const ladder = [[10, 'stat', 'hp', 1]]
const monster = (id: string, fields: Record<string, unknown>) => ({ id, name: id, definition: { achievements: ladder }, ...fields }) as unknown as BestiaryMonster
const at = [{ map: 'main', x: 0, y: 0 }]

describe('Achievement Hunt monster order', () => {
  const catalog = [monster('goo', { xp: 1, hp: 50 }), monster('stompy', { xp: 9, hp: 60_000 }), monster('phoenix', { xp: 5, hp: 100 })]
  const choices = [{ id: 'goo', locations: at }, { id: 'stompy', locations: at, spawnRecords: [{ count: 1 }] }, { id: 'phoenix', locations: at }]
  it("marks a big single spawn a boss by the add-on's cut-off and a passive rare as fought when seen", () => {
    const order = achievementMonsters(catalog, choices, { spawns: 2, hp: 50_000 }, (id) => id === 'phoenix')
    expect(order.map((m) => [m.id, m.special, m.boss, m.rare])).toEqual([['goo', false, false, false], ['phoenix', true, false, true], ['stompy', true, true, false]])
  })
  it('follows a changed cut-off and an empty rare list', () => {
    const order = achievementMonsters(catalog, choices, { spawns: 2, hp: 100_000 }, () => false)
    expect(order.filter((m) => m.special).map((m) => m.id)).toEqual([])
  })
})
