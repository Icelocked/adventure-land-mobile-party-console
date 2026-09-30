/** A tiny module-level pub/sub for "a command was just sent" feedback -
 *  not React state, because the thing that needs to trigger it
 *  (PartyApiClient.post(), a plain class with no React context access)
 *  isn't a component. Instrumenting the API client's one shared post()
 *  method here means every mutating action gets this feedback for free,
 *  with no per-button changes anywhere - added after a bad-network
 *  session where taps looked like they did nothing for 10-15 seconds,
 *  so people tapped the same button repeatedly with no way to tell
 *  whether the first tap had actually gone through. */
export type ActionToastStatus = 'sending' | 'sent' | 'failed'
export interface ActionToastEntry {
  id: string
  status: ActionToastStatus
  message?: string
}

const SENT_DISMISS_MS = 1200
const FAILED_DISMISS_MS = 3000

let entries: ActionToastEntry[] = []
const listeners = new Set<(entries: ActionToastEntry[]) => void>()

function notify() {
  for (const listener of listeners) listener(entries)
}

export function subscribeActionToasts(listener: (entries: ActionToastEntry[]) => void): () => void {
  listeners.add(listener)
  listener(entries)
  return () => {
    listeners.delete(listener)
  }
}

/** Call the moment a command is actually dispatched (before awaiting the
 *  response) - returns an id to resolve once the response arrives. */
export function beginActionToast(): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  entries = [...entries, { id, status: 'sending' }]
  notify()
  return id
}

export function resolveActionToast(id: string, status: 'sent' | 'failed', message?: string): void {
  entries = entries.map((entry) => (entry.id === id ? { ...entry, status, message } : entry))
  notify()
  setTimeout(
    () => {
      entries = entries.filter((entry) => entry.id !== id)
      notify()
    },
    status === 'failed' ? FAILED_DISMISS_MS : SENT_DISMISS_MS,
  )
}
