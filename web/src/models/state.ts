import type { StandPriceHistory } from '@/lib/suggestedItemValue'
import type { Item, InventoryEntry, EquippedEntry } from './item'
import type { Sprite } from './sprite'
import type { CraftMaterial, ItemMeta, MerchantExchangeItem } from './itemDetail'
import type { Catalog as MonsterLocationCatalog } from '@/lib/farmingZones'

export type { Sprite }

/** Console: merchant-job.tsx MerchantJob, trimmed to what the queue shows.
 *  The shape varies a lot by kind of errand, so most fields are optional. */
export interface MerchantJob {
  id?: string
  target: string
  reason: string
  routine?: string
  priority?: number
  phase?: string
  realmBlockedReason?: string
  realmRetryExhausted?: boolean
  // From the server's recovery/retry loop. A climbing recoveryAttempts with
  // the same lastDeferredReason for several minutes means the job is stuck
  // retrying, not just queued (MerchantQueueSection's stuckJob()).
  recoveryAttempts?: number
  lastDeferredReason?: string
  firstDeferredAt?: number
  // Read by routineFor to name the job's routine.
  manual?: boolean
  bidItemId?: string
  order?: unknown
  autoExchangeKeys?: string[]
  // Shown by the queue/job label.
  operationStage?: string
  listings?: unknown[]
  seller?: string
  expectedItem?: Item
  retryAt?: number
  pauseReason?: string
  commandReport?: unknown
}

/** One HP or MP auto-potion threshold. */
export interface RestockRange {
  min: number
  max: number
  item?: string
}

export interface RestockPolicy {
  hp: RestockRange
  mp: RestockRange
}

export const emptyRestockPolicy = (): RestockPolicy => ({
  hp: { min: 0, max: 0 },
  mp: { min: 0, max: 0 },
})

/** What is shown (and saved) for a character with no policy yet. */
export const defaultRestockPolicy = (): RestockPolicy => ({
  hp: { min: 5, max: 20, item: 'hpot1' },
  mp: { min: 0, max: 0, item: 'mpot1' },
})

/** Shared bank. Pack keys are names like "items1"/"bank_b1"; each pack is a
 *  fixed-length slot list with nulls for empty slots, like an inventory. */
export interface BankSnapshot {
  gold: number
  packs: Record<string, (InventoryEntry | null)[]>
}

/** One bank pack, locked or not. A pack is unlocked once it appears in
 *  BankSnapshot.packs; until then this describes what opens it.
 *  `floor === "bank"` packs open for `gold` alone. On other floors the
 *  first (gold: 0) vault must be opened with its `key` item before any
 *  vault on that floor is accessible. */
export interface BankVault {
  pack: string
  floor: string
  gold: number
  shells?: number
  key?: { id: string; name?: string; sprite?: Sprite | null } | null
}

/** One drop-table entry within a BestiaryMonster - `rate` is the chance
 *  per kill (e.g. 0.0002 = 0.02%). */
export interface BestiaryDrop {
  id: string
  name: string
  rate: number
  quantity: number
  sprite?: Sprite | null
}

/** A map location where a monster spawns. */
export interface MonsterSpawnRecord {
  map: string
  mapName?: string
  x: number
  y: number
  count?: number
  boundary?: [number, number, number, number]
  restrictions?: string[]
}

export interface BestiaryMonster {
  id: string
  name: string
  hp: number
  attack: number
  xp: number
  threat: number
  // Attack range and the raw G.monsters definition.
  range?: number
  definition?: Record<string, unknown>
  sprite?: Sprite | null
  drops: BestiaryDrop[]
  spawnRecords: MonsterSpawnRecord[]
}

/** A class's skill list. */
export interface SkillClass {
  id: string
  name: string
  skills: SkillEntry[]
}

export interface SkillDefinition {
  explanation?: string
  range?: number
  mp?: number
  cooldown?: number
  level?: number
}

export interface SkillEntry {
  id: string
  name: string
  sprite?: Sprite | null
  // The full G.skills definition.
  definition?: SkillDefinition & Record<string, unknown>
}

