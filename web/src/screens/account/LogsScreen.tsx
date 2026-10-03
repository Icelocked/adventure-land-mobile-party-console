import { useEffect, useMemo, useRef, useState } from 'react'
import { useCharacterDiagnosticsMap, useCharacters, useDynamicState, useGameLogs, useLogsError, useDomainInterest } from '@/data/PartyDataProvider'
import { useClock } from '@/lib/duration'
import { classifyGameLog, defaultLogFilters, logFilters, showGameLog } from '@/lib/gameLogFilters'
import { AccountScreenScaffold } from './AccountScreenScaffold'

const FILTERS_KEY = 'party-log-filters'
const button = 'rounded border border-slate-500 px-2 py-1 text-sm'

function storedFilters(): Record<string, boolean> {
  try {
    return { ...defaultLogFilters, ...JSON.parse(localStorage.getItem(FILTERS_KEY) || '{}') }
  } catch {
    return { ...defaultLogFilters }
  }
}

/** log-sidebar.tsx as a screen: Game logs (category toggles) and
 *  Dashboard logs (combat, merchant/coordinator, anniversary), a character
 *  filter, the latest 1,000 matching entries in order, auto-following the end. */
export function LogsScreen() {
  useDomainInterest('logs')
  const state = useDynamicState()
  const characters = useCharacters()
  const diagnostics = useCharacterDiagnosticsMap()
  const gameLogs = useGameLogs()
  const logsError = useLogsError()
  const [tab, setTab] = useState<'game' | 'dashboard'>('game')
  const [character, setCharacter] = useState('all')
  const [source, setSource] = useState('all')
  const [filters, setFilters] = useState<Record<string, boolean>>(storedFilters)
  const scroller = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const combatLogs = state.combatLogs
  const merchantActivity = state.merchantActivity
  const anniversaryActivity = (state.anniversary as { activity?: { at: number; message?: string; level?: string }[] } | undefined)?.activity
  const game = useMemo(
    () => Object.entries(gameLogs || {}).flatMap(([name, events]) => events.map((e) => ({ ...e, color: e.color || '', category: classifyGameLog(e.message), name, source: 'game', key: name + e.session + e.seq }))),
    [gameLogs],
  )
  const combat = useMemo(
    () => Object.entries(combatLogs || {}).flatMap(([name, events]) => events.map((e, i) => ({ at: e.at, message: e.message, name, source: 'combat', category: e.type || '', key: `combat:${name}:${e.at}:${i}`, color: '' }))),
    [combatLogs],
  )
  const merchant = useMemo(
    () => (merchantActivity || []).map((e, i) => ({ at: e.at, message: e.message, name: state.merchantCharacter || '', source: 'merchant', category: e.level || '', key: `merchant:${e.at}:${i}`, color: '' })),
    [merchantActivity, state.merchantCharacter],
  )
  const anniversary = useMemo(
    () => (anniversaryActivity || []).map((e, i) => ({ at: e.at, message: e.message || '', name: '', source: 'anniversary', category: e.level || '', key: `anniversary:${e.at}:${i}`, color: '' })),
    [anniversaryActivity],
  )
  const entries = useMemo(
    () =>
      (tab === 'game' ? game : [...combat, ...merchant, ...anniversary])
        .filter((e) => (character === 'all' || e.name === character) && (tab === 'game' ? showGameLog(e.category || 'other', filters) : source === 'all' || source === e.source))
        .sort((a, b) => a.at - b.at)
        .slice(-1000),
    [tab, game, combat, merchant, anniversary, character, source, filters],
  )
  useEffect(() => {
    if (following.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight
  }, [entries])
  const names = useMemo(() => Array.from(new Set([...Object.keys(characters), ...Object.keys(gameLogs || {}), ...(state.bankbois || []).map((b) => b.name)])), [characters, gameLogs, state.bankbois])
  const now = useClock()
  const offline = character !== 'all' && now - (Number(diagnostics[character]?.seenAt) || 0) > 15000

  return (
    <AccountScreenScaffold title="Live logs">
      <div className="flex flex-col gap-2 p-3">
        <div role="tablist" className="flex gap-2">
          {(['game', 'dashboard'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={button + (tab === t ? ' border-cyan-300 bg-cyan-950' : '')} onClick={() => setTab(t)}>
              {t === 'game' ? 'Game logs' : 'Dashboard logs'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {tab === 'game' ? (
            logFilters.map((f) => (
              <button
                key={f.id}
                aria-pressed={filters[f.id]}
                className={button + (!filters[f.id] ? ' text-slate-500' : ' border-cyan-700')}
                onClick={() => {
                  const next = { ...filters, [f.id]: !filters[f.id] }
                  setFilters(next)
                  try {
                    localStorage.setItem(FILTERS_KEY, JSON.stringify(next))
                  } catch {
                    /* storage unavailable */
                  }
                }}
              >
                {f.label}
              </button>
            ))
          ) : (
            <select aria-label="Dashboard log source" value={source} onChange={(e) => setSource(e.target.value)} className={button + ' bg-background'}>
              <option value="all">All sources</option>
              <option value="combat">Combat</option>
              <option value="merchant">Merchant / coordinator</option>
              <option value="anniversary">Anniversary</option>
            </select>
          )}
        </div>
        <select aria-label="Log character" className={button + ' bg-background'} value={character} onChange={(e) => setCharacter(e.target.value)}>
          <option value="all">All characters</option>
          {names.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <p className="py-1 text-xs text-slate-400">{logsError ? 'Disconnected — showing retained logs' : offline ? 'Character offline — showing retained logs' : 'Live updates · latest 1,000 matching entries'}</p>
        <div
          ref={scroller}
          aria-label="Log entries"
          onScroll={(e) => {
            const el = e.currentTarget
            following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32
          }}
          className="max-h-[calc(100vh-15rem)] min-h-40 space-y-2 overflow-auto font-mono text-xs"
        >
          {entries.map((e) => (
            <p key={e.key} className="break-words">
              <span className="text-slate-500">
                {new Date(e.at).toLocaleTimeString()} {e.name ? `[${e.name}]` : `[${e.source}]`}{' '}
              </span>
              <span style={{ color: /^#[0-9a-f]{3,8}$/i.test(e.color) ? e.color : undefined }} className={e.category === 'errors' || e.category === 'error' ? 'text-rose-300' : 'text-slate-100'}>
                {e.message}
              </span>
            </p>
          ))}
          {!entries.length && <p className="text-slate-400">No matching logs yet.</p>}
        </div>
      </div>
    </AccountScreenScaffold>
  )
}
