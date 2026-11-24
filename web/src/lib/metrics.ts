// The metrics view's wire types and series math, ported from the console:
// runtime/metrics/contracts.ts and luck.ts, plus dashboard/features/party/
// metrics-series.ts, metrics-days.ts and metrics-gold.tsx goldGainSeries.
import type { ApiResult } from '@/api/partyApi'

/** A failed read becomes a thrown error, which TanStack Query reports as isError. */
export async function unwrap<T>(request: Promise<ApiResult<T>>): Promise<T> {
  const result = await request
  if (result.kind === 'failure') throw new Error(result.message)
  return result.value
}

export interface MetricDamage { monster: string; skill: string; amount: number; hits: number }
export interface MetricCredit { monster: string; count: number }
export interface MetricSample {
  at: number; gold: number; luck: number; ping: number | null; level: number; xp: number; maxXp: number
  /** Cumulative internal gold sent or deposited minus received or withdrawn. Older history omits it. */
  goldMovement?: number
  consumableCost?: number
  consumablePurchases?: number
  encouragementLuck?: number
}
export type GoldSample = Pick<MetricSample, 'at' | 'gold' | 'goldMovement' | 'consumableCost' | 'consumablePurchases'>
export interface MetricTotals {
  character: string; server: string
  goldStart?: GoldSample
  observedMs: number; partial: boolean
  damage: MetricDamage[]; credits: MetricCredit[]
  loot: { item: string; variant: string; quantity: number }[]
  first: MetricSample; last: MetricSample
  samples: number; luckSum: number; pingSum: number; pingSamples: number
}
export interface MetricDeathTotal { server: string; monster: string; actor: string; count: number }
export interface MetricPoint { at: number; values: MetricTotals[]; kills: MetricDeathTotal[] }
export const METRIC_RESET_KINDS = ['kills', 'damage', 'gold', 'loot', 'ping'] as const
export type MetricResetKind = (typeof METRIC_RESET_KINDS)[number]
export type MetricResets = Partial<Record<MetricResetKind, number>>
export interface MetricsResponse {
  version: 1; startedAt: number; from: number; to: number; resolutionMs: number
  points: MetricPoint[]; characters: string[]; servers: string[]
  lastReceivedAt: number | null; incomplete: boolean; resets?: MetricResets
}
export interface AccountGoldResponse { from: number; to: number; points: { at: number; total: number | null }[] }
export interface GoldHistoryResponse {
  startedAt: number; from: number; to: number; resolutionMs: number; characters: string[]; resets?: MetricResets
  points: { at: number; values: (Pick<MetricTotals, 'character' | 'server' | 'goldStart'> & { first: GoldSample; last: GoldSample })[] }[]
}
export interface MetricsKillsResponse {
  version: 1; from: number; to: number; elapsedMs: number; dayFrom: number; dayTo: number; resetAt: number
  monsters: { monster: string; count: number; total: number; today: number }[]
  lastReceivedAt: number | null
}
export interface MetricBarSummary { id: string; amount: number; total: number; today: number }
export interface MetricsBarsResponse {
  version: 1; metric: 'damage' | 'loot'; by: 'character' | 'skill' | 'item'
  from: number; to: number; elapsedMs: number; dayFrom: number; dayTo: number; resetAt: number
  rows: MetricBarSummary[]; characters: string[]; monsters: string[]; skills: string[]; items: string[]
  lastReceivedAt: number | null
}
export const METRIC_BUCKET_MS = 10_000
/** The console rejects any metrics range longer than this (service.ts). */
export const METRIC_MAX_RANGE_MS = 180 * 86_400_000

export interface GraphPoint { at: number; [key: string]: number | null }
export interface GraphSeries { key: string; label: string; color: string }
export const METRIC_COLORS = ['#22d3ee', '#fbbf24', '#fb7185', '#a78bfa', '#4ade80', '#fb923c', '#60a5fa', '#e879f9']

export const characterSeries = (names: string[], roster = names): GraphSeries[] =>
  names.map((name) => ({ key: 'character:' + name, label: name, color: METRIC_COLORS[Math.max(0, roster.indexOf(name)) % METRIC_COLORS.length] }))
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

export function selectMetricRows(rows: MetricTotals[], characters: string[], server: string) {
  return rows.filter((row) => (!characters.length || characters.includes(row.character)) && (!server || row.server === server))
}

/** A bucket with no ping observation stays a gap instead of a zero-latency sample. */
export function pingGraph(data: MetricsResponse, filters: { characters: string[]; server: string }) {
  const names = filters.characters
  const series = characterSeries(names, data.characters)
  const ping: GraphPoint[] = []
  const points = new Map(data.points.map((point) => [point.at, point]))
  const resetAt = data.resets?.ping || 0
  for (let at = Math.floor(data.from / data.resolutionMs) * data.resolutionMs; at < data.to; at += data.resolutionMs) {
    if (at + data.resolutionMs <= resetAt) continue
    const selected = selectMetricRows(points.get(at)?.values || [], names, filters.server).filter((row) => row.last.at >= resetAt)
    const point: GraphPoint = { at: Math.max(at, resetAt) }
    for (const line of series) {
      const rows = selected.filter((row) => row.character === line.label)
      const samples = sum(rows.map((row) => row.pingSamples))
      point[line.key] = samples ? sum(rows.map((row) => row.pingSum)) / samples : null
    }
    ping.push(point)
  }
  return { series, ping }
}

