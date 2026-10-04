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
  CharacterDiagnostics,
  PartyStateDynamic,
  RosterMember,
} from '@/models'
import { emptyPartyStateDynamic } from '@/models'
import { QK } from './queryKeys'
import { affectedDomains, PARTY_ACTION_EVENT, type Domain, type PartyActionDetail } from './queryActions'

/** Owns one live connection to one configured server and pushes every
 *  known character's state into the shared TanStack Query cache - a
 *  direct port of data/PartyRepository.kt, one instance per active
 *  server connection (recreated whenever [settings] changes - see the
 *  key on <PartyDataProvider> in App.tsx). */


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
  registerInterest: (domain: Domain) => () => void
  settings: ServerSettings
}

const PartyDataContext = createContext<PartyDataContextValue | null>(null)

export function PartyDataProvider({ settings, children }: { settings: ServerSettings; children: ReactNode }) {
  const queryClient = useQueryClient()
  const api = useMemo(() => new PartyApiClient(settings), [settings])
  const rosterRef = useRef<Record<string, RosterMember>>({})

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

  // Per-domain polling, mirroring query-cache.tsx's domain policies: every
  // section is its own single-flight request on its own cadence, so a slow
  // section never holds up another, and a refresh asked for while one is in
  // flight runs once more right after it (never two at once, never an older
  // response landing after a newer one).
  const interest = useRef<Record<string, number>>({})
  const lastAccountId = useRef<string | null>(null)
  const lastReferenceRevision = useRef<string | null>(null)
  // The market domain's aldata (with listings) - wins over core's stripped copy.
  const marketAldata = useRef<PartyStateDynamic['aldata']>(null)
  const catalogLoaded = useRef(false)

  const fetchers = useMemo(() => {
    type CoreWire = Partial<PartyStateDynamic> & {
      characterDetails?: Record<string, CharacterDiagnostics>
      serverNow?: number
      characters?: Record<string, Pick<RosterMember, 'name' | 'ctype' | 'level' | 'server'>>
    }
    type LogsWire = {
      combatLogs?: PartyStateDynamic['combatLogs']
      merchantActivity?: PartyStateDynamic['merchantActivity']
      gameLogs?: Record<string, GameLogEntry[]>
    }
    const mergeState = (patch: Partial<PartyStateDynamic>) =>
      queryClient.setQueryData<PartyStateDynamic>(QK.dynamicState, (current) => ({ ...emptyPartyStateDynamic(), ...(current ?? {}), ...patch }))
    // dashboard=1 is the dashboard's own request shape (query-cache.tsx reads
    // every domain as state?catalog=0&dashboard=1&section=X).
    const section = <T,>(name: string) => api.getJson<T>(`state?catalog=0&dashboard=1&section=${name}`)

    const core = async () => {
      const sentAt = Date.now()
      const result = await section<CoreWire>('core')
      if (result.kind !== 'success') return
      // bankbois: core only has item-less summaries; the bank section has the full entries.
      const { characterDetails, bankbois: _bankboiSummaries, characters: summaries, serverNow, ...patch } = result.value
      // query-cache.tsx: a different account on the same server replaces
      // everything - the dashboard remounts, the PWA reloads.
      const accountId = patch.accountId ?? null
      if (accountId && lastAccountId.current && accountId !== lastAccountId.current) {
        window.location.reload()
        return
      }
      if (accountId) lastAccountId.current = accountId
      // live-metrics.ts synchronizeDashboardClock: offset from the midpoint of the round trip.
      if (serverNow) queryClient.setQueryData(QK.serverOffset, serverNow - (sentAt + Date.now()) / 2)
      if (characterDetails) queryClient.setQueryData(QK.characterDiagnostics, characterDetails)
      if (summaries) {
        const roster = { ...rosterRef.current }
        for (const [name, summary] of Object.entries(summaries)) roster[name] = { ...roster[name], ...summary, name }
        applyRoster(roster)
      }
      const characterHunt = characterDetails
        ? Object.fromEntries(Object.entries(characterDetails).map(([name, detail]) => [name, detail.monsterHunt ?? null]))
        : undefined
      // use-panel-model.ts lays the market domain over core, so core's
      // aldata (listings/trades/buyOrders stripped) never replaces the
      // market's copy once that has loaded.
      if (marketAldata.current) patch.aldata = marketAldata.current
      mergeState({ ...patch, ...(characterHunt ? { characterHunt } : {}) })
      // query-cache.tsx keys the catalog by core's referenceRevision.
      if (patch.referenceRevision && patch.referenceRevision !== lastReferenceRevision.current) {
        lastReferenceRevision.current = patch.referenceRevision
        void triggers.catalog()
      }
    }

    const config = async () => {
      const result = await section<Partial<PartyStateDynamic> & { roster?: RosterMember[] }>('config')
      if (result.kind !== 'success') return
      const { roster: rosterList, ...patch } = result.value
      mergeState(patch)
      queryClient.setQueryData(QK.configLoadedAt, Date.now())
      if (Array.isArray(rosterList)) {
        const roster: Record<string, RosterMember> = {}
        for (const member of rosterList) roster[member.name] = member
        applyRoster(roster)
      }
    }

    // query-cache.tsx market domain: before core's first referenceRevision
    // it reads GET /aldata/market alone; afterwards the market section.
    const market = async () => {
      if (!lastReferenceRevision.current) {
        const result = await api.getJson<PartyStateDynamic['aldata']>('aldata/market')
        if (result.kind === 'success' && result.value) {
          marketAldata.current = result.value
          mergeState({ aldata: result.value })
        }
        return
      }
      const result = await section<Partial<PartyStateDynamic>>('market')
      if (result.kind !== 'success') return
      if (result.value.aldata) marketAldata.current = result.value.aldata
      mergeState(result.value)
    }

    const simple = (name: string) => async () => {
      const result = await section<Partial<PartyStateDynamic>>(name)
      if (result.kind === 'success') mergeState(result.value)
    }

    const logs = async () => {
      const result = await section<LogsWire>('logs')
      // log-sidebar.tsx: a failed refresh keeps the retained logs and says so.
      queryClient.setQueryData(QK.logsError, result.kind !== 'success')
      if (result.kind !== 'success') return
      const { combatLogs, merchantActivity, gameLogs } = result.value
      mergeState({ ...(combatLogs ? { combatLogs } : {}), ...(merchantActivity ? { merchantActivity } : {}) })
      queryClient.setQueryData(QK.gameLogs, gameLogs ?? {})
    }

    const mail = async () => {
      const result = await api.getJson<Partial<MailSnapshot>>('mail')
      // mail-query.ts: a failed refresh keeps the last inbox and shows why.
      if (result.kind === 'success') queryClient.setQueryData(QK.mail, { messages: [], count: 0, ...result.value })
      else queryClient.setQueryData<MailSnapshot>(QK.mail, (previous) => ({ messages: [], count: 0, ...previous, error: result.message || 'Mail unavailable' }))
    }

    // `escape` is the smallest request (usually `{escape:null}`), so its
    // round trip is mostly network latency - the latency badge's source.
    const escape = async () => {
      const started = performance.now()
      const result = await api.getJson<{ escape?: EscapeStatus | null }>('escape')
      queryClient.setQueryData(QK.escapeError, result.kind === 'success' ? null : result.message || 'Escape status unavailable')
      if (result.kind !== 'success') return
      queryClient.setQueryData(QK.latencyMs, Math.round(performance.now() - started))
      queryClient.setQueryData(QK.escape, result.value.escape ?? null)
    }

    const catalog = async () => {
      const result = await api.getJson<Partial<PartyStateDynamic>>('state?section=catalog')
      if (result.kind !== 'success') return
      catalogLoaded.current = true
      mergeState(result.value)
    }

    // dashboard-live.tsx: while the live stream is down, `fast` (vitals) and
    // `inventory` (items/slots) stand in for it.
    const fallbackRecords = new Map<string, LiveRecordWire>()
    const applyFallback = (name: string, patch: Partial<LiveRecordWire>) => {
      // A response that lands after the stream recovered is stale.
      if (queryClient.getQueryData<boolean>(QK.connected) !== false) return
      const previous = fallbackRecords.get(name) ?? { generation: 'poll', sample: 0, sampledAt: Date.now(), vitals: {}, items: {}, slots: {} }
      const record = { ...previous, ...patch }
      fallbackRecords.set(name, record)
      queryClient.setQueryData<Record<string, CharacterState>>(QK.characters, (current) => ({
        ...(current ?? {}),
        [name]: recordToState(name, record, rosterRef.current),
      }))
    }
    const fast = async () => {
      const result = await section<{ characters?: Record<string, Record<string, unknown>> }>('fast')
      if (result.kind !== 'success') return
      for (const [name, vitals] of Object.entries(result.value.characters ?? {})) {
        const size = fallbackRecords.get(name)?.vitals.inventorySize
        applyFallback(name, { vitals: { ...vitals, ...(size !== undefined ? { inventorySize: size } : {}) } })
      }
    }
    const inventory = async () => {
      type InventoryWire = { items?: (InventoryEntry | null)[]; slots?: Record<string, EquippedEntry | null> }
      const result = await section<{ characters?: Record<string, InventoryWire> }>('inventory')
      if (result.kind !== 'success') return
      for (const [name, entry] of Object.entries(result.value.characters ?? {})) {
        const items: Record<string, unknown> = {}
        ;(entry.items ?? []).forEach((value, index) => {
          if (value) items[String(index)] = value
        })
        const vitals = fallbackRecords.get(name)?.vitals ?? {}
        applyFallback(name, { items, slots: entry.slots ?? {}, vitals: { ...vitals, inventorySize: (entry.items ?? []).length } })
      }
    }

    const singleFlight = (fetch: () => Promise<void>) => {
      let inFlight: Promise<void> | null = null
      let again = false
      return (): Promise<void> => {
        if (inFlight) {
          again = true
          return inFlight
        }
        inFlight = (async () => {
          try {
            do {
              again = false
              await fetch().catch((error) => console.error('poll failed', error))
            } while (again)
          } finally {
            inFlight = null
          }
        })()
        return inFlight
      }
    }
    const triggers = {
      core: singleFlight(core),
      config: singleFlight(config),
      bank: singleFlight(simple('bank')),
      market: singleFlight(market),
      logs: singleFlight(logs),
      mail: singleFlight(mail),
      escape: singleFlight(escape),
      catalog: singleFlight(catalog),
      fast: singleFlight(fast),
      inventory: singleFlight(inventory),
    }
    return triggers
  }, [api, queryClient, applyRoster])

  // query-cache.tsx policies (core is 2s here rather than 1s - mobile data).
  // A domain a visible screen depends on (useDomainInterest) polls faster.
  const cadences = useMemo(() => {
    const interested = (domain: string) => (interest.current[domain] ?? 0) > 0
    // Only once the stream has reported unhealthy - not during the first
    // connect, when a fallback write could overwrite the first snapshot.
    const liveDown = () => queryClient.getQueryData<boolean>(QK.connected) === false
    const policies: Record<keyof typeof fetchers, () => number | null> = {
      core: () => 2_000,
      config: () => 15_000,
      bank: () => (interested('bank') ? 2_000 : 15_000),
      market: () => 10_000,
      logs: () => (interested('logs') ? 1_000 : 6_000),
      mail: () => (interested('mail') ? 2_000 : 10_000),
      escape: () => (queryClient.getQueryData(QK.escape) ? 1_000 : 6_000),
      // Refetched when core's referenceRevision changes, not on a timer -
      // but retried until the first one lands.
      catalog: () => (catalogLoaded.current ? null : 5_000),
      fast: () => (liveDown() ? 250 : null),
      inventory: () => (liveDown() ? 2_000 : null),
    }
    return policies
  }, [queryClient, fetchers])

  useEffect(() => {
    let cancelled = false
    const sleeps = new Set<() => void>()
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const wake = () => {
          clearTimeout(timer)
          sleeps.delete(wake)
          resolve()
        }
        const timer = setTimeout(wake, ms)
        sleeps.add(wake)
      })
    for (const domain of Object.keys(fetchers) as (keyof typeof fetchers)[]) {
      void (async () => {
        while (!cancelled) {
          const interval = cadences[domain]()
          // Polling pauses while the app is in the background, like the dashboard's queries.
          if (interval !== null && !document.hidden) await fetchers[domain]()
          if (cancelled) return
          await sleep(interval ?? 1_000)
        }
      })()
    }
    // Coming back to the foreground: refresh right away.
    const onVisible = () => {
      if (document.hidden) return
      for (const wake of [...sleeps]) wake()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      for (const wake of [...sleeps]) wake()
    }
  }, [fetchers, cadences])

  // query-actions.ts: after an action, refresh the domains it touched.
  useEffect(() => {
    const onAction = (event: Event) => {
      const { path, body } = (event as CustomEvent<PartyActionDetail>).detail
      for (const domain of affectedDomains(path, body)) {
        if (cadences[domain]() === null && (domain === 'fast' || domain === 'inventory')) continue
        void fetchers[domain]()
      }
    }
    window.addEventListener(PARTY_ACTION_EVENT, onAction)
    return () => window.removeEventListener(PARTY_ACTION_EVENT, onAction)
  }, [fetchers, cadences])

  // After a mutation: refresh core and config together, like query-actions.ts's
  // ['core', 'config'] group. Resolves once both have landed.
  const refreshDynamicStateNow = useMemo(
    () => async () => {
      await Promise.all([fetchers.core(), fetchers.config(), fetchers.escape()])
    },
    [fetchers],
  )

  const registerInterest = useMemo(
    () => (domain: Domain) => {
      interest.current[domain] = (interest.current[domain] ?? 0) + 1
      void fetchers[domain]()
      return () => {
        interest.current[domain] = Math.max(0, (interest.current[domain] ?? 1) - 1)
      }
    },
    [fetchers],
  )

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

  const value = useMemo<PartyDataContextValue>(
    () => ({ api, refreshDynamicStateNow, registerInterest, settings }),
    [api, refreshDynamicStateNow, registerInterest, settings],
  )

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
/** A screen that shows this domain makes it poll at its fast cadence while
 *  mounted (query-cache.tsx polls bank/mail/logs faster while they're open). */
