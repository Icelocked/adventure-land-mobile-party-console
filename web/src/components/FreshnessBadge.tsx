import { useServerOffset } from '@/data/PartyDataProvider'
import { useClock } from '@/lib/duration'
import { freshness, freshnessColor, freshnessDot } from '@/lib/freshness'

/** A live/slow/stale marker for the last report at [at] (server clock). */
export function FreshnessBadge({ at, subject, className = '' }: { at: number; subject?: string; className?: string }) {
  const now = useClock() + useServerOffset()
  const state = freshness(now - at, subject)
  return (
    <span role="status" data-freshness={state.level} className={`flex items-center gap-1.5 text-xs ${freshnessColor[state.level]} ${className}`}>
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${freshnessDot[state.level]}`} />
      {state.label}
    </span>
  )
}
