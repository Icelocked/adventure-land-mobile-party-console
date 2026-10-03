import { useMemo } from 'react'
import { aggregateMonsterAchievements } from '@/lib/monsterAchievements'
import { useCharacterDiagnosticsMap } from './PartyDataProvider'

type Achievement = { score: number; owner: string | null }

/** party-reference-panels.tsx monsterAchievements: aggregated from every character's diagnostics. */
export function useMonsterAchievements(): Record<string, Achievement> {
  const diagnostics = useCharacterDiagnosticsMap()
  return useMemo(
    () =>
      aggregateMonsterAchievements(
        Object.fromEntries(
          Object.entries(diagnostics).map(([name, detail]) => [name, { name, monsterAchievements: detail.monsterAchievements as Record<string, { score: number; owner?: string | null }> | null | undefined }]),
        ),
      ),
    [diagnostics],
  )
}

