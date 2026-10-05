/** How recently a character last reported (status seenAt or a map frame's
 *  `at`, both on the server's clock), so a stuck character is visible from
 *  the phone. `live` matches the 10s online window (useCharacterOnline);
 *  past a minute it may be hung. */
export type Freshness = { level: 'live' | 'slow' | 'stale'; label: string }

export function ageLabel(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

export function freshness(ageMs: number, subject = 'update'): Freshness {
  if (ageMs < 10_000) return { level: 'live', label: `Live · last ${subject} ${ageLabel(ageMs)} ago` }
  if (ageMs < 60_000) return { level: 'slow', label: `No ${subject} for ${ageLabel(ageMs)}` }
  return { level: 'stale', label: `No ${subject} for ${ageLabel(ageMs)} — may be hung` }
}

export const freshnessColor: Record<Freshness['level'], string> = {
  live: 'text-emerald-400',
  slow: 'text-amber-300',
  stale: 'text-rose-400',
}
export const freshnessDot: Record<Freshness['level'], string> = {
  live: 'bg-emerald-400',
  slow: 'bg-amber-300',
  stale: 'bg-rose-500',
}