/** One activity-feed line (merchant-activity or combat log). */
export interface ActivityEntry {
  at: number
  message: string
  level?: string
  // skill | kill | loot | death | item (combat log).
  type?: string
  details?: unknown
}

/** One of the merchant's 16 stand listings. `slot` is the merchant's
 *  inventory slot holding the item, not `tradeSlot` (the stand position).
 *  A listing marked straight from the bank has `bankPack`/`bankSlot`
 *  instead; BankScreen uses them to badge listed bank slots. */
export interface StandListing {
  id?: string
  slot?: number
  bankPack?: string
  bankSlot?: number
  // configured | live | paused ..., and the stand slot a live listing sits in.
  state?: string
  tradeSlot?: string
  item: Item
  price: number
  quantity: number
}

/** One public market listing from ALData or Ponty. ALData's price is
 *  per-unit; Ponty's `price` is the total for `quantity` (its `unitPrice`
 *  is per-unit). */
export interface MarketListing {
  key?: string
  // Ponty listings can combine several underlying listings.
  keys?: string[]
  // Neither feed tags itself reliably (Ponty listings carry no `source`),
  // so MarketScreen sets this on merge.
  origin?: 'aldata' | 'ponty'
  source?: string
  seller?: string
  item: Item
  price: number
  unitPrice?: number
  quantity: number
}

/** One open player stand found by a stand search. Buying echoes these
 *  fields back so the coordinator can re-match the same listing. */
export interface StandSearchListing {
  seller: string
  slot: string
  rid?: string
  item: Item
  price: number
  quantity: number
  map?: string
  x?: number
  y?: number
}

export interface StandSearchState {
  status: string
  itemId?: string
  listings: StandSearchListing[]
  error?: string
}

export const emptyStandSearchState = (): StandSearchState => ({ status: 'idle', listings: [] })

export interface AlDataState {
  listings: MarketListing[]
  // Only used when publishing the merchant's own listings to ALData.
  hasKey?: boolean
  auth?: 'NO' | 'YES' | 'CORRECT' | 'WRONG'
  publishStatus?: string
  error?: string | null
}

export interface PontyState {
  listings: MarketListing[]
}

/** merchantCatalog.allItems. A live item's `.name` matches `id` here, not
 *  `name` (which is the display name). `meta` feeds the item-details view. */
export interface CatalogItem {
  id: string
  name: string
  upgradeable?: boolean
  compoundable?: boolean
  maxLevel?: number
  sprite?: Sprite | null
  meta?: ItemMeta | null
}

/** merchantCatalog.buyable - NPC-purchasable items, including the compound
 *  scrolls whose prices compoundPassCost looks up by id. */
export interface MerchantBuyItem {
  id: string
  name: string
  cost: number
  seller: string
  sprite?: Sprite | null
  upgradeable?: boolean
  compoundable?: boolean
  upgradeGrade?: number
  grades?: number[]
  upgradeChances?: number[]
  scrollCosts?: number[]
}

/** merchantCatalog.craftable - recipes the merchant can craft. */
export interface MerchantCraftRecipe {
  id: string
  name: string
  cost: number
  sprite?: Sprite | null
  materials: CraftMaterial[]
}

export interface MerchantCatalog {
  allItems: CatalogItem[]
  buyable: MerchantBuyItem[]
  craftable: MerchantCraftRecipe[]
  // NPC exchange/box tables, matched by id+level for the item-details
  // exchange sections.
  exchangeable: MerchantExchangeItem[]
}

/** One bank/merchant hold mark on a specific slot, as opposed to
 *  autoItemMarks' standing rules. `auto` marks were generated by a rule. */
export interface BankMark {
  slot: number
  item: Item
  auto?: boolean
}

/** One pending NPC-sale mark. state.npcSaleMarks is a flat account-wide
 *  list; filter by `source`/`character`. */
export interface NpcSaleMark {
  id: string
  auto?: boolean
  pack?: string
  source?: 'bank' | 'merchant' | 'character'
  character?: string
  slot: number
  item: Item
  quantity: number
  state?: string
  error?: string | null
  retryAt?: number | null
}

