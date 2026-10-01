import type { BestiaryMonster, CharacterVitals } from '@/models'

/** The "what are they actively doing" one-line readout, ported from
 *  ui/ActivityLine.kt - dead first, then a named activity flag the
 *  server reports, then whatever they're fighting, then a generic
 *  location fallback.
 *
 *  `vitals.target` is the game's own per-instance entity id (confirmed
 *  against the real client source, characters/shared.js: `target:
 *  character.target`), not a monster-type id - the static bestiary
 *  catalog (keyed by type, e.g. "crabx") essentially never matches it, so
 *  showing it raw is just a meaningless number. `resolvedTargetType` is
 *  the real type id (e.g. "crabx"), resolved live via the per-character
 *  map/entities stream (see data/useTargetMonsterType.ts) - only
 *  available on the character detail screen, which is the only place
 *  that subscription is open. Without it (the character list screen),
 *  this degrades to a plain "fighting" instead of exposing the raw id. */
export function activityLine(vitals: CharacterVitals, bestiaryCatalog: BestiaryMonster[] = [], resolvedTargetType?: string | null): string {
  if (vitals.rip) return 'dead'
  if (vitals.banking) return 'banking'
  if (vitals.bankQueued) return 'waiting for bank'
  if (vitals.stocking) return 'stocking up'
  if (vitals.upgrading) return 'upgrading'
  if (vitals.farmingMode) return `farming (${vitals.farmingMode})`
  if (vitals.target?.trim()) {
    const monster = bestiaryCatalog.find((m) => m.id === (resolvedTargetType ?? vitals.target))
    return monster ? `fighting ${monster.name}` : 'fighting'
  }
  return `at ${vitals.map} ${Math.trunc(vitals.x)},${Math.trunc(vitals.y)}`
}
