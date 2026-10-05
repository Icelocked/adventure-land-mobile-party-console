import type { BestiaryMonster } from '@/models'

type Progress = { score: number; owner?: string | null }
type CharacterAchievements = { name: string; monsterAchievements?: Record<string, Progress> | null }

/** The best score (and its owner) per monster across characters. */
export function aggregateMonsterAchievements(characters: Record<string, CharacterAchievements>) {
  const result: Record<string, { score: number; owner: string | null }> = {}
  for (const member of Object.values(characters)) {
    for (const [monsterId, progress] of Object.entries(member.monsterAchievements || {})) {
      if (result[monsterId] && Number(progress.score) <= result[monsterId].score) continue
      result[monsterId] = { score: Math.max(0, Number(progress.score) || 0), owner: progress.owner || member.name }
    }
  }
  return result
}

export function achievementMilestones(monster: BestiaryMonster): number[] {
  const entries = monster.definition?.achievements
  return Array.isArray(entries)
    ? entries
        .map((entry) => (Array.isArray(entry) ? Number(entry[0]) : 0))
        .filter((value) => Number.isFinite(value) && value > 0)
        .sort((a, b) => a - b)
    : []
}
