import { useCallback, useEffect, useSyncExternalStore } from 'react'

// Each character has one live map (console map-dock-state.ts). MapSection's card copy and the
// card name strip's copy (CardNameStrip.tsx) share its open and native-size state, and the map
// body renders in the strip's dock while the strip shows, in the card otherwise. One body keeps a
// single map stream. The open flag is the PWA's folded-section choice for the map
// (lib/sectionOpen.ts `character:Map`), one per device; the native-size flag lasts the page.

const SECTION_KEY = 'party-section-open'
const OPEN_ID = 'character:Map'
const strips = new Map<string, boolean>()
const large = new Map<string, boolean>()
let open: boolean | null = null
const listeners = new Set<() => void>()
const notify = () => {
  for (const listener of listeners) listener()
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function savedSections(): Record<string, boolean> {
  try {
    const value = JSON.parse(localStorage.getItem(SECTION_KEY) || '{}')
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}
function readOpen(): boolean {
  if (open === null) open = savedSections()[OPEN_ID] ?? false
  return open
}

/** CardNameStrip reports whether its strip shows for `name`. Its unmount, when "Pin top bar" turns
 *  off or the screen closes, reports it hidden, so the map moves back into the card. */
export function useReportStrip(name: string, shown: boolean): void {
  useEffect(() => {
    if (strips.get(name) !== shown) {
      strips.set(name, shown)
      notify()
    }
    return () => {
      if (strips.get(name)) {
        strips.set(name, false)
        notify()
      }
    }
  }, [name, shown])
}

/** True while the strip for `name` shows, so the map body belongs in its dock. */
export function useStripShown(name: string): boolean {
  return useSyncExternalStore(subscribe, () => strips.get(name) === true, () => false)
}

/** The live map's open state, shared by every copy and kept on this device. */
export function useMapOpen(): readonly [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(subscribe, readOpen, () => false)
  const set = useCallback((next: boolean) => {
    open = next
    try {
      localStorage.setItem(SECTION_KEY, JSON.stringify({ ...savedSections(), [OPEN_ID]: next }))
    } catch {
      // Storage unavailable: the choice lasts until the page closes.
    }
    notify()
  }, [])
  return [value, set] as const
}

/** The native-size view of `name`'s map, shared so it stays open as the body moves. */
export function useMapLarge(name: string): readonly [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(subscribe, () => large.get(name) === true, () => false)
  const set = useCallback(
    (next: boolean) => {
      large.set(name, next)
      notify()
    },
    [name],
  )
  return [value, set] as const
}
