import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CloudOff, RefreshCw, Settings } from 'lucide-react'
import { usePartyApi, useCharacters, useConnected, useDynamicState, useEscapeStatus, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { useOpenServerSettings } from '@/lib/ServerSettingsDialogContext'
import { classLook } from '@/lib/classLook'
import { activityLine } from '@/lib/activityLine'
import { Button } from '@/components/ui/button'
import type { CharacterState } from '@/models'

/** Party overview - ported from ui/characterlist/CharacterListScreen.kt:
 *  class icon, level/class, HP/MP, one-line activity, gold carried per
 *  character and the account total, pull-to-refresh (here: a refresh
 *  button, matching the icon already added to the Android app's top bar). */
export function CharacterListScreen() {
  const characters = useCharacters()
  const connected = useConnected()
  const dynamicState = useDynamicState()
  const refreshNow = useRefreshDynamicStateNow()
  const openServerSettings = useOpenServerSettings()

  const names = Object.keys(characters)
  const accountGold = (dynamicState.bank?.gold ?? 0) + Object.values(characters).reduce((sum, c) => sum + (c.vitals?.gold ?? 0), 0)

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h1 className="text-lg font-semibold">Party</h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{accountGold.toLocaleString()}g</span>
          {!connected && <CloudOff className="size-4" aria-label="Disconnected" />}
          <button onClick={() => void refreshNow()} aria-label="Refresh">
            <RefreshCw className="size-4" />
          </button>
          <button onClick={openServerSettings} aria-label="Server settings">
            <Settings className="size-4" />
          </button>
        </div>
      </header>

      {!connected && <div className="h-0.5 w-full animate-pulse bg-primary/60" />}

      {names.length > 0 && <PartyControls />}

      {names.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="text-muted-foreground">{connected ? 'No characters online yet.' : 'Connecting...'}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2 p-3">
          {names.map((name) => (
            <CharacterRow key={name} name={name} state={characters[name]} />
          ))}
        </ul>
      )}
    </div>
  )
}

/** party-workspace.tsx's two party-wide (not per-character) buttons: "Send party to
 *  town" (bulk /town-party) and "Escape" (escape-control.tsx's polled emergency-
 *  recovery command - needs one online warrior/mage/priest, the server owns the
 *  whole staged rendezvous/convoy-fallback sequence, this just triggers + shows
 *  `stage`/`error`). */
function PartyControls() {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const escape = useEscapeStatus()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const running = !!escape && !['complete', 'failed-hold', 'released'].includes(escape.stage)
  const failed = !!error || (!!escape && escape.stage !== 'released' && (!!escape.error || escape.stage === 'failed-hold'))
  const label = failed ? 'Escape · failed' : escape?.stage === 'complete' ? 'Escape · success' : 'Escape'

  return (
    <div className="flex gap-2 px-3 pt-3">
      <Button variant="outline" size="sm" className="flex-1" onClick={() => void api.sendPartyToTown()}>
        Send party to town
      </Button>
      <Button
        variant={failed ? 'destructive' : 'outline'}
        size="sm"
        className="flex-1"
        disabled={busy || running}
        onClick={async () => {
          setBusy(true)
          setError(null)
          const result = await api.triggerEscape()
          if (result.kind === 'failure') setError(result.message)
          await refreshNow()
          setBusy(false)
        }}
      >
        {(busy || running) && <span className="mr-2 size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
        {label}
      </Button>
    </div>
  )
}

function CharacterRow({ name, state }: { name: string; state: CharacterState }) {
  const vitals = state.vitals
  const { Icon, color } = classLook(vitals?.ctype ?? '')

  return (
    <li>
      <Link
        to={`/characters/${encodeURIComponent(name)}`}
        className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition hover:border-primary/50"
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${color}33` }}>
          <Icon className="size-5" style={{ color }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <span className="font-medium">{name}</span>
            {vitals && (
              <span className="text-sm text-muted-foreground">
                Lv {vitals.level} {vitals.ctype}
              </span>
            )}
          </div>
          {vitals ? (
            <>
              <div className={`truncate text-sm ${vitals.rip ? 'text-destructive' : 'text-muted-foreground'}`}>{activityLine(vitals)}</div>
              <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                <span>
                  HP {vitals.hp}/{vitals.max_hp}
                </span>
                <span>
                  MP {vitals.mp}/{vitals.max_mp}
                </span>
                <span>{vitals.gold.toLocaleString()}g</span>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">offline</div>
          )}
        </div>
      </Link>
    </li>
  )
}
