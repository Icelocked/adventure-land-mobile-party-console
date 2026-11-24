import { describe, expect, it } from 'vitest'
import {
  applyAcknowledgedResets,
  applyTemporaryResets,
  goldGainSeries,
  linearTicks,
  logTicks,
  metricDay,
  metricDayStart,
  observedMonsterRate,
  pingGraph,
  projectDirectDrop,
  shiftMetricDay,
  type GoldHistoryResponse,
  type MetricSample,
  type MetricTotals,
  type MetricsResponse,
} from './metrics'

const sample = (at: number, gold: number, extra: Partial<MetricSample> = {}): MetricSample => ({ at, gold, luck: 1, ping: null, level: 50, xp: 0, maxXp: 1, ...extra })
const totals = (character: string, at: number, extra: Partial<MetricTotals> = {}): MetricTotals => ({
  character, server: 'EUI', observedMs: 10_000, partial: false, damage: [], credits: [], loot: [],
  first: sample(at, 0), last: sample(at + 5_000, 0), samples: 1, luckSum: 1, pingSum: 0, pingSamples: 0, ...extra,
})
const response = (points: MetricsResponse['points'], extra: Partial<MetricsResponse> = {}): MetricsResponse => ({
  version: 1, startedAt: 0, from: 0, to: 30_000, resolutionMs: 10_000, points, characters: ['Leada', 'Healy'], servers: ['EUI'],
  lastReceivedAt: null, incomplete: false, ...extra,
})

describe('pingGraph', () => {
  it('averages each character per bucket and keeps missing buckets as gaps', () => {
    const data = response([
      { at: 0, values: [totals('Leada', 0, { pingSum: 300, pingSamples: 3 })], kills: [] },
      { at: 20_000, values: [totals('Leada', 20_000, { pingSum: 80, pingSamples: 2 }), totals('Healy', 20_000, { pingSum: 50, pingSamples: 1 })], kills: [] },
    ])
    const graph = pingGraph(data, { characters: ['Leada', 'Healy'], server: '' })
    expect(graph.series.map((line) => line.label)).toEqual(['Leada', 'Healy'])
    expect(graph.ping).toEqual([
      { at: 0, 'character:Leada': 100, 'character:Healy': null },
      { at: 10_000, 'character:Leada': null, 'character:Healy': null },
      { at: 20_000, 'character:Leada': 40, 'character:Healy': 50 },
    ])
  })
})

describe('goldGainSeries', () => {
  it('starts each character at its first balance and adds internal gold movement back', () => {
    const history: GoldHistoryResponse = {
      startedAt: 0, from: 0, to: 30_000, resolutionMs: 10_000, characters: ['Leada', 'Healy'],
      points: [
        { at: 0, values: [{ character: 'Leada', server: 'EUI', first: sample(1_000, 1_000), last: sample(9_000, 1_200) }] },
        { at: 10_000, values: [
          // Leada sent 500 to the bank, so her balance drop is not a loss.
          { character: 'Leada', server: 'EUI', first: sample(11_000, 1_200, { goldMovement: 0 }), last: sample(19_000, 900, { goldMovement: 500 }) },
          { character: 'Healy', server: 'EUI', first: sample(12_000, 5_000), last: sample(19_000, 5_050) },
        ] },
      ],
    }
    expect(goldGainSeries(history, [], '').map((point) => point.gain)).toEqual([200, 450])
    expect(goldGainSeries(history, ['Healy'], '').map((point) => point.gain)).toEqual([null, 50])
  })

  it('charges consumed potions and adds back their purchases when asked', () => {
    const history: GoldHistoryResponse = {
      startedAt: 0, from: 0, to: 20_000, resolutionMs: 10_000, characters: ['Leada'],
      points: [{ at: 0, values: [{ character: 'Leada', server: 'EUI', first: sample(0, 1_000, { consumableCost: 0, consumablePurchases: 0 }), last: sample(9_000, 900, { consumableCost: 40, consumablePurchases: 100 }) }] }],
    }
    expect(goldGainSeries(history, [], '', false)[0].gain).toBe(-100)
    expect(goldGainSeries(history, [], '', true)[0].gain).toBe(-40)
  })
})