export interface TemporaryMetricReset { at: number; bucketAt: number; resolutionMs: number; values: MetricTotals[] }

/** A confirmed kills or damage reset hides that data until the next response carries the new cut. */
export function applyAcknowledgedResets(data: MetricsResponse, acknowledged: MetricResets): MetricsResponse {
  const kills = (data.resets?.kills || 0) < (acknowledged.kills || 0), damage = (data.resets?.damage || 0) < (acknowledged.damage || 0)
  if (!kills && !damage) return data
  const cuts: MetricResets = { ...data.resets }
  for (const kind of METRIC_RESET_KINDS) if (acknowledged[kind] !== undefined) cuts[kind] = Math.max(cuts[kind] || 0, acknowledged[kind] || 0)
  return {
    ...data, resets: cuts,
    points: data.points.map((point) => ({
      ...point, kills: kills ? [] : point.kills,
      values: point.values.map((row) => ({ ...row, credits: kills ? [] : row.credits, damage: damage ? [] : row.damage })),
    })),
  }
}

/** A display reset subtracts the last received partial bucket. The console keeps the stored
 *  measurements, and Reset filters brings them back. */
export function applyTemporaryResets(data: MetricsResponse, resets: Partial<Record<MetricResetKind, TemporaryMetricReset>>): MetricsResponse {
  const cuts: MetricResets = { ...data.resets }
  for (const kind of ['gold', 'loot', 'ping'] as const) {
    const reset = resets[kind]
    if (reset) cuts[kind] = Math.max(cuts[kind] || 0, reset.at)
  }
  const points = data.points.map((point) => ({
    ...point,
    values: point.values.map((row) => {
      let result = row
      for (const kind of ['loot', 'ping'] as const) {
        const reset = resets[kind]
        if (!reset || point.at >= reset.at) continue
        if (point.at + data.resolutionMs <= reset.at || data.resolutionMs !== reset.resolutionMs) {
          result = kind === 'loot' ? { ...result, loot: [] } : { ...result, pingSum: 0, pingSamples: 0 }
          continue
        }
        if (point.at !== reset.bucketAt) continue
        const baseline = reset.values.find((value) => value.character === row.character && value.server === row.server)
        if (!baseline) continue
        result = { ...result }
        if (kind === 'loot')
          result.loot = row.loot
            .map((item) => ({ ...item, quantity: Math.max(0, item.quantity - (baseline.loot.find((previous) => previous.item === item.item && previous.variant === item.variant)?.quantity || 0)) }))
            .filter((item) => item.quantity > 0)
        else {
          result.pingSum = Math.max(0, row.pingSum - baseline.pingSum)
          result.pingSamples = Math.max(0, row.pingSamples - baseline.pingSamples)
        }
      }
      return result
    }),
  }))
  return { ...data, resets: cuts, points }
}

export function observedMonsterRate(data: MetricsResponse, monster: string, server: string, characters: string[]) {
  const count = sum(data.points.flatMap((point) => point.kills)
    .filter((kill) => (!server || kill.server === server) && kill.monster === monster && (!characters.length || characters.includes(kill.actor)))
    .map((kill) => kill.count))
  const elapsed = data.to - Math.max(data.from, data.startedAt, data.resets?.kills || 0)
  return elapsed > 0 && count > 0 ? (count * 3_600_000) / elapsed : null
}

const profitBalance = (sample: GoldSample, accountConsumables: boolean) =>
  sample.gold + (sample.goldMovement || 0) + (accountConsumables ? (sample.consumablePurchases || 0) - (sample.consumableCost || 0) : 0)

/** Each character starts at its first observed balance, adjusted for internal movement, so
 *  joining the chart never counts existing wealth as income. An offline character keeps its
 *  last known gain. */
export function goldGainSeries(data: GoldHistoryResponse, characters: string[], server: string, accountConsumables = false) {
  const start = Math.max(data.from, data.startedAt, data.resets?.gold || 0)
  const balances = new Map<string, { baseline: number; balance: number; at: number }>()
  const points: GraphPoint[] = []
  for (const point of data.points) {
    if (point.at + data.resolutionMs <= start) continue
    const rows = point.values
      .filter((row) => (!characters.length || characters.includes(row.character)) && (!server || row.server === server) && row.last.at >= start)
      .sort((a, b) => a.first.at - b.first.at)
    for (const row of rows) {
      const previous = balances.get(row.character)
      const first = row.goldStart && row.goldStart.at >= start ? row.goldStart : row.first.at >= start ? row.first : row.last
      if (!previous) balances.set(row.character, { baseline: profitBalance(first, accountConsumables), balance: profitBalance(row.last, accountConsumables), at: row.last.at })
      else if (row.last.at >= previous.at) {
        previous.balance = profitBalance(row.last, accountConsumables)
        previous.at = row.last.at
      }
    }
    points.push({ at: Math.max(point.at, start), gain: balances.size ? sum([...balances.values()].map((value) => value.balance - value.baseline)) : null })
  }
  return points
}

