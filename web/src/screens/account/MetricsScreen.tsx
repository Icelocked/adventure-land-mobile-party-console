import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pause, Play, RotateCcw, Users } from 'lucide-react'
import { useDynamicState, usePartyApi } from '@/data/PartyDataProvider'
import {
  METRIC_MAX_RANGE_MS, applyAcknowledgedResets, applyTemporaryResets, parseMetricResets, pingGraph,
  type MetricResetKind, type MetricResets, type MetricsResponse, type TemporaryMetricReset, unwrap,
} from '@/lib/metrics'
import { cn } from '@/lib/utils'
import { AccountScreenScaffold } from './AccountScreenScaffold'
import { MetricsChart } from './metrics/MetricsChart'
import { MetricsFilter, MetricsSelect, metricsControl } from './metrics/MetricsControls'
import { MetricsAccountGold, MetricsGold, MetricsKills, MetricsLoot, MetricsMeasurements } from './metrics/MetricsPanels'
import { MetricsDropEstimator } from './metrics/MetricsDropEstimator'

const RANGES = [
  { value: 900_000, label: '15 minutes' }, { value: 3_600_000, label: '1 hour' }, { value: 21_600_000, label: '6 hours' },
  { value: 86_400_000, label: '24 hours' }, { value: 604_800_000, label: '7 days' },
]
function localDate(at: number) {
  return new Date(at - new Date(at).getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
function useVisible() {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden)
  useEffect(() => {
    const change = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', change)
    return () => document.removeEventListener('visibilitychange', change)
  }, [])
  return visible
}
function savedReset(key: string) {
  try {
    const at = Number(localStorage.getItem(key))
    return Number.isFinite(at) && at >= 0 ? at : 0
  } catch {
    return 0
  }
}
/** The dashboard's gold reset baselines, under the same localStorage key (metrics-view.tsx useGoldReset). */
function useGoldReset(account: string, metric: string) {
  const key = `party.metrics.${account}.${metric}`
  const [saved, setSaved] = useState(() => ({ key, at: savedReset(key) }))
  const at = saved.key === key ? saved.at : savedReset(key)
  return [at, (value: number) => {
    try { localStorage.setItem(key, String(value)) } catch { /* Storage disabled: the baseline lasts for this visit only. */ }
    setSaved({ key, at: value })
  }] as const
}

/** The dashboard's metrics view (dashboard/features/party/metrics-view.tsx): kills, DPS, gold,
 *  account gold, loot, loot per day, a drop estimator and ping, with the same filters and the
 *  same GET /party-api/metrics* requests. Panels stack in one column on a phone. */
export function MetricsScreen() {
  const api = usePartyApi()
  const client = useQueryClient()
  const state = useDynamicState()
  const visible = useVisible()
  const account = state.accountId || 'local'
  const [estimateVersion, setEstimateVersion] = useState(0)
  const [acknowledgedResets, setAcknowledgedResets] = useState<MetricResets>({})
  const [temporaryResets, setTemporaryResets] = useState<Partial<Record<MetricResetKind, TemporaryMetricReset>>>({})
  const [goldResetAt, setGoldResetAt] = useGoldReset(account, 'goldResetAt')
  const [accountResetAt, setAccountResetAt] = useGoldReset(account, 'accountGoldResetAt')
  const [duration, setDuration] = useState(3_600_000), [live, setLive] = useState(true), [clock, setClock] = useState(Date.now)
  const [customFrom, setCustomFrom] = useState(() => localDate(Date.now() - 3_600_000)), [customTo, setCustomTo] = useState(() => localDate(Date.now()))
  const [characters, setCharacters] = useState<string[]>([]), [server, setServer] = useState('')
  const [filtersVersion, setFiltersVersion] = useState(0)
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    if (!live || !visible) return
    setClock(Date.now())
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [live, visible, duration])

  // Only a tap on Reset data reaches this destructive route; filter changes never erase data.
  const resetMutation = useMutation({
    mutationFn: async (metric: 'kills' | 'damage' | 'performance') => {
      const result = await api.resetMetrics(metric)
      if (result.kind === 'failure') throw new Error(result.message)
      const resets = parseMetricResets(result.value.data?.resets)
      if (!resets) throw new Error('Invalid metrics reset response')
      return resets
    },
    onMutate: () => client.cancelQueries({ queryKey: ['metrics'] }),
    onSettled: () => client.invalidateQueries({ queryKey: ['metrics'] }),
  })

  const from = duration ? clock - duration : new Date(customFrom).getTime(), to = duration ? clock : new Date(customTo).getTime()
  const valid = Number.isFinite(from) && Number.isFinite(to) && from < to && to - from <= METRIC_MAX_RANGE_MS
  const query = useQuery({
    queryKey: ['metrics', 'range', from, to],
    queryFn: () => unwrap(api.metrics<MetricsResponse>('metrics', { from: String(from), to: String(to) })),
    enabled: visible && valid && !resetMutation.isPending, staleTime: live ? 500 : Infinity, gcTime: 10_000,
    placeholderData: keepPreviousData, retry: false,
  })
  const rawData = query.data
  const data = useMemo(() => (rawData ? applyTemporaryResets(applyAcknowledgedResets(rawData, acknowledgedResets), temporaryResets) : undefined), [rawData, acknowledgedResets, temporaryResets])
  const pingCharacters = useMemo(() => [...new Set((state.activeSlots || []).filter((slot) => slot.state === 'online' && slot.character).map((slot) => slot.character!))]
    .filter((name) => !characters.length || characters.includes(name)), [state.activeSlots, characters])
  const graphs = useMemo(() => (data ? pingGraph(data, { characters: pingCharacters, server }) : null), [data, pingCharacters, server])
  const itemNames = useMemo(() => new Map((state.merchantCatalog?.allItems || []).map((item) => [item.id, item.name])), [state.merchantCatalog])
  const monsterNames = useMemo(() => new Map(state.bestiaryCatalog.map((monster) => [monster.id, monster.name])), [state.bestiaryCatalog])
  const skillNames = useMemo(() => new Map(state.skillCatalog.flatMap((group) => group.skills.map((skill) => [skill.id, skill.name] as const))), [state.skillCatalog])
  // Core's accountGold (public-state.ts), the bank plus carried total, including offline slots.
  const accountTotal = (state as { accountGold?: { total?: number | null } | null }).accountGold?.total ?? null

  function clearView(kinds: MetricResetKind[]) {
    if (kinds.includes('gold')) { setGoldResetAt(Date.now()); setAccountResetAt(Date.now()) }
    if (!rawData) return
    const latest = rawData.points[rawData.points.length - 1]
    const baseline: TemporaryMetricReset = { at: Date.now(), bucketAt: latest?.at ?? 0, resolutionMs: rawData.resolutionMs, values: structuredClone(latest?.values || []) }
    setTemporaryResets((previous) => ({ ...previous, ...Object.fromEntries(kinds.map((kind) => [kind, baseline])) }))
  }
  function resetMetric(kind: MetricResetKind | 'all') {
    if (kind !== 'all' && kind !== 'kills' && kind !== 'damage') return clearView([kind])
    resetMutation.mutate(kind === 'all' ? 'performance' : kind, {
      onSuccess: (cuts) => {
        setAcknowledgedResets(cuts)
        if (kind === 'all') { clearView(['gold', 'loot', 'ping']); setEstimateVersion((value) => value + 1) }
      },
    })
  }
  const resetControls = (kind: MetricResetKind) => ({
    onReset: () => resetMetric(kind), resetDisabled: resetMutation.isPending,
    resetting: resetMutation.isPending && (resetMutation.variables === kind || resetMutation.variables === 'performance'),
    resetTitle: kind === 'kills' || kind === 'damage' ? `Permanently delete all stored ${kind} data` : 'Clear graph; keep stored history',
  })
  function resetFilters() {
    setCharacters([]); setServer(''); setFiltersVersion((value) => value + 1)
    setTemporaryResets({}); setGoldResetAt(0); setAccountResetAt(0)
    setDuration(3_600_000); setLive(true); setClock(Date.now())
  }
  const rangeLive = live && duration !== 0
  const range = { active: visible, live: rangeLive, from, to, clock, characters, server }
  const status = query.isError ? 'Unavailable' : data?.incomplete ? 'Partial coverage' : live ? 'Live' : 'Paused'

  return (
    <AccountScreenScaffold title="Metrics">
      <section aria-label="Game metrics" className="flex flex-col gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span title={status} aria-label={status} className={cn('size-2 rounded-full', query.isError ? 'bg-rose-400' : data?.incomplete ? 'bg-amber-400' : live ? 'bg-emerald-400' : 'bg-slate-500')} />
          <MetricsSelect label="Time range" value={String(duration)} onChange={(value) => { setDuration(Number(value)); setClock(Date.now()) }}
            options={[...RANGES.map((entry) => ({ value: String(entry.value), label: entry.label })), { value: '0', label: 'Custom' }]} />
          <MetricsFilter label="Filter characters" allLabel="All characters" icon={<Users className="size-4" />} selected={characters}
            options={(data?.characters || []).map((name) => ({ id: name, label: name }))} onChange={setCharacters} />
          <MetricsSelect label="Server" value={server} onChange={setServer} options={[{ value: '', label: 'All servers' }, ...(data?.servers || []).map((name) => ({ value: name, label: name }))]} />
          <button className={metricsControl} aria-pressed={live} onClick={() => setLive(!live)}>
            {live ? <Pause className="size-4" /> : <Play className="size-4" />}{live ? 'Live' : 'Paused'}
          </button>
          <button className={cn(metricsControl, 'w-9 px-0')} onClick={resetFilters} aria-label="Reset filters" title="Reset filters and restore temporarily hidden history">
            <RotateCcw className="size-4" />
          </button>
          {confirmReset ? (
            <>
              <button className={cn(metricsControl, 'border-rose-500 text-rose-300')} disabled={resetMutation.isPending} onClick={() => { setConfirmReset(false); resetMetric('all') }}>Confirm reset</button>
              <button className={metricsControl} onClick={() => setConfirmReset(false)}>Cancel</button>
            </>
          ) : (
            <button className={metricsControl} disabled={resetMutation.isPending} onClick={() => setConfirmReset(true)} title="Delete kills and damage history; clear other graphs from view">Reset data</button>
          )}
        </div>
        {duration === 0 && (
          <div className="flex flex-wrap gap-2">
            <input aria-label="Range start" type="datetime-local" className={metricsControl} value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} />
            <input aria-label="Range end" type="datetime-local" className={metricsControl} value={customTo} onChange={(event) => setCustomTo(event.target.value)} />
          </div>
        )}
        {confirmReset && <p className="text-xs text-rose-300">Reset data permanently deletes the stored kills and damage history and clears the other graphs from view.</p>}
        {!valid && <p role="status" className="text-sm text-amber-300">Invalid date range</p>}
        {query.isError && !resetMutation.isPending && <p role="status" className="text-sm text-rose-300">Metrics unavailable</p>}
        {resetMutation.isError && <p role="status" className="text-sm text-rose-300">Could not reset metrics</p>}
        {query.isPending && !data && valid && <p role="status" className="py-12 text-center text-sm text-muted-foreground">Loading...</p>}
        {data && graphs && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <MetricsKills key={`kills:${filtersVersion}`} {...range} monsterNames={monsterNames}
              resetAt={Math.max(acknowledgedResets.kills || 0, data.resets?.kills || 0)} {...resetControls('kills')} />
            <MetricsMeasurements key={`damage:${filtersVersion}`} metric="damage" {...range} names={itemNames} monsterNames={monsterNames} skillNames={skillNames}
              resetAt={Math.max(acknowledgedResets.damage || 0, data.resets?.damage || 0)} {...resetControls('damage')} />
            <MetricsGold key={`gold:${filtersVersion}`} active={visible} live={live} clock={clock} resetAt={goldResetAt} roster={data.characters}
              characters={characters} server={server} {...resetControls('gold')} />
            <MetricsAccountGold active={visible} live={live} clock={clock} resetAt={accountResetAt} total={accountTotal}
              onReset={() => setAccountResetAt(Date.now())} resetDisabled={resetMutation.isPending} />
            <MetricsMeasurements key={`loot:${filtersVersion}`} metric="loot" {...range} names={itemNames} monsterNames={monsterNames} skillNames={skillNames}
              resetAt={rawData?.resets?.loot || 0} temporaryReset={temporaryResets.loot} {...resetControls('loot')} />
            <MetricsLoot key={`loot-days:${filtersVersion}`} active={visible} live={live} clock={clock} characters={characters} server={server} names={itemNames}
              resetDisabled={resetMutation.isPending} />
            <MetricsDropEstimator key={estimateVersion} data={data} items={state.merchantCatalog?.allItems || []} characters={characters} server={server} live={rangeLive} clock={clock} />
            <MetricsChart {...resetControls('ping')} title="Ping history" data={graphs.ping} series={graphs.series} yLabel="Ping (ms)"
              empty={pingCharacters.length ? 'No recorded ping' : 'No logged-in characters'} />
          </div>
        )}
      </section>
    </AccountScreenScaffold>
  )
}
