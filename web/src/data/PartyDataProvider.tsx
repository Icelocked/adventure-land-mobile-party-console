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
const ROSTER_RETRY_DELAY_MS = 2_000
const ROSTER_RETRY_ATTEMPTS = 3
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
      const result = await api.get('state?section=catalog')
      if (result.kind === 'success') {
        const parsed = JSON.parse(result.value) as Partial<PartyStateDynamic>
        catalogFetchedRef.current = true
        queryClient.setQueryData<PartyStateDynamic>(QK.dynamicState, (current) => ({
          ...emptyPartyStateDynamic(),
          ...(current ?? {}),
          ...parsed,
        }))
      }
    },
    [api, queryClient],
  )

  const refreshDynamicStateNow = useMemo(
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
      const [coreResult, bankResult, marketResult, logsResult, mailResult, escapeResult] = await Promise.all([
        // dashboard=1 is just a payload-shape toggle (see runtime/coordinator/
        // telemetry/public-state.ts) - no extra auth/ACL, and it's what unlocks
        // characterDetails below (party-console's own dashboard already reads
        // per-character Hunt quest status from there; this app just wasn't
        // asking for the same shape before now).
        api.get('state?section=core&dashboard=1'),
        api.get('state?section=bank'),
        api.get('state?section=market'),
        api.get('state?catalog=0&dashboard=1&section=logs'),
        api.get('mail'),
        api.get('escape'),
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
        const coreRaw =
          coreResult.kind === 'success'
            ? (JSON.parse(coreResult.value) as Partial<PartyStateDynamic> & {
                characterDetails?: Record<string, { monsterHunt?: MonsterHuntStatus | null }>
              })
            : undefined
        const { characterDetails, ...core } = coreRaw ?? {}
        const characterHunt = characterDetails
          ? Object.fromEntries(Object.entries(characterDetails).map(([name, detail]) => [name, detail.monsterHunt ?? null]))
          : undefined
        const bank = bankResult.kind === 'success' ? (JSON.parse(bankResult.value) as Partial<PartyStateDynamic>) : {}
        const market = marketResult.kind === 'success' ? (JSON.parse(marketResult.value) as Partial<PartyStateDynamic>) : {}
        const logs =
          logsResult.kind === 'success'
            ? (JSON.parse(logsResult.value) as { combatLogs?: PartyStateDynamic['combatLogs']; merchantActivity?: PartyStateDynamic['merchantActivity'] })
            : {}
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

      if (mailResult.kind === 'success') {
        const parsed = JSON.parse(mailResult.value) as Partial<MailSnapshot>
        queryClient.setQueryData(QK.mail, { messages: [], count: 0, ...parsed })
      }
      if (logsResult.kind === 'success') {
        const parsed = JSON.parse(logsResult.value) as { gameLogs?: Record<string, GameLogEntry[]> }
        queryClient.setQueryData(QK.gameLogs, parsed.gameLogs ?? {})
      }
      if (escapeResult.kind === 'success') {
        const parsed = JSON.parse(escapeResult.value) as { escape?: EscapeStatus | null }
        queryClient.setQueryData(QK.escape, parsed.escape ?? null)
      }
    },
    [api, queryClient, refreshCatalogNow],
  )

  // Roster fetch (name/ctype/level) - relatively static, fetched once
  // with a short retry rather than polled.
  useEffect(() => {
    let cancelled = false
    const fetchRosterWithRetry = async () => {
      for (let attempt = 0; attempt < ROSTER_RETRY_ATTEMPTS; attempt += 1) {
        const result = await api.get('state')
        if (!cancelled && result.kind === 'success') {
          try {
            const parsed = JSON.parse(result.value) as { roster?: RosterMember[] }
            const roster: Record<string, RosterMember> = {}
            for (const member of parsed.roster ?? []) roster[member.name] = member
            rosterRef.current = roster
            queryClient.setQueryData(QK.roster, roster)
            // The roster fetch and the live SSE stream race - a
            // character's first snapshot can arrive (and get decoded
            // with blank ctype/level) before the roster call completes.
            // Once it does, patch every already-known character rather
            // than waiting for their next tick.
            queryClient.setQueryData<Record<string, CharacterState>>(QK.characters, (current) => {
              if (!current) return current
              const next: Record<string, CharacterState> = {}
              for (const [name, state] of Object.entries(current)) {
                const member = roster[name]
                next[name] = member && state.vitals ? { ...state, vitals: { ...state.vitals, ctype: member.ctype, level: member.level, server: member.server } } : state
              }
              return next
            })
            return
          } catch {
            // fall through to retry
          }
        }
        if (attempt < ROSTER_RETRY_ATTEMPTS - 1) await new Promise((resolve) => setTimeout(resolve, ROSTER_RETRY_DELAY_MS))
      }
    }
    void fetchRosterWithRetry()
    return () => {
      cancelled = true
    }
  }, [api, queryClient])

  // Dynamic state / mail / game logs - polled on the same ~6s cadence
  // party-console's own account-info refresh uses.
  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      while (!cancelled) {
        await refreshDynamicStateNow()
        await new Promise((resolve) => setTimeout(resolve, DYNAMIC_STATE_POLL_MS))
      }
    }
    void poll()
    return () => {
      cancelled = true
    }
  }, [refreshDynamicStateNow])

  // Catalog - see CATALOG_REFRESH_MS. Runs on its own much slower timer,
  // independent of the main poll above.
  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      while (!cancelled) {
        await new Promise((resolve) => setTimeout(resolve, CATALOG_REFRESH_MS))
        if (!cancelled) await refreshCatalogNow()
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