describe('resets', () => {
  it('drops kills and damage from the view once a reset is acknowledged', () => {
    const data = response([{ at: 0, values: [totals('Leada', 0, { damage: [{ monster: 'goo', skill: 'attack', amount: 10, hits: 1 }], credits: [{ monster: 'goo', count: 1 }] })], kills: [{ server: 'EUI', monster: 'goo', actor: 'Leada', count: 1 }] }])
    const cut = applyAcknowledgedResets(data, { kills: 5 })
    expect(cut.resets?.kills).toBe(5)
    expect(cut.points[0].kills).toEqual([])
    expect(cut.points[0].values[0].credits).toEqual([])
    expect(cut.points[0].values[0].damage).toHaveLength(1)
    expect(applyAcknowledgedResets(data, {})).toBe(data)
  })

  it('subtracts the partial bucket baseline for a display-only loot reset', () => {
    const row = totals('Leada', 10_000, { loot: [{ item: 'seashell', variant: '', quantity: 5 }] })
    const data = response([
      { at: 0, values: [totals('Leada', 0, { loot: [{ item: 'seashell', variant: '', quantity: 3 }] })], kills: [] },
      { at: 10_000, values: [row], kills: [] },
    ])
    const baseline = { at: 15_000, bucketAt: 10_000, resolutionMs: 10_000, values: [totals('Leada', 10_000, { loot: [{ item: 'seashell', variant: '', quantity: 2 }] })] }
    const cut = applyTemporaryResets(data, { loot: baseline })
    expect(cut.resets?.loot).toBe(15_000)
    expect(cut.points[0].values[0].loot).toEqual([])
    expect(cut.points[1].values[0].loot).toEqual([{ item: 'seashell', variant: '', quantity: 3 }])
  })
})

describe('observedMonsterRate', () => {
  it('normalizes kills to an hourly rate over the observed range', () => {
    const data = response([{ at: 0, values: [], kills: [{ server: 'EUI', monster: 'goo', actor: 'Leada', count: 6 }] }], { from: 0, to: 600_000 })
    expect(observedMonsterRate(data, 'goo', '', [])).toBe(36)
    expect(observedMonsterRate(data, 'goo', '', ['Healy'])).toBeNull()
  })
})

describe('metric days', () => {
  it('uses America/Toronto midnights, including the 25-hour DST day', () => {
    expect(metricDayStart('2026-11-01')).toBe(Date.parse('2026-11-01T04:00:00Z'))
    expect(metricDayStart('2026-11-02') - metricDayStart('2026-11-01')).toBe(25 * 3_600_000)
    expect(metricDay(Date.parse('2026-11-02T04:30:00Z'))).toBe('2026-11-01')
    expect(shiftMetricDay('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('projectDirectDrop', () => {
  it('combines ordinary rolls with the Encouragement bonus roll', () => {
    const base = { baseRate: 0.01, luck: 1, share: 1, contribution: 1, encouragement: 1, level: 1, modifier: 1, rolls: 1 }
    expect(projectDirectDrop(base).probability).toBeCloseTo(0.01)
    expect(projectDirectDrop({ ...base, encouragement: 2 }).probability).toBeCloseTo(1 - 0.99 * 0.99)
    expect(projectDirectDrop({ ...base, baseRate: 1 }).probability).toBe(1)
  })
})

describe('chart ticks', () => {
  it('picks round linear steps and decade log steps', () => {
    expect(linearTicks(0, 87)).toEqual([0, 20, 40, 60, 80, 100])
    expect(linearTicks(0, 0)).toEqual([0, 1])
    expect(logTicks(3, 4500)).toEqual([1, 10, 100, 1000, 10000])
  })
})