/** One pending deconstruction mark (also a flat account-wide list).
 *  'complete' marks are not badged. A bank-sourced mark has `slot` -1 and
 *  identifies the item by `storage` instead. */
export interface DeconstructionMark {
  id: string
  owner: string
  slot: number
  item: Item
  quantity: number
  state: 'collecting' | 'withdrawing' | 'ready' | 'running' | 'blocked' | 'complete'
  error?: string
  auto?: boolean
  storage?: { pack: string; slot: number }
}

/** One pending upgrade on a specific item (state.upgrades[character]), as
 *  opposed to autoUpgradeMarks' standing rules. `slot` is an inventory
 *  index, or the equipment slot name when `equipped`. */
export interface UpgradeMark {
  slot?: number | string
  item: Item
  tiers?: number
  auto?: boolean
  equipped?: boolean
}

/** One pending compound-pass mark (state.compounds[character][].items) -
 *  compounding always advances exactly one tier per pass. */
export type CompoundMark = UpgradeMark

/** state.compounds[character] groups the copies being compounded together
 *  under one id. */
export interface CompoundGroup {
  id: string
  name: string
  items: CompoundMark[]
}

/** One pending stat-scroll mark (state.statScrolls[character]). */
export interface StatScrollMark extends UpgradeMark {
  statType: string
  scroll: string
}

/** One inventory slot's accumulated upgrade-roll evidence. The server
 *  rotates automatic upgrades through the merchant's 42 slots and records
 *  each roll, since some slots may carry a hidden success bonus ("lucky
 *  slots"). Evidence only, never a verified fact. */
export interface SlotRollStatistics {
  totalRolls: number
  sumRolls: number
  rollsAbove96_3: number
  perfectRolls: number
}

/** One evidence stream's slot table. Each client keeps its own stream so
 *  restarts and multiple clients never double-count or drop rolls;
 *  aggregateSlotTracking sums them for display. */
export interface LuckySlotTracking {
  version: 1
  streamId?: string
  slots: Record<string, SlotRollStatistics>
}
export type LuckySlotStreams = Record<string, LuckySlotTracking>

/** One pending bank withdrawal, collected by a character (usually the
 *  merchant) on its next bank visit. Requesting the same {pack,slot,item}
 *  again toggles it off; there is no separate "unmark" request. */
export interface WithdrawalRequest {
  pack: string
  slot: number
  item: Item
}

/** Keyed by internal item id. Only listed items can be deconstructed
 *  (compoundables only above level 0). */
export interface DeconstructionCatalogEntry {
  compound: boolean
  cost?: number
  rewards?: { name: string; quantity: number; chance: number }[]
}
export type DeconstructionCatalog = Record<string, DeconstructionCatalogEntry>

/** Recipe rolls are independent; compounded items return three items at
 *  one lower level. Console: deconstruction.ts. */
export function deconstructionRewards(item: Item, catalog: DeconstructionCatalog) {
  const definition = catalog[item.name]
  if (!definition) return null
  if (definition.compound && Number(item.level) > 0) return [{ name: item.name, level: Number(item.level) - 1, quantity: 3, chance: 1 }]
  return definition.rewards?.map((reward) => ({ ...reward, level: 0 })) || null
}

export function canDeconstruct(item: Item, catalog: DeconstructionCatalog): boolean {
  const entry = catalog[item.name]
  return !!entry && !item.l && !item.b && (!entry.compound || Number(item.level) > 0)
}

/** Rule key for autoItemMarks and autoUpgradeMarks: "{name}@+{level or 0}". */
export const autoMarkRuleKey = (item: Item): string => `${item.name}@+${item.level ?? 0}`

/** Rule key for autoStandMarks and autoNpcSales. */
export const automaticCommerceRuleKey = (item: Item): string =>
  JSON.stringify({
    name: item.name,
    level: Math.max(0, Number(item.level) || 0),
    p: item.p || null,
    stat_type: item.stat_type || null,
  })

