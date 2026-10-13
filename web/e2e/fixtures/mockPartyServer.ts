import type { Page } from '@playwright/test'
import { createServer, type Server, type ServerResponse } from 'node:http'

/**
 * A stateful in-memory stand-in for party-console's HTTP API, installed via
 * Playwright route interception, so e2e tests are deterministic and can't
 * touch a real account.
 *
 * Typing is deliberately loose (Record<string, unknown>): the shapes only
 * need to match web/src/models closely enough for the app to render and act.
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
  // string | number on purpose: the console never coerces the vitals
  // target, while map-frame entity ids are always strings.
  target?: string | number
  conditions?: { id: string; name: string; remainingMs?: number }[]
  // The game realm the character is on (vitals.server).
  server?: string
  // Equipped slots as the live stream sends them ({slot: {item}}), incl. a merchant's trade1..N.
  slots?: Record<string, { item: MockItem; price?: number } | null>
  // Extra characterDetails fields (the script's stats: str, attack, combatStats, characterDollHtml, ...).
  diagnostics?: Record<string, unknown>
  // This character's Hunt quest (state.statuses[name].monsterHunt), served in
  // characterDetails by section=core&dashboard=1.
  monsterHunt?: { id: string | null; count: number; remainingMs?: number | null; server?: string | null }
  // Console 1.4: live vitals.reservedInventory, the bag slots a gear set holds (inventory/swap-reservations.ts).
  reservedInventory?: { slot: number; item: MockItem | null }[]
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
  // meta.world (drop sources, recipes, ...).
  world?: Record<string, unknown>
  // meta.usage (classes that can equip it).
  usage?: { classes: { id: string; name: string }[]; hands?: number[] }
}

const testSprite = () => ({ url: '/e2e-sprite.png', tileSize: 8, columns: 1, rows: 1, x: 0, y: 0 })

// Console: runtime/coordinator/telemetry/public-state.ts (configFields,
// configExtraKeys). Keep in sync with console releases: these decide which
// keys `section=core&dashboard=1` strips and `section=config` serves.
const CONFIG_FIELDS = [
  'characterAppearances', 'merchantRules',
  'bankboiPrefix', 'anniversaryAutoChat', 'farmingProfiles',
  'passiveRareHunts', 'passiveHunting', 'phoenixRouteOrder',
  'threshold', 'itemCollectionThreshold', 'buyUpgradeBatchSize',
  'marked', 'merchantMarked', 'autoItemMarks', 'merchantDeliveries',
  'standListings', 'npcSaleMarks', 'deconstructionMarks', 'autoDeconstruction',
  'deconstructionCatalog', 'autoNpcSales', 'autoStandMarks',
  'merchantRoutinePriorities', 'merchantAutomations', 'merchantBlacklist', 'marketIgnoredItems',
  'standBids', 'autoStandBuys', 'autoBlacklistMerchants', 'standSearch',
  'upgrades', 'statScrolls', 'compounds', 'autoCompounds', 'autoExchanges', 'goldTargets',
  'leader', 'followers', 'eventsByCharacter', 'eventSelectionsByCharacter',
  'monsterFocus', 'monsterFocusByCharacter', 'monsterPrioritiesByCharacter',
  'monsterSearchRadiusByCharacter', 'scatterMonsterTypes',
  'farmingPolicy',
  'huntBlacklist', 'huntSettings',
  'restockPolicies', 'merchantCharacter', 'merchantForceStand', 'merchantStandLocation', 'merchantWeapon',
  // Console 1.4 events and realms.
  'eventPrioritiesByCharacter', 'eventLimitsByCharacter', 'eventAttendance', 'bossChase', 'dailyChase', 'realmHopBlacklist',
  // Console 1.4 combat and party: designated tank and gear sets.
  'designatedTank', 'gearSets',
] as const
// Console 1.4 events and realms: dashboard/lib/event-policy.ts supportedEvents,
// which /formation's eventPriorities must permute and eventLimits must name.
const SUPPORTED_EVENTS = ['anniversary', 'abtesting', 'goobrawl', 'crabxx', 'franky', 'icegolem', 'snowman', 'slenderman', 'mrgreen', 'mrpumpkin']
const validEventLimits = (value: unknown) => {
  const { deathLimit, timeLimitMinutes } = (value ?? {}) as Record<string, unknown>
  return (
    !!value &&
    typeof value === 'object' &&
    (deathLimit === null || (Number.isSafeInteger(deathLimit) && Number(deathLimit) >= 0)) &&
    (timeLimitMinutes === null || (typeof timeLimitMinutes === 'number' && Number.isFinite(timeLimitMinutes) && timeLimitMinutes > 0))
  )
}
const CONFIG_EXTRA_KEYS = ['roster', 'classChoices', 'eventStrategy', 'giveawayRealms', 'autoUpgradeMarks'] as const
// public-state.ts catalogs() - served only by section=catalog (core omits them).
const CATALOG_FIELDS = ['travelPlaces', 'monsterChoices', 'bestiaryCatalog', 'skillCatalog', 'appearanceChoices', 'merchantCatalog', 'bankVaults'] as const
const BANK_FIELDS = ['bank', 'bankVaults', 'bankCurrent', 'bankQueue'] as const
const MARKET_FIELDS = ['aldata', 'ponty', 'standPriceHistory'] as const
const LOGS_FIELDS = ['gameLogs', 'combatLogs', 'merchantActivity'] as const

// merchant/initial-settings.ts defaults: the keys the server accepts in
// /merchant/routine-priorities.
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
  buyable: Record<string, unknown>[] = []
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
  // section=logs gameLogs (game-log-filters.ts GameLog per character); failLogs makes the logs section fail.
  gameLogs: Record<string, Record<string, unknown>[]> = {}
  failLogs = false
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
  upgradePreview: Record<string, unknown> | null = null
  upgradePreviewRequests: Record<string, unknown>[] = []
  huntBlacklist: Record<string, Record<string, unknown>> = {}
  monsterFocusByCharacter: Record<string, string[]> = {}
  monsterSearchRadiusByCharacter: Record<string, number> = {}
  // The leader's focus. The console keeps monsterFocusByCharacter[leader]
  // empty, so leader-focus tests set this flat field instead.
  monsterFocus: string[] = []
  // Spawn-area geometry (farmingAreas.ts Catalog), separate from the
  // bestiaryCatalog's spawnRecords.
  monsterChoices: { id: string; locations?: { map: string; x: number; y: number; mapName?: string; boundary?: number[] }[] }[] = []
  phoenixRouteOrder: string[] = []
  huntSettings: Record<string, unknown> | null = null
  monsterHunt: Record<string, unknown> | null = null
  // resolveFarmingContext (models/state.ts) uses the top-level farmingPolicy/
  // huntBlacklist/monsterHunt only for the leader; every other character
  // needs its own farmingProfiles entry.
  leader: string | null = null
  followers: Record<string, boolean> = {}
  farmingProfiles: Record<string, Record<string, unknown>> = {}
  requirePairing = false
  // Both keyed by character (state.luckyUpgradeSlots/luckySlotTracking).
  luckyUpgradeSlots: Record<string, number> = {}
  luckySlotTracking: Record<string, Record<string, { version: 1; slots: Record<string, { totalRolls: number; sumRolls: number; rollsAbove96_3: number; perfectRolls: number }> }>> = {}
  // Pending bank withdrawals keyed by the collecting character, usually the
  // merchant (state.withdrawals).
  withdrawals: Record<string, { pack: string; slot: number; item: MockItem }[]> = {}
  // Keyed by item id (item.name); empty means nothing is deconstructible.
  deconstructionCatalog: Record<string, { compound: boolean; cost?: number; rewards?: unknown[] }> = {}

  // Auto-mark state, mutated by POSTed commands (PartyStateDynamic shape).
  autoNpcSales: Record<string, { item: MockItem; character?: string }> = {}
  // Pending one-time inventory marks (not standing rules), keyed by
  // character (state.upgrades/compounds/statScrolls).
  upgrades: Record<string, { slot?: number | string; item: MockItem; tiers?: number; equipped?: boolean }[]> = {}
  compounds: Record<string, { id: string; name: string; items: { slot?: number | string; item: MockItem }[] }[]> = {}
  statScrolls: Record<string, { slot?: number | string; item: MockItem; statType: string }[]> = {}
  // Flat, account-wide (state.npcSaleMarks/deconstructionMarks).
  npcSaleMarks: { id: string; source?: string; pack?: string; character?: string; slot: number; item: MockItem; quantity: number }[] = []
  deconstructionMarks: { id: string; owner: string; slot: number; item: MockItem; quantity: number; state: string; storage?: { pack: string; slot: number } }[] = []
  // Keyed by the recipient's name (state.merchantDeliveries).
  merchantDeliveries: Record<string, { id: string; slot: number; item: MockItem; equipOnDelivery?: boolean }[]> = {}

  /** One-shot error injection: after `failOnce['merchant/bid'] = 'Stand is full'`
   *  the next matching POST fails with that message in a non-2xx
   *  CommandResult body, then handling returns to normal. */
  failOnce: Record<string, string> = {}
  // Extra response fields for a failOnce (e.g. a 409's `missing` list).
  failOnceBody: Record<string, Record<string, unknown>> = {}
  // merchant-bid.ts: entries the stand could bump when a buy order needs a slot.
  standFullOccupants: { id: string; itemId: string; kind: string; price: number; quantity: number }[] = []

  lastOrder: Record<string, unknown> | null = null
  consoleActions: { name: string; body: unknown }[] = []
  consoleDebug: Record<string, unknown> | null = { phase: 'idle', message: 'Ready' }
  stateImports: { action: string; body: string; digest: string | null }[] = []
  // GET/POST /daily-dungeons (dungeons/contracts.ts DungeonView). POSTs are
  // recorded; onDungeonAction may change the view before it is returned.
  dailyDungeon: Record<string, unknown> = { state: { phase: 'idle', participants: [], protectFromEvents: true, commands: {} }, members: [] }
  dungeonActions: Record<string, unknown>[] = []
  onDungeonAction: ((body: Record<string, unknown>) => void) | null = null
  lastRoutineSave: Record<string, unknown> | null = null

  paired = false

  // Console 1.4 combat and party: designated tank, gear sets, Franky routine, escape.
  designatedTank: string | null = null
  gearSets: Record<string, Record<string, { slots: Record<string, MockItem & { p?: string }>; savedAt: number }>> = {}
  // Characters whose equipment report is older than gear-sets.ts's 10s freshness window.
  staleEquipment: string[] = []
  // The leader scope's routine; other scopes keep theirs in farmingProfiles (navigation/initial-focus.ts defaults {}).
  encounterRoutines: Record<string, string> = {}
  encounterAutoDeathLimits: Record<string, number> = {}
  encounterAutoDeaths: Record<string, number> = {}
  // GET /party-api/escape's `escape`, and every escape POST path in order.
  escape: { id: string; stage: string; error: string | null; progress: Record<string, unknown> } | null = null
  escapeActions: string[] = []
  // Access-code pairing (tools/hosting/access.ts): the newest code from
  // /setup/invite, its expiry and wrong guesses (the 5th cancels it), plus
  // every /setup/pair body. Set accessCode = null to model another browser
  // pairing with it.
  accessCode: { code: string; expiresAt: number; failures: number } | null = null
  nextAccessCode = 'K7MQ-2PXA'
  accessCodeTtlMs = 10 * 60_000
  pairRequests: Record<string, unknown>[] = []

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
    return [...this.characters.map((c) => ({ name: c.name, ctype: c.ctype, level: c.level, ...(c.server ? { server: c.server } : {}) })), ...this.offlineRoster]
  }

  private dynamicState(): Record<string, unknown> {
    return {
      bank: { gold: this.bankGold, packs: this.bankPacks },
      standListings: this.standListings,
      merchantCurrent: this.merchantCurrent,
      merchantQueue: this.merchantQueue,
      merchantCatalog: {
        // The app reads both meta.upgradeable/compoundable (itemFormulas)
        // and the top-level flags (WtbScreen etc.); fill both from one.
        allItems: Object.values(this.catalogEntries).map((entry) => ({
          ...entry,
          sprite: testSprite(),
          meta: { definition: { name: entry.name, ...(entry.value ? { g: entry.value } : {}), ...entry.definition }, upgradeable: entry.upgradeable, compoundable: entry.compoundable, maxLevel: entry.maxLevel ?? (entry.upgradeable ? 13 : entry.compoundable ? 7 : 0), ...(entry.world ? { world: entry.world } : {}), ...(entry.usage ? { usage: { hands: [], ...entry.usage } } : {}) },
        })),
        buyable: this.buyable,
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
      // Console 1.4 events and realms.
      eventAttendance: this.eventAttendance,
      bossChase: this.bossChase,
      dailyChase: this.dailyChase,
      realmHopBlacklist: this.realmHopBlacklist,
      // Console 1.4 combat and party: designated tank, gear sets, Franky routine.
      designatedTank: this.designatedTank,
      gearSets: this.gearSets,
      encounterRoutines: this.encounterRoutines,
      encounterAutoDeathLimits: this.encounterAutoDeathLimits,
      encounterAutoDeaths: this.encounterAutoDeaths,
      ...this.extraState,
    }
  }

  // Console 1.4 events and realms: initial-core.ts defaults (initialBossChase,
  // initialDailyChase, initialRealmHopBlacklist) until a test or POST changes them.
  eventAttendance: Record<string, Record<string, { ended: boolean; ignored?: string }>> = {}
  bossChase: Record<string, unknown> = { enabled: false, minEtaMinutes: 15, trip: null, returning: null, retryAt: 0, lastError: null, checkedAt: 0, sightings: [], respawns: [] }
  dailyChase: Record<string, unknown> = { enabled: false, leadMinutes: 16, otherRegions: false, observations: {}, gameVersion: 0, trip: null, returning: null, retryAt: 0, lastError: null, upcoming: [] }
  realmHopBlacklist: string[] = []

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

  /** GET /party-api/state, split by `section` the way the
   *  console does (public-state.ts). */
  stateSection(section: string, dashboard: boolean): Record<string, unknown> {
    const full: Record<string, unknown> = { roster: this.roster(), ...this.dynamicState() }
    if (section === 'config') return pick(full, [...CONFIG_FIELDS, ...CONFIG_EXTRA_KEYS])
    if (section === 'catalog') return { ...pick(full, CATALOG_FIELDS), referenceRevision: 'mock' }
    // public-state.ts fastPayload / inventoryCharacters - the live-stream fallback.
    if (section === 'fast')
      return {
        characters: Object.fromEntries(
          // fastCharacters: the whole status minus items/slots and other omitted fields.
          this.characters.map((c) => [c.name, { hp: c.hp ?? 100, max_hp: c.max_hp ?? 100, mp: c.mp ?? 100, max_mp: c.max_mp ?? 100, gold: c.gold ?? 0, map: c.map ?? 'main', x: c.x ?? 0, y: c.y ?? 0, rip: false, ...(c.target ? { target: c.target } : {}), ...(c.conditions ? { conditions: c.conditions } : {}), ...(c.reservedInventory ? { reservedInventory: c.reservedInventory } : {}) }]),
        ),
      }
    if (section === 'inventory')
      return { characters: Object.fromEntries(this.characters.map((c) => [c.name, { items: (c.items ?? []).map((item, slot) => (item ? { slot, item } : null)), slots: c.slots ?? {} }])) }
    if (section === 'bank') return { ...pick(full, BANK_FIELDS), ...(dashboard ? { bankbois: full.bankbois ?? [] } : {}) }
    if (section === 'market') return pick(full, MARKET_FIELDS)
    if (section === 'logs') return { gameLogs: this.gameLogs, combatLogs: this.combatLogs, merchantActivity: this.merchantActivity }
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
        // The wire shape is InventoryEntry ({slot, item}), not the bare item.
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
          ...(c.reservedInventory ? { reservedInventory: c.reservedInventory } : {}),
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
  // Per-character map/entities frames (telemetry/map-stream.ts). Entity ids
  // keep whatever type the test sets so tests can reproduce the string vs
  // number mismatch with the vitals `target` (useTargetMonsterType.ts).
  private mapFrameEntities = new Map<string, { id: string | number; mtype?: string }[]>()
  private mapStreamClients = new Map<string, Set<ServerResponse>>()

  // Whole map frames (telemetry/map-stream.ts) for the live map, sent as-is.
  setMapFrame(character: string, frame: Record<string, unknown>): void {
    this.mapFrames.set(character, frame)
    const data = `data: ${JSON.stringify(frame)}\n\n`
    for (const client of this.mapStreamClients.get(character) ?? []) client.write(data)
  }
  private mapFrames = new Map<string, Record<string, unknown>>()
  // GET /maps/:map definitions (map-definition.ts), and every request's path.
  mapDefinitions: Record<string, Record<string, unknown>> = {}
  mapDefinitionRequests: string[] = []

  setMapFrameEntities(character: string, entities: { id: string | number; mtype?: string }[]): void {
    this.mapFrameEntities.set(character, entities)
    const frame = `data: ${JSON.stringify({ entities })}\n\n`
    for (const client of this.mapStreamClients.get(character) ?? []) client.write(frame)
  }

  /** A real persistent text/event-stream server. `route.fulfill()` sends one
   *  response and closes, which the app would treat as a dropped stream and
   *  reconnect every second. Started lazily; install() redirects the app's
   *  EventSource here with `route.continue({url})`. Also serves
   *  /map-stream/:character. */
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
          const frame = this.mapFrames.get(character)
          if (frame) res.write(`data: ${JSON.stringify(frame)}\n\n`)
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
        // Heartbeat well inside liveConnection.ts's 15s watchdog.
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

  /** Applies one POST body to /party-api/<path>, mutating mock state where
   *  the console would. Commands the tests don't exercise succeed as no-ops. */
  private applyCommand(path: string, body: Record<string, unknown>): { status: number; json: Record<string, unknown> } {
    if (this.failOnce[path] !== undefined) {
      const error = this.failOnce[path]
      delete this.failOnce[path]
      const extra = this.failOnceBody[path] ?? {}
      delete this.failOnceBody[path]
      return { status: 409, json: { ok: false, error, ...extra } }
    }
    // Console 1.4 designated tank: http/formation.ts assigns `tank` after
    // `leader` and before the character fields; null clears it.
    if (path === 'formation' && body.tank !== undefined) {
      if (body.tank !== null && !this.characters.some((c) => c.name === body.tank)) return { status: 400, json: { error: 'unknown tank' } }
      this.designatedTank = body.tank === null ? null : String(body.tank)
    }
    // Console 1.4 gear sets: characters/gear-sets.ts.
    if (path === 'gear-sets') {
      const name = String(body.character ?? '')
      const set = String(body.set ?? '')
      const member = this.characters.find((c) => c.name === name)
      if (!member) return { status: 400, json: { error: 'invalid character' } }
      if (!['luck', 'tank', 'gold'].includes(set)) return { status: 400, json: { error: 'invalid gear set' } }
      const sets = (this.gearSets[name] ||= {})
      if (body.action === 'clear') delete sets[set]
      else if (body.action === 'save') {
        if (!member.slots || this.staleEquipment.includes(name)) return { status: 409, json: { error: 'no fresh equipment report for ' + name } }
        const slots: Record<string, MockItem & { p?: string }> = {}
        for (const slot of ['chest', 'pants', 'helmet', 'gloves', 'shoes', 'cape', 'belt', 'orb', 'amulet', 'ring1', 'ring2', 'earring1', 'earring2']) {
          const item = member.slots[slot]?.item as (MockItem & { p?: string }) | undefined
          if (item?.name)
            slots[slot] = { name: item.name, ...(item.level !== undefined ? { level: item.level } : {}), ...(item.p ? { p: item.p } : {}), ...(item.stat_type ? { stat_type: item.stat_type } : {}) }
        }
        if (!Object.keys(slots).length) return { status: 409, json: { error: 'nothing is equipped in the gear set slots' } }
        sets[set] = { slots, savedAt: Date.now() }
      } else return { status: 400, json: { error: 'invalid gear set action' } }
      return { status: 200, json: { ok: true, gearSets: this.gearSets[name] } }
    }
    // Console 1.4 Franky routine: http/encounter-mode.ts behind the
    // farming-scope.ts wrapper, which refuses followers and merchants.
    if (path === 'encounter-mode') {
      const scope = this.huntScope(body.character)
      if ('error' in scope) return { status: scope.status, json: { error: scope.error } }
      const encounter = String(body.encounter ?? '')
      if (encounter !== 'franky') return { status: 400, json: { error: 'invalid encounter mode' } }
      if (body.mode === undefined && body.deathLimit === undefined) return { status: 400, json: { error: 'no encounter setting provided' } }
      if (body.mode !== undefined && !['auto', 'offtank', 'tank'].includes(String(body.mode))) return { status: 400, json: { error: 'invalid encounter mode' } }
      const deathLimit = Number(body.deathLimit)
      if (body.deathLimit !== undefined && (!Number.isInteger(deathLimit) || deathLimit < 0)) return { status: 400, json: { error: 'invalid death limit' } }
      const profile = scope.profile ? (this.farmingProfiles[scope.profile] ?? {}) : null
      const routines = { ...((profile ? profile.encounterRoutines : this.encounterRoutines) as Record<string, string> | undefined), ...(body.mode !== undefined ? { [encounter]: String(body.mode) } : {}) }
      const limits = { ...((profile ? profile.encounterAutoDeathLimits : this.encounterAutoDeathLimits) as Record<string, number> | undefined), ...(body.deathLimit !== undefined ? { [encounter]: deathLimit } : {}) }
      if (scope.profile) this.updateProfile(scope.profile, { encounterRoutines: routines, encounterAutoDeathLimits: limits })
      else {
        this.encounterRoutines = routines
        this.encounterAutoDeathLimits = limits
      }
      // farming-scope.ts resultResponse adds the scope's owner and policies when `character` was sent.
      const owner = body.character === undefined ? null : String(body.character)
      const policy = (name: string) => (this.farmingProfiles[name]?.farmingPolicy as string | undefined) ?? (name === this.leader ? (this.extraState.farmingPolicy as string | undefined) : undefined)
      return {
        status: 200,
        json: { ok: true, encounter, mode: routines[encounter], deathLimit: limits[encounter], ...(owner ? { farmingOwner: owner, savedFarmingPolicy: policy(owner), effectiveFarmingPolicy: policy(owner) } : {}) },
      }
    }
    if (path === 'formation') {
      // http/formation.ts: `leader` is only touched when the key is
      // present (null clears it), `follow` only when `character` is sent.
      if (body.leader !== undefined) this.leader = body.leader === null ? null : String(body.leader)
      if (body.character !== undefined && body.follow !== undefined) {
        if (typeof body.follow !== 'boolean') return { status: 400, json: { error: 'invalid follower' } }
        this.followers = { ...this.followers, [String(body.character)]: body.follow }
      }
      // Console 1.4 events and realms: http/formation.ts limits() then
      // priorities(), each 400 on a bad value before the follower 409.
      if (body.character !== undefined && (body.eventLimits !== undefined || body.eventPriorities !== undefined)) {
        const name = String(body.character)
        const merchant = this.characters.find((c) => c.ctype === 'merchant')?.name
        const inherited = !!this.leader && name !== this.leader && name !== merchant && this.followers[name] === true
        const state = this.extraState as { eventLimitsByCharacter?: Record<string, Record<string, unknown>>; eventPrioritiesByCharacter?: Record<string, string[]> }
        if (body.eventLimits !== undefined) {
          const patch = (body.eventLimits ?? {}) as { event?: unknown; limits?: { deathLimit: unknown; timeLimitMinutes: unknown } }
          if (!SUPPORTED_EVENTS.includes(String(patch.event)) || !validEventLimits(patch.limits)) return { status: 400, json: { error: 'invalid event limits' } }
          if (inherited) return { status: 409, json: { error: 'using leader events' } }
          const limits = { deathLimit: patch.limits!.deathLimit, timeLimitMinutes: patch.limits!.timeLimitMinutes }
          const saved = { ...state.eventLimitsByCharacter, [name]: { ...state.eventLimitsByCharacter?.[name], [String(patch.event)]: limits } }
          this.extraState = { ...this.extraState, eventLimitsByCharacter: saved }
        }
        if (body.eventPriorities !== undefined) {
          const value = body.eventPriorities
          if (!Array.isArray(value) || value.length !== SUPPORTED_EVENTS.length || new Set(value).size !== value.length || value.some((id) => !SUPPORTED_EVENTS.includes(id)))
            return { status: 400, json: { error: 'invalid event priorities' } }
          if (inherited) return { status: 409, json: { error: 'using leader events' } }
          this.extraState = { ...this.extraState, eventPrioritiesByCharacter: { ...state.eventPrioritiesByCharacter, [name]: [...value] } }
        }
      }
      if (body.character !== undefined && body.eventSelections !== undefined) {
        // http/formation.ts: followers of a leader use the leader's events.
        const name = String(body.character)
        const merchant = this.characters.find((c) => c.ctype === 'merchant')?.name
        if (this.leader && name !== this.leader && name !== merchant && this.followers[name]) return { status: 409, json: { ok: false, error: 'using leader events' } }
        const current = (this.extraState.eventSelectionsByCharacter as Record<string, string[]> | undefined) ?? {}
        this.extraState = { ...this.extraState, eventSelectionsByCharacter: { ...current, [name]: [...new Set(body.eventSelections as string[])] } }
      }
      return { status: 200, json: { ok: true, leader: this.leader, tank: this.designatedTank, followers: this.followers } }
    }
    if (path === 'merchant/auto-npc-sale') {
      // http/automatic-sales.ts npc(): with `character` the rule is per-player
      // (keyed [character, ruleKey], even for the merchant, where it never
      // fires); without it, the account-wide merchant rule.
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
      // npc-sale.ts validate(): the merchant's own items can't use source
      // "character", and a modified item (level>0/stat_type/p) needs an
      // explicit acknowledgement.
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
      // Bank-sourced NPC sales are queued (state "queued") for the merchant
      // to collect; the item stays in the bank until then.
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
      // Bank-sourced deconstruction also queues: the mark has
      // `storage:{pack,slot}` and slot -1, and the item stays in the pack
      // until the merchant collects it.
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
      // http/stand-marks.ts + merchant/stand-marks.ts.
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
    // Console 1.4 merchant and market routes (see applyMerchantMarket14).
    const merchantMarket14 = this.applyMerchantMarket14(path, body)
    if (merchantMarket14) return merchantMarket14
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
    // Console 1.4 http/bankboi-delete.ts: the server, not the dashboard, refuses a BankBoi that still holds anything.
    const bankboiDelete = /^bankbois\/([^/]+)\/delete$/.exec(path)
    if (bankboiDelete) {
      const name = decodeURIComponent(bankboiDelete[1])
      const existing = (this.extraState.bankbois as { name: string; items?: unknown[]; gold?: number; slots?: Record<string, unknown> }[] | undefined) ?? []
      const entry = existing.find((bankboi) => bankboi.name === name)
      if (!entry) return { status: 404, json: { error: 'unknown bankboi' } }
      if ((entry.items ?? []).some(Boolean) || Number(entry.gold) || Object.keys(entry.slots ?? {}).length)
        return { status: 409, json: { error: 'bankboi must have no inventory, equipment, gold, or pending work' } }
      this.extraState = { ...this.extraState, bankbois: existing.filter((bankboi) => bankboi.name !== name) }
      return { status: 200, json: { ok: true } }
    }
    if (path === 'dashboard-preferences') {
      // http/dashboard-import.ts preferences().
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
      // http/focus.ts validation + navigation/focus.ts placement:
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
      // http/farming-scope.ts: no `character` edits the leader's
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
      // http/routine-priorities.ts + merchant-configuration.ts
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
    const combatClear = /^combat-log\/([^/]+)\/clear$/.exec(path)
    if (combatClear) {
      delete this.combatLogs[decodeURIComponent(combatClear[1])]
      return { status: 200, json: { ok: true } }
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
    // Console 1.4 events and realms: events/boss-chase.ts and daily-chase.ts
    // update(), navigation/realm-hop-blacklist.ts.
    if (path === 'realm/boss-chase') {
      const chase = { ...this.bossChase }
      if (body.enabled !== undefined) chase.enabled = body.enabled === true
      if (body.minEtaMinutes !== undefined) {
        const minEta = Number(body.minEtaMinutes)
        if (!Number.isFinite(minEta) || minEta < 0 || minEta > 600) return { status: 400, json: { error: 'minEtaMinutes must be between 0 and 600' } }
        chase.minEtaMinutes = minEta
      }
      if (!chase.enabled) Object.assign(chase, { trip: null, returning: null })
      this.bossChase = chase
      return { status: 200, json: { ok: true, bossChase: chase } }
    }
    if (path === 'realm/daily-chase') {
      const chase = { ...this.dailyChase }
      if (body.enabled !== undefined) chase.enabled = body.enabled === true
      if (body.otherRegions !== undefined) chase.otherRegions = body.otherRegions === true
      if (body.leadMinutes !== undefined) {
        const lead = Number(body.leadMinutes)
        if (!Number.isFinite(lead) || lead < 14 || lead > 120) return { status: 400, json: { error: 'leadMinutes must be between 14 and 120' } }
        chase.leadMinutes = lead
      }
      if (!chase.enabled) Object.assign(chase, { trip: null, returning: null })
      this.dailyChase = chase
      return { status: 200, json: { ok: true, dailyChase: chase } }
    }
    if (path === 'realm/hop-blacklist') {
      const realms = body.realms
      if (!Array.isArray(realms) || !realms.every((realm) => typeof realm === 'string')) return { status: 400, json: { error: 'realms must be a list of realm keys' } }
      if (new Set(realms).size !== realms.length) return { status: 400, json: { error: 'realms must not repeat' } }
      const known = ((this.realmControl?.realms as { key: string }[] | undefined) ?? []).map((realm) => realm.key)
      const unknown = realms.filter((realm) => !known.includes(realm))
      if (unknown.length) return { status: 400, json: { error: 'unknown Adventure Land realm: ' + unknown.join(', ') } }
      this.realmHopBlacklist = realms
      return { status: 200, json: { ok: true, realmHopBlacklist: realms } }
    }
    if (path === 'command' && body.type === 'give') {
      const target = String(body.target)
      const slot = Number(body.slot)
      const item = body.item as MockItem
      // transfer-commands.ts delivery(): drop any existing delivery of this
      // slot+item from every recipient, then queue it for the new target.
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
    // Bank sort mode, layout and one-shot request (merchant/bank-sort.ts configure()).
    if (path === 'merchant/bank-sort') {
      const valid =
        (body.mode === undefined || body.mode === 'automatic' || body.mode === 'request') &&
        (body.enabled === undefined || typeof body.enabled === 'boolean') &&
        (body.layout === undefined || body.layout === 'packed' || body.layout === 'gapped')
      if (!valid) return { status: 400, json: { error: 'invalid bank sort setting' } }
      const next = { ...this.extraState }
      if (body.mode === 'request' || body.mode === 'automatic') next.bankSortMode = body.mode
      if (body.layout === 'packed' || body.layout === 'gapped') next.bankSortLayout = body.layout
      if (next.bankSortMode !== 'request' || body.enabled === false) next.bankSortRequest = null
      else if (body.enabled === true && !next.bankSortRequest) next.bankSortRequest = { id: 'sort-1', requestedAt: Date.now(), status: 'queued' }
      this.extraState = next
      return { status: 200, json: { ok: true } }
    }
    // Cosmetics (characters/cosmetic-commands.ts): each command is checked
    // against the character's latest cosmetics report, then queued.
    if (path === 'command' && typeof body.type === 'string' && body.type.startsWith('cx-')) {
      const report = this.characters.find((c) => c.name === body.character)?.diagnostics?.cosmetics as
        | { jars: { inventorySlot: number; data: string | null; usable: boolean }[]; owned: { name: string; kind: string; slot: string | null }[]; worn: Record<string, string> }
        | undefined
      if (!report) return { status: 409, json: { error: 'No cosmetics report from this character yet' } }
      const owned = report.owned.find((entry) => entry.name === body.name)
      if (body.type === 'cx-open-jar') {
        const jar = report.jars.find((entry) => entry.inventorySlot === body.inventorySlot)
        if (!jar?.usable || !jar.data) return { status: 400, json: { error: 'That inventory slot has no usable CX jar' } }
      } else if (body.type === 'cx-wear') {
        if (!owned || owned.kind !== 'appearance' || !owned.slot || owned.slot !== body.slot)
          return { status: 400, json: { error: 'Only an owned appearance cosmetic can be worn, in its own slot' } }
      } else if (body.type === 'cx-emote') {
        if (!owned || owned.kind !== 'emote') return { status: 400, json: { error: 'Only an owned emote can be used' } }
        const target = body.target === undefined || body.target === null ? null : String(body.target)
        if (target !== null && (!target || target.length > 40)) return { status: 400, json: { error: 'Invalid emote target' } }
      } else if (body.type === 'cx-remove') {
        if (body.slot === 'skin' || !report.worn[String(body.slot)]) return { status: 400, json: { error: 'Nothing removable is worn in that slot' } }
      } else return { status: 400, json: { error: 'invalid command' } }
      return { status: 200, json: { ok: true } }
    }
    return { status: 200, json: { ok: true } }
  }

  private activeAccessCode() {
    if (this.accessCode && Date.now() >= this.accessCode.expiresAt) this.accessCode = null
    return this.accessCode
  }

  // Console 1.4 merchant and market. Returns null for anything it doesn't
  // answer, so applyCommand carries on (aldata orders that pass the
  // staleness check are still recorded in lastOrder there).
  private applyMerchantMarket14(path: string, body: Record<string, unknown>): { status: number; json: Record<string, unknown> } | null {
    const merchant = this.merchantCharacter !== undefined ? this.merchantCharacter : (this.characters.find((c) => c.ctype === 'merchant')?.name ?? null)
    if (path === 'market/ignored-items') {
      // http/market-ignored-items.ts + runtime/market-preferences.ts.
      let items = (this.extraState.marketIgnoredItems as { name: string; level: number }[] | undefined) ?? []
      if (body.action === 'clear') items = []
      else if (body.action === 'add' || body.action === 'remove') {
        const item = { name: body.name, level: body.level ?? 0 }
        const valid = typeof item.name === 'string' && /^[a-z0-9_]{1,80}$/i.test(item.name) && typeof item.level === 'number' && Number.isSafeInteger(item.level) && item.level >= 0 && item.level <= 100
        if (!valid) return { status: 400, json: { error: 'Provide an item name and nonnegative whole item level' } }
        const key = `${item.name}|${item.level}`
        items = items.filter((entry) => `${entry.name}|${entry.level ?? 0}` !== key)
        if (body.action === 'add') {
          if (items.length >= 2048) return { status: 400, json: { error: 'The ignored-item list is full; remove an entry first' } }
          items.push(item as { name: string; level: number })
        }
      } else return { status: 400, json: { error: 'Choose add, remove, or clear' } }
      this.extraState = { ...this.extraState, marketIgnoredItems: items }
      return { status: 200, json: { ok: true, items } }
    }
    if (path === 'merchant/config' && (body.action === 'lock-lucky-slot' || body.action === 'unlock-lucky-slot')) {
      // http/merchant-settings.ts luckySlotAction.
      const name = body.character
      if (typeof name !== 'string' || this.characters.find((c) => c.name === name)?.ctype !== 'merchant') return { status: 400, json: { error: 'select an owned merchant character' } }
      if (name !== merchant) return { status: 409, json: { error: 'merchant is no longer configured' } }
      const locks = { ...((this.extraState.luckySlotLocks as Record<string, number | null> | undefined) ?? {}) }
      const resume = { ...((this.extraState.luckySlotResume as Record<string, { slot: number; rolls: number }> | undefined) ?? {}) }
      const validSlot = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0 && Number(value) < 42
      if (body.action === 'unlock-lucky-slot') {
        const locked = locks[name]
        if (!validSlot(locked)) return { status: 409, json: { error: 'lucky slot is not locked' } }
        const slot = (locked + 1) % 42
        const rolls = Object.values(this.luckySlotTracking[name] ?? {}).reduce((sum, stream) => sum + (stream.slots[slot]?.totalRolls ?? 0), 0)
        resume[name] = { slot, rolls }
        delete locks[name]
      } else {
        if (!validSlot(body.slot)) return { status: 400, json: { error: 'invalid lucky slot' } }
        locks[name] = body.slot
        delete resume[name]
      }
      this.extraState = { ...this.extraState, luckySlotLocks: locks, luckySlotResume: resume }
      return { status: 200, json: { ok: true } }
    }
    if (path === 'merchant/aldata-order' || path === 'merchant/aldata-sale') {
      // http/manual-market-orders.ts: a snapshot entry older than two
      // minutes is refused unless `check` is true. The mock only judges
      // entries it can find in its own snapshot.
      const sale = path === 'merchant/aldata-sale'
      const requested = (sale ? body.order : body.listing) as { key?: string } | undefined
      const aldata = (this.extraState.aldata as { listings?: Record<string, unknown>[]; buyOrders?: Record<string, unknown>[] } | undefined) ?? { listings: this.aldataListings }
      const listing = ((sale ? aldata.buyOrders : aldata.listings) ?? []).find((entry) => entry.key === requested?.key)
      if (listing?.serverIdentifier === 'PVP') return { status: 409, json: { error: 'automatic PVP realm travel is disabled' } }
      if (listing && body.check !== true && Number(listing.seenAt) < Date.now() - 120000)
        return { status: 409, json: { error: sale ? 'buy order is stale; refresh the market first' : 'listing is stale; refresh the market first' } }
      return null
    }
    if (path === 'command' && body.type === 'exchange') {
      // inventory/merchant-item-commands.ts once(): a manual exchange job,
      // plus a pickup job when the item is in another character's bag.
      const name = String(body.character)
      if (!merchant || !this.characters.some((c) => c.name === name) || !Number.isSafeInteger(body.slot)) return null
      const item = this.characters.find((c) => c.name === name)?.items?.[Number(body.slot)]
      if (!item || JSON.stringify(item) !== JSON.stringify(body.item)) return { status: 409, json: { error: 'merchant inventory item changed; refresh and try again' } }
      const level = Number(item.level) || 0
      const choice = this.exchangeable.find((line) => !line.reward && line.id === item.name && (Number(line.level) || 0) === level)
      const quantity = Math.floor((Number(item.q) || 1) / Math.max(1, Number(choice?.required) || 1))
      if (!choice || !quantity) return { status: 400, json: { error: 'not enough stock for this exchange' } }
      const id = `exchange-${this.merchantQueue.length + 1}`
      const job: Record<string, unknown> = { id, target: merchant, reason: 'exchange', routine: 'manual exchange', manual: true, queuedAt: Date.now(), exchanges: [{ id: item.name, level, quantity }] }
      if (name !== merchant) {
        job.exchangePickupId = `${id}-pickup`
        this.merchantQueue.push({ id: `${id}-pickup`, target: name, reason: 'exchange pickup', routine: 'manual exchange', manual: true, queuedAt: job.queuedAt, exchangeDeliveryId: id })
      }
      this.merchantQueue.push(job)
      return { status: 200, json: { ok: true } }
    }
    return null
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
   *  Playwright checks the most recently registered route first, so the
   *  broad fallback goes first and a test's own later `page.route()` wins. */
  async install(page: Page): Promise<void> {
    await page.route('**/e2e-sprite.png', (route) =>
      route.fulfill({ contentType: 'image/png', body: Buffer.from(TINY_PNG_BASE64, 'base64') }),
    )

    // Fallback for /party-api/* POSTs without a specific handler below.
    // Unhandled GETs get {} rather than a 404, since some settings reads
    // (ALData key/auth checks) aren't modeled.
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
      // setup-routes.ts setupState(): accessCodeExpiresAt only while pairing is required, null once the code is used, expired or cancelled.
      const accessCode = this.requirePairing ? { accessCodeExpiresAt: this.activeAccessCode()?.expiresAt ?? null } : {}
      if (this.paired) return route.fulfill({ status: 200, json: { ok: true, requirePairing: this.requirePairing, ...accessCode } })
      return route.fulfill({ status: 401, json: { error: 'not paired' } })
    })
    await page.route('**/setup/pair', (route) => {
      const body = (route.request().postDataJSON() as Record<string, unknown>) ?? {}
      this.pairRequests.push(body)
      // setup-routes.ts pair(): a code takes precedence over a token; access.ts
      // pairCode() ignores case, spaces and dashes, and a failure answers 400.
      if (typeof body.code === 'string' && body.code) {
        const code = this.activeAccessCode()
        const typed = body.code.toUpperCase().replace(/[\s-]/g, '')
        if (!code) return route.fulfill({ status: 400, json: { error: 'Access code is invalid or expired' } })
        if (typed !== code.code.replace(/-/g, '')) {
          if (++code.failures >= 5) this.accessCode = null
          return route.fulfill({ status: 400, json: { error: 'Access code is invalid or expired' } })
        }
        this.accessCode = null
      }
      this.paired = true
      return route.fulfill({ status: 200, json: { ok: true } })
    })
    await page.route('**/setup/invite', (route) => {
      if (this.requirePairing && !this.paired) return route.fulfill({ status: 401, json: { error: 'Pair this browser before changing setup' } })
      // access.ts accessCode(): each invitation replaces the previous code.
      this.accessCode = { code: this.nextAccessCode, expiresAt: Date.now() + this.accessCodeTtlMs, failures: 0 }
      return route.fulfill({ json: { token: 'c0ffee'.repeat(10) + 'c0de', code: this.accessCode.code, expiresAt: this.accessCode.expiresAt, expiresIn: this.accessCodeTtlMs } })
    })
    await page.route('**/setup/pairing', async (route) => {
      const body = (route.request().postDataJSON() as { requirePairing?: boolean }) ?? {}
      if (typeof body.requirePairing === 'boolean') this.requirePairing = body.requirePairing
      // tools/hosting/setup-routes.ts: replies with the stored requirement.
      return route.fulfill({ json: { requirePairing: this.requirePairing } })
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
      if (section === 'logs' && this.failLogs) return route.fulfill({ status: 503, json: { error: 'unavailable' } })
      return route.fulfill({ json: this.stateSection(section, dashboard) })
    })
    await page.route('**/party-api/mail**', (route) => {
      // Also matches POST /party-api/mail/collect; leave that to the fallback.
      if (route.request().method() !== 'GET') return route.fallback()
      if (new URL(route.request().url()).pathname.endsWith('/mail/postage'))
        return this.mailPostage === null ? route.fulfill({ status: 503, json: { error: 'unavailable' } }) : route.fulfill({ json: { gold: this.mailPostage } })
      return route.fulfill({ json: { messages: this.mailMessages, count: this.mailMessages.length, updatedAt: Date.now(), error: null } })
    })
    await page.route('**/console-update', (route) =>
      this.consoleUpdate ? route.fulfill({ json: this.consoleUpdate }) : route.fulfill({ status: 503, json: { error: 'starting' } }),
    )
    // Console 1.4 escape resume: http/party-actions.ts escapeState/escape/resume
    // all answer {escape}; resume releases the hold (party-escape.cjs stage "released").
    await page.route('**/party-api/escape**', (route) => {
      const request = route.request()
      if (request.method() !== 'POST') return route.fulfill({ json: { escape: this.escape } })
      const path = new URL(request.url()).pathname.replace(/^.*\/party-api\//, '')
      this.escapeActions.push(path)
      if (this.failOnce[path] !== undefined) {
        const error = this.failOnce[path]
        delete this.failOnce[path]
        return route.fulfill({ status: 409, json: { error } })
      }
      if (path === 'escape/resume' && this.escape) this.escape = { ...this.escape, stage: 'released' }
      return route.fulfill({ json: { escape: this.escape } })
    })
    // tools/update + debug-instance + dashboard-state (settings).
    await page.route('**/console-update/*', async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').pop() ?? ''
      this.consoleActions.push({ name, body: route.request().postDataJSON() })
      return route.fulfill({ json: { ok: true } })
    })
    await page.route('**/console-debug**', async (route) => {
      const path = new URL(route.request().url()).pathname
      if (route.request().method() === 'POST') {
        const name = path.split('/').pop() ?? ''
        this.consoleActions.push({ name: `debug-${name}`, body: null })
        this.consoleDebug = name === 'start' ? { phase: 'running', message: 'Debug instance running', project: 'debug', port: 9100, token: 'tok' } : { phase: 'idle', message: 'Ready' }
      }
      return this.consoleDebug ? route.fulfill({ json: this.consoleDebug }) : route.fulfill({ status: 503, json: { error: 'starting' } })
    })
    await page.route('**/party-api/dashboard-state**', async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname.replace(/^.*\/party-api\//, '')
      if (path === 'dashboard-state') return route.fulfill({ json: { filename: 'caraGarage.jsonl', canonicalPath: '/srv/console/caraGarage.jsonl', localPath: '/srv/.caracal/localStorage/caraGarage.jsonl', dockerPath: '/data/localStorage/caraGarage.jsonl', maxBytes: 1000 } })
      if (path === 'dashboard-state/export') return route.fulfill({ json: { version: 1, settings: { leader: this.leader } } })
      const body = request.postData() ?? ''
      this.stateImports.push({ action: path.split('/').pop() ?? '', body, digest: request.headers()['x-state-preview'] ?? null })
      if (body.includes('broken')) return route.fulfill({ status: 400, json: { error: 'Unrecognized state file' } })
      const preview = { fields: ['marked', 'farmingPolicy'], characters: ['Leada'], digest: 'd1', skippedCharacters: { Stranger: ['autoItemMarks'] } }
      return route.fulfill({ json: path.endsWith('import') ? { ...preview, backupPath: '/srv/backups/state-1.jsonl' } : preview })
    })
    await page.route('**/party-api/daily-dungeons', async (route) => {
      const request = route.request()
      if (request.method() !== 'POST') return route.fulfill({ json: this.dailyDungeon })
      const body = (request.postDataJSON() as Record<string, unknown>) ?? {}
      this.dungeonActions.push(body)
      if (this.failOnce['daily-dungeons'] !== undefined) {
        const error = this.failOnce['daily-dungeons']
        delete this.failOnce['daily-dungeons']
        return route.fulfill({ status: 409, json: { ok: false, error } })
      }
      this.onDungeonAction?.(body)
      return route.fulfill({ json: this.dailyDungeon })
    })
    // upgrade-preview.ts: the stored server preview for the merchant's item.
    await page.route('**/party-api/upgrade-preview', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>
      this.upgradePreviewRequests.push(body)
      return route.fulfill({ json: this.upgradePreview ?? { status: 'idle' } })
    })
    // aldata-routes.ts market(): the full ALData market state.
    await page.route('**/party-api/aldata/market', (route) => route.fulfill({ json: (this.stateSection('market', true) as Record<string, unknown>).aldata ?? {} }))
    await page.route('**/party-api/dashboard-stream', async (route) => {
      const base = await this.startSseServer()
      return route.continue({ url: `${base}/dashboard-stream` })
    })
    await page.route('**/party-api/maps/**', (route) => {
      const url = new URL(route.request().url())
      this.mapDefinitionRequests.push(url.pathname.replace(/^.*\/party-api\//, '') + url.search)
      const definition = this.mapDefinitions[decodeURIComponent(url.pathname.replace(/^.*\/maps\//, ''))]
      return definition ? route.fulfill({ json: definition }) : route.fulfill({ status: 404, json: { error: 'unknown map' } })
    })
    await page.route('**/party-api/map-stream/**', async (route) => {
      const base = await this.startSseServer()
      const path = new URL(route.request().url()).pathname.replace(/^.*\/map-stream\//, '')
      return route.continue({ url: `${base}/map-stream/${path}` })
    })

    page.once('close', () => this.stopSseServer())
  }
}
