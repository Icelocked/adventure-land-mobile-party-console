import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { usePartyApi } from '@/data/PartyDataProvider'
import {
  METRIC_BUCKET_MS, METRIC_MAX_RANGE_MS, RATE_UNITS, goldGainSeries, localDayBounds, metricDay, metricDayStart, rateFormat, shiftMetricDay,
  type AccountGoldResponse, type GoldHistoryResponse, type MetricsBarsResponse, type MetricsKillsResponse, type TemporaryMetricReset, unwrap,
} from '@/lib/metrics'
import { MetricsChart } from './MetricsChart'
import { MetricsFilter, MetricsSelect, metricsControl } from './MetricsControls'

export interface ResetControls { onReset(): void; resetting: boolean; resetDisabled: boolean; resetTitle: string }
interface RangeProps { active: boolean; live: boolean; from: number; to: number; clock: number; characters: string[]; server: string }
const validRange = (from: number, to: number) => Number.isFinite(from) && Number.isFinite(to) && from < to && to - from <= METRIC_MAX_RANGE_MS
const emptyText = (query: { isError: boolean; isPending: boolean }, fallback: string) => (query.isError ? 'Metrics unavailable' : query.isPending ? 'Loading...' : fallback)

/** metrics-kills.tsx: rate labels normalize the selected range, so rare monsters keep a useful average between spawns. */
export function MetricsKills(props: RangeProps & ResetControls & { monsterNames: Map<string, string>; resetAt: number }) {
  const api = usePartyApi()
  const [selected, setSelected] = useState<string[]>([]), [rateMs, setRateMs] = useState(3_600_000)
  const [dayFrom, dayTo] = localDayBounds(props.clock)
  const query = useQuery({
    queryKey: ['metrics', 'kills', props.from, props.to, dayFrom, dayTo, props.characters, props.server],
    queryFn: () => {
      const params: Record<string, string> = { from: String(props.from), to: String(props.to), dayFrom: String(dayFrom), dayTo: String(dayTo) }
      if (props.characters.length) params.characters = props.characters.join(',')
      if (props.server) params.servers = props.server
      return unwrap(api.metrics<MetricsKillsResponse>('metrics/kills', params))
    },
    enabled: props.active && validRange(props.from, props.to) && !props.resetDisabled,
    staleTime: props.live ? 500 : Infinity, gcTime: 10_000, placeholderData: keepPreviousData, retry: false,
  })
  const data = query.data
  const totals = data && data.resetAt >= props.resetAt ? data.monsters : []
  const options = useMemo(() => {
    const names = new Map(props.monsterNames)
    for (const row of data?.monsters || []) if (!names.has(row.monster)) names.set(row.monster, row.monster)
    return [...names].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [props.monsterNames, data])
  const name = (id: string) => props.monsterNames.get(id) || id
  const byMonster = new Map(totals.map((row) => [row.monster, row]))
  const monsters = (selected.length ? selected.map((monster) => byMonster.get(monster) || { monster, count: 0, total: 0, today: 0 }) : totals)
    .slice().sort((a, b) => b.count - a.count || name(a.monster).localeCompare(name(b.monster)))
  const unit = RATE_UNITS.find((entry) => entry.value === rateMs) || RATE_UNITS[2]
  const labels = monsters.map((row) => ({
    label: name(row.monster), total: row.total,
    rate: (data && data.elapsedMs > 0 ? rateFormat((row.count * rateMs) / data.elapsedMs) : '-') + unit.suffix,
  }))
  return (
    <MetricsChart title="Kills" data={monsters.map((row, at) => ({ at, kills: row.count }))} series={[{ key: 'kills', label: 'Kills in selected range', color: '#22d3ee' }]}
      yLabel="Kills" xFormat={(value) => labels[Math.round(value)]?.label || ''} type="bar" barCategories={labels} logarithmic
      currentValue={{ amount: data && !query.isError ? monsters.reduce((count, row) => count + row.today, 0) : null, unit: 'today', label: 'Total kills today', exact: true }}
      onReset={props.onReset} resetDisabled={props.resetDisabled} resetting={props.resetting} resetTitle={props.resetTitle}
      empty={emptyText(query, 'No recorded kills')}
      controls={<>
        <MetricsFilter label="Filter monsters" allLabel="All monsters" selected={selected} options={options} onChange={setSelected} />
        <MetricsSelect label="Kill rate unit" value={String(rateMs)} onChange={(value) => setRateMs(Number(value))} options={RATE_UNITS.map((entry) => ({ value: String(entry.value), label: entry.label }))} />
      </>} />
  )
}

/** metrics-measurements.tsx: DPS compares characters or skills; acquired-item bars count units. */
export function MetricsMeasurements(props: RangeProps & ResetControls & {
  metric: 'damage' | 'loot'; names: Map<string, string>; monsterNames: Map<string, string>; skillNames: Map<string, string>
  resetAt: number; temporaryReset?: TemporaryMetricReset
}) {
  const api = usePartyApi()
  const [by, setBy] = useState<'character' | 'skill'>('character'), [monsters, setMonsters] = useState<string[]>([])
  const [skills, setSkills] = useState<string[]>([]), [items, setItems] = useState<string[]>([]), [rateMs, setRateMs] = useState(3_600_000)
  const [dayFrom, dayTo] = localDayBounds(props.clock)
  const from = Math.max(props.from, props.temporaryReset?.at || 0)
  const valid = validRange(from, props.to)
  const damage = props.metric === 'damage'
  const query = useQuery({
    queryKey: ['metrics', 'bars', props.metric, by, from, props.to, dayFrom, props.characters, props.server, monsters, skills, items],
    queryFn: () => {
      const params: Record<string, string> = { metric: props.metric, by, from: String(from), to: String(props.to), dayFrom: String(dayFrom), dayTo: String(dayTo) }
      for (const [key, values] of [['characters', props.characters], ['monsters', monsters], ['skills', skills], ['items', items]] as const) if (values.length) params[key] = values.join(',')
      if (props.server) params.servers = props.server
      return unwrap(api.metrics<MetricsBarsResponse>('metrics/bars', params))
    },
    enabled: props.active && valid && !props.resetDisabled, staleTime: props.live ? 500 : Infinity, gcTime: 10_000, placeholderData: keepPreviousData, retry: false,
  })
  const data = query.data
  const elapsedMs = props.temporaryReset && data ? Math.max(0, data.to - Math.max(data.from, props.temporaryReset.at)) : data?.elapsedMs || 0
  const fresh = !!data && data.metric === props.metric && (!damage || data.by === by) && data.resetAt >= props.resetAt
  // A display-only item reset subtracts its last visible partial bucket.
  const baseline = props.temporaryReset?.values.filter((value) => (!props.characters.length || props.characters.includes(value.character)) && (!props.server || value.server === props.server)) || []
  const rows = fresh
    ? data.rows.map((row) => {
        if (damage || !props.temporaryReset || data.from >= props.temporaryReset.at) return row
        const previous = baseline.flatMap((value) => value.loot).filter((item) => item.item === row.id).reduce((total, item) => total + item.quantity, 0)
        return { ...row, amount: Math.max(0, row.amount - previous) }
      })
    : []
  const unit = RATE_UNITS.find((entry) => entry.value === rateMs) || RATE_UNITS[2]
  const label = (id: string) => (!damage ? props.names.get(id) || id : by === 'skill' ? props.skillNames.get(id) || id : id)
  const categories = rows.map((row) => ({
    label: label(row.id), total: row.total, detailLabel: damage ? 'Damage' : 'Total',
    rate: elapsedMs > 0 ? rateFormat((row.amount * (damage ? 1000 : rateMs)) / elapsedMs) + (damage ? '/s' : unit.suffix) : '-',
  }))
  const amount = (row: { amount: number }) => (damage ? (elapsedMs > 0 ? (row.amount * 1000) / elapsedMs : 0) : row.amount)
  return (
    <MetricsChart title={damage ? 'DPS' : 'Items acquired'} data={rows.map((row, at) => ({ at, amount: amount(row) }))}
      series={[{ key: 'amount', label: damage ? 'Average DPS in selected range' : 'Acquired in selected range', color: damage ? '#a78bfa' : '#fbbf24' }]}
      yLabel={damage ? 'Damage / sec' : 'Quantity'} xFormat={(value) => label(rows[Math.round(value)]?.id || '')} type="bar" barCategories={categories} logarithmic
      currentValue={{ amount: data && !query.isError ? rows.reduce((total, row) => total + row.today, 0) : null, unit: damage ? 'damage today' : 'items today', label: damage ? 'Total damage today' : 'Total items acquired today' }}
      onReset={props.onReset} resetting={props.resetting} resetDisabled={props.resetDisabled} resetTitle={props.resetTitle}
      empty={!valid ? 'No data since reset' : emptyText(query, 'No recorded data')}
      controls={damage ? <>
        <MetricsSelect label="DPS categories" value={by} onChange={(value) => setBy(value === 'skill' ? 'skill' : 'character')} options={[{ value: 'character', label: 'By character' }, { value: 'skill', label: 'By skill' }]} />
        <MetricsFilter label="Monster" allLabel="All monsters" selected={monsters} options={(data?.monsters || []).map((id) => ({ id, label: props.monsterNames.get(id) || id }))} onChange={setMonsters} />
        <MetricsFilter label="Skill" allLabel="All skills" selected={skills} options={(data?.skills || []).map((id) => ({ id, label: props.skillNames.get(id) || id }))} onChange={setSkills} />
      </> : <>
        <MetricsFilter label="Item" allLabel="All items" selected={items} options={(data?.items || []).map((id) => ({ id, label: props.names.get(id) || id }))} onChange={setItems} />
        <MetricsSelect label="Acquisition rate" value={String(rateMs)} onChange={(value) => setRateMs(Number(value))} options={RATE_UNITS.map((entry) => ({ value: String(entry.value), label: entry.label }))} />
      </>} />
  )
}

/** metrics-gold.tsx: net gold since the last gold reset, independent of the time range. */
export function MetricsGold(props: ResetControls & { active: boolean; live: boolean; clock: number; resetAt: number; roster: string[]; characters: string[]; server: string }) {
  const api = usePartyApi()
  const historyClock = Math.floor(props.clock / METRIC_BUCKET_MS) * METRIC_BUCKET_MS
  const query = useQuery({
    queryKey: ['metrics', 'gold', props.resetAt, historyClock],
    queryFn: () => unwrap(api.metrics<GoldHistoryResponse>('metrics', { sinceReset: 'gold', resetAt: String(props.resetAt), to: String(historyClock) })),
    enabled: props.active && !props.resetDisabled && historyClock > props.resetAt,
    staleTime: props.live ? METRIC_BUCKET_MS : Infinity, gcTime: 10_000, placeholderData: keepPreviousData, retry: false,
  })
  const data = useMemo(() => (query.data ? { ...query.data, resets: { ...query.data.resets, gold: Math.max(props.resetAt, query.data.resets?.gold || 0) } } : undefined), [query.data, props.resetAt])
  const [character, setCharacter] = useState(''), [accountConsumables, setAccountConsumables] = useState(true)
  const available = (data?.characters || props.roster).filter((name) => !props.characters.length || props.characters.includes(name))
  const selected = available.includes(character) ? character : ''
  const points = useMemo(() => (data ? goldGainSeries(data, selected ? [selected] : props.characters, props.server, accountConsumables) : []), [data, selected, props.characters, props.server, accountConsumables])
  const legacy = data?.points.some((point) => point.values.some((row) => row.last.goldMovement === undefined && (!selected || row.character === selected) && (!props.characters.length || props.characters.includes(row.character)) && (!props.server || row.server === props.server)))
  return (
    <MetricsChart title="Gold history" data={points} series={[{ key: 'gain', label: selected || 'Combined net gold gain', color: '#4ade80' }]}
      yLabel="Gold gained (net)" currentValue={{ amount: points[points.length - 1]?.gain ?? null, unit: 'gold gained', label: 'Net gold gained since reset' }}
      empty={emptyText(query, 'No data since reset')}
      onReset={props.onReset} resetting={props.resetting} resetDisabled={props.resetDisabled} resetTitle={props.resetTitle}
      optionDetails={<p className="text-xs text-muted-foreground">History since the last reset, up to 180 days. Internal transfers and bank movements are excluded. With potion and elixir use on, confirmed use costs its catalog replacement value and the matching purchases are added back, so nothing is charged twice. Older samples without consumption tracking can't be adjusted.{legacy ? ' Older history predates transfer tracking.' : ''}</p>}
      controls={<>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={accountConsumables} onChange={(event) => setAccountConsumables(event.target.checked)} />Account for potion and elixir use</label>
        <MetricsSelect label="Gold character" value={selected} onChange={setCharacter} options={[{ value: '', label: 'All characters' }, ...available.map((name) => ({ value: name, label: name }))]} />
      </>} />
  )
}

/** metrics-account-gold.tsx: the bank plus carried total the console records every 10 seconds. */
export function MetricsAccountGold(props: { active: boolean; live: boolean; clock: number; resetAt: number; total: number | null; onReset(): void; resetDisabled: boolean }) {
  const api = usePartyApi()
  const historyClock = Math.floor(props.clock / METRIC_BUCKET_MS) * METRIC_BUCKET_MS
  const query = useQuery({
    queryKey: ['metrics', 'account-gold', props.resetAt, historyClock],
    queryFn: () => unwrap(api.metrics<AccountGoldResponse>('metrics/account-gold', { resetAt: String(props.resetAt), to: String(historyClock) })),
    enabled: props.active && !props.resetDisabled, staleTime: props.live ? METRIC_BUCKET_MS : Infinity, gcTime: 10_000, placeholderData: keepPreviousData, retry: false,
  })
  return (
    <MetricsChart title="Total account gold" data={(query.data?.points || []).filter((point) => point.at >= props.resetAt).map((point) => ({ at: point.at, total: point.total }))}
      series={[{ key: 'total', label: 'Total account gold', color: '#fbbf24' }]} yLabel="Gold"
      currentValue={{ amount: props.total, unit: 'total gold', exact: true }} onReset={props.onReset} resetDisabled={props.resetDisabled}
      resetTitle="Clear graph; keep stored history" empty={emptyText(query, 'No recorded account balance')}
      optionDetails={<p className="text-xs text-muted-foreground">Bank plus carried gold, which the console records every 10 seconds whether or not a dashboard is open. History starts when that tracking began and is kept for 180 days.</p>} />
  )
}

/** metrics-loot.tsx: every item acquired on whole America/Toronto calendar days. */
export function MetricsLoot(props: { active: boolean; live: boolean; clock: number; characters: string[]; server: string; names: Map<string, string>; resetDisabled: boolean }) {
  const api = usePartyApi()
  const [mode, setMode] = useState('today'), [first, setFirst] = useState(() => metricDay(Date.now())), [last, setLast] = useState(() => metricDay(Date.now()))
  const today = metricDay(props.clock), day = mode === 'today' ? today : mode === 'yesterday' ? shiftMetricDay(today, -1) : first
  const from = metricDayStart(day), end = metricDayStart(shiftMetricDay(mode === 'range' ? last : day, 1))
  const to = Math.min(end, props.clock), valid = validRange(from, to)
  const query = useQuery({
    queryKey: ['metrics', 'loot-days', from, to, props.characters, props.server],
    queryFn: () => {
      const params: Record<string, string> = { metric: 'loot', from: String(from), to: String(to), dayFrom: String(metricDayStart(today)), dayTo: String(metricDayStart(shiftMetricDay(today, 1))) }
      if (props.characters.length) params.characters = props.characters.join(',')
      if (props.server) params.servers = props.server
      return unwrap(api.metrics<MetricsBarsResponse>('metrics/bars', params))
    },
    enabled: props.active && valid && !props.resetDisabled, staleTime: props.live ? 500 : Infinity, gcTime: 10_000, placeholderData: keepPreviousData, retry: false,
  })
  const rows = valid && !query.isError ? (query.data?.rows || []).filter((row) => row.amount > 0) : []
  const label = (at: number) => props.names.get(rows[Math.round(at)]?.id || '') || rows[Math.round(at)]?.id || ''
  return (
    <MetricsChart title="Loot breakdown" data={rows.map((row, at) => ({ at, total: row.amount }))} series={[{ key: 'total', label: 'Acquired', color: '#fbbf24' }]}
      yLabel="Quantity" xFormat={label} type="bar" categoryAxis resetDisabled={props.resetDisabled}
      onReset={() => { setMode('today'); setFirst(today); setLast(today) }}
      resetTitle="Restore today's loot and date filters" currentValue={{ amount: rows.reduce((total, row) => total + row.amount, 0), unit: 'items in selected days', exact: true }}
      empty={!valid ? 'Choose a valid day or range of up to 180 days' : emptyText(query, 'No loot in selected days')}
      inlineControls={<>
        <MetricsSelect label="Loot days" value={mode} onChange={setMode} options={[{ value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }, { value: 'day', label: 'Pick a day' }, { value: 'range', label: 'Date range' }]} />
        {(mode === 'day' || mode === 'range') && <input aria-label="Loot first day" type="date" className={metricsControl} value={first} max={today} onChange={(event) => setFirst(event.target.value)} />}
        {mode === 'range' && <input aria-label="Loot last day" type="date" className={metricsControl} value={last} min={first} max={today} onChange={(event) => setLast(event.target.value)} />}
      </>}
      optionDetails={<p className="text-xs text-muted-foreground">Calendar days use America/Toronto, including daylight saving time. A date range includes both of its days.</p>} />
  )
}

