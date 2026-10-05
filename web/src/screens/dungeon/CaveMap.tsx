import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { MapCanvas } from '@/components/map/MapCanvas'
import type { MapFrame } from '@/components/map/mapTypes'
import { mapStreamUrl } from '@/config/serverConfig'
import { useServerSettings } from '@/data/PartyDataProvider'
import { subscribeMapFrames } from '@/data/useMapFrames'
import type { CaveObservation, DungeonView } from '@/models/dungeon'
import { dungeonButton } from './CaveEventRow'

/** The full floor map with party, room and waypoint pins,
 *  opened from the dungeon panel as a full-screen view. */
export function CaveMap({
  view,
  cave,
  action,
  error,
}: {
  view: DungeonView
  cave: NonNullable<CaveObservation['cave']>
  action: (body: Record<string, unknown>) => Promise<unknown>
  error: string
}) {
  const settings = useServerSettings()
  const [open, setOpen] = useState(false),
    [adding, setAdding] = useState(false)
  const [waypoint, setWaypoint] = useState<{ x: number; y: number } | null>(null)
  const [frames, setFrames] = useState<Record<string, MapFrame>>({})
  const [busy, setBusy] = useState(false)
  const [nativeSize, setNativeSize] = useState(false)
  const names = view.state.participants.join(',')
  const map = 'zone_' + cave.run + '_' + cave.floor
  useEffect(() => {
    if (!open) return
    const unsubscribe = names.split(',').map((name) =>
      subscribeMapFrames(mapStreamUrl(settings, name), {
        frame: (frame) => {
          if (frame.map === map) setFrames((old) => ({ ...old, [name]: frame }))
        },
      }),
    )
    return () => unsubscribe.forEach((stop) => stop())
  }, [open, names, map, settings])
  const frame = frames[view.state.participants[0]]?.definition ? frames[view.state.participants[0]] : Object.values(frames).find((f) => f.definition?.name === map)
  const pins = [
    ...cave.points
      .filter((p) => p.map === map && !p.exit)
      .map((p) => ({ x: p.x, y: p.y, label: p.label, color: p.done ? '#4ade80' : p.required ? '#fb923c' : '#facc15' })),
    ...Object.values(frames).map((f) => ({ x: f.x, y: f.y, label: f.name, color: '#67e8f9' })),
    ...(waypoint ? [{ ...waypoint, label: 'Waypoint', color: '#f472b6' }] : []),
  ]
  return (
    <>
      <button className={dungeonButton + ' mt-2'} onClick={() => setOpen(true)}>
        View full map
      </button>
      {open && (
        <div role="group" aria-label="Cave map" className="fixed inset-0 z-50 flex flex-col gap-2 bg-[#081713] p-3 text-emerald-50">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold">Cave of Many Dreams — Floor {cave.floor + 1}</p>
              <p className="text-xs text-slate-300">Cyan: party · Orange: required · Green: complete · Yellow: events · Pink: waypoint</p>
            </div>
            <button type="button" aria-label="Close cave map" onClick={() => setOpen(false)} className="rounded border border-emerald-600 bg-slate-950 p-1">
              <X className="size-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded border border-emerald-800 bg-[#07110f]">
            <MapCanvas
              definition={frame?.definition || null}
              frame={frame ? { ...frame, entities: Array.from(new Map(Object.values(frames).flatMap((f) => f.entities).map((e) => [e.id, e])).values()) } : null}
              previous={null}
              receivedAt={0}
              scale={1}
              detailed
              fullMap={!nativeSize}
              pins={pins}
              active={open}
              fps={15}
              onWaypoint={
                adding
                  ? (point) => {
                      setWaypoint(point)
                      setAdding(false)
                    }
                  : undefined
              }
            />
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            {Object.values(frames).map((f) => (
              <span key={f.name}>{f.name}</span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className={dungeonButton} disabled={!frame} onClick={() => setNativeSize((value) => !value)}>
              {nativeSize ? 'Fit full floor' : 'Native-size view'}
            </button>
            <button className={dungeonButton} disabled={!frame} onClick={() => setAdding(true)}>
              Add waypoint
            </button>
            <button
              className={dungeonButton}
              disabled={!waypoint || busy || cave.paused}
              onClick={async () => {
                if (!waypoint) return
                setBusy(true)
                try {
                  if (await action({ action: 'waypoint', map, ...waypoint })) setOpen(false)
                } finally {
                  setBusy(false)
                }
              }}
            >
              Set waypoint
            </button>
            <span className="text-sm text-slate-300">{adding ? 'Click the map to place your waypoint.' : waypoint ? `${Math.round(waypoint.x)}, ${Math.round(waypoint.y)}` : 'One waypoint at a time.'}</span>
          </div>
          {error && (
            <p role="alert" className="text-red-200">
              {error}
            </p>
          )}
        </div>
      )}
    </>
  )
}
