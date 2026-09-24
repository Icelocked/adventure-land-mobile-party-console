import type { CharacterVitals } from '@/models'

/** The "what are they actively doing" one-line readout, ported from
 *  ui/ActivityLine.kt - dead first, then a named activity flag the
 *  server reports, then whatever they're fighting, then a generic
 *  location fallback. */
export function activityLine(vitals: CharacterVitals): string {
  if (vitals.rip) return 'dead'
  if (vitals.banking) return 'banking'
  if (vitals.bankQueued) return 'waiting for bank'
  if (vitals.stocking) return 'stocking up'
  if (vitals.upgrading) return 'upgrading'
  if (vitals.farmingMode) return `farming (${vitals.farmingMode})`
  if (vitals.target?.trim()) return `fighting ${vitals.target}`
  return `at ${vitals.map} ${Math.trunc(vitals.x)},${Math.trunc(vitals.y)}`
}