/** Whether a mark's `item` still matches what's in that slot. Slots get
 *  reused when items move, so matching by slot alone can badge the wrong
 *  item. Quantity is ignored so a stack change doesn't invalidate a mark. */
export function sameMarkedItem(markItem: Item, liveItem: Item): boolean {
  return markItem.name === liveItem.name && (markItem.level ?? 0) === (liveItem.level ?? 0)
}

/** Parses an autoMarkRuleKey back into a displayable Item. */
export const itemFromRuleKey = (ruleKey: string): Item => {
  const [name, level] = ruleKey.split('@+')
  const parsedLevel = level != null ? Number(level) : undefined
  return { name: name ?? ruleKey, level: parsedLevel != null && !Number.isNaN(parsedLevel) ? parsedLevel : undefined }
}

/** An autoNpcSales entry. No `character` means the merchant's own rule. */
export interface AutoNpcSaleRule {
  item: Item
  character?: string
}

/** An autoStandMarks entry (merchant-only). */
export interface AutoStandRule {
  item: Item
  price: number
}

export interface AutoDeconstructionRule {
  item: Item
}

/** Compound rules aren't level-specific: compounding advances the item
 *  toward targetTier on its own. */
export interface AutoCompoundRule {
  name: string
  targetTier: number
  quantity: number
}

/** An item queued for hand delivery, keyed by recipient. `slot` is the
 *  sender's (in practice the merchant's) inventory slot; the item stays
 *  there until delivered. */
export interface MerchantDelivery {
  id: string
  slot: number
  item: Item
  equipOnDelivery?: boolean
}

/** A preset "Send to..." location. `id` is the map name character-travel
 *  expects. */
export interface TravelPlace {
  id: string
  name: string
  x: number
  y: number
}

/** A selectable realm. `key` is what /party-api/realm/switch expects. */
export interface RealmOption {
  key: string
  label: string
  players: number
  pvp: boolean
}

export interface RealmCharacter {
  name: string
  ctype: string
  realm: string | null
  online: boolean
}

/** A realm switch (and optional home change) in progress. */
export interface RealmOperation {
  id: string
  phase: string
  realm: string
  setHome: boolean
  startedAt: number
  executor?: string | null
  error?: string | null
  characters?: RealmCharacter[]
}

export interface RealmControl {
  activeRealm?: string
  // Where the party actually is (activeRealm is where the coordinator aims it).
  currentRealm?: string | null
  homeRealm?: string | null
  split: boolean
  merchantRealm?: string | null
  characters: RealmCharacter[]
  realms: RealmOption[]
  operation?: RealmOperation | null
}

/** The polled slice of GET /party-api/state. `followers` maps character
 *  name -> whether it follows the leader. */
