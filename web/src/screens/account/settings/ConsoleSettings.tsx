import { useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { usePartyApi, useServerSettings } from '@/data/PartyDataProvider'
import { useConsoleUpdates } from '@/hooks/useConsoleUpdates'
import { Button } from '@/components/ui/button'

/** hosting-settings.tsx HostingSettings: the pairing requirement and the setup link. */
export function HostingSettings() {
  const api = usePartyApi()
  const settings = useServerSettings()
  const [required, setRequired] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void api.getRoot('setup/state').then((result) => {
      if (!active) return
      if (result.kind === 'failure') return setError('Choose Load setup to pair this browser.')
      try {
        setRequired((JSON.parse(result.value) as { requirePairing: boolean }).requirePairing)
      } catch {
        setError('Choose Load setup to pair this browser.')
      }
    })
    return () => {
      active = false
    }
  }, [api])
  async function change(requirePairing: boolean) {
    setBusy(true)
    setError('')
    const result = await api.postRoot('setup/pairing', { requirePairing })
    if (result.kind === 'failure') setError(result.message)
    else {
      try {
        setRequired((JSON.parse(result.value) as { requirePairing: boolean }).requirePairing)
      } catch {
        setRequired(requirePairing)
      }
    }
    setBusy(false)
  }
  return (
    <section aria-label="Hosting" className="space-y-3 rounded-md border border-border bg-card p-4 text-sm">
      <label className="flex items-center gap-3 font-semibold">
        <input type="checkbox" className="size-4 accent-violet-500" checked={required === true} disabled={busy || required === null} onChange={(event) => void change(event.target.checked)} />
        Require secure pairing
      </label>
      <p className="text-xs">Require paired browsers and private Steam connection tokens. Recommended when hosting at a publicly accessible URL; use HTTPS. When off, anyone who can reach this dashboard can control it.</p>
      {required && <p className="text-xs text-amber-200">This browser is authorized. Unpaired browsers and tokenless Steam loaders must reconnect using an invitation or a new private loader.</p>}
      <Button variant="outline" onClick={() => window.location.assign(`${settings.baseUrl.replace(/\/+$/, '')}/setup`)}>
        Load setup
      </Button>
      {error && (
        <p role="alert" className="text-rose-300">
          {error}
        </p>
      )}
    </section>
  )
}

