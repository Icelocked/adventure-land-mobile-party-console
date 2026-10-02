import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CloudOff, Menu, RefreshCw } from 'lucide-react'
import { usePartyApi, useCharacters, useConnected, useDynamicState, useEscapeStatus, useRefreshDynamicStateNow, useServerSettings, useConfigLoaded } from '@/data/PartyDataProvider'
import { AccountMenu } from '@/screens/character-detail/AccountMenu'
import { classLook } from '@/lib/classLook'
import { activityLine } from '@/lib/activityLine'
import { Button } from '@/components/ui/button'
import { LatencyBadge } from '@/components/LatencyBadge'
import { PartyGold } from '@/components/PartyGold'
import { useConsoleUpdates } from '@/hooks/useConsoleUpdates'
import type { BestiaryMonster, CharacterState } from '@/models'

/** Party overview - ported from ui/characterlist/CharacterListScreen.kt:
 *  class icon, level/class, HP/MP, one-line activity, gold carried per
 *  character and the account total, pull-to-refresh (here: a refresh
 *  button, matching the icon already added to the Android app's top bar). */
export function CharacterListScreen() {
  const characters = useCharacters()
  const connected = useConnected()
  const dynamicState = useDynamicState()
  const refreshNow = useRefreshDynamicStateNow()
  // The account menu (Settings, Logs, Bank, ...) must be reachable with no
  // character online; the server-address override lives in Settings.
  const [menuOpen, setMenuOpen] = useState(false)

  // use-party-console.tsx chars: bankbois get their own cards, not party ones.
  const bankboiNames = new Set(dynamicState.bankbois.map((bankboi) => bankboi.name))
  const names = Object.keys(characters).filter((name) => !bankboiNames.has(name))
  const updates = useConsoleUpdates().state
  const navigate = useNavigate()
  const settings = useServerSettings()
  // party-workspace.tsx's empty states.
  const configLoaded = useConfigLoaded()

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">Party</h1>
            {/* console-updates.tsx ConsoleUpdateIndicator */}
            {updates?.available && (
              <button
                type="button"
                aria-label="New version available"
                title="New version available"
                onClick={() => navigate('/settings')}
                className="inline-flex size-5 items-center justify-center rounded-full bg-emerald-700 text-xs font-bold text-white"
              >
                !
              </button>
            )}
          </div>
          {/* party-header.tsx version line */}
          <span className="block font-mono text-[10px] text-muted-foreground">
            {dynamicState.gameVersion ? `Game v${dynamicState.gameVersion} · ` : ''}Console {updates ? `v${updates.displayVersion || updates.current}` : 'loading…'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <PartyGold />
          <LatencyBadge />
          {!connected && <CloudOff className="size-4" aria-label="Disconnected" />}
          <Button variant="ghost" size="icon-sm" onClick={() => void refreshNow()} aria-label="Refresh">
            <RefreshCw className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setMenuOpen(true)} aria-label="Menu">
            <Menu className="size-5" />
          </Button>
        </div>
      </header>

      {!connected && <div className="h-0.5 w-full animate-pulse bg-primary/60" />}

      {names.length > 0 && <PartyControls />}

      {names.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          {!configLoaded ? (
            <p className="text-muted-foreground">Party Console is loading…</p>
          ) : !connected ? (
            <p className="text-muted-foreground">Reconnecting to Party Console…</p>
          ) : (
            <p className="text-muted-foreground">
              No characters connected yet. Load a character or{' '}
              <a className="text-primary underline" href={`${settings.baseUrl.replace(/\/+$/, '')}/setup`}>
                open setup
              </a>{' '}
              to link Steam.
            </p>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-2 p-3">
          {names.map((name) => (
            <CharacterRow key={name} name={name} state={characters[name]} bestiaryCatalog={dynamicState.bestiaryCatalog} />
          ))}
        </ul>
      )}
      {menuOpen && <AccountMenu onClose={() => setMenuOpen(false)} />}
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

function CharacterRow({ name, state, bestiaryCatalog }: { name: string; state: CharacterState; bestiaryCatalog: BestiaryMonster[] }) {
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
              <div className={`truncate text-sm ${vitals.rip ? 'text-destructive' : 'text-muted-foreground'}`}>{activityLine(vitals, bestiaryCatalog)}</div>
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