export interface PartyStateDynamic {
  merchantCurrent?: MerchantJob | null
  merchantQueue: MerchantJob[]
  leader?: string | null
  followers: Record<string, boolean>
  // The leader's effective monster focus. monsterFocusByCharacter[leader]
  // is deliberately left empty server-side, so the leader's screen falls
  // back to this.
  monsterFocus?: string[]
  restockPolicies: Record<string, RestockPolicy>
  bank?: BankSnapshot | null
  // Every bank pack, locked or not; locked ones aren't in `bank.packs`.
  bankVaults: BankVault[]
  bestiaryCatalog: BestiaryMonster[]
  // Spawn-area geometry for farmingAreas.ts; a separate catalog from
  // bestiaryCatalog's spawnRecords, sent in the same section=catalog.
  monsterChoices: MonsterLocationCatalog
  // Saved Phoenix 5-region search order.
  phoenixRouteOrder: string[]
  skillCatalog: SkillClass[]
  combatLogs: Record<string, ActivityEntry[]>
  merchantActivity: ActivityEntry[]
  standListings: StandListing[]
  aldata?: AlDataState | null
  ponty?: PontyState | null
  merchantCatalog?: MerchantCatalog | null
  standSearch: StandSearchState
  marked: Record<string, BankMark[]>
  merchantMarked: Record<string, BankMark[]>
  // Keyed by the character who will collect them (usually the merchant).
  withdrawals: Record<string, WithdrawalRequest[]>
  deconstructionCatalog: DeconstructionCatalog
  // Both keyed by character, then by autoMarkRuleKey(item).
  autoItemMarks: Record<string, Record<string, string>>
  autoUpgradeMarks: Record<string, Record<string, unknown>>
  // Pending one-time marks (not standing rules), keyed by character.
  upgrades: Record<string, UpgradeMark[]>
  compounds: Record<string, CompoundGroup[]>
  statScrolls: Record<string, StatScrollMark[]>
  // Flat, account-wide lists.
  npcSaleMarks: NpcSaleMark[]
  deconstructionMarks: DeconstructionMark[]
  // Keyed by recipient.
  merchantDeliveries: Record<string, MerchantDelivery[]>
  // Lucky-slot evidence, keyed by character. luckyUpgradeSlots holds the
  // slot number once confidence is high enough.
  luckyUpgradeSlots: Record<string, number>
  luckySlotTracking: Record<string, LuckySlotStreams>
  bankboiPrefix: string
  anniversaryAutoChat: boolean
  realmControl?: RealmControl | null
  // How much gold each character should carry. Merchant bank errands
  // deposit the excess or withdraw the shortfall; this is the only way
  // gold moves between a character and the bank.
  goldTargets: Record<string, number>
  // Account-wide. Keys are opaque identity strings; only values are read.
  autoNpcSales: Record<string, AutoNpcSaleRule>
  autoStandMarks: Record<string, AutoStandRule>
  // Keyed by `${itemName}@${level}`; presence alone marks the item for auto-exchange.
  autoExchanges: Record<string, unknown>
  // Per character, then by rule key (see itemFromRuleKey).
  autoDeconstruction: Record<string, Record<string, AutoDeconstructionRule>>
  autoCompounds: Record<string, AutoCompoundRule[]>
  travelPlaces: TravelPlace[]
  // force-stand pauses all other merchant work; gatheringModes is the set
  // of enabled mining/fishing modes.
  merchantForceStand: boolean
  gatheringModes: string[]
  // reason -> 0-100 priority, and which automatic routines are enabled.
  merchantRoutinePriorities: Record<string, number>
  merchantAutomations: Record<string, boolean>
  threshold: number
  itemCollectionThreshold: number
  bankSortMode?: 'automatic' | 'request'
  // One-shot "sort on next visit" trigger; only relevant in "request" mode.
  bankSortRequest?: { id: string; status: 'queued' | 'sorting' | 'retry'; message?: string } | null
  // The leader's farming mode; other characters may have their own in
  // farmingProfiles (see resolveFarmingContext).
  farmingPolicy: string
  monsterFocusByCharacter: Record<string, string[]>
  monsterSearchRadiusByCharacter: Record<string, number>
  huntBlacklist: Record<string, HuntBlacklistEntry>
  huntSettings?: HuntSettings | null
  // Achievement Hunt (console branch achievement-hunt; absent on stock consoles).
  achievementHunt?: AchievementHuntSettings | null
  achievementBlacklist?: Record<string, AchievementBlacklistEntry> | null
  achievementTarget?: { id: string; step: number; milestone: number; startedAt: number; deaths: number } | null
  achievementMessage?: string | null
  // The party's current Hunt quest: which monster, for which member.
  monsterHunt?: MonsterHuntCycle | null
  // Per-character Hunt quest assignment, keyed by character name.
  characterHunt: Record<string, MonsterHuntStatus | null>
  farmAreaState?: FarmAreaState | null
  // Only for characters that neither lead nor follow; the leader and its
  // followers use the top-level fields. See resolveFarmingContext.
  farmingProfiles: Record<string, FarmingProfile>
  // Standing WTB orders, one per item id, filled up to `price`.
  standBids: Record<string, StandBid>
  // Use an offering instead of scrolls during automatic upgrades within a
  // level range.
  upgradeOfferingRules: UpgradeOfferingRule[]
  // Config section only. Never infer the merchant from character class;
  // bankbois are merchants too.
  merchantCharacter?: string | null
  // When present, rules are owned by `owner` for every name in `members`.
  merchantRules?: SharedRules | null
  // Full entries (with items) only arrive from section=bank&dashboard=1;
  // section=core carries item-less summaries.
  bankbois: Bankboi[]
  bankboiQueue?: { id: string; item: Item; state: string; bootstrap?: boolean }[]
  buyUpgradeBatchSize?: number