/** console-updates.tsx ConsoleUpdateSettings (with DebugInstanceSettings). */
export function ConsoleUpdateSettings() {
  const api = usePartyApi()
  const { state, error: readError } = useConsoleUpdates()
  const [actionError, setActionError] = useState('')
  const error = actionError || readError
  const action = async (name: 'check' | 'download' | 'restart' | 'preferences', value: Record<string, unknown> = {}) => {
    setActionError('')
    const result = await api.consoleUpdateAction(name, value)
    if (result.kind === 'failure') setActionError(result.message || 'Update request failed')
  }
  const phase = String(state?.phase || '')
  const busy = !!state && ['checking', 'downloading', 'restarting'].includes(phase)
  return (
    <section id="console-updates" aria-label="Adventureland Party Console" tabIndex={-1} className="space-y-3 rounded-md border border-border bg-card p-4 text-sm">
      <h3 className="font-semibold">Adventureland Party Console</h3>
      <p>
        Installed version: <span className="font-mono">{state?.current || 'Checking…'}</span>
      </p>
      {state?.available && (
        <p className="text-emerald-200">
          New release available: {String(state.available)}{' '}
          {typeof state.notes === 'string' && state.notes && (
            <a href={state.notes} target="_blank" rel="noreferrer" className="underline">
              Release notes
            </a>
          )}
        </p>
      )}
      {state && (
        <p role="status">
          {phase === 'ready'
            ? 'Update downloaded. Restart when you are ready.'
            : phase === 'restarting'
              ? 'Pausing work and restarting. This page will reconnect automatically.'
              : phase === 'idle'
                ? state.checkedAt
                  ? 'Up to date.'
                  : 'Waiting for the first update check.'
                : phase.replace(/^[a-z]/, (c) => c.toUpperCase())}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy || !state} onClick={() => void action('check')}>
          Check now
        </Button>
        {!!state?.available && !!state.managed && !['ready', 'blocked'].includes(phase) && (
          <Button variant="outline" disabled={busy} onClick={() => void action('download')}>
            Download and install update
          </Button>
        )}
        {!!state?.managed && ['ready', 'blocked'].includes(phase) && (
          <Button variant="outline" className="border-emerald-500 text-emerald-100" onClick={() => void action('restart')}>
            Restart now
          </Button>
        )}
      </div>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-emerald-500"
          checked={state?.automatic === true}
          disabled={!state?.managed || busy}
          onChange={(event) => void action('preferences', { automatic: event.target.checked })}
        />
        Automatically download and install new versions when available
      </label>
      <p className="text-xs text-slate-300">While running, updates download and wait for Restart now. At startup, enabled automatic updates install before characters start. Local source edits must be reconciled before installing.</p>
      {state && !state.managed && <p className="text-amber-200">Development checkout: update notifications only. Update your source manually, or use the editable release package for managed updates.</p>}
      <DebugInstanceSettings />
      {(error || state?.error) && (
        <p role="alert" className="text-rose-300">
          {error || String(state?.error)}
        </p>
      )}
    </section>
  )
}

type DebugState = { phase: string; message: string; error?: string; port?: number; token?: string; project?: string; insideDebug?: boolean }

/** debug-instance.tsx DebugInstanceSettings. */
function DebugInstanceSettings() {
  const api = usePartyApi()
  const settings = useServerSettings()
  const [state, setState] = useState<DebugState | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  useEffect(() => {
    let alive = true,
      busy = false
    const refresh = async () => {
      if (busy) return
      busy = true
      try {
        const result = await api.consoleDebug()
        if (result.kind === 'failure') throw Error('Debug service is starting or unavailable.')
        const value = JSON.parse(result.value) as DebugState
        if (alive) {
          setState(value)
          setError('')
        }
      } catch (e) {
        if (alive) setError((e as Error).message)
      } finally {
        busy = false
      }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 1500)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [api])
  const action = async (name: 'start' | 'stop') => {
    setPending(true)
    setError('')
    const result = await api.consoleDebugAction(name)
    if (result.kind === 'failure') setError(result.message || 'Debug request failed')
    else
      try {
        setState(JSON.parse(result.value) as DebugState)
      } catch {
        /* the next poll refreshes it */
      }
    setPending(false)
  }
  const busy = pending || state?.phase === 'starting' || state?.phase === 'stopping'
  const href = state?.port
    ? (() => {
        const url = new URL(settings.baseUrl || window.location.origin)
        url.protocol = 'http:'
        url.port = String(state.port)
        url.pathname = '/'
        url.hash = 'debug=' + state.token
        return url.href
      })()
    : ''
  if (state?.insideDebug)
    return (
      <div className="border-t border-slate-700 pt-3">
        <h4 className="font-semibold">Debug instance</h4>
        <p>God party · unlimited Cave visits. Stop this instance from your main console to destroy its data.</p>
      </div>
    )
  return (
    <div className="space-y-3 border-t border-slate-700 pt-3">
      <h4 className="font-semibold">Cave of Many Dreams debugging</h4>
      <p className="text-slate-300">Launch a separate game server and Party Console with a god-equipped party and unlimited Cave visits. Requires Docker. Stopping destroys the debug party and all its data.</p>
      <div className="flex flex-wrap items-center gap-2">
        {!state?.project && (
          <Button variant="outline" disabled={pending || !state} onClick={() => void action('start')}>
            Start debug instance
          </Button>
        )}
        {state?.project && (
          <Button variant="outline" disabled={pending || state.phase === 'stopping'} onClick={() => void action('stop')}>
            Stop running
          </Button>
        )}
        {state?.phase === 'running' && href && (
          <a className="rounded border border-emerald-500 px-3 py-2 text-emerald-100" href={href} target="_blank" rel="noreferrer">
            Open debug console
          </a>
        )}
        {busy && <LoaderCircle className="size-5 animate-spin" aria-label="Working" />}
      </div>
      <output aria-label="Debug instance status" className="block text-slate-300">
        {state?.message || 'Checking debug service…'}
      </output>
      {(state?.error || error) && (
        <p role="alert" className="whitespace-pre-wrap text-rose-300">
          {state?.error || error}
        </p>
      )}
    </div>
  )
}
