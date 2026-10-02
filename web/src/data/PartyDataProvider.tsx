import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PartyApiClient } from '@/api/partyApi'
import { connectLive, type LiveEvent } from '@/api/liveConnection'
import type { LiveRecordWire } from '@/api/liveProtocol'
import type { ServerSettings } from '@/config/serverConfig'
import type {
  CharacterState,
  CharacterVitals,
  EquippedEntry,
  EscapeStatus,
  GameLogEntry,
  InventoryEntry,
  MailSnapshot,
  MonsterHuntStatus,
  PartyStateDynamic,
  RosterMember,
} from '@/models'
import { emptyPartyStateDynamic } from '@/models'
import { QK } from './queryKeys'

/** Owns one live connection to one configured server and pushes every
 *  known character's state into the shared TanStack Query cache - a
 *  direct port of data/PartyRepository.kt, one instance per active
 *  server connection (recreated whenever [settings] changes - see the
 *  key on <PartyDataProvider> in App.tsx). */

const DYNAMIC_STATE_POLL_MS = 6_000
// query-cache.tsx's `config` policy: configuration/rules/marks, split out of
// `core` by the server (public-state.ts omitConfigFields) and polled on its
// own slower cadence. Carries farmingProfiles, so it can be large - it never
// rides in the 6s batch, where a slow config response would hold up core.
const CONFIG_POLL_MS = 15_000
// The item/monster/skill catalog barely ever changes mid-session (it's
// the account's own static game data) but used to be re-sent in full on
// every 6s poll alongside everything else - by far the biggest single
// contributor to a slow-network poll's size. Fetched once at startup,
// then just re-checked on this much slower cadence instead.
const CATALOG_REFRESH_MS = 10 * 60_000

const REQUIRED_VITALS_FIELDS = ['hp', 'max_hp', 'mp', 'max_mp', 'gold', 'map', 'x', 'y', 'rip'] as const

function isCompleteVitals(vitals: Record<string, unknown>): boolean {
  return REQUIRED_VITALS_FIELDS.every((field) => vitals[field] !== undefined)
}

/** Parses the wire-level LiveRecordWire (raw JSON, merged by LiveReceiver
 *  - see api/liveProtocol.ts) into this app's typed model. Matches
 *  dashboard-live.tsx and PartyRepository.kt: reconstructs a FIXED-length
 *  items array sized by vitals.inventorySize, filling gaps with null -
 *  an empty slot is never sent over the wire, so building the list from
 *  present keys alone would silently compact the grid instead of showing
 *  real empty slots in their real positions. */
function recordToState(name: string, record: LiveRecordWire, roster: Record<string, RosterMember>): CharacterState {
  // ctype/level are never part of the live vitals payload at all (see
  // module doc) - default them here (matching the Kotlin app's
  // @Serializable default-value behavior) so a character rendered before
  // the roster merge below has run still gets a safe "" / 0 rather than
  // a genuinely-missing key that crashes anything assuming CharacterVitals'
  // required fields are always actually present at runtime.
  const withName = { ctype: '', level: 0, ...record.vitals, name }
  const decoded = isCompleteVitals(record.vitals) ? (withName as unknown as CharacterVitals) : null
  const member = roster[name]
  const vitals: CharacterVitals | null = decoded && member ? { ...decoded, ctype: member.ctype, level: member.level, server: member.server } : decoded

  const slots: Record<string, EquippedEntry | null> = {}
  for (const [key, value] of Object.entries(record.slots)) {
    slots[key] = (value as EquippedEntry | null) ?? null
  }

  const inventorySize = (record.vitals as { inventorySize?: number }).inventorySize ?? Object.keys(record.items).length
  const items: (InventoryEntry | null)[] = []
  for (let index = 0; index < inventorySize; index += 1) {
    const value = record.items[String(index)]
    items.push((value as InventoryEntry | undefined) ?? null)
  }

  return { vitals, inventory: { items, slots } }
}

interface PartyDataContextValue {
  api: PartyApiClient
  refreshDynamicStateNow: () => Promise<void>
  settings: ServerSettings
}

const PartyDataContext = createContext<PartyDataContextValue | null>(null)

