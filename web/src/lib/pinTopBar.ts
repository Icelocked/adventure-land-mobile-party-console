import { useCallback, useSyncExternalStore } from 'react'

// "Pin top bar" (console pin-top-bar.tsx), a display choice kept on this device under the PWA's
// own key. It is off by default. On, the party header sticks to the top of the party screen and
// the character screen shows the card name strip (CardNameStrip.tsx) with the map dock.
export const PIN_TOP_BAR_KEY = 'party-console-companion:pin-top-bar'
const changed = 'party-pin-top-bar-changed'

function subscribe(listener: () => void) {
  window.addEventListener('storage', listener)
  window.addEventListener(changed, listener)
  return () => {
    window.removeEventListener('storage', listener)
    window.removeEventListener(changed, listener)
  }
}
function read(): boolean {
  try {
    return localStorage.getItem(PIN_TOP_BAR_KEY) === 'true'
  } catch {
    return false
  }
}

export function usePinTopBar(): [boolean, (pinned: boolean) => void] {
  const pinned = useSyncExternalStore(subscribe, read, () => false)
  const setPinned = useCallback((next: boolean) => {
    try {
      localStorage.setItem(PIN_TOP_BAR_KEY, String(next))
    } catch {
      // Storage unavailable: the switch stays as it was.
      return
    }
    window.dispatchEvent(new Event(changed))
  }, [])
  return [pinned, setPinned]
}