  // The rest of the console's PartyState: typed where the shape is simple,
  // `unknown` where it is a deep runtime type.
  // Roster, slots, session
  activeSlots?: ActiveSlot[]
  characterConnections?: CharacterConnection[]
  steamSwitch?: SteamSwitch | null
  bankboiTransaction?: { bankboi: string; phase: string; mode: string } | null
  gameVersion?: number
  classChoices?: string[]
  appearanceChoices?: Record<string, AppearanceChoice[]>
  characterAppearances?: Record<string, { skin?: string; characterSprite?: unknown; characterDollHtml?: string; updatedAt: number }>
  accountId?: string | null
  referenceRevision?: string
  // Core's bank gold (null until the bank has been seen).
  bankGold?: number | null
  // Giveaways
  giveawayRealms?: { key: string; label: string }[]
  giveawayPlayers?: Record<string, string[]>
  // Merchant and stand
  merchantWeapon?: { item: Item } | null
  merchantBlacklist?: Record<string, { reason?: string; at?: number; [field: string]: unknown }>
  autoStandBuys?: boolean
  autoBlacklistMerchants?: boolean
  merchantStandLocation?: { map: string; x: number; y: number; [field: string]: unknown } | null
  standPriceHistory?: Record<string, StandPriceHistory>
  nativeStand?: {
    offers: Record<string, { itemId: string; auto: boolean; phase: string; slot: string; level?: number; price?: number; quantity?: number; acknowledged?: number; problem?: string }>
    problems: Record<string, string>
  }
  mluckSchedule?: { target: string; remainingMs: number; leadMs: number; dispatchInMs: number; marginMs: number; status: string } | null
  gatheringCooldowns?: { fishing?: number; mining?: number }
  gatheringNoTool?: Record<string, boolean>
  purchases?: Record<string, { name: string }[]>
  // Events, hunting, location
  eventSchedules?: import('@/lib/eventPolicy').EventSchedule[]
  eventSelectionsByCharacter?: Record<string, string[]>
  eventsByCharacter?: Record<string, boolean>
  monsterPrioritiesByCharacter?: Record<string, Record<string, number>>
  passiveHunting?: unknown
  passiveRareHunts?: { tinyp: boolean; phoenix: boolean; goldenbat?: boolean; cutebee?: boolean; hen?: boolean; rooster?: boolean }
  scatterMonsterTypes?: string[]
  huntFailures?: Record<string, { deaths: number; expirations: number }>
  anniversary?: unknown
  characterLocations?: Record<string, { map: string; x: number; y: number; [field: string]: unknown }>
  partyLocation?: { map: string; x: number; y: number; [field: string]: unknown } | null
  combatRecovery?: { phase: string; reason?: string; names: string[] } | null
  activeConvoy?: unknown
  // Upgrades
  upgradeOfferingStock?: Partial<Record<UpgradeOffering, number>>
}

/** Merchant rules shared across characters. `conflicts` is left opaque. */
export interface SharedRules {
  version: 1
  owner: string
  members: string[]
  backup?: unknown
  conflicts: unknown[]
}

/** `items`/`slots` are absent on core's summaries. */
export interface Bankboi {
  name: string
  ctype?: string
  level?: number
  state: string
  items?: (InventoryEntry | null)[]
  slots?: Record<string, EquippedEntry>
  gold?: number
  seenAt?: number
  error?: string | null
  transaction?: { phase: string; mode: string } | null
}

