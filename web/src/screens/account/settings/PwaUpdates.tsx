import { useEffect, useState } from 'react'
import { useServerSettings } from '@/data/PartyDataProvider'
import { Button } from '@/components/ui/button'
import { applyPendingUpdate, checkForUpdate, subscribeUpdateStatus, type UpdateStatus } from '@/lib/serviceWorkerUpdate'

/** web/notifier/updates.mjs status(). */
export interface PwaUpdateStatus {
  current: string
  available?: string
  notes?: string
  checkedAt?: number
  automatic: boolean
  managed: boolean
  updater: boolean
  phase: 'idle' | 'checking' | 'available' | 'installing'
  error?: string
}

async function updates(baseUrl: string, path: string, body?: unknown): Promise<PwaUpdateStatus> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/notify/update${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = (await response.json().catch(() => ({}))) as PwaUpdateStatus & { error?: string }
  if (!response.ok) throw new Error(data.error || `Update service unavailable (HTTP ${response.status})`)
  return data
}

/** The PWA server's own release updates, laid out like the console's update
 *  panel. Also hosts the service-worker reload: an installed home-screen app
 *  has no address bar to force-refresh from. */
export function PwaUpdateSettings() {
  const { baseUrl } = useServerSettings()
  const [state, setState] = useState<PwaUpdateStatus | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [build, setBuild] = useState<UpdateStatus>('idle')
  useEffect(() => subscribeUpdateStatus(setBuild), [])
  useEffect(() => {
    let alive = true
    const refresh = async () => {
      try {
        const value = await updates(baseUrl, '')
        if (alive) {
          setState(value)
          setError('')
        }
      } catch (e) {
        // Expected for a moment while an update restarts the server.
        if (alive) setError((e as Error).message)
      }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 3000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [baseUrl])

  const action = async (path: string, body: Record<string, unknown> = {}) => {
    setPending(true)
    setError('')
    try {
      setState(await updates(baseUrl, path, body))
    } catch (e) {
      setError((e as Error).message)
      updates(baseUrl, '').then(setState, () => {})
    } finally {
      setPending(false)
    }
  }
  const checkNow = () => {
    void checkForUpdate()
    void action('/check')
  }

  const phase = state?.phase ?? 'idle'
  const busy = pending || phase === 'checking' || phase === 'installing'
  const message =
    phase === 'installing'
      ? 'Installing. The app reconnects by itself, then offers a reload.'
      : phase === 'checking'
        ? 'Checking…'
        : state?.available
          ? 'Update available.'
          : state?.checkedAt
            ? 'Up to date.'
            : 'Waiting for the first update check.'

  return (
    <section id="pwa-updates" aria-label="Party Console PWA" tabIndex={-1} className="space-y-3 rounded-md border border-border bg-card p-4 text-sm">
      <h3 className="font-semibold">Party Console PWA</h3>
      <p>
        Installed version: <span className="font-mono">{state?.current || 'Checking…'}</span>
      </p>
      {state?.available && (
        <p className="text-emerald-200">
          New release available: {state.available}{' '}
          {state.notes && (
            <a href={state.notes} target="_blank" rel="noreferrer" className="underline">
              Release notes
            </a>
          )}
        </p>
      )}
      {state && <p role="status">{message}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={checkNow}>
          Check now
        </Button>
        {!!state?.available && state.managed && (
          <Button variant="outline" disabled={busy} onClick={() => void action('/install')}>
            Download and install update
          </Button>
        )}
        {build === 'available' && <Button onClick={applyPendingUpdate}>Reload to update</Button>}
      </div>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-emerald-500"
          checked={state?.automatic === true}
          disabled={!state?.managed || busy}
          onChange={(event) => {
            const automatic = event.target.checked
            // Show the change at once; a failed save is replaced by the server's state.
            setState((current) => current && { ...current, automatic })
            void action('/preferences', { automatic })
          }}
        />
        Automatically download and install new versions when available
      </label>
      <p className="text-xs text-slate-300">Checks for new releases every 6 hours. Check now checks immediately and also picks up a newer build this device hasn't loaded yet.</p>
      {state && !state.updater && state.current !== 'development build' && (
        <p className="text-amber-200">Installing from here needs the updater service. See “Automatic updates” in DEPLOYMENT.md; until then, update with the commands in the release notes.</p>
      )}
      {state?.current === 'development build' && <p className="text-amber-200">Built from source: update notices only. Rebuild from source to update.</p>}
      {(error || state?.error) && (
        <p role="alert" className="text-rose-300">
          {error || state?.error}
        </p>
      )}
    </section>
  )
}
