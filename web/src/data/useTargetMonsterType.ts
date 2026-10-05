import { useEffect, useState } from 'react'
import { mapStreamUrl } from '@/config/serverConfig'
import { useServerSettings } from './PartyDataProvider'
import { observeMapFrames } from './useMapFrames'

/**
 * Resolves a character's combat target (an entity instance id such as
 * "2951603") to the monster type id (e.g. "crabx") using the latest map
 * frame's `entities`.
 *
 * Passive: it only reads frames while a map view has the character's map
 * stream open, because an open stream makes the character post frames
 * continuously. Misses resolve to `null`, never the raw id.
 */
export function useTargetMonsterType(characterName: string, target: string | undefined): string | null {
  const settings = useServerSettings()
  const [resolved, setResolved] = useState<string | null>(null)

  useEffect(() => {
    setResolved(null)
    if (!target) return
    return observeMapFrames(mapStreamUrl(settings, characterName), {
      frame: (frame) => {
        // Entity ids arrive as strings here; the vitals `target` may not.
        const entity = frame?.entities?.find((e) => String(e.id) === String(target))
        setResolved(entity?.mtype ?? null)
      },
    })
  }, [settings, characterName, target])

  return resolved
}