export function PartyDataProvider({ settings, children }: { settings: ServerSettings; children: ReactNode }) {
  const queryClient = useQueryClient()
  const api = useMemo(() => new PartyApiClient(settings), [settings])
  const rosterRef = useRef<Record<string, RosterMember>>({})

  // The 6s background poll and a manual refreshDynamicStateNow() (fired
  // right after a mutating action, e.g. FarmingSection's selectMode) can
  // overlap with no ordering between their requests - a poll tick that
  // happened to start just before the action, reading pre-action state,
  // can still resolve AFTER the manual refresh's post-action read and
  // silently clobber the fresher data back to stale via setQueryData,
  // making a just-applied change look like it never took effect. Each
  // call captures its own generation number; only the latest one is
  // allowed to write.
  const dynamicStateGeneration = useRef(0)

  // Whether the catalog has been fetched at all yet this session - the
  // first dynamic-state poll triggers an immediate catalog fetch if not;
  // after that it only refreshes on the slow CATALOG_REFRESH_MS timer.
  const catalogFetchedRef = useRef(false)

  const refreshCatalogNow = useMemo(
    () => async () => {
      const result = await api.getJson<Partial<PartyStateDynamic>>('state?section=catalog')
      if (result.kind === 'success') {
        catalogFetchedRef.current = true
        queryClient.setQueryData<PartyStateDynamic>(QK.dynamicState, (current) => ({
          ...emptyPartyStateDynamic(),
          ...(current ?? {}),
          ...result.value,
        }))
      }
    },
    [api, queryClient],
  )

  // Roster (name/class/level/server) - the full list arrives with config;
  // core's `characters` summary refreshes the active ones every poll, so a
  // slow config response never leaves characters without a class.
  const applyRoster = useMemo(
    () => (roster: Record<string, RosterMember>) => {
      rosterRef.current = roster
      queryClient.setQueryData(QK.roster, roster)
      // The roster and the live SSE stream race - a character's first
      // snapshot can arrive (decoded with blank ctype/level) before the
      // roster does. Patch every already-known character.
      queryClient.setQueryData<Record<string, CharacterState>>(QK.characters, (current) => {
        if (!current) return current
        const next: Record<string, CharacterState> = {}
        for (const [name, state] of Object.entries(current)) {
          const member = roster[name]
          next[name] = member && state.vitals ? { ...state, vitals: { ...state.vitals, ctype: member.ctype, level: member.level, server: member.server } } : state
        }
        return next
      })
    },
    [queryClient],
  )

  // One config request at a time: a refresh asked for while one is in
  // flight runs once more right after it, so requests never overlap and an
  // older response can never land after a newer one.
  const configInFlight = useRef<Promise<void> | null>(null)
  const configAgain = useRef(false)

  const refreshConfigNow = useMemo(() => {
    const fetchConfig = async () => {
      const result = await api.getJson<Partial<PartyStateDynamic> & { roster?: RosterMember[] }>(
        'state?catalog=0&dashboard=1&section=config',
      )
      if (result.kind !== 'success') return
      const { roster: rosterList, ...config } = result.value
      queryClient.setQueryData<PartyStateDynamic>(QK.dynamicState, (current) => ({
        ...emptyPartyStateDynamic(),
        ...(current ?? {}),
        ...config,
      }))
      queryClient.setQueryData(QK.configLoadedAt, Date.now())
      queryClient.setQueryData<CoreFetchDebug | null>(QK.coreFetchDebug, (current) =>
        current ? { ...current, leader: config.leader, farmingPolicy: config.farmingPolicy } : current,
      )
      if (Array.isArray(rosterList)) {
        const roster: Record<string, RosterMember> = {}
        for (const member of rosterList) roster[member.name] = member
        applyRoster(roster)
      }
    }
    return async () => {
      if (configInFlight.current) {
        configAgain.current = true
        return configInFlight.current
      }
      const run = (async () => {
        try {
          do {
            configAgain.current = false
            await fetchConfig()
          } while (configAgain.current)
        } finally {
          configInFlight.current = null
        }
      })()
      configInFlight.current = run
      return run
    }
  }, [api, queryClient, applyRoster])

  const pollDynamicState = useMemo(
    () => async () => {
      // Split into several small section-scoped requests run in PARALLEL
      // instead of one large payload fetched sequentially with everything
      // else - on a slow/high-latency connection, four sequential round
      // trips compound badly (each one waits for the last to finish
      // before it even starts), while parallel requests overlap. The big
      // item/monster/skill catalog is deliberately excluded from this
      // cycle entirely - see refreshCatalogNow.
      const generation = ++dynamicStateGeneration.current
      const escapeStart = performance.now()
      type CoreWire = Partial<PartyStateDynamic> & {
        characterDetails?: Record<string, { monsterHunt?: MonsterHuntStatus | null }>
        characters?: Record<string, Pick<RosterMember, 'name' | 'ctype' | 'level' | 'server'>>
      }
      type LogsWire = {
        combatLogs?: PartyStateDynamic['combatLogs']
        merchantActivity?: PartyStateDynamic['merchantActivity']
        gameLogs?: Record<string, GameLogEntry[]>
      }
      const [coreResult, bankResult, marketResult, logsResult, mailResult, escapeResult] = await Promise.all([
        // dashboard=1 is the dashboard's own payload shape (query-cache.tsx
        // reads every domain as state?catalog=0&dashboard=1&section=X): it
        // unlocks characterDetails, and on core the server strips every
        // config field (public-state.ts omitConfigFields) - those arrive
        // via refreshConfigNow instead.
        api.getJson<CoreWire>('state?catalog=0&dashboard=1&section=core'),
        // bankbois carry their items only with dashboard=1 (public-state.ts).
        api.getJson<Partial<PartyStateDynamic>>('state?catalog=0&dashboard=1&section=bank'),
        api.getJson<Partial<PartyStateDynamic>>('state?catalog=0&dashboard=1&section=market'),
        api.getJson<LogsWire>('state?catalog=0&dashboard=1&section=logs'),
        api.getJson<Partial<MailSnapshot>>('mail'),
        api.getJson<{ escape?: EscapeStatus | null }>('escape'),
      ])
      // `escape` is the smallest of these (usually just `{escape:null}`),
      // so its round trip is dominated by real network latency rather
      // than payload transfer time - a reasonable, zero-extra-request
      // proxy for "how slow does this connection feel right now".
      // A newer call (the next poll tick, or another manual refresh)
      // already started while this one was in flight - its results will
      // supersede ours shortly, so writing this response now would only
      // risk clobbering fresher data with this call's staler snapshot.
      if (generation !== dynamicStateGeneration.current) return
      if (escapeResult.kind === 'success') queryClient.setQueryData(QK.latencyMs, Math.round(performance.now() - escapeStart))

      if (coreResult.kind === 'success' || bankResult.kind === 'success' || marketResult.kind === 'success' || logsResult.kind === 'success') {
        const coreRaw: CoreWire = coreResult.kind === 'success' ? coreResult.value : {}
        // bankbois: core only has item-less summaries; the bank section has the full entries.
        const { characterDetails, bankbois: _bankboiSummaries, characters: summaries, ...core } = coreRaw
        if (summaries) {
          const roster = { ...rosterRef.current }
          for (const [name, summary] of Object.entries(summaries)) roster[name] = { ...roster[name], ...summary, name }
          applyRoster(roster)
        }
        const configState = queryClient.getQueryData<PartyStateDynamic>(QK.dynamicState)
        queryClient.setQueryData(QK.coreFetchDebug, {
          at: Date.now(),
          success: coreResult.kind === 'success',
          message: coreResult.kind === 'failure' ? coreResult.message : undefined,
          leader: configState?.leader,
          farmingPolicy: configState?.farmingPolicy,
        })
        const characterHunt = characterDetails
          ? Object.fromEntries(Object.entries(characterDetails).map(([name, detail]) => [name, detail.monsterHunt ?? null]))
          : undefined
        const bank = bankResult.kind === 'success' ? bankResult.value : {}
        const market = marketResult.kind === 'success' ? marketResult.value : {}
        const logs: LogsWire = logsResult.kind === 'success' ? logsResult.value : {}
        // Merge onto whatever's already cached rather than resetting to
        // empty each time - now that the response is assembled from
        // several independent requests, one of them failing (a dropped
        // packet, a timeout) shouldn't wipe out the others' still-valid
        // data for this cycle.
        queryClient.setQueryData<PartyStateDynamic>(QK.dynamicState, (current) => ({
          ...emptyPartyStateDynamic(),
          ...(current ?? {}),
          ...core,
          ...(characterHunt ? { characterHunt } : {}),
          ...bank,
          ...market,
          ...(logs.combatLogs ? { combatLogs: logs.combatLogs } : {}),
          ...(logs.merchantActivity ? { merchantActivity: logs.merchantActivity } : {}),
        }))
      }
      if (!catalogFetchedRef.current) void refreshCatalogNow()

      if (mailResult.kind === 'success') queryClient.setQueryData(QK.mail, { messages: [], count: 0, ...mailResult.value })
      if (logsResult.kind === 'success') queryClient.setQueryData(QK.gameLogs, logsResult.value.gameLogs ?? {})
      if (escapeResult.kind === 'success') queryClient.setQueryData(QK.escape, escapeResult.value.escape ?? null)
    },
    [api, queryClient, refreshCatalogNow, applyRoster],
  )

  // After a mutation: refresh core and config together, like
  // query-actions.ts invalidating ['core', 'config'].
  const refreshDynamicStateNow = useMemo(
    () => async () => {
      await Promise.all([pollDynamicState(), refreshConfigNow()])
    },
    [pollDynamicState, refreshConfigNow],
  )

  // Dynamic state / mail / game logs - polled on the same ~6s cadence
  // party-console's own account-info refresh uses. A failed or thrown
  // cycle must never end the loop.
  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      while (!cancelled) {
        try {
          await pollDynamicState()
        } catch (error) {
          console.error('state poll failed', error)
        }
        await new Promise((resolve) => setTimeout(resolve, DYNAMIC_STATE_POLL_MS))
      }
    }
    void poll()
    return () => {
      cancelled = true
    }
  }, [pollDynamicState])

  // Config (and the roster it carries) - see CONFIG_POLL_MS.
  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      while (!cancelled) {
        try {
          await refreshConfigNow()
        } catch (error) {
          console.error('config poll failed', error)
        }
        await new Promise((resolve) => setTimeout(resolve, CONFIG_POLL_MS))
      }
    }
    void poll()
    return () => {
      cancelled = true
    }
  }, [refreshConfigNow])

  // Catalog - see CATALOG_REFRESH_MS. Runs on its own much slower timer,
  // independent of the main poll above.
  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      while (!cancelled) {
        await new Promise((resolve) => setTimeout(resolve, CATALOG_REFRESH_MS))
        try {
          if (!cancelled) await refreshCatalogNow()
        } catch (error) {
          console.error('catalog poll failed', error)
        }
      }
    }
    void poll()
    return () => {
      cancelled = true
    }
  }, [refreshCatalogNow])

  // Live SSE connection - character vitals/inventory + connection health.
  useEffect(() => {
    const handleEvent = (event: LiveEvent) => {
      if (event.kind === 'connectionHealth') {
        queryClient.setQueryData(QK.connected, event.healthy)
        if (!event.healthy && event.error) queryClient.setQueryData(QK.lastConnectionError, event.error)
        if (event.healthy) queryClient.setQueryData(QK.lastConnectionError, null)
        return
      }
      queryClient.setQueryData<Record<string, CharacterState>>(QK.characters, (current) => {
        const next = { ...(current ?? {}) }
        if (event.record == null) {
          delete next[event.name]
        } else {
          next[event.name] = recordToState(event.name, event.record, rosterRef.current)
        }
        return next
      })
    }
    const close = connectLive(settings, handleEvent)
    return close
  }, [settings, queryClient])

  const value = useMemo<PartyDataContextValue>(() => ({ api, refreshDynamicStateNow, settings }), [api, refreshDynamicStateNow, settings])

  return <PartyDataContext.Provider value={value}>{children}</PartyDataContext.Provider>
}

