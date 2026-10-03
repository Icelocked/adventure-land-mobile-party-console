import type { Page } from '@playwright/test'
import { createServer, type Server, type ServerResponse } from 'node:http'

/**
 * A stateful in-memory stand-in for party-console's own HTTP surface,
 * installed via Playwright route interception - no live server is ever
 * involved. This keeps e2e tests fast, deterministic, and completely
 * incapable of mutating a real account (there's no way to "accidentally"
 * mark a real character's real items while testing against this).
 *
 * Deliberately loose typing (Record<string, unknown> throughout) - this
 * mirrors the wire shapes in web/src/models exactly enough for the app to
 * render and act on, without importing/duplicating those interfaces here.
 */

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAF0lEQVR42mNk+P+/noEIwDiqkL4KAV+BEjOd0YoAAAAASUVORK5CYII='

export interface MockItem {
  name: string
  level?: number
  q?: number
  stat_type?: string
}

export interface MockCharacter {
  name: string
  ctype: string
  level: number
  hp?: number
  max_hp?: number
  mp?: number
  max_mp?: number
  gold?: number
  map?: string
  x?: number
  y?: number
  items?: (MockItem | null)[]
  // Deliberately string | number, not just string - the real vitals status's
  // own target field is never coerced server-side (characters/shared.js's
  // publishMapFrame), unlike the map-frame's entities[].id (explicitly
  // String()'d) - this models that real, exact asymmetry.
  target?: string | number
  conditions?: { id: string; name: string; remainingMs?: number }[]
  // Equipped slots as the live stream sends them ({slot: {item}}), incl. a merchant's trade1..N.
  slots?: Record<string, { item: MockItem; price?: number } | null>
  // Extra characterDetails fields (the script's stats: str, attack, combatStats, characterDollHtml, ...).
  diagnostics?: Record<string, unknown>
  // This character's own Hunt quest assignment - mirrors state.statuses[name].monsterHunt,
  // exposed via characterDetails in the real state?section=core&dashboard=1 response.
  monsterHunt?: { id: string | null; count: number; remainingMs?: number | null; server?: string | null }
}

export interface MockCatalogEntry {
  id: string
  name: string
  upgradeable?: boolean
  compoundable?: boolean
  // G.items[id].g - the item's base gold value (stand price default, NPC sale value).
  value?: number
  maxLevel?: number
  // Extra G.items fields (e.g. `e` for exchangeable).
  definition?: Record<string, unknown>
}

const testSprite = () => ({ url: '/e2e-sprite.png', tileSize: 8, columns: 1, rows: 1, x: 0, y: 0 })

// Copied VERBATIM from party-console v1.2.0
// runtime/coordinator/telemetry/public-state.ts:65-86 (configFields,
// configExtraKeys). Re-sync on every console release: these decide which
// keys `section=core&dashboard=1` strips and `section=config` serves.
const CONFIG_FIELDS = [
  'characterAppearances', 'merchantRules',
  'bankboiPrefix', 'anniversaryAutoChat', 'farmingProfiles',
  'passiveRareHunts', 'passiveHunting', 'phoenixRouteOrder',
  'threshold', 'itemCollectionThreshold', 'buyUpgradeBatchSize',
  'marked', 'merchantMarked', 'autoItemMarks', 'merchantDeliveries',
  'standListings', 'npcSaleMarks', 'deconstructionMarks', 'autoDeconstruction',
  'deconstructionCatalog', 'autoNpcSales', 'autoStandMarks',
  'merchantRoutinePriorities', 'merchantAutomations', 'merchantBlacklist',
  'standBids', 'autoStandBuys', 'autoBlacklistMerchants', 'standSearch',
  'upgrades', 'statScrolls', 'compounds', 'autoCompounds', 'autoExchanges', 'goldTargets',
  'leader', 'followers', 'eventsByCharacter', 'eventSelectionsByCharacter',
  'monsterFocus', 'monsterFocusByCharacter', 'monsterPrioritiesByCharacter',
  'monsterSearchRadiusByCharacter', 'scatterMonsterTypes',
  'farmingPolicy',
  'huntBlacklist', 'huntSettings',
  'restockPolicies', 'merchantCharacter', 'merchantForceStand', 'merchantStandLocation', 'merchantWeapon',
] as const
const CONFIG_EXTRA_KEYS = ['roster', 'classChoices', 'eventStrategy', 'giveawayRealms', 'autoUpgradeMarks'] as const
// public-state.ts catalogs() - served only by section=catalog (core omits them).
const CATALOG_FIELDS = ['travelPlaces', 'monsterChoices', 'bestiaryCatalog', 'skillCatalog', 'appearanceChoices', 'merchantCatalog', 'bankVaults'] as const
const BANK_FIELDS = ['bank', 'bankVaults', 'bankCurrent', 'bankQueue'] as const
const MARKET_FIELDS = ['aldata', 'ponty', 'standPriceHistory'] as const
const LOGS_FIELDS = ['gameLogs', 'combatLogs', 'merchantActivity'] as const

// merchant/initial-settings.ts defaults (party-console v1.2.0) - the keys
// the server accepts in /merchant/routine-priorities.
const DEFAULT_ROUTINE_PRIORITIES: Record<string, number> = {
  'merchant luck': 100, 'inventory cleanout': 95, 'manual visit': 90, deliveries: 90, withdrawals: 90,
  'ALData authentication': 90, 'party collection': 90, restock: 90, 'gold threshold': 85, 'npc sales': 80,
  'auto npc sales': 80, 'auto npc sale pickup': 80, 'manual marketplace purchases': 76, 'upgrade preview': 70,
  'manual upgrades': 70, 'auto upgrade': 70, 'manual compounds': 70, 'manual buying': 65, 'manual crafting': 65,
  'npc sale pickup': 80, deconstruction: 80, 'deconstruction pickup': 80, 'stand purchases': 75,
  'stand bid purchases': 75, 'ALData marketplace purchases': 76, 'ALData marketplace sales': 76,
  'upgrades and compounds': 70, 'auto compound': 68, 'manual exchange': 67, 'automatic exchange': 67,
  'merchant commerce': 65, 'merchant donation': 60, 'join giveaway': 55, 'stand search': 50,
  'stand maintenance': 40, fishing: 20, mining: 20, 'merchant idle': 0, 'manual bank exchange': 80,
  'bank unlock': 90, 'send mail': 90, 'collect mail': 90,
}
const DEFAULT_MERCHANT_AUTOMATIONS: Record<string, boolean> = {
  deliveries: true, withdrawals: true, 'merchant luck': true, 'party collection': true, 'auto npc sales': true,
  restock: true, 'gold threshold': true, 'inventory cleanout': true, 'auto compound': true, 'auto upgrade': true,
  'automatic exchange': true, 'stand bid purchases': true, 'join giveaway': true,
}

function pick(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]))
}
function omit(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const drop = new Set(keys)
  return Object.fromEntries(Object.entries(source).filter(([key]) => !drop.has(key)))
}

