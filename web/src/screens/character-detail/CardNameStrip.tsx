import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { CharacterPortrait } from '@/components/CharacterPortrait'
import { useReportStrip } from '@/components/map/mapDockState'
import { useCharacterActivity } from '@/data/useCharacterActivity'
import { useCharacterDiagnostics } from '@/data/PartyDataProvider'
import { cardLine } from '@/api/ownersCards'
import { MapSection } from './sections/MapSection'
import type { CharacterVitals } from '@/models'

// The card name strip (console card-name-strip.tsx), shown while "Pin top bar" is on
// (lib/pinTopBar.ts). It hangs under the character screen's sticky title bar once the card's own
// name has scrolled under that bar, and takes no layout space: its wrapper is zero height. Its
// location row is a second MapSection, so the live map docks under the strip.

/** The sticky bar's height, and true while `identity` sits above the bar's bottom edge. */
function useScrolledUnder(bar: RefObject<HTMLElement | null>, identity: RefObject<HTMLElement | null>) {
  const [offset, setOffset] = useState(0)
  const [under, setUnder] = useState(false)
  useEffect(() => {
    const element = bar.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(() => setOffset(Math.round(element.getBoundingClientRect().height)))
    watch.observe(element)
    return () => watch.disconnect()
  }, [bar])
  useEffect(() => {
    const element = identity.current
    if (!element) return
    const watch = new IntersectionObserver(
      ([entry]) => setUnder(!entry.isIntersecting && entry.boundingClientRect.bottom <= offset),
      { rootMargin: `-${offset}px 0px 0px 0px` },
    )
    watch.observe(element)
    return () => watch.disconnect()
  }, [identity, offset])
  return under
}

const heightKey = (name: string) => 'party-console-companion:map-dock-height:' + name
function savedHeight(name: string): number | null {
  try {
    const value = Number(localStorage.getItem(heightKey(name)))
    return value > 0 ? value : null
  } catch {
    return null
  }
}
/** Height of the docked map: 35% of the viewport until the bottom handle drags it. */
function useDockHeight(name: string) {
  const [height, setHeight] = useState<number | null>(() => savedHeight(name))
  function drag(event: ReactPointerEvent<HTMLButtonElement>) {
    const dock = event.currentTarget.previousElementSibling as HTMLElement | null
    if (!dock) return
    event.preventDefault()
    const handle = event.currentTarget
    const start = event.clientY
    const from = dock.getBoundingClientRect().height
    handle.setPointerCapture(event.pointerId)
    let next = from
    const move = (moved: PointerEvent) => {
      next = Math.round(Math.min(window.innerHeight * 0.8, Math.max(120, from + moved.clientY - start)))
      setHeight(next)
    }
    const end = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', end)
      handle.removeEventListener('pointercancel', end)
      try {
        localStorage.setItem(heightKey(name), String(next))
      } catch {
        // The height resets on reload.
      }
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', end)
    handle.addEventListener('pointercancel', end)
  }
  return { height, drag }
}

const title = (value: string) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : value)

export function CardNameStrip({ name, vitals, bar, identity }: { name: string; vitals: CharacterVitals; bar: RefObject<HTMLElement | null>; identity: RefObject<HTMLElement | null> }) {
  const visible = useScrolledUnder(bar, identity)
  useReportStrip(name, visible)
  const diagnostics = useCharacterDiagnostics(name)
  const line = cardLine(diagnostics)
  // The release's strip shows the console's own line; the fork console sends none, so the phone's label stands in.
  const fallback = useCharacterActivity(name, vitals)
  const activity = line === undefined ? fallback : (line?.text ?? '')
  const [dock, setDock] = useState<HTMLDivElement | null>(null)
  const strip = useRef<HTMLDivElement>(null)
  // Escape with focus inside the docked map presses the strip's own collapse arrow.
  useEffect(() => {
    if (!dock) return
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !dock.contains(document.activeElement)) return
      strip.current?.querySelector<HTMLButtonElement>('[aria-label="Collapse live map"]')?.click()
    }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [dock])
  const { height, drag } = useDockHeight(name)
  return (
    <div className="relative h-0">
      <div data-card-name-strip={name} hidden={!visible} className="absolute inset-x-0 top-0 text-emerald-50 shadow-lg shadow-black/40">
        <div ref={strip} data-card-strip-line className="flex items-center gap-2 border-b border-emerald-900/70 bg-[#0b1916] px-3 py-1">
          <span className="relative h-9 w-6 shrink-0 overflow-hidden rounded border border-emerald-800/80 bg-[#07100f]">
            <CharacterPortrait html={diagnostics?.characterDollHtml} sprite={diagnostics?.characterSprite} skin={diagnostics?.skin} className="h-full w-full" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-sm font-semibold">{name}</span>
              <span className="shrink-0 font-mono text-[11px] text-emerald-200/60">
                {vitals.level} {title(vitals.ctype)} {(vitals.primaryStat || '').toUpperCase()}
              </span>
              <span data-card-strip-location className="ml-auto flex min-w-5 shrink-[1000] justify-end">
                <MapSection name={name} map={vitals.map} x={vitals.x} y={vitals.y} dock={dock} />
              </span>
            </span>
            <span data-card-activity className="truncate text-xs text-emerald-100/80" title={activity}>
              {activity}
            </span>
          </span>
        </div>
        <div ref={setDock} data-card-strip-map aria-label={`${name} docked map`} className="peer bg-[#07110f] empty:hidden" style={{ height: height ? `${height}px` : '35vh' }} />
        <button
          type="button"
          aria-label={`Resize ${name} docked map`}
          onPointerDown={drag}
          className="block h-2 w-full cursor-ns-resize touch-none border-b border-emerald-900/70 bg-[#0b1916] peer-empty:hidden"
        />
      </div>
    </div>
  )
}
