import type { BestiaryMonster, CharacterVitals } from '@/models'

/** One-line "what are they doing" readout: dead, then a server-reported
 *  activity flag, then what they're fighting, then their location.
 *
 *  `vitals.target` is an entity instance id, not a monster type, so it
 *  can't be looked up in the bestiary. `resolvedTargetType` comes from the
 *  map stream (useTargetMonsterType), open only on the detail screen;
 *  without it this shows a plain "fighting". */
export function activityLine(vitals: CharacterVitals, bestiaryCatalog: BestiaryMonster[] = [], resolvedTargetType?: string | null): string {
  if (vitals.rip) return 'dead'
  if (vitals.banking) return 'banking'
  if (vitals.bankQueued) return 'waiting for bank'
  if (vitals.stocking) return 'stocking up'
  if (vitals.upgrading) return 'upgrading'
  if (vitals.farmingMode) return `farming (${vitals.farmingMode})`
  // The server doesn't coerce target to a string; it may be a number.
  if (vitals.target != null && String(vitals.target).trim()) {
    const monster = bestiaryCatalog.find((m) => m.id === (resolvedTargetType ?? vitals.target))
    return monster ? `fighting ${monster.name}` : 'fighting'
  }
  return `at ${vitals.map} ${Math.trunc(vitals.x)},${Math.trunc(vitals.y)}`
}