export class MockPartyServer {
  characters: MockCharacter[] = []
  catalogEntries: Record<string, MockCatalogEntry> = {}
  craftable: Record<string, unknown>[] = []
  exchangeable: Record<string, unknown>[] = []
  bankPacks: Record<string, (Record<string, unknown> | null)[]> = {}
  bankGold = 0
  mailMessages: Record<string, unknown>[] = []
  mailPostage: number | null = null
  // inventory-entry.tsx operation, per character then slot (an upgrade/compound in progress).
  inventoryOperations: Record<string, Record<number, Record<string, unknown>>> = {}
  mailActions: { action: string; id?: unknown }[] = []
  standListings: Record<string, unknown>[] = []
  bestiaryCatalog: Record<string, unknown>[] = []
  skillCatalog: Record<string, unknown>[] = []
  combatLogs: Record<string, unknown[]> = {}
  merchantActivity: Record<string, unknown>[] = []
  merchantRoutinePriorities: Record<string, number> = {}
  merchantAutomations: Record<string, boolean> = {}
  gatheringModes: string[] = []
  standBids: Record<string, Record<string, unknown>> = {}
  aldataListings: Record<string, unknown>[] = []
  pontyListings: Record<string, unknown>[] = []
  realmControl: Record<string, unknown> | null = null
  merchantCurrent: Record<string, unknown> | null = null
  merchantQueue: Record<string, unknown>[] = []
  upgradeOfferingRules: Record<string, unknown>[] = []
  huntBlacklist: Record<string, Record<string, unknown>> = {}
  monsterFocusByCharacter: Record<string, string[]> = {}
  monsterSearchRadiusByCharacter: Record<string, number> = {}
  // The leader's own effective focus (party-state.tsx's flat field) -
  // the real server deliberately keeps monsterFocusByCharacter[leader]
  // empty (navigation/focus.ts's characterFocus() deletes it there),
  // so a leader-focus test needs this set directly, not the by-character map.
  monsterFocus: string[] = []
  // farmingAreas.ts's Catalog shape - spawn-area GEOMETRY, a separate
  // catalog from bestiaryCatalog's own simpler spawnRecords.
  monsterChoices: { id: string; locations?: { map: string; x: number; y: number; mapName?: string; boundary?: number[] }[] }[] = []
  phoenixRouteOrder: string[] = []
  huntSettings: Record<string, unknown> | null = null
  monsterHunt: Record<string, unknown> | null = null
  // A real account always has a leader once configured - resolveFarmingContext
  // (models/state.ts) falls back to the plain top-level farmingPolicy/
  // huntBlacklist/monsterHunt fields above ONLY for whichever character IS
  // the leader (or follows nobody and matches `leader`); every other
  // character needs its own farmingProfiles entry or it sees nothing.
  leader: string | null = null
  followers: Record<string, boolean> = {}
  farmingProfiles: Record<string, Record<string, unknown>> = {}
  requirePairing = false
  // Both keyed by character - mirrors state.luckyUpgradeSlots/luckySlotTracking.
  luckyUpgradeSlots: Record<string, number> = {}
  luckySlotTracking: Record<string, Record<string, { version: 1; slots: Record<string, { totalRolls: number; sumRolls: number; rollsAbove96_3: number; perfectRolls: number }> }>> = {}
  // Pending bank withdrawals, keyed by the collecting character (usually
  // the merchant) - mirrors the coordinator's own `state.withdrawals`.
  withdrawals: Record<string, { pack: string; slot: number; item: MockItem }[]> = {}
  // Keyed by item id (matches item.name) - {} means nothing is
  // deconstructible unless a test explicitly opts an item in.
  deconstructionCatalog: Record<string, { compound: boolean; cost?: number; rewards?: unknown[] }> = {}

  // Auto-mark state, mutated by POSTed commands - mirrors PartyStateDynamic's shape.
  autoNpcSales: Record<string, { item: MockItem; character?: string }> = {}
  // Pending one-time inventory marks (not standing rules), keyed by
  // character - mirrors state.upgrades/compounds/statScrolls.
  upgrades: Record<string, { slot?: number | string; item: MockItem; tiers?: number; equipped?: boolean }[]> = {}
  compounds: Record<string, { id: string; name: string; items: { slot?: number | string; item: MockItem }[] }[]> = {}
  statScrolls: Record<string, { slot?: number | string; item: MockItem; statType: string }[]> = {}
  // Flat, account-wide - mirrors state.npcSaleMarks/deconstructionMarks.
  npcSaleMarks: { id: string; source?: string; pack?: string; character?: string; slot: number; item: MockItem; quantity: number }[] = []
  deconstructionMarks: { id: string; owner: string; slot: number; item: MockItem; quantity: number; state: string; storage?: { pack: string; slot: number } }[] = []
  // Keyed by the RECIPIENT's name - mirrors state.merchantDeliveries.
  merchantDeliveries: Record<string, { id: string; slot: number; item: MockItem; equipOnDelivery?: boolean }[]> = {}

  /** One-shot error injection for error-path tests: set
   *  `failOnce['merchant/bid'] = 'Stand is full'` before triggering the
   *  action - the NEXT matching POST fails with that message (via a real
   *  non-2xx CommandResult body, exactly like the coordinator), then
   *  reverts to normal success handling. */
  failOnce: Record<string, string> = {}
  // merchant-bid.ts: entries the stand could bump when a buy order needs a slot.
  standFullOccupants: { id: string; itemId: string; kind: string; price: number; quantity: number }[] = []

  lastOrder: Record<string, unknown> | null = null
  lastRoutineSave: Record<string, unknown> | null = null

  paired = false

  addCharacter(character: MockCharacter): this {
    this.characters.push(character)
    for (const item of character.items ?? []) {
      if (item) this.catalogEntries[item.name] ??= { id: item.name, name: item.name }
    }
    return this
  }

  addCatalogEntry(entry: MockCatalogEntry): this {
    this.catalogEntries[entry.id] = entry
    return this
  }

  /** Roster members that aren't live (offline, not in a slot). */
  offlineRoster: { name: string; ctype: string; level: number; online?: boolean }[] = []

  private roster() {
    return [...this.characters.map((c) => ({ name: c.name, ctype: c.ctype, level: c.level })), ...this.offlineRoster]
  }