export type UpgradeOffering = 'offeringp' | 'offering' | 'offeringx'
export const UPGRADE_OFFERING_LABELS: Record<UpgradeOffering, string> = {
  offeringp: 'Primling',
  offering: 'Primordial Essence',
  offeringx: 'Primordial X',
}
/** `name` is the item's catalog id (e.g. "coat"), not its display name. */
export interface UpgradeOfferingRule {
  id: string
  name: string
  floor: number
  ceiling: number
  offering: UpgradeOffering
  required: boolean
}

export interface StandBid {
  revision?: number
  price: number
  quantity: number
  minimumQuality?: number
  priorityOverride?: number
  useStandSlot?: boolean
  acceptHigherLevels?: boolean
}

/** The displayable slice of the coordinator's HuntCycle. */
export interface MonsterHuntCycle {
  target: string | null
  message?: string
  stage: string
  owner?: string
  currentIndex: number
  missions: { target: string; owners: string[] }[]
  backup?: {
    members: Record<string, { target: string | null; remainingMs: number; ready: boolean; fresh: boolean }>
  }
  turnIn?: { owner: string; phase: 'returning' | 'claiming' | 'complete' }
}

/** One character's Hunt quest assignment. Arrives via characterDetails,
 *  only in the dashboard-shaped (dashboard=1) core poll. */
export interface MonsterHuntStatus {
  id: string | null
  count: number
  remainingMs: number | null
  server: string | null
}
export interface FarmAreaState {
  message?: string
  paused?: boolean
  active?: { map: string; x: number; y: number; monsterIds?: string[] }
}

/** An independent (neither leading nor following) character's own
 *  farming settings. See resolveFarmingContext. */
export interface FarmingProfile {
  farmAreaState?: FarmAreaState
  farmingPolicy?: string
  monsterHunt?: MonsterHuntCycle | null
  huntSettings?: HuntSettings
  huntBlacklist?: Record<string, HuntBlacklistEntry>
  monsterFocus?: string[]
}

export interface HuntBlacklistEntry {
  monsterId: string
  at: number
  deaths: number
  reason: string
  expirations?: number
  characters?: string[]
  lastDeathAt?: number
}

/** When Hunt mode relocates away from a competing party, and when a
 *  monster gets auto-blacklisted (too many deaths or quest expirations). */
export interface HuntSettings {
  // Preferred spawn per monster.
  preferredSpawns?: Record<string, string>
  relocateIfCompeting: boolean
  blacklistDeaths: boolean
  deathThreshold: number
  blacklistExpirations: boolean
  expirationThreshold: number
}

/** A character's effective farming setup. The leader and its followers
 *  use the top-level fields; everyone else uses their farmingProfiles
 *  entry. `savedMode` is what this character selected; `effectiveMode` is
 *  what is running. Console: farming-context.ts. */
export function resolveFarmingContext(state: PartyStateDynamic, name: string) {
  const followingLeader = state.leader && state.leader !== name && state.followers[name] ? state.leader : undefined
  const owner = followingLeader || name
  const legacy = owner === state.leader
  const personal = state.farmingProfiles[name]
  const effective = state.farmingProfiles[owner]
  return {
    owner,
    followingLeader,
    farmArea: effective?.farmAreaState || (legacy ? state.farmAreaState : undefined) || null,
    savedMode: personal?.farmingPolicy || (name === state.leader ? state.farmingPolicy : undefined) || 'auto',
    effectiveMode: effective?.farmingPolicy || (legacy ? state.farmingPolicy : undefined) || 'auto',
    blacklist: effective?.huntBlacklist || (legacy ? state.huntBlacklist : undefined) || {},
    settings: effective?.huntSettings || (legacy ? state.huntSettings ?? undefined : undefined),
    hunt: effective?.monsterHunt ?? (legacy ? state.monsterHunt : null) ?? null,
  }
}