// Loot days follow the console's America/Toronto calendar.
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
const dayParts = (at: number) => Object.fromEntries(dayFormatter.formatToParts(at).map((part) => [part.type, part.value]))

export function metricDay(at: number) {
  const value = dayParts(at)
  return value.year + '-' + value.month + '-' + value.day
}
export function shiftMetricDay(day: string, days: number) {
  const at = Date.parse(day + 'T00:00:00Z')
  return Number.isFinite(at) ? new Date(at + days * 86_400_000).toISOString().slice(0, 10) : ''
}
/** Toronto midnight at its real offset, so a DST day spans 23 or 25 hours. */
export function metricDayStart(day: string) {
  const midnight = Date.parse(day + 'T00:00:00Z')
  if (!Number.isFinite(midnight)) return NaN
  let at = midnight
  for (let i = 0; i < 3; i++) {
    const value = dayParts(at)
    const wall = Date.parse(value.year + '-' + value.month + '-' + value.day + 'T' + value.hour + ':' + value.minute + ':' + value.second + 'Z')
    at += midnight - wall
  }
  return at
}
/** This device's local day around `clock`, which the kills and bars "today" totals use. */
export function localDayBounds(clock: number): [number, number] {
  const start = new Date(clock)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return [start.getTime(), end.getTime()]
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
export function parseMetricResets(value: unknown): MetricResets | null {
  if (!object(value)) return null
  const resets: MetricResets = {}
  for (const kind of METRIC_RESET_KINDS) {
    const at = value[kind]
    if (at === undefined) continue
    if (typeof at !== 'number' || !Number.isFinite(at) || at < 0) return null
    resets[kind] = at
  }
  return resets
}

/** Encouragement is a separate contribution-based reward. luckm already holds ordinary buffs,
 *  so this counts only the encouragement_* conditions (node/logic/encouragement.js). */
export function encouragementLuck(conditions: Record<string, unknown> | undefined): number | null {
  if (!conditions) return null
  let multiplier = 1
  for (const [id, condition] of Object.entries(conditions)) {
    if (!id.startsWith('encouragement_') || !object(condition)) continue
    const luck = condition.luck_multiplier
    if (typeof luck === 'number' && Number.isFinite(luck) && luck >= 1) multiplier *= luck
  }
  return multiplier
}

export interface DropProjectionInputs {
  baseRate: number; luck: number; share: number; contribution: number
  encouragement: number; level: number; modifier: number; rolls: number
}
/** Ordinary table rolls and the reserved Encouragement roll are independent Bernoulli trials. */
export function projectDirectDrop(input: DropProjectionInputs) {
  const ordinary = Math.min(1, input.baseRate * input.luck * input.share * input.level * input.modifier)
  const bonus = Math.min(1, input.baseRate * input.luck * input.contribution * (input.encouragement - 1) * input.level * input.modifier)
  const probability = ordinary === 1 || bonus === 1 ? 1 : -Math.expm1(input.rolls * Math.log1p(-ordinary) + Math.log1p(-bonus))
  return { probability, expectedRewards: input.rolls * ordinary + bonus }
}

export const metricFormat = (value: number) =>
  new Intl.NumberFormat(undefined, {
    ...(Math.abs(value) > 0 && Math.abs(value) < 1 ? { maximumSignificantDigits: 3 } : { maximumFractionDigits: 2 }),
    notation: Math.abs(value) >= 10000 ? 'compact' : 'standard',
  }).format(value)
export const rateFormat = (value: number) =>
  new Intl.NumberFormat(undefined, { maximumSignificantDigits: 3, notation: value >= 10000 ? 'compact' : 'standard' }).format(value)

export const RATE_UNITS = [
  { value: 900_000, label: '/ 15 min', suffix: '/15m' },
  { value: 1_800_000, label: '/ 30 min', suffix: '/30m' },
  { value: 3_600_000, label: '/ hour', suffix: '/h' },
  { value: 86_400_000, label: '/ day', suffix: '/day' },
]

/** Round axis steps of 1, 2 or 5 times a power of ten, covering [low, high]. */
export function linearTicks(low: number, high: number, count = 5): number[] {
  if (!(high > low)) return [low, low + 1]
  const raw = (high - low) / count
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= raw) ?? 10 * power
  const ticks: number[] = []
  for (let value = Math.floor(low / step) * step; value < high + step; value += step) {
    ticks.push(Number(value.toPrecision(12)))
    if (value >= high) break
  }
  return ticks
}
/** One tick per decade from below `low` to above `high`. */
export function logTicks(low: number, high: number): number[] {
  const first = Math.floor(Math.log10(low)), last = Math.max(first + 1, Math.ceil(Math.log10(high)))
  return Array.from({ length: Math.min(16, last - first + 1) }, (_, i) => 10 ** (first + i))
}
