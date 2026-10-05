import { DungeonPanel } from '@/screens/dungeon/DungeonPanel'
import { DebugBrowserBanner } from '@/components/DebugBrowserBanner'
import { FreshnessBadge } from '@/components/FreshnessBadge'
import { useDungeons } from '@/data/useDailyDungeon'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CloudOff, Menu, Plus, RefreshCw } from 'lucide-react'
import { useCharacterDiagnostics, useEscapeError, usePartyApi, useCharacters, useConnected, useDynamicState, useEscapeStatus, useRefreshDynamicStateNow, useServerSettings, useConfigLoaded, useRoster } from '@/data/PartyDataProvider'
import { AccountMenu } from '@/screens/character-detail/AccountMenu'
import { classLook } from '@/lib/classLook'
import { activityLine } from '@/lib/activityLine'
import { Button } from '@/components/ui/button'
import { LatencyBadge } from '@/components/LatencyBadge'
import { PartyGold } from '@/components/PartyGold'
import { CharacterPortrait } from '@/components/CharacterPortrait'
import { orderCharacters } from '@/lib/characterOrder'
import { pendingCharacters, pendingHelp, pendingLabels, type PendingCharacter } from '@/lib/pendingCharacters'
import { RosterPickerSheet } from '@/screens/roster/RosterPickerSheet'
import { CreateCharacterSheet } from '@/screens/roster/CreateCharacterSheet'
import { useConsoleUpdates } from '@/hooks/useConsoleUpdates'
import type { BestiaryMonster, CharacterState } from '@/models'

/** Party overview: class icon, level/class, HP/MP, one-line activity, gold
 *  carried per character and the account total, and a refresh button. */
export function CharacterListScreen() {
  const characters = useCharacters()
  const connected = useConnected()
  const dynamicState = useDynamicState()
  const refreshNow = useRefreshDynamicStateNow()
  // The account menu (Settings, Logs, Bank, ...) must be reachable with no
  // character online; the server-address override lives in Settings.
  const [menuOpen, setMenuOpen] = useState(false)

  // Bankbois get their own cards, not party ones.
  const bankboiNames = new Set(dynamicState.bankbois.map((bankboi) => bankboi.name))
  const roster = useRoster()
  // Active slots in slot order (all live
  // characters on a server that reports no slots), then orderCharacters.
  const slots = dynamicState.activeSlots
  const liveNames = (slots
    ? slots
        .slice()
        .sort((x, y) => x.index - y.index)
        .map((slot) => slot.character)
        .filter((name): name is string => !!name && !!characters[name])
    : Object.keys(characters)
  ).filter((name) => !bankboiNames.has(name))
  const primary = slots?.find((slot) => slot.primary)?.character ?? slots?.find((slot) => slot.kind === 'native' && slot.index === 0)?.character
  const steam = (slots ?? []).filter((slot) => slot.kind === 'native' && slot.character).map((slot) => slot.character!)
  const names = orderCharacters(
    liveNames.map((name) => ({ name, ctype: characters[name]?.vitals?.ctype })),
    Object.values(roster),
    primary,
    dynamicState.merchantCharacter,
    steam,
  ).map((entry) => entry.name)
  const pending = pendingCharacters(dynamicState, names)
  const [pickerSlot, setPickerSlot] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const updates = useConsoleUpdates().state
  const navigate = useNavigate()
  const settings = useServerSettings()
  // Picks between the empty-state messages.
  const configLoaded = useConfigLoaded()

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">Party</h1>
            {/* Console update indicator */}
            {updates?.available && (
              <button
                type="button"
                aria-label="New version available"
                title="New version available"
                onClick={() => navigate('/settings', { state: { focus: 'console-updates' } })}
                className="inline-flex size-5 items-center justify-center rounded-full bg-emerald-700 text-xs font-bold text-white"
              >
                !
              </button>
            )}
          </div>
          {/* Version line */}
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
      <DebugBrowserBanner />

      {/* The dungeon panel heads the party while a visit runs. */}
      <DungeonPanel />
      {(names.length > 0 || pending.length > 0) && <PartyControls />}

      {names.length === 0 && !pending.length ? (
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
          {names.filter((name) => !pending.some((entry) => entry.name === name)).map((name) => (
            <CharacterRow key={name} name={name} state={characters[name]} bestiaryCatalog={dynamicState.bestiaryCatalog} />
          ))}
          {pending.map((entry) => (
            <PendingCharacterCard key={entry.name} entry={entry} />
          ))}
        </ul>
      )}
      <RosterSlots onChoose={setPickerSlot} />
      {dynamicState.bankboiTransaction && (
        // "Bankboi Active" card.
        <div className="mx-3 mb-3 rounded-lg border-2 border-dashed border-primary/60 p-4 text-center">
          <p className="font-mono text-lg font-black uppercase tracking-widest text-primary">Bankboi Active</p>
          <p className="mt-1 font-mono text-xs uppercase text-muted-foreground">{dynamicState.bankboiTransaction.bankboi}</p>
          <p className="font-mono text-[10px] uppercase text-muted-foreground">
            {dynamicState.bankboiTransaction.mode} · {dynamicState.bankboiTransaction.phase}
          </p>
        </div>
      )}
      {pickerSlot !== null && (
        <RosterPickerSheet
          slot={pickerSlot}
          onClose={() => setPickerSlot(null)}
          onCreate={() => {
            setPickerSlot(null)
            setCreating(true)
          }}
        />
      )}
      {creating && <CreateCharacterSheet onClose={() => setCreating(false)} />}
      {menuOpen && <AccountMenu onClose={() => setMenuOpen(false)} />}
    </div>
  )
}

