import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Maximize2, X } from 'lucide-react'
import { MapCanvas } from '@/components/map/MapCanvas'
import { FreshnessBadge } from '@/components/FreshnessBadge'
import { receiveMapFrame, type MapRenderBuffer } from '@/components/map/mapRendering'
import type { MapDefinition } from '@/components/map/mapTypes'
import { useMapDefinition, useMapFrames, useVisible } from '@/data/useMapFrames'

/** character-map-section.tsx: the collapsible live map under the
 *  character's position, at 20 fps while open and the page is visible,
 *  with a native-size view (names and hit/heal floaters). */
export function MapSection({ name, map, x, y }: { name: string; map: string; x: number; y: number }) {
  const caveMap = /^zone_[a-f0-9]+_\d+$/.test(map)
  const mapLabel = caveMap ? 'Cave of Many Dreams' : map
  const [open, setOpen] = useState(false)
  const [large, setLarge] = useState(false)
  const [streamDefinition, setStreamDefinition] = useState<MapDefinition | null>(null)
  const definitionQuery = useMapDefinition(map, open && !caveMap)
  const definition = caveMap ? (streamDefinition?.name === map ? streamDefinition : null) : definitionQuery.data || null
  const visible = useVisible()
  const buffer = useRef<MapRenderBuffer>({ frame: null, previous: null, receivedAt: 0 })
  const [streamState, setStreamState] = useState('loading')
  const [lastFrameAt, setLastFrameAt] = useState(0)
  const mapRef = useRef(map)
  useEffect(() => {
    mapRef.current = map
  }, [map])
  const [listener] = useState(() => ({
    state: (state: string) => setStreamState(state),
    frame: (next: import('@/components/map/mapTypes').MapFrame) => {
      if (next.map !== mapRef.current) return
      if (next.definition?.name === next.map) {
        const supplied = next.definition
        setStreamDefinition((previous) => (previous?.name === supplied.name ? previous : supplied))
      }
      receiveMapFrame(buffer.current, next, performance.now(), Date.now())
      // Re-render for the age badge at most once per second of frame time.
      const at = Number(next.at) || 0
      setLastFrameAt((previous) => (Math.floor(previous / 1000) === Math.floor(at / 1000) ? previous : at))
    },
  }))
  useMapFrames(name, open && visible, listener)

  return (
    <div className="px-3 pt-1">
      <div className="flex items-center gap-1 font-mono text-xs text-cyan-200/65">
        <button
          type="button"
          onClick={() => {
            if (!open) {
              Object.assign(buffer.current, { frame: null, previous: null, receivedAt: 0 })
              setLastFrameAt(0)
            }
            setOpen((value) => !value)
          }}
          className="rounded p-0.5"
          aria-label={open ? 'Collapse live map' : 'Expand live map'}
        >
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
        <span>
          {mapLabel} [{Math.round(x)}, {Math.round(y)}]
        </span>
      </div>
      {open ? (
        <div className="relative mt-2 aspect-[4/3] overflow-hidden rounded-md border border-emerald-800/80 bg-[#07110f]">
          <MapCanvas definition={definition} frame={null} previous={null} receivedAt={0} buffer={buffer} fps={20} active={open && visible && !large} scale={1 / 3} detailed={false} />
          <button
            type="button"
            onClick={() => setLarge(true)}
            className="absolute right-2 top-2 rounded border border-emerald-700 bg-[#07110f]/90 p-1.5 text-emerald-200"
            aria-label="Open native-size map"
          >
            <Maximize2 className="size-4" />
          </button>
          {streamState !== 'live' ? <span className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 font-mono text-[10px] text-amber-200">{streamState}</span> : null}
          {/* Not on the dashboard: the console replays its last frame and keeps the stream open, so a hung character looks live without this. */}
          {streamState === 'live' && (
            <span className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1">
              {lastFrameAt > 0 ? <FreshnessBadge at={lastFrameAt} subject="frame" /> : <span className="text-xs text-slate-300">Waiting for the first frame…</span>}
            </span>
          )}
        </div>
      ) : null}
      {large && (
        <div role="group" aria-label="Native-size map" className="fixed inset-0 z-50 flex flex-col bg-[#081713]">
          <div className="flex items-center justify-between border-b border-emerald-800 px-4 py-3">
            <span className="font-medium text-emerald-50">
              {name} — {mapLabel}
            </span>
            {lastFrameAt > 0 && <FreshnessBadge at={lastFrameAt} subject="frame" className="ml-auto mr-3" />}
            <button type="button" aria-label="Close native-size map" onClick={() => setLarge(false)} className="rounded p-1 text-emerald-100">
              <X className="size-5" />
            </button>
          </div>
          <div className="min-h-0 w-full flex-1 overflow-hidden bg-[#07110f]">
            <MapCanvas definition={definition} frame={null} previous={null} receivedAt={0} buffer={buffer} fps={20} active={open && visible && large} scale={1} detailed />
          </div>
        </div>
      )}
    </div>
  )
}
