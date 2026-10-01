import { useEffect, useState } from 'react'
import { mapStreamUrl } from '@/config/serverConfig'
import { useServerSettings } from './PartyDataProvider'

interface MapEntity {
  id: string
  mtype?: string | null
}
interface MapFrame {
  entities?: MapEntity[]
}

/**
 * Resolves a character's raw combat target (a per-instance entity id,
 * e.g. "2951603" - confirmed against the real client source,
 * characters/shared.js's `target: character.target`) into the monster's
 * actual type id (e.g. "crabx", matching the bestiary catalog), by
 * subscribing to that one character's live map/entities feed
 * (runtime/coordinator/telemetry/map-stream.ts) and looking the target id
 * up in the most recent frame's `entities` list - the same `entities`
 * array the game client itself builds every attack cycle (publishMapFrame),
 * each entry carrying both `id` (the instance id) and `mtype` (the type).
 *
 * Deliberately scoped to ONE character at a time (only ever mounted on the
 * open character-detail screen, not the character list) - map frames are
 * relatively heavy and subscribing to every character's feed at once for a
 * cosmetic name lookup isn't a reasonable trade. Target id -> name misses
 * (e.g. between a fresh target and the next map frame arriving) resolve to
 * `null` rather than ever showing the raw id - see activityLine.ts's own
 * fallback for what callers show while this is null.
 *
 * Intentionally lighter than liveConnection.ts's dashboard-stream
 * connection (no watchdog/heartbeat-timeout reconnect logic) - this is
 * best-effort supplementary data, not the primary vitals channel, and
 * EventSource's own built-in auto-reconnect is an acceptable trade-off
 * for that lower stakes.
 */
export function useTargetMonsterType(characterName: string, target: string | undefined): string | null {
  const settings = useServerSettings()
  const [resolved, setResolved] = useState<string | null>(null)

  useEffect(() => {
    setResolved(null)
    if (!target) return
    const source = new EventSource(mapStreamUrl(settings, characterName))
    source.onmessage = (event) => {
      let frame: MapFrame | null = null
      try {
        frame = JSON.parse(event.data) as MapFrame
      } catch {
        return
      }
      const entity = frame?.entities?.find((e) => e.id === target)
      setResolved(entity?.mtype ?? null)
    }
    return () => source.close()
  }, [settings, characterName, target])

  return resolved
}
