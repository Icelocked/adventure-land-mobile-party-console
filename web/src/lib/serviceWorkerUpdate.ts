import { registerSW } from 'virtual:pwa-register'

/** An installed PWA has no browser chrome, so there is no hard refresh and
 *  a stuck service worker could pin an old build indefinitely. New builds
 *  surface as a dismissible "Update available" banner (not a forced
 *  reload, which could discard a half-filled form), and Settings offers a
 *  manual "Check for updates". */
export type UpdateStatus = 'idle' | 'checking' | 'available' | 'upToDate' | 'unsupported'

const listeners = new Set<(status: UpdateStatus) => void>()
let status: UpdateStatus = 'idle'
let applyUpdate: ((reloadPage?: boolean) => Promise<void>) | null = null
let initialized = false

function setStatus(next: UpdateStatus): void {
  status = next
  for (const listener of listeners) listener(status)
}

export function subscribeUpdateStatus(listener: (status: UpdateStatus) => void): () => void {
  listeners.add(listener)
  listener(status)
  return () => {
    listeners.delete(listener)
  }
}

/** Call once at app startup. Registers the service worker and starts
 *  listening for a newer one becoming available in the background. */
export function initServiceWorkerUpdates(): void {
  if (initialized) return
  initialized = true
  if (!('serviceWorker' in navigator)) {
    setStatus('unsupported')
    return
  }
  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      setStatus('available')
    },
  })
}

/** Forces every registered service worker to check for a new build now
 *  instead of on the browser's schedule. */
export async function checkForUpdate(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    setStatus('unsupported')
    return
  }
  setStatus('checking')
  const registrations = await navigator.serviceWorker.getRegistrations()
  if (registrations.length === 0) {
    setStatus('unsupported')
    return
  }
  await Promise.all(registrations.map((registration) => registration.update().catch(() => undefined)))
  // onNeedRefresh fires asynchronously if a new worker was found, so wait
  // a moment, and don't overwrite 'available' if it already fired.
  setTimeout(() => {
    if (status === 'checking') setStatus('upToDate')
  }, 2000)
}

/** Activates the waiting service worker and reloads. */
export function applyPendingUpdate(): void {
  void applyUpdate?.(true)
}
