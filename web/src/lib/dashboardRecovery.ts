/** Reconnect/backoff state machine behind the "couldn't render" screen.
 *  Console: dashboard/lib/dashboard-recovery.ts. The probe differs: the
 *  PWA has no /__dashboard supervisor, so it checks its own page instead. */
export type RecoveryStatus = { seconds: number; checking: boolean; blocked: boolean }
export const recoveryStoragePrefix = 'party-dashboard-recovery:'

export function clearRecoveryHistory(storage: Pick<Storage, 'length' | 'key' | 'removeItem'>): void {
  for (let index = storage.length - 1; index >= 0; index--) {
    const key = storage.key(index)
    if (key?.startsWith(recoveryStoragePrefix)) storage.removeItem(key)
  }
}

export function recoveryDelay(attempt: number): number {
  return attempt < 10 ? 1000 : Math.min(60000, 1000 * 2 ** Math.min(6, attempt - 9))
}

interface Ports {
  now(): number
  later(callback: () => void, ms: number): unknown
  cancel(timer: unknown): void
  probe(signal: AbortSignal): Promise<string | null>
  claimed(instance: string): boolean
  claim(instance: string): void
  reload(): void
  update(status: RecoveryStatus): void
}

export function startRecovery(ports: Ports) {
  let attempt = 0,
    disposed = false,
    checking = false,
    blocked = false,
    manual = false
  let timer: unknown, timeout: unknown, controller: AbortController | undefined
  let due = ports.now() + recoveryDelay(attempt)
  function publish() {
    ports.update({ seconds: Math.max(0, Math.ceil((due - ports.now()) / 1000)), checking, blocked })
  }
  function tick() {
    if (disposed) return
    publish()
    if (ports.now() >= due) void check()
    else timer = ports.later(tick, Math.min(1000, due - ports.now()))
  }
  async function check() {
    if (checking || disposed) return
    checking = true
    publish()
    controller = new AbortController()
    timeout = ports.later(() => controller?.abort(), 5000)
    try {
      const instance = await ports.probe(controller.signal)
      if (disposed || controller.signal.aborted) return
      if (instance) {
        blocked = !manual && ports.claimed(instance)
        // A healthy page blocked by loop protection is not a failed poll.
        attempt = -1
        if (!blocked) {
          // Store before navigating so a persistent render error cannot loop.
          try {
            ports.claim(instance)
          } catch (error) {
            if (!manual) throw error
          }
          disposed = true
          ports.reload()
        }
      } else blocked = false
    } catch {
      /* Keep checking after unavailable servers or timed-out requests. */
    } finally {
      ports.cancel(timeout)
      checking = false
      manual = false
      if (!disposed) {
        attempt++
        due = ports.now() + recoveryDelay(attempt)
        tick()
      }
    }
  }
  tick()
  return {
    retry() {
      if (disposed || checking) return
      ports.cancel(timer)
      attempt = -1
      manual = true
      blocked = false
      due = ports.now()
      void check()
    },
    dispose() {
      disposed = true
      ports.cancel(timer)
      ports.cancel(timeout)
      controller?.abort()
    },
  }
}

/** The PWA's probe: its own page is being served as HTML again. The
 *  instance is the served page's build (its main script URL), so a
 *  reload only "claims" each build once - the same loop protection. */
export async function probePwa(signal: AbortSignal): Promise<string | null> {
  const response = await fetch('/', { signal, cache: 'no-store', headers: { Accept: 'text/html' } })
  if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) return null
  const html = await response.text()
  return html.match(/src="([^"]+\.js)"/)?.[1] ?? 'pwa'
}