export const emptyPartyStateDynamic = (): PartyStateDynamic => ({
  merchantQueue: [],
  bankVaults: [],
  followers: {},
  restockPolicies: {},
  bestiaryCatalog: [],
  monsterChoices: [],
  phoenixRouteOrder: [],
  skillCatalog: [],
  combatLogs: {},
  merchantActivity: [],
  standListings: [],
  standSearch: emptyStandSearchState(),
  marked: {},
  merchantMarked: {},
  withdrawals: {},
  deconstructionCatalog: {},
  autoItemMarks: {},
  autoUpgradeMarks: {},
  upgrades: {},
  compounds: {},
  statScrolls: {},
  npcSaleMarks: [],
  deconstructionMarks: [],
  merchantDeliveries: {},
  luckyUpgradeSlots: {},
  luckySlotTracking: {},
  bankboiPrefix: '',
  anniversaryAutoChat: false,
  goldTargets: {},
  autoNpcSales: {},
  autoStandMarks: {},
  autoExchanges: {},
  autoDeconstruction: {},
  autoCompounds: {},
  travelPlaces: [],
  merchantForceStand: false,
  gatheringModes: [],
  merchantRoutinePriorities: {},
  merchantAutomations: {},
  threshold: 0,
  itemCollectionThreshold: 1,
  farmingPolicy: 'auto',
  monsterFocusByCharacter: {},
  monsterSearchRadiusByCharacter: {},
  huntBlacklist: {},
  monsterHunt: null,
  characterHunt: {},
  farmAreaState: null,
  farmingProfiles: {},
  standBids: {},
  upgradeOfferingRules: [],
  bankbois: [],
})

/** One raw in-game chat/system log line, fetched via ?section=logs. */
export interface GameLogEntry {
  session?: string
  seq: number
  at: number
  message: string
  color?: string
  category?: string
}

export interface PartyStateGameLogs {
  gameLogs: Record<string, GameLogEntry[]>
}

/** One character's entry in core's `characterDetails`. Only present for
 *  characters in active slots; a missing field means "unknown", never 0. */
export interface CharacterDiagnostics {
  name?: string
  ctype?: string
  server?: string
  level?: number
  seenAt?: number
  ping?: number
  owner?: string | number
  skin?: string
  characterSprite?: unknown
  characterDollHtml?: string
  primaryStat?: string
  attack?: number
  frequency?: number
  range?: number
  speed?: number
  unrestrictedSpeed?: number
  armor?: number
  resistance?: number
  str?: number
  int?: number
  dex?: number
  vit?: number
  fortitude?: number
  luck?: number
  goldBonus?: number
  xpBonus?: number
  combatStats?: Record<string, unknown>
  monsterHunt?: MonsterHuntStatus | null
  monsterAchievements?: unknown
  monsterAchievementKills?: unknown
  tracktrix?: unknown
  anniversaryVisit?: unknown
  anniversaryState?: unknown
  [field: string]: unknown
}

export interface ActiveSlot {
  index: number
  kind: 'native' | 'headless'
  primary?: boolean
  character: string | null
  state: 'empty' | 'starting' | 'online' | 'stopping' | 'offline' | 'failed'
}

/** A Steam handoff in progress. */
export interface SteamSwitch {
  from: string | null
  target: string | null
  startedAt: number
  timedOut: boolean
  phase?: 'awaiting-realm-choice' | 'preparing' | 'release' | 'confirm-release' | 'navigate' | 'complete' | 'failed'
  error?: string | null
}

export interface CharacterConnection {
  name: string
  primary?: boolean
  error?: string | null
  since: number
  seenAt: number
  status: 'loading' | 'code' | 'stopped' | 'waiting' | 'connected' | 'lost'
  delayed: boolean
}

/** One of a class's starting looks. */
export interface AppearanceChoice {
  index: number
  html?: string | null
  layers?: unknown[]
}

/** Console runtime/coordinator/hunt/achievement-settings.ts. */
export interface AchievementHuntSettings {
  monsters: string[]
  blacklistDeaths: boolean
  deathThreshold: number
}
export interface AchievementBlacklistEntry {
  monsterId: string
  at: number
  reason: string
  deaths?: number
  characters?: string[]
}