function usePartyData(): PartyDataContextValue {
  const context = useContext(PartyDataContext)
  if (!context) throw new Error('usePartyData must be used within a PartyDataProvider')
  return context
}

export const usePartyApi = (): PartyApiClient => usePartyData().api
export const useServerSettings = (): ServerSettings => usePartyData().settings
export const useRefreshDynamicStateNow = (): (() => Promise<void>) => usePartyData().refreshDynamicStateNow

function useCachedValue<T>(key: readonly unknown[], initial: T): T {
  const { data } = useQuery({
    queryKey: key as unknown[],
    queryFn: () => initial,
    staleTime: Infinity,
    gcTime: Infinity,
  })
  return (data ?? initial) as T
}

export const useCharacters = (): Record<string, CharacterState> => useCachedValue(QK.characters, {})
export const useConnected = (): boolean => useCachedValue(QK.connected, false)
export const useLastConnectionError = (): string | null => useCachedValue(QK.lastConnectionError, null)
export const useRoster = (): Record<string, RosterMember> => useCachedValue(QK.roster, {})
export const useDynamicState = (): PartyStateDynamic => useCachedValue(QK.dynamicState, emptyPartyStateDynamic())
export const useMail = (): MailSnapshot => useCachedValue(QK.mail, { messages: [], count: 0 })
export const useGameLogs = (): Record<string, GameLogEntry[]> => useCachedValue(QK.gameLogs, {})
export const useEscapeStatus = (): EscapeStatus | null => useCachedValue(QK.escape, null)
/** Round-trip time of the smallest request in the last dynamic-state poll
 *  cycle (see refreshDynamicStateNow) - null until the first poll lands. */
export const useLatencyMs = (): number | null => useCachedValue(QK.latencyMs, null)
/** Temporary diagnostic - see queryKeys.ts's coreFetchDebug. */
export interface CoreFetchDebug {
  at: number
  success: boolean
  message?: string
  leader?: string | null
  farmingPolicy?: string
}
export const useCoreFetchDebug = (): CoreFetchDebug | null => useCachedValue(QK.coreFetchDebug, null)
/** When the config section (rules, marks, settings, leader/followers, ...)
 *  last arrived - null until the first one lands. Any control seeded from a
 *  config field must stay disabled until then (useConfigLoaded), or it
 *  would save empty defaults over the server's real values. */
export const useConfigLoadedAt = (): number | null => useCachedValue(QK.configLoadedAt, null)
export const useConfigLoaded = (): boolean => useConfigLoadedAt() !== null
