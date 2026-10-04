/** Writes the e2e mock's section payloads as JSON fixtures for the Android
 *  app's JVM tests (app/src/test/resources/fixtures), so both clients are
 *  tested against the same server shapes. Re-run after changing the mock:
 *
 *    npx vite-node e2e/fixtures/exportAndroidFixtures.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MockPartyServer } from './mockPartyServer'

const out = join(dirname(fileURLToPath(import.meta.url)), '../../../app/src/test/resources/fixtures')
mkdirSync(out, { recursive: true })

// One representative account: a leader with a follower, an independent
// character, and the configured merchant with bank, stand, market and queue.
const server = new MockPartyServer()
server
  .addCharacter({ name: 'Leada', ctype: 'warrior', level: 70, gold: 12000, map: 'main', x: 10, y: 20, items: [{ name: 'hpot0', q: 200 }, { name: 'bow', level: 7 }, null], slots: { mainhand: { item: { name: 'blade', level: 8 } } }, conditions: [{ id: 'mluck', name: "Merchant's Luck", remainingMs: 60000 }] })
  .addCharacter({ name: 'Folla', ctype: 'priest', level: 68, items: [{ name: 'ringsj', level: 1 }, null] })
  .addCharacter({ name: 'Rangy', ctype: 'ranger', level: 66, items: [null, null] })
  .addCharacter({ name: 'Merchy', ctype: 'merchant', level: 80, items: [{ name: 'wcoat', level: 0 }, { name: 'cscroll0', q: 5 }, null], slots: { trade1: { item: { name: 'bow', level: 3 }, price: 50000 } } })
server.addCatalogEntry({ id: 'bow', name: 'Bow', upgradeable: true, value: 600 })
server.addCatalogEntry({ id: 'ringsj', name: 'Ring of Strength', compoundable: true, value: 1000 })
server.addCatalogEntry({ id: 'hpot0', name: 'Health Potion', value: 20 })
server.leader = 'Leada'
server.followers = { Folla: true }
server.farmingProfiles = { Rangy: { farmingPolicy: 'scatter', huntSettings: { relocateIfCompeting: false, blacklistDeaths: true, deathThreshold: 2, blacklistExpirations: true, expirationThreshold: 1 }, huntBlacklist: {}, monsterFocus: ['bat'] } }
server.monsterFocus = ['goo']
server.monsterFocusByCharacter = { Rangy: ['bat'] }
server.monsterSearchRadiusByCharacter = { Leada: 400, Rangy: 600 }
server.monsterChoices = [{ id: 'goo', locations: [{ map: 'main', x: 0, y: 700 }] }, { id: 'bat', locations: [{ map: 'cave', x: 300, y: -1000 }] }, { id: 'tinyp', locations: [] }]
server.huntSettings = { relocateIfCompeting: true, blacklistDeaths: true, deathThreshold: 3, blacklistExpirations: false, expirationThreshold: 1 }
server.huntBlacklist = { crab: { monsterId: 'crab', at: 1_700_000_000_000, deaths: 3, reason: 'deaths' } }
server.bankGold = 5_000_000
server.bankPacks = { items0: [{ slot: 0, item: { name: 'bow', level: 5 } }, null, { slot: 2, item: { name: 'hpot0', q: 9999 } }], items1: [null, null] }
server.standListings = [{ id: 'l1', slot: 0, item: { name: 'wcoat', level: 0 }, price: 9000, quantity: 1 }, { id: 'l2', bankPack: 'items0', bankSlot: 0, slot: 0, item: { name: 'bow', level: 5 }, price: 80000, quantity: 1 }]
server.standBids = { ringsj: { price: 20000, quantity: 2, minimumQuality: 1, priorityOverride: 80 } }
server.aldataListings = [{ key: 'a1', seller: 'Someone', item: { name: 'bow', level: 6 }, price: 120000, quantity: 1 }]
server.pontyListings = [{ key: 'p1', item: { name: 'ringsj', level: 0 }, price: 30000, unitPrice: 15000, quantity: 2 }]
server.merchantCurrent = { id: 'j0', target: 'Leada', reason: 'restock', routine: 'restock', priority: 90 }
server.merchantQueue = [
  { id: 'j1', target: 'bank', reason: 'exchange', autoExchangeKeys: ['box@0'] },
  { id: 'j2', target: 'Ponty', reason: 'Ponty purchases', manual: true },
  { id: 'j3', target: 'sea', reason: 'fishing', routine: 'fishing' },
]
server.merchantRoutinePriorities = { 'merchant luck': 100, restock: 90, 'stand maintenance': 40 }
server.merchantAutomations = { 'auto upgrade': false, restock: true, deliveries: true, withdrawals: false }
server.gatheringModes = ['mining']
server.withdrawals = { Merchy: [{ pack: 'items0', slot: 2, item: { name: 'hpot0', q: 9999 } }] }
server.autoNpcSales = { hpot0: { item: { name: 'hpot0' } }, [JSON.stringify(['Leada', 'bow@+0'])]: { item: { name: 'bow' }, character: 'Leada' } }
server.realmControl = { activeRealm: 'USI', currentRealm: 'USI', homeRealm: 'USI', split: false, characters: [{ name: 'Leada', ctype: 'warrior', realm: 'USI', online: true }], realms: [{ key: 'USI', label: 'US I', players: 120, pvp: false }, { key: 'USPVP', label: 'US PVP', players: 4, pvp: true }], operation: null }
server.combatLogs = { Leada: [{ at: 1_700_000_000_000, type: 'loot', message: 'Looted 1 × bow', details: { item: 'bow', quantity: 1 } }] }
server.merchantActivity = [{ at: 1_700_000_000_000, message: 'Sold 2 × hpot0 at stand (+40 gold)', level: 'success' }]
server.gameLogs = { Leada: [{ session: 's', seq: 1, at: 1_700_000_000_000, message: 'Route rejected', color: 'red' }] }
server.extraState = {
  merchantForceStand: false,
  threshold: 250000,
  itemCollectionThreshold: 12,
  goldTargets: { Merchy: 2_000_000 },
  restockPolicies: { Leada: { hp: { min: 100, max: 300, item: 'hpot1' }, mp: { min: 50, max: 200, item: 'mpot1' } } },
  bankboiPrefix: 'MyBank',
  anniversaryAutoChat: true,
  farmingPolicy: 'hunt',
  autoExchanges: { 'box@0': true },
}

const write = (name: string, value: unknown) => writeFileSync(join(out, `${name}.json`), JSON.stringify(value, null, 1) + '\n')
for (const section of ['core', 'config', 'bank', 'market', 'logs', 'catalog', 'fast', 'inventory']) write(`section-${section}`, server.stateSection(section, true))
write('state-full', server.stateSection('', false))
write('stream-snapshot', (server as unknown as { snapshotPayload(sequence: number): unknown }).snapshotPayload(1))
console.log(`wrote fixtures to ${out}`)
