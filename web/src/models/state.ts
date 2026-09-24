import type { Item, InventoryEntry } from './item'
import type { Sprite } from './sprite'
import type { CraftMaterial, ItemMeta, MerchantExchangeItem } from './itemDetail'

export type { Sprite }

/** Mirrors party-console's MerchantJob type (merchant-job.tsx), trimmed to
 *  what the queue widget displays. Everything optional/defaulted: a job's
 *  shape varies a lot by what kind of errand it is. */
export interface MerchantJob {
  id?: string
  target: string
  reason: string
  routine?: string
  priority?: number
  phase?: string
  realmBlockedReason?: string
  realmRetryExhausted?: boolean
}

/** One HP or MP auto-potion threshold - see restock-policy.tsx. */
export interface RestockRange {
  min: number
  max: number
  item?: string
}

/** A character's restock policy (restock-controls.tsx) - defaults to a
 *  zeroed range rather than requiring both hp/mp. */
export interface RestockPolicy {
  hp: RestockRange
  mp: RestockRange
}

export const emptyRestockPolicy = (): RestockPolicy => ({
  hp: { min: 0, max: 0 },
  mp: { min: 0, max: 0 },
})

/** Shared bank vault (bank-sheet.tsx's BankSnapshot) - packs keys are pack
 *  names like "items1"/"bank_b1"; each pack is a fixed-length list of
 *  entries, same empty-slot-preserving shape as a character's inventory. */
export interface BankSnapshot {
  gold: number
  packs: Record<string, (InventoryEntry | null)[]>
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

/** One entry in a BestiaryMonster's spawnRecords - a real map location
 *  this monster spawns at, confirmed against a live GET /party-api/state
 *  capture (farming-area-picker.tsx's `farmingAreas()` groups these same
 *  records client-side using a separate static lib/farming-areas.ts data
 *  file this app doesn't port - picking a plain spawn record directly is
 *  simpler and uses only server-sourced data). */
export interface MonsterSpawnRecord {
  map: string
  mapName?: string
  x: number
  y: number
  count?: number
  boundary?: [number, number, number, number]
  restrictions?: string[]
}

/** bestiary-dialog.tsx's monster reference entry. */
export interface BestiaryMonster {
  id: string
  name: string
  hp: number
  attack: number
  xp: number
  threat: number
  sprite?: Sprite | null
  drops: BestiaryDrop[]
  spawnRecords: MonsterSpawnRecord[]
}

/** skills-dialog.tsx's per-class skill list. */
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
  definition?: SkillDefinition
}

/** One activity-feed line (merchant-activity or combat log). */
export interface ActivityEntry {
  at: number
  message: string
  level?: string
  details?: unknown
}

/** One of the merchant's own 16 stand listing slots (stand-sheet.tsx).
 *  `slot` is the merchant's own INVENTORY slot the item occupies while
 *  listed - distinct from `tradeSlot` (the stand UI position, unused). */
export interface StandListing {
  id?: string
  slot?: number
  item: Item
  price: number
  quantity: number
}

/** One public market listing from ALData or Ponty - real listings live
 *  under `aldata.listings`/`ponty.listings`, unified into this one shape.
 *  ALData's price is already per-unit; Ponty's `price` is the TOTAL for
 *  `quantity` (its own `unitPrice` is per-unit). */
export interface MarketListing {
  key?: string
  source?: string
  seller?: string
  item: Item
  price: number
  unitPrice?: number
  quantity: number
}

/** One live "someone's stand is open nearby" result from a stand search.
 *  Buying one requires echoing these exact fields back so the coordinator
 *  can re-match the same physical listing. */
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
}

export interface PontyState {
  listings: MarketListing[]
}

/** merchantCatalog.allItems - browsing (CatalogScreen), icon/display-name
 *  lookup (item.name on a live inventory/equipment entry matches `id`
 *  here, NOT `name` - the catalog's `name` is the human-readable display
 *  name, `id` is the internal identifier every live item instance
 *  actually carries as its own `.name`), and the full item-details view
 *  (components/itemdetail/ItemDetailBrowser.tsx) via `meta`. */
export interface CatalogItem {
  id: string
  name: string
  upgradeable?: boolean
  compoundable?: boolean
  maxLevel?: number
  sprite?: Sprite | null
  meta?: ItemMeta | null
}

