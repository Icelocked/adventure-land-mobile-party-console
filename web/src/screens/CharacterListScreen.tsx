import { Link } from 'react-router-dom'
import { CloudOff, RefreshCw, Settings } from 'lucide-react'
import { useCharacters, useConnected, useDynamicState, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { useOpenServerSettings } from '@/lib/ServerSettingsDialogContext'
import { classLook } from '@/lib/classLook'
import { activityLine } from '@/lib/activityLine'
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
