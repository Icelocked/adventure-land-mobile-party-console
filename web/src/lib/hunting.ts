// Console: runtime/coordinator/navigation/passive-settings.ts.
export interface PassiveRule {
  enabled: boolean
  keepMoving: boolean
  priority: number
  maxLevel?: number
}
export interface PassiveSettings {
  version: 1
  rules: Record<string, PassiveRule>
  useFieldGenerators: boolean
}
export const legacyPriorities: Record<string, number> = { tinyp: 101, phoenix: 100, goldenbat: 100, cutebee: 100, hen: 100, rooster: 100 }
export function defaultPassiveRule(id: string): PassiveRule {
  return { enabled: false, keepMoving: false, priority: legacyPriorities[id] ?? 100, maxLevel: -1 }
}
export function migratePassiveSettings(saved?: PassiveSettings | null, legacy: Record<string, boolean> = {}): PassiveSettings {
  if (saved?.version === 1) return saved
  return { version: 1, useFieldGenerators: true, rules: Object.fromEntries(Object.entries(legacy).map(([id, enabled]) => [id, { ...defaultPassiveRule(id), enabled }])) }
}
export type PassivePatch = { rules?: Record<string, Partial<PassiveRule>>; useFieldGenerators?: boolean }

/** Stable across catalog ordering; coordinates identify the spawn center. */
export function huntSpawnKey(location: { map: string; x: unknown; y: unknown }): string {
  return JSON.stringify([location.map, Number(location.x), Number(location.y)])
}

export function huntBlacklistLabel(entry: { deaths: number; expirations?: number; reason?: string }): string {
  if (entry.reason === 'Manually blacklisted') return 'manually added'
  const expired = entry.expirations ?? (entry.reason === 'Hunt quest expired before completion' ? 1 : 0)
  return [entry.deaths ? `${entry.deaths} hunt death${entry.deaths === 1 ? '' : 's'}` : '', expired ? `${expired} hunt${expired === 1 ? '' : 's'} expired` : ''].filter(Boolean).join(' · ')
}