/** merchantCatalog.buyable - NPC-purchasable items, including the
 *  compound scrolls ("cscroll0".."cscroll3") whose real prices
 *  compoundPassCost (itemFormulas.ts) looks up by id. */
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

/** merchantCatalog.craftable - recipes buyable via the merchant crafting
 *  workflow (merchant-commerce-dialog.tsx "craft" mode). */
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
  // NPC exchange/box tables - matched against an item by id+level to
  // build the item-details "Exchange price"/"reward"/"Reward in" sections.
  exchangeable: MerchantExchangeItem[]
}

/** One entry in `marked`/`merchantMarked` (bank/merchant hold marks) -
 *  slot-based, one specific item instance, as opposed to autoItemMarks'
 *  item-identity-keyed standing rules. `auto` distinguishes a rule-
 *  generated mark from a manual one-off mark. */
export interface BankMark {
  slot: number
  item: Item
  auto?: boolean
}

/** The rule-key format both autoItemMarks and autoUpgradeMarks use:
 *  "{item.name}@+{level or 0}" - see automatic-commerce-rule-key.ts. */
export const autoMarkRuleKey = (item: Item): string => `${item.name}@+${item.level ?? 0}`

/** Parses a rule key (see autoMarkRuleKey) back into a displayable Item -
 *  used when a collection is keyed by rule string rather than holding a
 *  real Item (autoItemMarks, autoUpgradeMarks). */
export const itemFromRuleKey = (ruleKey: string): Item => {
  const [name, level] = ruleKey.split('@+')
  const parsedLevel = level != null ? Number(level) : undefined
  return { name: name ?? ruleKey, level: parsedLevel != null && !Number.isNaN(parsedLevel) ? parsedLevel : undefined }
}

/** One entry in the flat, account-wide autoNpcSales map - `character`
 *  distinguishes a per-character rule from the merchant's own (absent
 *  character = merchant). */
export interface AutoNpcSaleRule {
  item: Item
  character?: string
}

/** One entry in the flat autoStandMarks map - merchant-only. */
export interface AutoStandRule {
  item: Item
  price: number
}

export interface AutoDeconstructionRule {
  item: Item
}

/** One entry in a character's autoCompounds list - `name` only (no level:
 *  compound rules aren't level-specific, since compounding advances an
 *  item's own level automatically toward targetTier). */
export interface AutoCompoundRule {
  name: string
  targetTier: number
  quantity: number
}

/** One preset map location the "Send to..." picker offers (travelPlaces) -
 *  `id` is the map name POST /party-api/command's character-travel
 *  command expects. */
export interface TravelPlace {
  id: string
  name: string
  x: number
  y: number
}

/** One selectable Adventure Land realm/server option (realm-control's
 *  realms list) - `key` is what POST /party-api/realm/switch expects. */
export interface RealmOption {
  key: string
  label: string
  players: number
  pvp: boolean
}

export interface RealmControl {
  activeRealm?: string
  homeRealm?: string
  realms: RealmOption[]
}

/** The slice of GET /party-api/state that changes often enough to poll
 *  (merchant errands, party formation, restock policy, bank/bestiary/
 *  skills/logs/stand/market for the account-wide screens) rather than
 *  fetch once like the roster. `followers` mirrors party-workspace.tsx's
 *  `state.followers?.[name]` map: character name -> is this character
 *  following the leader. */