export function useDomainInterest(domain: Domain): void {
  const { registerInterest } = usePartyData()
  useEffect(() => registerInterest(domain), [registerInterest, domain])
}

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
export const useLogsError = (): boolean => useCachedValue(QK.logsError, false)
export const useEscapeError = (): string | null => useCachedValue(QK.escapeError, null)
export const useAlDataAuthPending = (): boolean => useCachedValue(QK.aldataAuthPending, false)
export const useAlDataAuthStatus = (): string | null => useCachedValue(QK.aldataAuthStatus, null)
export const useEscapeStatus = (): EscapeStatus | null => useCachedValue(QK.escape, null)
/** Round-trip time of the smallest request in the last dynamic-state poll
 *  cycle (see refreshDynamicStateNow) - null until the first poll lands. */
export const useLatencyMs = (): number | null => useCachedValue(QK.latencyMs, null)
/** When the config section (rules, marks, settings, leader/followers, ...)
 *  last arrived - null until the first one lands. Any control seeded from a
 *  config field must stay disabled until then (useConfigLoaded), or it
 *  would save empty defaults over the server's real values. */
export const useConfigLoadedAt = (): number | null => useCachedValue(QK.configLoadedAt, null)
export const useConfigLoaded = (): boolean => useConfigLoadedAt() !== null
/** core's characterDetails for one character (active slots only). */
export function useCharacterDiagnostics(name: string): CharacterDiagnostics | undefined {
  return useCachedValue<Record<string, CharacterDiagnostics>>(QK.characterDiagnostics, {})[name]
}
/** Every character's diagnostics (active slots only). */
export const useCharacterDiagnosticsMap = (): Record<string, CharacterDiagnostics> => useCachedValue(QK.characterDiagnostics, {})
/** query-cache.tsx presence: seen by the coordinator within the last 10s. */
export function useCharacterOnline(name: string): boolean {
  const seenAt = Number(useCharacterDiagnostics(name)?.seenAt || 0)
  return Date.now() - seenAt < 10_000
}
/** Server clock minus this device's clock (live-metrics.ts serverOffset). */
export const useServerOffset = (): number => useCachedValue(QK.serverOffset, 0)
/** The configured merchant (config section) - the merchant ROLE. Never infer
 *  it from character class: bankbois and second merchants share the class. */
export const useMerchantCharacter = (): string | null => useDynamicState().merchantCharacter ?? null
/** inventory/shared-rules.ts ruleOwner: with shared merchant rules every
 *  member's rules live under the merchant; otherwise each owns its own. */
export function useRuleOwner(name: string): string {
  const state = useDynamicState()
  return state.merchantRules ? (state.merchantCharacter ?? name) : name
}
