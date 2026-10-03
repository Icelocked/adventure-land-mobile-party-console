import { useEffect, useState } from 'react'
import { mapStreamUrl } from '@/config/serverConfig'
import { useServerSettings } from './PartyDataProvider'
import { subscribeMapFrames } from './useMapFrames'

/**
 * Resolves a character's raw combat target (a per-instance entity id,
 * e.g. "2951603" - confirmed against the real client source,
 * characters/shared.js's `target: character.target`) into the monster's
 * actual type id (e.g. "crabx", matching the bestiary catalog), from that
 * one character's live map frames (the shared map-stream subscription in
 * useMapFrames.ts), looking the target id up in the latest frame's
 * `entities` list - each entry carries both `id` and `mtype`.
 *
 * Scoped to the open character-detail screen only. Misses (e.g. between a
 * fresh target and the next frame) resolve to `null` rather than ever
 * showing the raw id - see activityLine.ts's own fallback.
 */
export function useTargetMonsterType(characterName: string, target: string | undefined): string | null {
  const settings = useServerSettings()
  const [resolved, setResolved] = useState<string | null>(null)

  useEffect(() => {
    setResolved(null)
    if (!target) return
    return subscribeMapFrames(mapStreamUrl(settings, characterName), {
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
