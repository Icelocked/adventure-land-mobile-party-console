import { describe, expect, it } from 'vitest'
import { consoleFeatures } from './consoleFeatures'
import { emptyPartyStateDynamic, type PartyStateDynamic } from './state'
import { filterBuyOrders, ownedKey, type AlDataBuyOrder } from '@/lib/market'

// Ryan's v1.4.0 public state: none of the fork's fields.
const v140State = (): PartyStateDynamic => ({
  ...emptyPartyStateDynamic(),
  leader: 'Leada',
  merchantRoutinePriorities: { 'upgrade preview': 70, 'manual upgrades': 70 },
  farmingProfiles: { Leada: { farmingPolicy: 'auto' } },
})

// The stable console fork with its initial values (initial-core.ts,
// merchant/bank-sort.ts, merchant/initial-settings.ts, hunt/scopes.ts).
const stableState = (): PartyStateDynamic => ({
  ...v140State(),
  designatedTank: null,
  gearSets: {},
  bossChase: { enabled: false, minEtaMinutes: 15, trip: null, sightings: [], respawns: [] } as unknown as PartyStateDynamic['bossChase'],
  realmHopBlacklist: [],
  bankSortLayout: 'packed',
  merchantRoutinePriorities: { 'upgrade preview': 70, 'manual upgrades': 70, 'prim stack': 70 },
  farmingProfiles: { Leada: { farmingPolicy: 'auto', encounterRoutines: {} } },
})

describe('consoleFeatures', () => {
  it('Ryan v1.4.0 supports none of the fork features', () => {
    expect(Object.values(consoleFeatures(v140State())).some(Boolean)).toBe(false)
  })

  it('the stable fork supports every feature from its initial state, an unset tank included', () => {
    expect(consoleFeatures(stableState())).toEqual({
      designatedTank: true,
      gearSets: true,
      frankyRoutine: true,
      bossChase: true,
      realmHopBlacklist: true,
      gappedBankSort: true,
      primStack: true,
      forkCommerce: true,
    })
  })

  it('reads each signal on its own', () => {
    const base = v140State()
    expect(consoleFeatures({ ...base, designatedTank: 'Tanky' }).designatedTank).toBe(true)
    expect(consoleFeatures({ ...base, encounterRoutines: { franky: 'tank' } }).frankyRoutine).toBe(true)
    expect(consoleFeatures({ ...base, merchantRoutinePriorities: { 'prim stack': 10 } }).primStack).toBe(true)
    // gearSets alone is not the fork's commerce build; bossChase must come with it.
    const gearOnly = consoleFeatures({ ...base, gearSets: {} })
    expect(gearOnly.gearSets).toBe(true)
    expect(gearOnly.forkCommerce).toBe(false)
    expect(consoleFeatures({ ...base, bossChase: null }).bossChase).toBe(false)
  })
})

describe('filterBuyOrders owned-first', () => {
  const now = 1_000_000_000
  const order = (name: string, price: number, seenAt: number) => ({ key: name, item: { name }, price, seenAt, buyer: 'B', serverRegion: 'EU', serverIdentifier: 'I', quantity: 1 }) as unknown as AlDataBuyOrder
  const orders = [order('fresh', 900, now), order('owned', 100, now - 600_000)]
  const owned = new Map([[ownedKey({ name: 'owned' }), 2]])

  it('v1.4.0 sorts fresh offers first', () => {
    expect(filterBuyOrders(orders, '', now, false, owned, () => undefined).map((entry) => entry.item.name)).toEqual(['fresh', 'owned'])
  })

  it('the stable fork puts offers the merchant can fill ahead of freshness', () => {
    expect(filterBuyOrders(orders, '', now, false, owned, () => undefined, true).map((entry) => entry.item.name)).toEqual(['owned', 'fresh'])
  })
})
