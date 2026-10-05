import { useEffect, useState } from 'react'
import { mapStreamUrl } from '@/config/serverConfig'
import { useServerSettings } from './PartyDataProvider'
import { observeMapFrames } from './useMapFrames'

/**
 * Resolves a character's raw combat target (a per-instance entity id,
 * e.g. "2951603" - characters/shared.js's `target: character.target`) into
 * the monster's type id (e.g. "crabx", matching the bestiary catalog), from
 * the latest map frame's `entities` (each carries `id` and `mtype`).
 *
 * Passive: it only reads frames while the live map or the Cave map has the
 * character's map stream open. Opening a stream just for this name made the
 * character stream frames to the console continuously, load the dashboard
 * never creates. Misses resolve to `null` rather than the raw id - see
 * activityLine.ts's own fallback.
 */
export function useTargetMonsterType(characterName: string, target: string | undefined): string | null {
  const settings = useServerSettings()
  const [resolved, setResolved] = useState<string | null>(null)

  useEffect(() => {
    setResolved(null)
    if (!target) return
    return observeMapFrames(mapStreamUrl(settings, characterName), {
      frame: (frame) => {
        // String() both sides: mapEntity() casts entity ids to String() for
        // this feed while the vitals status's own `target` is not coerced.
        const entity = frame?.entities?.find((e) => String(e.id) === String(target))
        setResolved(entity?.mtype ?? null)
      },
    })
  }, [settings, characterName, target])

  return resolved
}
