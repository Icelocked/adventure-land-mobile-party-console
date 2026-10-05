/** Module-level pub/sub for "command sent" feedback. Not React state
 *  because the trigger, PartyApiClient.post(), is a plain class. On a bad
 *  network a tap can take 10-15s to land; without this, nothing visibly
 *  happens and people tap again. */
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
