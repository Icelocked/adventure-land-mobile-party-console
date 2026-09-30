import { registerSW } from 'virtual:pwa-register'

/** Once installed to a home screen, a PWA has no browser chrome at all -
 *  no URL bar, no "hard refresh", no way to clear site data. Without an
 *  explicit in-app path, a stuck service worker can pin someone on an old
 *  build indefinitely, with their only real fix being to uninstall and
 *  reinstall the app, or dig into system-level browser settings. This
 *  gives the app two things instead: it detects a new build automatically
 *  (surfaced as a dismissible "Update available" banner rather than a
 *  silent forced reload, since that could yank someone off a half-filled
 *  form), and Settings gets a manual "Check for updates" action that
 *  forces the same check on demand - the in-app equivalent of a hard
 *  refresh, reachable without ever leaving the installed app. */
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

/** The manual "Check for updates" action - forces every registered
 *  service worker to re-fetch and compare against what's actually
 *  deployed right now, the same check the browser would normally only
 *  run on its own schedule. */
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
  // onNeedRefresh fires asynchronously if a new worker was actually
  // found - give it a moment before concluding there's nothing new.
  // Only downgrade 'checking' -> 'upToDate'; if onNeedRefresh already
  // flipped it to 'available' in the meantime, leave that alone.
  setTimeout(() => {
    if (status === 'checking') setStatus('upToDate')
  }, 2000)
}

/** Applies whatever new service worker is already waiting and reloads -
 *  the banner's own "Reload" button, or callable directly. */
export function applyPendingUpdate(): void {
  void applyUpdate?.(true)
}