  private dynamicState(): Record<string, unknown> {
    return {
      bank: { gold: this.bankGold, packs: this.bankPacks },
      standListings: this.standListings,
      merchantCurrent: this.merchantCurrent,
      merchantQueue: this.merchantQueue,
      merchantCatalog: {
        // `meta.upgradeable`/`meta.compoundable` (read by itemFormulas'
        // itemMaximumLevel) are a separate nested field from the
        // top-level convenience flags WtbScreen/etc. read directly -
        // synthesize both from the one flag addCatalogEntry takes.
        allItems: Object.values(this.catalogEntries).map((entry) => ({
          ...entry,
          sprite: testSprite(),
          meta: { definition: { ...(entry.value ? { g: entry.value } : {}), ...entry.definition }, upgradeable: entry.upgradeable, compoundable: entry.compoundable, maxLevel: entry.maxLevel ?? (entry.upgradeable ? 13 : entry.compoundable ? 7 : 0) },
        })),
        buyable: [],
        craftable: this.craftable,
        exchangeable: this.exchangeable,
      },
      autoNpcSales: this.autoNpcSales,
      upgrades: this.upgrades,
      compounds: this.compounds,
      statScrolls: this.statScrolls,
      npcSaleMarks: this.npcSaleMarks,
      deconstructionMarks: this.deconstructionMarks,
      merchantDeliveries: this.merchantDeliveries,
      withdrawals: this.withdrawals,
      deconstructionCatalog: this.deconstructionCatalog,
      bestiaryCatalog: this.bestiaryCatalog,
      skillCatalog: this.skillCatalog,
      combatLogs: this.combatLogs,
      merchantActivity: this.merchantActivity,
      merchantRoutinePriorities: this.merchantRoutinePriorities,
      merchantAutomations: this.merchantAutomations,
      gatheringModes: this.gatheringModes,
      standBids: this.standBids,
      realmControl: this.realmControl,
      upgradeOfferingRules: this.upgradeOfferingRules,
      luckyUpgradeSlots: this.luckyUpgradeSlots,
      luckySlotTracking: this.luckySlotTracking,
      huntBlacklist: this.huntBlacklist,
      monsterFocusByCharacter: this.monsterFocusByCharacter,
      monsterSearchRadiusByCharacter: this.monsterSearchRadiusByCharacter,
      monsterFocus: this.monsterFocus,
      monsterChoices: this.monsterChoices,
      phoenixRouteOrder: this.phoenixRouteOrder,
      huntSettings: this.huntSettings,
      monsterHunt: this.monsterHunt,
      leader: this.leader,
      followers: this.followers,
      farmingProfiles: this.farmingProfiles,
      aldata: { listings: this.aldataListings },
      ponty: { listings: this.pontyListings },
      // A configured account always has a merchant (config section);
      // default to the first merchant-class character unless overridden.
      // Core's activeSlots: one loaded slot per mock character.
      activeSlots: this.characters.map((c, index) => ({ index, kind: 'headless', character: c.name, state: 'online' })),
      gameVersion: 830,
      merchantCharacter: this.merchantCharacter !== undefined ? this.merchantCharacter : (this.characters.find((c) => c.ctype === 'merchant')?.name ?? null),
      ...this.extraState,
    }
  }

  /** Any other state field a test needs (merchantForceStand, threshold,
   *  goldTargets, merchantCharacter, ...). Routed to its section exactly
   *  like a built-in field. */
  extraState: Record<string, unknown> = {}

  /** GET /console-update (tools/update): null = service unavailable. */
  consoleUpdate: Record<string, unknown> | null = { current: '1.2.0', displayVersion: '1.2.0', available: false, phase: 'idle' }

  /** undefined = the first merchant-class character (see dynamicState). */
  merchantCharacter: string | null | undefined = undefined

  /** Redirect every party-api GET to /setup once, like the hosting
   *  gateway does for a browser whose pairing lapsed (authorize.ts). */
  redirectNextStateGet = false

  /** Delay (ms) before answering section=config - for proving a slow
   *  config response never holds up core. */
  configDelayMs = 0

  /** Every state GET's `section` (or '' for none), in request order. */
  stateRequests: { section: string; dashboard: boolean }[] = []

  /** GET /party-api/state, split by `section` the way the real
   *  coordinator does (public-state.ts:236-277). */
  stateSection(section: string, dashboard: boolean): Record<string, unknown> {
    const full: Record<string, unknown> = { roster: this.roster(), ...this.dynamicState() }
    if (section === 'config') return pick(full, [...CONFIG_FIELDS, ...CONFIG_EXTRA_KEYS])
    if (section === 'catalog') return { ...pick(full, CATALOG_FIELDS), referenceRevision: 'mock' }
    // public-state.ts fastPayload / inventoryCharacters - the live-stream fallback.
    if (section === 'fast')
      return {
        characters: Object.fromEntries(
          // fastCharacters: the whole status minus items/slots and other omitted fields.
          this.characters.map((c) => [c.name, { hp: c.hp ?? 100, max_hp: c.max_hp ?? 100, mp: c.mp ?? 100, max_mp: c.max_mp ?? 100, gold: c.gold ?? 0, map: c.map ?? 'main', x: c.x ?? 0, y: c.y ?? 0, rip: false, ...(c.target ? { target: c.target } : {}), ...(c.conditions ? { conditions: c.conditions } : {}) }]),
        ),
      }
    if (section === 'inventory')
      return { characters: Object.fromEntries(this.characters.map((c) => [c.name, { items: (c.items ?? []).map((item, slot) => (item ? { slot, item } : null)), slots: c.slots ?? {} }])) }
    if (section === 'bank') return { ...pick(full, BANK_FIELDS), ...(dashboard ? { bankbois: full.bankbois ?? [] } : {}) }
    if (section === 'market') return pick(full, MARKET_FIELDS)
    if (section === 'logs') return { gameLogs: {}, combatLogs: this.combatLogs, merchantActivity: this.merchantActivity }
    if (section === 'core') {
      if (!dashboard) return omit(full, [...CATALOG_FIELDS])
      const core = omit(full, [...CONFIG_FIELDS, ...CONFIG_EXTRA_KEYS, ...CATALOG_FIELDS, 'bank', 'ponty', 'combatLogs', 'merchantActivity', 'standPriceHistory'])
      // fullPayload(omitCatalog) drops aldata's listings/trades/buyOrders.
      const aldata = { ...((full.aldata as Record<string, unknown>) ?? {}) }
      delete aldata.listings
      delete aldata.trades
      delete aldata.buyOrders
      return {
        ...core,
        aldata,
        // public-state.ts bankboiSummaries: no items/slots on core.
        bankbois: ((full.bankbois as Record<string, unknown>[]) ?? []).map((entry) => omit(entry, ['items', 'slots'])),
        // diagnosticCharacters() allowlists monsterHunt (among others).
        characterDetails: Object.fromEntries(this.characters.map((c) => [c.name, { name: c.name, ctype: c.ctype, level: c.level, seenAt: Date.now(), monsterHunt: c.monsterHunt ?? null, ...c.diagnostics }])),
        characters: Object.fromEntries(this.characters.map((c) => [c.name, { name: c.name, ctype: c.ctype, level: c.level }])),
        serverNow: Date.now(),
        bankGold: this.bankGold,
        // public-state.ts core: the catalog's reference revision.
        referenceRevision: 'mock',
      }
    }
    return full
  }

  private snapshotPayload(sequence: number): Record<string, unknown> {
    const characters: Record<string, unknown> = {}
    for (const c of this.characters) {
      const items: Record<string, unknown> = {}
      ;(c.items ?? []).forEach((item, index) => {
        // The wire shape is InventoryEntry ({slot, item}), not the bare
        // item - recordToState() in the app casts this straight through.
        const operation = this.inventoryOperations[c.name]?.[index]
        if (item) items[String(index)] = { slot: index, item, ...(operation ? { operation } : {}) }
      })
      characters[c.name] = {
        generation: 'g1',
        sample: 1,
        sampledAt: Date.now(),
        vitals: {
          hp: c.hp ?? 100,
          max_hp: c.max_hp ?? 100,
          mp: c.mp ?? 100,
          max_mp: c.max_mp ?? 100,
          gold: c.gold ?? 0,
          map: c.map ?? 'main',
          x: c.x ?? 0,
          y: c.y ?? 0,
          rip: false,
          inventorySize: (c.items ?? []).length,
          ...(c.target ? { target: c.target } : {}),
          ...(c.conditions ? { conditions: c.conditions } : {}),
        },
        items,
        slots: c.slots ?? {},
      }
    }
    return { type: 'snapshot', epoch: 'e1', sequence, characters }
  }