export interface PartyStateDynamic {
  merchantCurrent?: MerchantJob | null
  merchantQueue: MerchantJob[]
  leader?: string | null
  followers: Record<string, boolean>
  restockPolicies: Record<string, RestockPolicy>
  bank?: BankSnapshot | null
  bestiaryCatalog: BestiaryMonster[]
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
  // Both keyed by character, then by autoMarkRuleKey(item).
  autoItemMarks: Record<string, Record<string, string>>
  autoUpgradeMarks: Record<string, Record<string, unknown>>
  bankboiPrefix: string
  realmControl?: RealmControl | null
  // How much gold each character should carry - the merchant's own bank
  // errands automatically deposit the excess or withdraw the shortfall to
  // match this during normal trips. There is no manual "withdraw gold"
  // action anywhere in party-console itself; this target is the real,
  // only mechanism for moving gold between a character and the bank.
  goldTargets: Record<string, number>
  // Flat/account-wide (not nested per character). Keys are opaque
  // identity strings never parsed (only the values matter).
  autoNpcSales: Record<string, AutoNpcSaleRule>
  autoStandMarks: Record<string, AutoStandRule>
  // Keyed by `${itemName}@${level}` (inventory-panel.tsx's autoExchangeKey) - presence alone marks the item for auto-exchange.
  autoExchanges: Record<string, unknown>
  // Per character, then by rule key (see itemFromRuleKey).
  autoDeconstruction: Record<string, Record<string, AutoDeconstructionRule>>
  autoCompounds: Record<string, AutoCompoundRule[]>
  travelPlaces: TravelPlace[]
  // Merchant Card Controls (merchant-card-controls.tsx): force-stand
  // pauses all other merchant work; gatheringModes is the standing
  // mining/fishing toggle set, each independently on or off.
  merchantForceStand: boolean
  gatheringModes: string[]
  // Routine priorities dialog - reason -> 0-100 priority, and which
  // AUTOMATIC routines (the ones with an enable checkbox) are on.
  merchantRoutinePriorities: Record<string, number>
  merchantAutomations: Record<string, boolean>
  // Merchant collection settings (merchant-collection-settings.tsx).
  threshold: number
  itemCollectionThreshold: number
  bankSortMode?: 'automatic' | 'request'
  // Farming/Hunting (farming-mode-control.tsx). `farmingPolicy` is the
  // account-wide CURRENT mode - unlike almost everything else here,
  // /farming-mode takes no `character` field, so this is one shared
  // value, not per-character (confirmed against the real route source,
  // runtime/coordinator/http/hunt-mode.ts). Monster focus IS per-
  // character, keyed by character name.
  farmingPolicy: string
  monsterFocusByCharacter: Record<string, string[]>
  monsterSearchRadiusByCharacter: Record<string, number>
  huntBlacklist: Record<string, HuntBlacklistEntry>
  huntSettings?: HuntSettings | null
  // Marketplace "manage WTB orders" (wtborder-dialog.tsx) - one standing
  // buy order per item id, automatically filled up to `price`.
  standBids: Record<string, StandBid>
  // Upgrade offering rules (upgrade-offering-controls.tsx) - "use a
  // Primling/Primordial Essence/Primordial X instead of scrolls" during
  // AUTOMATIC upgrades within a level range, independent of the item's
  // own upgrade-mark tier.
  upgradeOfferingRules: UpgradeOfferingRule[]
}

/** upgrade-offerings.ts's UpgradeOfferingRule, ported verbatim. `name` is
 *  the item's internal catalog id (e.g. "coat"), not its display name. */
export type UpgradeOffering = 'offeringp' | 'offering' | 'offeringx'
export const UPGRADE_OFFERING_LABELS: Record<UpgradeOffering, string> = {
  offeringp: 'Primling',
  offering: 'Primordial Essence',
  offeringx: 'Primordial X',
}
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

/** hunt-blacklist-label.ts's source entry - a monster currently skipped
 *  by Hunt mode, either automatically (deaths/expirations threshold) or
 *  manually. */
export interface HuntBlacklistEntry {
  monsterId: string
  at: number
  deaths: number
  reason: string
  expirations?: number
  characters?: string[]
  lastDeathAt?: number
}

/** hunt-settings-control.tsx's config - when Hunt mode should relocate to
 *  avoid a competing party, and when a monster should get auto-
 *  blacklisted (too many character deaths or quest expirations to it). */
export interface HuntSettings {
  relocateIfCompeting: boolean
  blacklistDeaths: boolean
  deathThreshold: number
  blacklistExpirations: boolean
  expirationThreshold: number
}

export const emptyPartyStateDynamic = (): PartyStateDynamic => ({
  merchantQueue: [],
  followers: {},
  restockPolicies: {},
  bestiaryCatalog: [],
  skillCatalog: [],
  combatLogs: {},
  merchantActivity: [],
  standListings: [],
  standSearch: emptyStandSearchState(),
  marked: {},
  merchantMarked: {},
  autoItemMarks: {},
  autoUpgradeMarks: {},
  bankboiPrefix: '',
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
  standBids: {},
  upgradeOfferingRules: [],
})

/** One raw in-game chat/system log line (game-log-filters.ts's GameLog) -
 *  fetched separately via ?section=logs, not part of the main dynamic-
 *  state poll. */
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
