import type { BestiaryMonster } from '@/models'
import type { Catalog as MonsterLocationCatalog } from './farmingZones'
import { achievementMilestones } from './monsterAchievements'

// The Achievement Hunt add-on's monster order (console runtime/addons/achievement-hunt/policy.ts
// achievementMonsters, nextStep).

export interface AchievementMonster {
  id: string
  name: string
  ladder: number[]
  xp: number
  threat: number
  hp: number
  special: boolean
  /** Flagged special by the game, or boss-like: a monster the party keeps away from. */
  boss: boolean
  /** A random respawn or one of passive hunting's rares: the console fights it when seen and never makes it the target. */
  rare: boolean
}

/** The boss cut-off, the add-on's declared `bossSpawns` and `bossHp` settings. No game field marks a boss. */
export interface BossCut {
  spawns: number
  hp: number
}
/** Whether passive hunting knows a monster by name: `passive.rule(id).corePriority` from the add-on list's reads. */
export type CorePriority = (id: string) => boolean

type SpawnChoice = { spawnRecords?: { count?: number; restrictions?: string[]; stype?: string }[] } | undefined

/** G.maps marks a spawn that moves between places `stype: "randomrespawn"` (Dracul, Phoenix); the console copies it into each spawn record. */
function randomRespawn(choice: SpawnChoice): boolean {
  return (choice?.spawnRecords || []).some((record) => record.stype === 'randomrespawn')
}

/** Spawns in the world from the spawn records, leaving out those the game marks "ignore". */
function worldSpawns(choice: SpawnChoice): number {
  return (choice?.spawnRecords || []).reduce((total, record) => (record.restrictions?.includes('ignore') ? total : total + (Number(record.count) || 0)), 0)
}

/** Every monster with achievements, weakest first: by XP (the game scales it with HP, damage and
 *  defenses), then threat, HP and name. Threat alone misranks: a Vampire Rat hits harder than a
 *  Fire Spirit but has a ninth of its HP. Special: unlisted (training dummies, Cave of Many Dreams), bosses,
 *  event, cooperative and random-respawn monsters, passive hunting's rares, and any without a regular spawn. */
export function achievementMonsters(catalog: BestiaryMonster[], choices: MonsterLocationCatalog, cut: BossCut, corePriority: CorePriority): AchievementMonster[] {
  const routable = new Set(choices.filter((choice) => (choice.locations || []).length > 0).map((choice) => choice.id))
  const choiceOf = (id: string) => choices.find((choice) => choice.id === id) as SpawnChoice
  // Never respawns, or is a big single spawn: Stompy, Skeletor, the crypt bosses.
  const bossLike = (monster: BestiaryMonster, definition: Record<string, unknown>) => {
    const respawn = Number(definition.respawn)
    if (Number.isFinite(respawn) && respawn < 0) return true
    const spawns = worldSpawns(choiceOf(monster.id))
    return spawns > 0 && spawns <= cut.spawns && (Number(monster.hp) || 0) >= cut.hp
  }
  const monsters = catalog
    .map((monster) => {
      const definition = (monster.definition || {}) as Record<string, unknown>
      const rare = randomRespawn(choiceOf(monster.id)) || corePriority(monster.id)
      const boss = !!definition.special || bossLike(monster, definition)
      return {
        id: monster.id,
        name: monster.name || monster.id,
        ladder: achievementMilestones(monster),
        xp: Number(monster.xp) || 0,
        threat: Number(monster.threat) || 0,
        hp: Number(monster.hp) || 0,
        special: boss || !!definition.cooperative || !!definition.unlist || rare || !routable.has(monster.id),
        boss,
        rare,
      }
    })
    .filter((monster) => monster.ladder.length > 0)
    .sort((a, b) => a.xp - b.xp || a.threat - b.threat || a.hp - b.hp || a.name.localeCompare(b.name))
  // The game names both `snake` and `osnake` "Snake"; a shared name shows the id.
  const counts = new Map<string, number>()
  for (const monster of monsters) counts.set(monster.name, (counts.get(monster.name) || 0) + 1)
  return monsters.map((monster) => ((counts.get(monster.name) || 0) > 1 ? { ...monster, name: `${monster.name} (${monster.id})` } : monster))
}

/** Index of the first milestone not yet reached, or -1 once the ladder is complete. */
export const nextStep = (ladder: readonly number[], kills: number) => ladder.findIndex((milestone) => kills < milestone)