  private sseServer: Server | null = null
  private sseClients = new Set<ServerResponse>()
  private sseSequence = 1
  // Per-character map/entities frames (telemetry/map-stream.ts) - keyed by
  // character name. Each entity's `id` is deliberately left as whatever
  // type the test sets (string OR number) rather than always coercing to
  // string, since the real bug this exists to catch (useTargetMonsterType.ts)
  // is an asymmetric id type between the vitals status's own `target` field
  // (never coerced server-side, characters/shared.js's publishMapFrame) and
  // mapEntity()'s explicit `String(entity.id)` cast for THIS feed - a mock
  // that always stringified both sides could never reproduce it.
  private mapFrameEntities = new Map<string, { id: string | number; mtype?: string }[]>()
  private mapStreamClients = new Map<string, Set<ServerResponse>>()

  setMapFrameEntities(character: string, entities: { id: string | number; mtype?: string }[]): void {
    this.mapFrameEntities.set(character, entities)
    const frame = `data: ${JSON.stringify({ entities })}\n\n`
    for (const client of this.mapStreamClients.get(character) ?? []) client.write(frame)
  }

  /** A REAL persistent text/event-stream server - not a Playwright
   *  `route.fulfill()`, which sends one complete response and closes the
   *  connection. That one-shot close is exactly the failure mode
   *  liveConnection.ts's reconnect logic exists to recover from: the app
   *  would genuinely see a disconnect/reconnect cycle every ~1s, cycling
   *  the "connected" indicator, instead of the stable always-open
   *  connection a real server holds open. Started lazily; the app's
   *  EventSource is redirected here via `route.continue({url})` in
   *  install(), which lets the browser's own networking connect to it
   *  directly (Playwright's fulfill API has no incremental-write mode).
   *  Also serves /map-stream/:character the same way, on the same server. */
  private startSseServer(): Promise<string> {
    if (this.sseServer) {
      const address = this.sseServer.address()
      return Promise.resolve(`http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`)
    }
    return new Promise((resolve) => {
      const server = createServer((req, res) => {
        const path = (req.url ?? '').split('?')[0]
        const mapStreamMatch = path.match(/\/map-stream\/([^/]+)/)
        if (mapStreamMatch) {
          const character = decodeURIComponent(mapStreamMatch[1])
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          })
          const existing = this.mapFrameEntities.get(character)
          if (existing) res.write(`data: ${JSON.stringify({ entities: existing })}\n\n`)
          const clients = this.mapStreamClients.get(character) ?? new Set()
          this.mapStreamClients.set(character, clients)
          clients.add(res)
          req.on('close', () => clients.delete(res))
          return
        }
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        })
        res.write(`data: ${JSON.stringify(this.snapshotPayload(this.sseSequence++))}\n\n`)
        this.sseClients.add(res)
        req.on('close', () => this.sseClients.delete(res))
      })
      this.sseServer = server
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        const port = typeof address === 'object' && address ? address.port : 0
        // A heartbeat keeps every open connection well within
        // liveConnection.ts's 15s watchdog timeout indefinitely, matching
        // the real coordinator's own heartbeat cadence.
        setInterval(() => this.broadcastHeartbeat(), 2000).unref()
        resolve(`http://127.0.0.1:${port}`)
      })
    })
  }

  private broadcastHeartbeat() {
    const frame = `data: ${JSON.stringify({ type: 'heartbeat', epoch: 'e1', sequence: this.sseSequence++ })}\n\n`
    for (const client of this.sseClients) client.write(frame)
  }

  private stopSseServer() {
    for (const client of this.sseClients) client.end()
    this.sseClients.clear()
    for (const clients of this.mapStreamClients.values()) for (const client of clients) client.end()
    this.mapStreamClients.clear()
    this.sseServer?.close()
    this.sseServer = null
  }

  private huntScope(character: unknown): { profile: string | null } | { status: number; error: string } {
    if (character === undefined) return { profile: null }
    const name = String(character)
    const member = this.characters.find((c) => c.name === name)
    if (!member) return { status: 400, error: 'unknown character' }
    if (member.ctype === 'merchant') return { status: 409, error: 'Merchants do not run Monster Hunts' }
    if (this.leader && this.leader !== name && this.followers[name]) return { status: 409, error: 'following leader settings' }
    return { profile: name === this.leader ? null : name }
  }

  private updateProfile(name: string, patch: Record<string, unknown>) {
    this.farmingProfiles = { ...this.farmingProfiles, [name]: { ...(this.farmingProfiles[name] ?? {}), ...patch } }
  }

  /** Applies one POST body against the given logical /party-api/<path>,
   *  mutating this mock's state where the real coordinator would. Only
   *  the command types these tests actually exercise are handled -
   *  anything else is accepted as a no-op success, matching how a real
   *  POST /party-api/command with an unhandled `type` still returns
   *  `{ok:true}` for fields the server simply ignores. */
  private applyCommand(path: string, body: Record<string, unknown>): { status: number; json: Record<string, unknown> } {
    if (this.failOnce[path] !== undefined) {
      const error = this.failOnce[path]
      delete this.failOnce[path]
      return { status: 409, json: { ok: false, error } }
    }
    if (path === 'formation') {
      // Mirrors http/formation.ts: `leader` is only touched when the key is
      // present (null clears it), `follow` only when `character` is sent.
      if (body.leader !== undefined) this.leader = body.leader === null ? null : String(body.leader)
      if (body.character !== undefined && body.follow !== undefined) {
        if (typeof body.follow !== 'boolean') return { status: 400, json: { error: 'invalid follower' } }
        this.followers = { ...this.followers, [String(body.character)]: body.follow }
      }
      return { status: 200, json: { ok: true, leader: this.leader, followers: this.followers } }
    }
    if (path === 'merchant/auto-npc-sale') {
      // Mirrors http/automatic-sales.ts npc(): `character` is kept exactly
      // as sent (a per-player rule keyed [character, ruleKey] - even for the
      // merchant, where such a rule never fires); omitted, it's the
      // account-wide merchant rule.
      const character = typeof body.character === 'string' ? body.character : undefined
      if (character && !this.characters.some((c) => c.name === character)) return { status: 400, json: { error: 'Unknown character' } }
      if (body.action === 'clear-all') {
        for (const k of Object.keys(this.autoNpcSales)) if (this.autoNpcSales[k].character === character) delete this.autoNpcSales[k]
        return { status: 200, json: { ok: true } }
      }
      const item = body.item as MockItem
      if (typeof item?.name !== 'string') return { status: 400, json: { error: 'invalid automatic NPC sale item' } }
      const ruleKey = JSON.stringify({ name: item.name, level: Math.max(0, Number(item.level) || 0), p: (item as { p?: string }).p || null, stat_type: item.stat_type || null })
      const key = character ? JSON.stringify([character, ruleKey]) : ruleKey
      if (body.action === 'remove') delete this.autoNpcSales[key]
      else this.autoNpcSales[key] = { item, ...(character ? { character } : {}) }
      return { status: 200, json: { ok: true } }
    }
    if (path === 'merchant/npc-sale' && body.remove && body.id) {
      // npc-sale.ts: a manual mark removed by id.
      this.npcSaleMarks = this.npcSaleMarks.filter((mark) => mark.id !== body.id)
      return { status: 200, json: { ok: true } }
    }
    if (path === 'merchant/npc-sale' && !body.remove) {
      // Mirrors npc-sale.ts's validate(): the merchant's own items can
      // never use source "character" (that's rejected server-side with
      // this exact error), and any modified item (level>0/stat_type/p)
      // needs an explicit acknowledgement or the sale is refused outright.
      const merchantName = this.characters.find((c) => c.ctype === 'merchant')?.name
      if (body.source === 'character' && body.character === merchantName) {
        return { status: 400, json: { ok: false, error: 'Unknown player character' } }
      }
      const item = body.item as MockItem
      const modified = Number(item.level) > 0 || !!item.stat_type || !!item.p
      if (modified && body.acknowledged !== true) {
        return { status: 400, json: { ok: false, error: 'confirm the modified-item warning before selling' } }
      }
    }
    if (path === 'merchant/npc-sale' && body.source === 'merchant') {
      const slot = Number(body.slot)
      if (body.remove) {
        this.npcSaleMarks = this.npcSaleMarks.filter((mark) => !(mark.source === 'merchant' && mark.slot === slot))
      } else {
        this.npcSaleMarks.push({
          id: `npc-sale-${this.npcSaleMarks.length + 1}`,
          source: 'merchant',
          slot,
          item: body.item as MockItem,
          quantity: Number(body.quantity) || 1,
        })
      }
      return { status: 200, json: { ok: true } }
    }
    if (path === 'merchant/npc-sale' && body.source === 'bank') {
      // Bank-sourced NPC sales queue for the merchant to actually collect
      // and sell, same as the real server (npc-sale.ts sets state:
      // "queued", not an instant removal) - the item stays put until then.
      const pack = String(body.pack)
      const slot = Number(body.slot)
      if (body.remove) {
        this.npcSaleMarks = this.npcSaleMarks.filter((mark) => !(mark.source === 'bank' && mark.pack === pack && mark.slot === slot))
      } else {
        this.npcSaleMarks.push({
          id: `npc-sale-${this.npcSaleMarks.length + 1}`,
          source: 'bank',
          pack,
          slot,
          item: body.item as MockItem,
          quantity: Number(body.quantity) || 1,
        })
      }
      return { status: 200, json: { ok: true } }
    }
    if (path === 'merchant/npc-sale' && body.source === 'character') {
      const character = String(body.character)
      if (body.remove) {
        this.npcSaleMarks = this.npcSaleMarks.filter((mark) => !(mark.character === character && mark.slot === Number(body.slot)))
      } else {
        this.npcSaleMarks.push({
          id: `npc-sale-${this.npcSaleMarks.length + 1}`,
          source: 'character',
          character,
          slot: Number(body.slot),
          item: body.item as MockItem,
          quantity: Number(body.quantity) || 1,
        })
      }
      return { status: 200, json: { ok: true } }
    }
    if (path === 'deconstruction/mark' && body.id) {
      // deconstruction-commands: retry or remove a pending mark by id.
      if (body.remove) this.deconstructionMarks = this.deconstructionMarks.filter((mark) => mark.id !== body.id)
      else if (body.retry) this.deconstructionMarks = this.deconstructionMarks.map((mark) => (mark.id === body.id ? { ...mark, state: 'collecting' } : mark))
      return { status: 200, json: { ok: true } }
    }
    if (path === 'deconstruction/mark' && body.pack) {
      // Bank-sourced deconstruction also queues (bank-deconstruction.ts
      // pushes a mark with `storage:{pack,slot}` and a real `slot` of -1,
      // matching the real server) - the item stays in the pack until the
      // merchant actually collects and deconstructs it.
      const push = (pack: string, slot: number, item: MockItem) =>
        this.deconstructionMarks.push({
          id: `deconstruction-${this.deconstructionMarks.length + 1}`,
          owner: String(this.characters.find((c) => c.ctype === 'merchant')?.name ?? ''),
          slot: -1,
          item,
          quantity: Number(item.q) || 1,
          state: 'collecting',
          storage: { pack, slot },
        })
      if (body.all) this.forEachMatchingBankItem((body.item as MockItem).name, (pack, slot, item) => push(pack, slot, item))
      else push(String(body.pack), Number(body.slot), body.item as MockItem)
      return { status: 200, json: { ok: true } }
    }
    if (path === 'deconstruction/mark' && body.character) {
      const owner = String(body.character)
      if (body.remove) {
        this.deconstructionMarks = this.deconstructionMarks.filter((mark) => !(mark.owner === owner && mark.slot === Number(body.slot)))
      } else {
        this.deconstructionMarks.push({
          id: `deconstruction-${this.deconstructionMarks.length + 1}`,
          owner,
          slot: Number(body.slot),
          item: body.item as MockItem,
          quantity: Number((body.item as MockItem).q) || 1,
          state: 'collecting',
        })
      }
      return { status: 200, json: { ok: true } }
    }
    if (path === 'command' && body.type === 'withdraw') {
      const character = String(body.character)
      const item = body.item as MockItem
      // transfer-commands.ts: an automatically bank-marked item needs consent.
      const autoMarks = (this.extraState.autoItemMarks as Record<string, Record<string, string>> | undefined)?.[character]
      if (autoMarks?.[`${item.name}@+${item.level ?? 0}`] === 'bank' && body.removeAutoBankMark !== true)
        return { status: 409, json: { ok: false, error: 'Item is automatically marked for bank', code: 'auto_bank_confirmation_required' } }
      const pending = (this.withdrawals[character] ??= [])
      if (body.markAll === true) {
        this.forEachMatchingBankItem(item.name, (pack, slot, matchedItem) => {
          if (!pending.some((w) => w.pack === pack && w.slot === slot)) pending.push({ pack, slot, item: matchedItem })
        })
      } else {
        const index = pending.findIndex((w) => w.pack === body.pack && w.slot === Number(body.slot))
        if (index >= 0) pending.splice(index, 1)
        else pending.push({ pack: String(body.pack), slot: Number(body.slot), item })
      }
      return { status: 200, json: { ok: true } }
    }
    if (path === 'merchant/stand') {
      // Mirrors http/stand-marks.ts + merchant/stand-marks.ts.
      const slot = Number(body.slot)
      const item = (body.item ?? {}) as MockItem
      if (typeof item.name !== 'string' || !Number.isSafeInteger(slot) || slot < 0) return { status: 400, json: { error: 'invalid stand item' } }
      const pack = typeof body.bankPack === 'string' && body.bankPack ? body.bankPack : null
      const id = typeof body.id === 'string' ? body.id : null
      type Listing = { id: string; slot: number; item: MockItem; price: number; quantity: number; state?: string; tradeSlot?: string; bankPack?: string; bankSlot?: number }
      const listings = this.standListings as Listing[]
      const index = id
        ? listings.findIndex((entry) => entry.id === id)
        : listings.findIndex(
            (entry) =>
              (pack ? entry.bankPack === pack && entry.bankSlot === slot : entry.state !== 'live' && !entry.tradeSlot && entry.slot === slot && !entry.bankPack) &&
              JSON.stringify(entry.item) === JSON.stringify(item),
          )
      if (body.remove === true) {
        if (index >= 0) listings.splice(index, 1)
        return { status: 200, json: { ok: true } }
      }
      const price = Number(body.price)
      const quantity = Number(body.quantity || 1)
      if (!Number.isSafeInteger(price) || price < 1 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 9999)
        return { status: 400, json: { error: 'invalid stand price or quantity' } }
      const make = (source: { slot: number; item: MockItem; bankPack?: string }, existingId?: string): Listing => ({
        id: existingId || `stand-${Date.now()}-${listings.length}`,
        slot: source.slot,
        item: source.item,
        price,
        quantity: Math.max(1, Math.min(9999, Number(source.item.q) || 1)),
        state: 'configured',
        bankPack: source.bankPack,
        bankSlot: source.bankPack ? source.slot : undefined,
      })
      if (body.markAll === true) {
        const identity = (entry: MockItem) => JSON.stringify({ name: entry.name, level: entry.level ?? 0 })
        const wanted = identity(item)
        const covered = new Set<string>()
        listings.forEach((existing, n) => {
          if (identity(existing.item) !== wanted) return
          listings[n] = make({ slot: existing.bankPack ? existing.bankSlot! : existing.slot, item: existing.item, bankPack: existing.bankPack }, existing.id)
          covered.add(`${existing.bankPack ?? ''}:${existing.bankPack ? existing.bankSlot : existing.slot}`)
        })
        const merchant = this.characters.find((c) => c.ctype === 'merchant')
        const sources: { slot: number; item: MockItem; bankPack?: string }[] = []
        merchant?.items?.forEach((entry, n) => entry && identity(entry) === wanted && sources.push({ slot: n, item: entry }))
        for (const [bankPack, entries] of Object.entries(this.bankPacks))
          entries.forEach((entry, n) => {
            const candidate = entry as { slot?: number; item?: MockItem } | null
            if (candidate?.item && identity(candidate.item) === wanted) sources.push({ slot: candidate.slot ?? n, item: candidate.item, bankPack })
          })
        for (const source of sources) {
          const key = `${source.bankPack ?? ''}:${source.slot}`
          if (listings.length >= 16 || covered.has(key)) continue
          listings.push(make(source))
          covered.add(key)
        }
        return { status: 200, json: { ok: true } }
      }
      if ((index < 0 || listings[index].state === 'paused') && listings.length >= 16) return { status: 409, json: { error: 'merchant stand is full (16/16)' } }
      const listing = { ...make({ slot, item, bankPack: pack ?? undefined }, id ?? undefined), quantity }
      if (index >= 0) listings[index] = listing
      else listings.push(listing)
      return { status: 200, json: { ok: true } }
    }
    if (path === 'mail/collect' || path === 'mail/delete' || path === 'mail/refresh') {
      const action = path.slice('mail/'.length)
      this.mailActions.push({ action, id: body.id })
      const message = this.mailMessages.find((m) => m.id === body.id)
      if (action === 'collect' && message) message.taken = true
      if (action === 'delete') {
        // http mail delete: refuses while an attachment is uncollected.
        if (message?.item && message.taken !== true) return { status: 409, json: { error: 'collect the attachment first' } }
        this.mailMessages = this.mailMessages.filter((m) => m.id !== body.id)
      }
      return { status: 200, json: { ok: true } }
    }
    if (
      path === 'merchant/order' ||
      path === 'merchant/exchange-order' ||
      path === 'merchant/aldata-order' ||
      path === 'merchant/aldata-sale' ||
      path === 'merchant/ponty-order' ||
      path === 'merchant/stand-order' ||
      path === 'merchant/send-mail'
    ) {
      this.lastOrder = { path, ...body }
      return { status: 200, json: { ok: true } }
    }
    if (path === 'bankbois/create') {
      const prefix = String(this.extraState.bankboiPrefix ?? 'Bankboi')
      const existing = (this.extraState.bankbois as { name: string }[] | undefined) ?? []
      const name = `${prefix}${existing.length}`
      this.extraState = { ...this.extraState, bankbois: [...existing, { name, ctype: 'merchant', state: 'provisioning', items: [] }] }
      return { status: 200, json: { ok: true, bankboi: { name } } }
    }
    if (path === 'dashboard-preferences') {
      // Mirrors http/dashboard-import.ts preferences().
      const prefix = body.bankboiPrefix
      if (prefix !== undefined && (typeof prefix !== 'string' || (prefix !== '' && !/^[A-Za-z0-9_]{3,11}$/.test(prefix))))
        return { status: 400, json: { error: 'Use 3–11 letters, numbers, or underscores' } }
      if (body.anniversaryAutoChat !== undefined && typeof body.anniversaryAutoChat !== 'boolean') return { status: 400, json: { error: 'Invalid chat setting' } }
      if (prefix !== undefined) this.extraState = { ...this.extraState, bankboiPrefix: prefix }
      if (body.anniversaryAutoChat !== undefined) this.extraState = { ...this.extraState, anniversaryAutoChat: body.anniversaryAutoChat }
      return { status: 200, json: { ok: true } }
    }
    if (path === 'merchant/force-stand' && typeof body.enabled === 'boolean') {
      this.extraState = { ...this.extraState, merchantForceStand: body.enabled }
      return { status: 200, json: { ok: true } }
    }
    if (path === 'focus') {
      // Mirrors http/focus.ts validation + navigation/focus.ts placement:
      // the leader's focus lives in the flat monsterFocus field.
      const focus = body.monsterFocus
      if (!Array.isArray(focus) || focus.some((entry) => entry === 'tinyp' || typeof entry !== 'string' || !/^[a-z0-9_]+$/i.test(entry)))
        return { status: 400, json: { error: 'invalid monster focus' } }
      const radius = body.monsterSearchRadius
      if (radius !== undefined && !(Number(radius) >= 1 && Number(radius) <= 10000))
        return { status: 400, json: { error: 'monster search radius must be between 1 and 10000' } }
      const normalized = focus.includes('all') ? ['all'] : [...new Set(focus as string[])]
      const name = body.character ? String(body.character) : null
      if (!name || name === this.leader) {
        this.monsterFocus = normalized
        const { [String(this.leader)]: _leader, ...rest } = this.monsterFocusByCharacter
        this.monsterFocusByCharacter = rest
      } else this.monsterFocusByCharacter = { ...this.monsterFocusByCharacter, [name]: normalized }
      if (name && radius !== undefined) this.monsterSearchRadiusByCharacter = { ...this.monsterSearchRadiusByCharacter, [name]: Number(radius) }
      return { status: 200, json: { ok: true, character: name, monsterFocus: normalized } }
    }
    if (path === 'hunt-settings' || path === 'hunt-blacklist') {
      // Mirrors http/farming-scope.ts: no `character` edits the leader's
      // (top-level) settings; a follower or merchant is refused; any other
      // character edits its own farmingProfiles entry.
      const scope = this.huntScope(body.character)
      if ('error' in scope) return { status: scope.status, json: { error: scope.error } }
      const { character: _character, action, monsterId, ...patch } = body
      if (path === 'hunt-settings') {
        if (scope.profile) this.updateProfile(scope.profile, { huntSettings: { ...((this.farmingProfiles[scope.profile]?.huntSettings as object) ?? {}), ...patch } })
        else this.huntSettings = { ...(this.huntSettings ?? {}), ...patch }
        return { status: 200, json: { ok: true } }
      }
      const current = scope.profile ? ((this.farmingProfiles[scope.profile]?.huntBlacklist as Record<string, Record<string, unknown>>) ?? {}) : this.huntBlacklist
      const next = { ...current }
      if (action === 'clear') for (const key of Object.keys(next)) delete next[key]
      else if (action === 'remove') delete next[String(monsterId)]
      else if (action === 'add') next[String(monsterId)] = { monsterId, at: Date.now(), deaths: 0, reason: 'manual' }
      if (scope.profile) this.updateProfile(scope.profile, { huntBlacklist: next })
      else this.huntBlacklist = next
      return { status: 200, json: { ok: true } }
    }
    if (path === 'merchant/routine-priorities') {
      // Mirrors http/routine-priorities.ts + merchant-configuration.ts
      // setGathering: unknown keys are dropped, priorities must be 0-100
      // integers, and fishing/mining in `enabled` toggle gatheringModes.
      this.lastRoutineSave = body
      const priorities = (body.priorities ?? null) as Record<string, unknown> | null
      if (!priorities || typeof priorities !== 'object') return { status: 400, json: { error: 'provide routine priorities' } }
      for (const [reason, raw] of Object.entries(priorities)) {
        if (!(reason in DEFAULT_ROUTINE_PRIORITIES)) continue
        const priority = Number(raw)
        if (!Number.isInteger(priority) || priority < 0 || priority > 100)
          return { status: 400, json: { error: 'priorities must be whole numbers from 0 to 100' } }
        this.merchantRoutinePriorities = { ...this.merchantRoutinePriorities, [reason]: priority }
      }
      const enabled = (body.enabled ?? null) as Record<string, unknown> | null
      if (enabled && typeof enabled === 'object') {
        for (const reason of Object.keys(DEFAULT_MERCHANT_AUTOMATIONS))
          if (typeof enabled[reason] === 'boolean') this.merchantAutomations = { ...this.merchantAutomations, [reason]: enabled[reason] as boolean }
        for (const mode of ['fishing', 'mining']) {
          const on = enabled[mode]
          if (typeof on !== 'boolean' || this.gatheringModes.includes(mode) === on) continue
          this.gatheringModes = on ? [...this.gatheringModes, mode] : this.gatheringModes.filter((entry) => entry !== mode)
        }
      }
      return { status: 200, json: { ok: true, priorities: this.merchantRoutinePriorities, enabled: this.merchantAutomations } }
    }
    if (path === 'merchant/blacklist') {
      // merchant-blacklist.ts createMerchantBlacklistRoute.
      const blacklist = { ...((this.extraState.merchantBlacklist as Record<string, Record<string, unknown>> | undefined) ?? {}) }
      const action = String(body.action || 'add')
      if (action === 'configure') {
        if (typeof body.enabled !== 'boolean') return { status: 400, json: { error: 'invalid blacklist setting' } }
        this.extraState = { ...this.extraState, autoBlacklistMerchants: body.enabled }
        return { status: 200, json: { ok: true } }
      }
      if (action === 'clear') {
        if (typeof body.key === 'string') delete blacklist[body.key]
        else for (const key of Object.keys(blacklist)) delete blacklist[key]
      } else {
        const seller = String(body.seller || '').trim()
        if (!seller) return { status: 400, json: { error: 'enter a merchant name' } }
        const minutes = Number(body.minutes)
        if (!Number.isFinite(minutes) || (minutes !== -1 && minutes < 1)) return { status: 400, json: { error: 'duration must be minutes or -1 for forever' } }
        blacklist[`${seller}||`] = { seller, serverRegion: '', serverIdentifier: '', reason: 'manual', failures: 0, until: minutes === -1 ? -1 : Date.now() + minutes * 60000, updatedAt: Date.now() }
      }
      this.extraState = { ...this.extraState, merchantBlacklist: blacklist }
      return { status: 200, json: { ok: true } }
    }
    if (path === 'merchant/native-stand') {
      if (body.action === 'configure') this.extraState = { ...this.extraState, autoStandBuys: body.enabled === true }
      return { status: 200, json: { ok: true } }
    }
    if (path === 'merchant/bid') {
      const itemId = String(body.itemId)
      const existing = this.standBids[itemId] as Record<string, unknown> | undefined
      // merchant-bid.ts: a single-field edit against an older revision is refused.
      if (body.editField && existing && Number(body.bidRevision) !== Number(existing.revision || 0))
        return { status: 409, json: { ok: false, error: 'WTB order changed; refresh and try again' } }
      // A stand slot is needed but the stand is full: list who could be bumped.
      if (body.useStandSlot && !body.replaceStandEntry && this.standFullOccupants.length)
        return { status: 409, json: { ok: false, error: 'Merchant stand is full', occupants: this.standFullOccupants } }
      if (body.clear) delete this.standBids[itemId]
      else {
        // merchant-bid.ts priority(): absent keeps the previous override,
        // null/'' clears it.
        const { itemId: _itemId, clear: _clear, replaceStandEntry: _replace, priorityOverride, editField: _field, value: _value, bidRevision: _revision, preferencesOnly: _prefs, ...rest } = body
        const previous = existing?.priorityOverride
        const nextPriority = priorityOverride === undefined ? previous : priorityOverride === null || priorityOverride === '' ? undefined : Number(priorityOverride)
        const base = body.preferencesOnly && existing ? { ...existing } : {}
        delete (base as Record<string, unknown>).priorityOverride
        this.standBids[itemId] = { ...base, ...rest, revision: Number(existing?.revision || 0) + 1, ...(nextPriority !== undefined ? { priorityOverride: nextPriority } : {}) }
      }
      return { status: 200, json: { ok: true } }
    }
    if (path === 'realm/switch') {
      // Simplified: the real switch runs as an operation; the mock completes it at once.
      this.realmControl = { ...(this.realmControl ?? {}), activeRealm: body.realm, currentRealm: body.realm, split: false, ...(body.setHome ? { homeRealm: body.realm } : {}) }
      return { status: 200, json: { ok: true } }
    }
    if (path === 'command' && body.type === 'give') {
      const target = String(body.target)
      const slot = Number(body.slot)
      const item = body.item as MockItem
      // Mirrors transfer-commands.ts's delivery(): drop any existing
      // delivery for this exact slot+item from every recipient first, then
      // queue it for the new target - a delivery is never split/duplicated.
      for (const name of Object.keys(this.merchantDeliveries)) {
        this.merchantDeliveries[name] = this.merchantDeliveries[name].filter((mark) => !(mark.slot === slot && mark.item.name === item.name && mark.item.level === item.level))
      }
      ;(this.merchantDeliveries[target] ??= []).push({
        id: `delivery-${target}-${slot}`,
        slot,
        item,
        equipOnDelivery: body.equipOnDelivery === true,
      })
      return { status: 200, json: { ok: true } }
    }
    if (path === 'command' && body.type === 'upgrade-mark') {
      const character = String(body.character)
      const pending = (this.upgrades[character] ??= [])
      pending.push({ slot: body.slot as number | string | undefined, item: body.item as MockItem, tiers: Number(body.tiers) || 1, equipped: body.equipped === true })
      return { status: 200, json: { ok: true } }
    }
    if (path === 'command' && body.type === 'compound-mark') {
      const character = String(body.character)
      const group = (this.compounds[character] ??= [])
      group.push({ id: `compound-${group.length + 1}`, name: (body.item as MockItem).name, items: [{ slot: body.slot as number | string | undefined, item: body.item as MockItem }] })
      return { status: 200, json: { ok: true } }
    }
    if (path === 'command' && body.type === 'stat-scroll-mark') {
      const character = String(body.character)
      const pending = (this.statScrolls[character] ??= [])
      pending.push({ slot: body.slot as number | string | undefined, item: body.item as MockItem, statType: String(body.statType) })
      return { status: 200, json: { ok: true } }
    }
    if (path === 'command' && body.type === 'upgrade-offering-rule') {
      const rule = body.rule as Record<string, unknown>
      if (body.remove) {
        this.upgradeOfferingRules = this.upgradeOfferingRules.filter((r) => r.id !== rule.id)
      } else if (rule.id) {
        this.upgradeOfferingRules = this.upgradeOfferingRules.map((r) => (r.id === rule.id ? { ...r, ...rule } : r))
      } else {
        this.upgradeOfferingRules.push({ ...rule, id: `rule-${this.upgradeOfferingRules.length + 1}` })
      }
      return { status: 200, json: { ok: true } }
    }
    return { status: 200, json: { ok: true } }
  }

  private removeBankItem(pack: string, slot: number) {
    const entries = this.bankPacks[pack]
    if (entries) entries[slot] = null
  }

  private forEachMatchingBankItem(itemName: string, fn: (pack: string, slot: number, item: MockItem) => void) {
    for (const [pack, entries] of Object.entries(this.bankPacks)) {
      entries.forEach((entry, index) => {
        const candidate = entry as { slot?: number; item?: MockItem } | null
        if (candidate?.item?.name === itemName) fn(pack, candidate.slot ?? index, candidate.item!)
      })
    }
  }

  /** Installs every route handler on [page]. Call before navigating.
   *  Registration order matters: Playwright checks the MOST recently
   *  registered route first, so the broad party-api fallback is
   *  registered first (lowest priority) and specific handlers after it
   *  (highest priority) - matching how a test's own late `page.route()`
   *  override (e.g. account-screens.spec.ts's Stand removal) still wins
   *  over anything installed here. */
  async install(page: Page): Promise<void> {
    await page.route('**/e2e-sprite.png', (route) =>
      route.fulfill({ contentType: 'image/png', body: Buffer.from(TINY_PNG_BASE64, 'base64') }),
    )

    // Broad fallback for every /party-api/* POST not given a specific
    // handler below (hunt-settings, hunt-blacklist, realm/switch,
    // merchant/bid, merchant/routine-priorities, command, merchant/**,
    // deconstruction/**, mail/**, ...). GETs not otherwise handled get an
    // empty object rather than a 404, since several settings-only reads
    // (ALData's key/auth checks) aren't modeled by this mock.
    await page.route('**/party-api/**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const path = url.pathname.replace(/^.*\/party-api\//, '')
      if (request.method() !== 'POST') return route.fulfill({ json: {} })
      const body = (request.postDataJSON() as Record<string, unknown>) ?? {}
      const result = this.applyCommand(path, body)
      return route.fulfill({ status: result.status, json: result.json })
    })

    await page.route('**/setup/state', (route) => {
      if (this.paired) return route.fulfill({ status: 200, json: { ok: true, requirePairing: this.requirePairing } })
      return route.fulfill({ status: 401, json: { error: 'not paired' } })
    })
    await page.route('**/setup/pair', (route) => {
      this.paired = true
      return route.fulfill({ status: 200, json: { ok: true } })
    })
    await page.route('**/setup/pairing', async (route) => {
      const body = (route.request().postDataJSON() as { requirePairing?: boolean }) ?? {}
      if (typeof body.requirePairing === 'boolean') this.requirePairing = body.requirePairing
      return route.fulfill({ json: { ok: true } })
    })

    await page.route('**/party-api/state**', async (route) => {
      const url = new URL(route.request().url())
      const section = url.searchParams.get('section') ?? ''
      const dashboard = url.searchParams.get('dashboard') === '1'
      this.stateRequests.push({ section, dashboard })
      if (this.redirectNextStateGet) {
        this.redirectNextStateGet = false
        return route.fulfill({ status: 302, headers: { Location: '/setup' } })
      }
      if (section === 'config' && this.configDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.configDelayMs))
      return route.fulfill({ json: this.stateSection(section, dashboard) })
    })
    await page.route('**/party-api/mail**', (route) => {
      // This pattern also matches POST /party-api/mail/collect - defer
      // that to the broad command fallback registered above (lower
      // priority) instead of wrongly answering it with the inbox snapshot.
      if (route.request().method() !== 'GET') return route.fallback()
      if (new URL(route.request().url()).pathname.endsWith('/mail/postage'))
        return this.mailPostage === null ? route.fulfill({ status: 503, json: { error: 'unavailable' } }) : route.fulfill({ json: { gold: this.mailPostage } })
      return route.fulfill({ json: { messages: this.mailMessages, count: this.mailMessages.length, updatedAt: Date.now(), error: null } })
    })
    await page.route('**/console-update', (route) =>
      this.consoleUpdate ? route.fulfill({ json: this.consoleUpdate }) : route.fulfill({ status: 503, json: { error: 'starting' } }),
    )
    await page.route('**/party-api/escape**', (route) => route.fulfill({ json: { escape: null } }))
    // aldata-routes.ts market(): the full ALData market state.
    await page.route('**/party-api/aldata/market', (route) => route.fulfill({ json: (this.stateSection('market', true) as Record<string, unknown>).aldata ?? {} }))
    await page.route('**/party-api/dashboard-stream', async (route) => {
      const base = await this.startSseServer()
      return route.continue({ url: `${base}/dashboard-stream` })
    })
    await page.route('**/party-api/map-stream/**', async (route) => {
      const base = await this.startSseServer()
      const path = new URL(route.request().url()).pathname.replace(/^.*\/map-stream\//, '')
      return route.continue({ url: `${base}/map-stream/${path}` })
    })

    page.once('close', () => this.stopSseServer())
  }
}
