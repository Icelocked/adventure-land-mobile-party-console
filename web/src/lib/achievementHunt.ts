import type { BestiaryMonster } from '@/models'
import type { Catalog as MonsterLocationCatalog } from './farmingZones'
import { achievementMilestones } from './monsterAchievements'

// Console: runtime/hunt/achievement-policy.ts (achievementMonsters, nextStep).

export interface AchievementMonster {
  id: string
  name: string
  ladder: number[]
  xp: number
  threat: number
  hp: number
  special: boolean
  monster: BestiaryMonster
}

// Phoenix needs a route order and the Fairy passive hunting; the console rejects both.
const UNTARGETABLE = new Set(['phoenix', 'tinyp'])
// G.maps marks these spawns `stype: "randomrespawn"` (cave: mvampire, main: phoenix, game
// data 17665). The bestiary catalog does not carry spawn types.
const RANDOM_RESPAWN = new Set(['mvampire', 'phoenix'])

/** Every monster with achievements, weakest first: by XP (the game scales it with HP, damage and
 *  defenses), then threat, HP and name. Threat alone misranks: a Vampire Rat hits harder than a
 *  Fire Spirit but has a ninth of its HP. Special: unlisted (training dummies, Cave of Many Dreams), bosses,
 *  event, cooperative and random-respawn monsters, and any without a regular spawn. */
export function achievementMonsters(catalog: BestiaryMonster[], choices: MonsterLocationCatalog): AchievementMonster[] {
  const routable = new Set(choices.filter((choice) => (choice.locations || []).length > 0).map((choice) => choice.id))
  return catalog
    .filter((monster) => !UNTARGETABLE.has(monster.id))
    .map((monster) => {
      const definition = (monster.definition || {}) as Record<string, unknown>
      return {
        id: monster.id,
        name: monster.name || monster.id,
        ladder: achievementMilestones(monster),
        xp: Number(monster.xp) || 0,
        threat: Number(monster.threat) || 0,
        hp: Number(monster.hp) || 0,
        special: !!definition.special || !!definition.cooperative || !!definition.unlist || RANDOM_RESPAWN.has(monster.id) || !routable.has(monster.id),
        monster,
      }
    })
    .filter((monster) => monster.ladder.length > 0)
    .sort((a, b) => a.xp - b.xp || a.threat - b.threat || a.hp - b.hp || a.name.localeCompare(b.name))
}

/** Index of the first milestone not yet reached, or -1 once the ladder is complete. */
export const nextStep = (ladder: readonly number[], kills: number) => ladder.findIndex((milestone) => kills < milestone)
