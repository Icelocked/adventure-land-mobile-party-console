import { useMemo } from 'react'
import type { CharacterDiagnostics, CharacterVitals, PartyStateDynamic } from '@/models'
import { characterActivity, type ActivityCharacter, type ActivityState, type MonsterNames } from '@/lib/characterActivity'
import { useCharacterDiagnostics, useDynamicState } from './PartyDataProvider'

/** Bestiary display names, the raw id when the bestiary lacks one
 *  (connected-character-card.tsx monsterName). */
export function monsterNamer(state: PartyStateDynamic): MonsterNames {
  const names = new Map(state.bestiaryCatalog.map((monster) => [monster.id, monster.name]))
  return (id) => names.get(id) || id
}

/** The label for one character. The dashboard merges live vitals over
 *  core's characterDetails the same way (card-name-strip.tsx). */
export function activityLabel(name: string, vitals: CharacterVitals, diagnostics: CharacterDiagnostics | undefined, state: PartyStateDynamic, monster: MonsterNames): string {
  const character = { ...diagnostics, ...vitals, name } as unknown as ActivityCharacter
  return characterActivity(character, state as unknown as ActivityState, monster)
}

/** The activity label for [name], recomputed on every core poll and vitals update. */
export function useCharacterActivity(name: string, vitals: CharacterVitals): string {
  const state = useDynamicState()
  const diagnostics = useCharacterDiagnostics(name)
  const monster = useMemo(() => monsterNamer(state), [state])
  return activityLabel(name, vitals, diagnostics, state, monster)
}
