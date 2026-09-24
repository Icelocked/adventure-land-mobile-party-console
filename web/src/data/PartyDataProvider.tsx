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
  GameLogEntry,
  InventoryEntry,
  MailSnapshot,
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
}

const PartyDataContext = createContext<PartyDataContextValue | null>(null)

export function PartyDataProvider({ settings, children }: { settings: ServerSettings; children: ReactNode }) {
  const queryClient = useQueryClient()
  const api = useMemo(() => new PartyApiClient(settings), [settings])
  const rosterRef = useRef<Record<string, RosterMember>>({})

  const refreshDynamicStateNow = useMemo(
    () => async () => {
      const stateResult = await api.get('state')
      if (stateResult.kind === 'success') {
        const parsed = JSON.parse(stateResult.value) as Partial<PartyStateDynamic>
        queryClient.setQueryData(QK.dynamicState, { ...emptyPartyStateDynamic(), ...parsed })
      }
      const mailResult = await api.get('mail')
      if (mailResult.kind === 'success') {
        const parsed = JSON.parse(mailResult.value) as Partial<MailSnapshot>
        queryClient.setQueryData(QK.mail, { messages: [], count: 0, ...parsed })
      }
      const logsResult = await api.get('state?catalog=0&dashboard=1&section=logs')
      if (logsResult.kind === 'success') {
        const parsed = JSON.parse(logsResult.value) as { gameLogs?: Record<string, GameLogEntry[]> }
        queryClient.setQueryData(QK.gameLogs, parsed.gameLogs ?? {})
      }
    },
    [api, queryClient],
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

  const value = useMemo<PartyDataContextValue>(() => ({ api, refreshDynamicStateNow }), [api, refreshDynamicStateNow])

  return <PartyDataContext.Provider value={value}>{children}</PartyDataContext.Provider>
}

function usePartyData(): PartyDataContextValue {
  const context = useContext(PartyDataContext)
  if (!context) throw new Error('usePartyData must be used within a PartyDataProvider')
  return context
}

export const usePartyApi = (): PartyApiClient => usePartyData().api
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