/** Party-wide buttons: "Send party to town" (bulk /town-party) and "Escape",
 *  a polled emergency-recovery command that needs one online warrior/mage/priest.
 *  The server runs the staged rendezvous/convoy-fallback sequence; this only
 *  triggers it and shows `stage`/`error`. */
function PartyControls() {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const escape = useEscapeStatus()
  const escapeReadError = useEscapeError()
  // Inside a dungeon, Escape exits the dungeon instead.
  const dungeon = useDungeons()
  const inDungeon = !!dungeon.data && !['idle', 'held'].includes(dungeon.data.state.phase)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const running = !!escape && !['complete', 'failed-hold', 'released'].includes(escape.stage)
  const failed = !!error || !!escapeReadError || (!!escape && escape.stage !== 'released' && (!!escape.error || escape.stage === 'failed-hold'))
  const label = failed ? 'Escape - failed' : escape?.stage === 'complete' ? 'Escape - success' : 'Escape'
  const [townError, setTownError] = useState<string | null>(null)

  return (
    <div className="px-3 pt-3">
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        className="flex-1"
        onClick={async () => {
          setTownError(null)
          const result = await api.sendPartyToTown()
          if (result.kind === 'failure') setTownError(result.message || 'Party town request failed')
        }}
      >
        Send party to town
      </Button>
      <Button
        variant={failed ? 'destructive' : 'outline'}
        size="sm"
        className="flex-1"
        disabled={inDungeon ? dungeon.busy : busy || running}
        onClick={async () => {
          if (inDungeon) {
            await dungeon.action({ action: 'exit' })
            return
          }
          setBusy(true)
          setError(null)
          const result = await api.triggerEscape()
          if (result.kind === 'failure') setError(result.message)
          await refreshNow()
          setBusy(false)
        }}
      >
        {(inDungeon ? dungeon.busy : busy || running) && <span aria-label="Escape in progress" className="mr-2 size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
        {inDungeon ? 'Escape — exit dungeon' : label}
      </Button>
    </div>
      {(townError || error) && (
        <p role="alert" className="mt-1 text-sm text-destructive">
          {townError || error}
        </p>
      )}
      {inDungeon && dungeon.actionError && (
        <p role="alert" className="mt-1 text-sm text-destructive">
          {dungeon.actionError}
        </p>
      )}
    </div>
  )
}

function CharacterRow({ name, state, bestiaryCatalog }: { name: string; state: CharacterState; bestiaryCatalog: BestiaryMonster[] }) {
  const vitals = state.vitals
  const { Icon, color } = classLook(vitals?.ctype ?? '')
  const seenAt = Number(useCharacterDiagnostics(name)?.seenAt || 0)

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
              {/* Flags a character that stopped reporting (possibly hung). */}
              {seenAt > 0 && <FreshnessBadge at={seenAt} className="mt-1" />}
            </>
          ) : (
            // Connected, but no status yet.
            <div className="text-sm text-muted-foreground">awaiting status</div>
          )}
        </div>
      </Link>
    </li>
  )
}

/** One "Load character slot N" per empty headless
 *  slot, disabled while a Steam handoff is running. */
function RosterSlots({ onChoose }: { onChoose: (slot: number) => void }) {
  const state = useDynamicState()
  const operation = state.steamSwitch
  const busy = !!operation?.phase && operation.phase !== 'complete'
  const empty = (state.activeSlots ?? []).filter((slot) => slot.kind === 'headless' && !slot.character)
  if (!empty.length) return null
  return (
    <div className="flex flex-col gap-2 px-3 pb-3">
      {empty.map((slot) => (
        <button
          key={slot.index}
          type="button"
          disabled={busy}
          onClick={() => onChoose(slot.index)}
          className="flex min-h-14 items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground disabled:opacity-50"
        >
          <Plus className="size-4" /> Load character slot {slot.index + 1}
        </button>
      ))}
    </div>
  )
}

/** A character that's loading, waiting or
 *  lost, with its portrait, class, hosting and status. */
function PendingCharacterCard({ entry }: { entry: PendingCharacter }) {
  const state = useDynamicState()
  const roster = useRoster()
  const look = state.characterAppearances?.[entry.name]
  const headless = state.activeSlots?.some((slot) => slot.character === entry.name && slot.kind === 'headless')
  return (
    <li aria-live="polite" className="flex gap-3 rounded-lg border border-border bg-card p-3">
      <CharacterPortrait html={look?.characterDollHtml} sprite={look?.characterSprite} skin={look?.skin} className="h-16 w-12 rounded border border-border" />
      <div className="min-w-0">
        <p className="font-medium">{entry.name}</p>
        <p className="text-xs text-muted-foreground">
          {roster[entry.name]?.ctype} · {headless ? 'Headless character' : entry.primary ? 'Steam primary' : 'Steam companion'}
        </p>
        <p className="mt-1 text-sm text-primary">{entry.status === 'waiting' ? 'Waiting for your character to connect…' : pendingLabels[entry.status]}</p>
        {entry.error && <p className="mt-1 text-sm text-destructive">{entry.error}</p>}
        {entry.delayed && <p className="mt-1 text-xs text-amber-500">{pendingHelp(entry)}</p>}
      </div>
    </li>
  )
}
