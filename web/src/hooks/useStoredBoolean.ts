import { useCallback, useSyncExternalStore, type SetStateAction } from 'react'

// A boolean preference kept in this device's localStorage, shared by every component
// that reads the same key. Console: dashboard/hooks/use-stored-boolean.ts.
const changed = 'party-preference-changed'
function subscribe(listener: () => void) {
  window.addEventListener('storage', listener)
  window.addEventListener(changed, listener)
  return () => {
    window.removeEventListener('storage', listener)
    window.removeEventListener(changed, listener)
  }
}

export function useStoredBoolean(key: string, fallback: boolean) {
  const read = useCallback(() => {
    try {
      const value = localStorage.getItem(key)
      return value === null ? fallback : value !== 'false'
    } catch {
      return fallback
    }
  }, [key, fallback])
  const value = useSyncExternalStore(subscribe, read, () => fallback)
  const set = (next: SetStateAction<boolean>) => {
    const updated = typeof next === 'function' ? next(read()) : next
    try {
      localStorage.setItem(key, String(updated))
    } catch {
      // Storage unavailable: the value stays as it was.
      return
    }
    window.dispatchEvent(new Event(changed))
  }
  return [value, set] as const
}
