import type { StandPriceHistory } from '@/lib/suggestedItemValue'
import type { Item, InventoryEntry, EquippedEntry } from './item'
import type { Sprite } from './sprite'
import type { CraftMaterial, ItemMeta, MerchantExchangeItem } from './itemDetail'
import type { Catalog as MonsterLocationCatalog } from '@/lib/farmingZones'

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
  // Surfaced by merchant-scheduling.ts's own recovery/retry loop (confirmed
  // against a live account: these fields already reach the client via
  // projectMerchantJob, which only ever strips aldataKey - they just
  // weren't modeled/shown before). A climbing recoveryAttempts with the
  // same lastDeferredReason for several minutes means the job is
  // genuinely stuck retrying, not just normally queued - see
  // MerchantQueueSection's stuckJob().
  recoveryAttempts?: number
  lastDeferredReason?: string
  firstDeferredAt?: number
  // Read by routineFor (merchant/routines.ts) to name the job's routine.
  manual?: boolean
  bidItemId?: string
  order?: unknown
  autoExchangeKeys?: string[]
  // merchant-job.tsx fields shown by the queue/job label (M1).
  operationStage?: string
  listings?: unknown[]
  seller?: string
  expectedItem?: Item
  retryAt?: number
  pauseReason?: string
  commandReport?: unknown
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

/** restock-controls.tsx's `defaults` - what the dashboard shows (and saves)
 *  for a character with no policy yet. */
export const defaultRestockPolicy = (): RestockPolicy => ({
  hp: { min: 5, max: 20, item: 'hpot1' },
  mp: { min: 0, max: 0, item: 'mpot1' },
})

/** Shared bank vault (bank-sheet.tsx's BankSnapshot) - packs keys are pack
 *  names like "items1"/"bank_b1"; each pack is a fixed-length list of
 *  entries, same empty-slot-preserving shape as a character's inventory. */
export interface BankSnapshot {
  gold: number
  packs: Record<string, (InventoryEntry | null)[]>
}

/** One bank pack's lock state (bank-unlock.ts / bank-sheet.tsx's BankVault) -
 *  every pack the account could ever have, locked or not. A pack is unlocked once
 *  it shows up as a key in BankSnapshot.packs; until then this describes what
 *  opens it: `floor === "bank"` packs open for `gold` alone once accessible, but
 *  a non-base floor's first (gold: 0) vault needs its `key` item owned and
 *  unlocked with `kind: "key"` before ANY vault on that floor (including that
 *  one) becomes accessible - see http/bank-unlock.ts's access(). */
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
  // bestiary-monster.ts: attack range and the raw G.monsters definition.
  range?: number
  definition?: Record<string, unknown>
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
  sprite?: Sprite | null
  // skill-entry.ts: the full G.skills definition.
  definition?: SkillDefinition & Record<string, unknown>
}

/** One activity-feed line (merchant-activity or combat log). */
export interface ActivityEntry {
  at: number
  message: string
  level?: string
  // combat-log-entry.ts: skill | kill | loot | death | item.
  type?: string
  details?: unknown
}

/** One of the merchant's own 16 stand listing slots (stand-sheet.tsx).
 *  `slot` is the merchant's own INVENTORY slot the item occupies while
 *  listed - distinct from `tradeSlot` (the stand UI position, unused).
 *  `bankPack`/`bankSlot` are set instead of `slot` when the listing was
 *  marked directly from a bank item rather than a carried one - this is
 *  how BankScreen tells whether a given bank slot is already listed. */
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

/** One public market listing from ALData or Ponty - real listings live
 *  under `aldata.listings`/`ponty.listings`, unified into this one shape.
 *  ALData's price is already per-unit; Ponty's `price` is the TOTAL for
 *  `quantity` (its own `unitPrice` is per-unit). */
export interface MarketListing {
  key?: string
  // Ponty listings can combine several underlying listings (ponty.ts).
  keys?: string[]
  // Where the PWA got it from - neither feed tags itself reliably
  // (Ponty listings carry no `source`), so MarketScreen sets this on merge.
  origin?: 'aldata' | 'ponty'
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
  // Publish/auth fields (aldata-state.tsx) - public market browsing needs neither; these only
  // matter for the merchant publishing their own listings to ALData.
  hasKey?: boolean
  auth?: 'NO' | 'YES' | 'CORRECT' | 'WRONG'
  publishStatus?: string
  error?: string | null
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

/** One pending NPC-sale mark (state.npcSaleMarks, a FLAT account-wide
 *  list, not keyed by character - filter by `source`/`character` to find
 *  the marks relevant to one). The item-action panel always sends
 *  `source: 'character'` (bank-side NPC sales are BankScreen's own
 *  `source: 'bank'` concern instead). */
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

/** One pending deconstruction mark (state.deconstructionMarks, also a
 *  flat account-wide list) - `state: 'complete'` means it's done and no
 *  longer worth badging, matching the dashboard's own filter. A bank-
 *  sourced mark (BankScreen's "Mark for deconstruction", not withdrawn
 *  first) has no meaningful top-level `slot` (-1) and identifies the
 *  item by `storage` instead - see bank-deconstruction.ts. */
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

/** One pending, one-time upgrade-pass mark (state.upgrades[character]) -
 *  distinct from autoUpgradeMarks' standing per-level-range rules: this is
 *  a live in-flight upgrade attempt on one specific item instance. `slot`
 *  is a number for an inventory item, the equipment slot name (string)
 *  when `equipped` is true. */
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
 *  under one id - see compound-group.tsx. */
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

/** One inventory slot's accumulated upgrade-roll evidence, mirrored from
 *  runtime/lucky-slot-tracking.ts's SlotRollStatistics - the server rotates
 *  automatic upgrades through the merchant's 42 slots and records where the
 *  underlying roll landed, since a handful of AL private-server slots carry
 *  a hidden bonus to upgrade success chance ("lucky slots"). Never a
 *  verified private-server fact by itself, just evidence for comparison. */
export interface SlotRollStatistics {
  totalRolls: number
  sumRolls: number
  rollsAbove96_3: number
  perfectRolls: number
}

/** One evidence stream's full slot table (state.luckySlotTracking[character]
 *  is a Record of these, keyed by an opaque stream id - each client/session
 *  keeps its own durable stream so restarts and multiple clients never
 *  double-count or drop rolls; aggregateSlotTracking sums them for display). */
export interface LuckySlotTracking {
  version: 1
  streamId?: string
  slots: Record<string, SlotRollStatistics>
}
export type LuckySlotStreams = Record<string, LuckySlotTracking>

/** One pending bank-withdrawal request, queued for a specific character
 *  (usually the merchant) to collect on their next bank visit - the wire
 *  source of truth `state.withdrawals` in the coordinator, distinct from
 *  BankMark. Requesting the SAME {pack,slot,item} again toggles it back
 *  off server-side (see transfer-commands.ts's removingWithdrawal) -
 *  there is no separate "unmark" request shape. */
export interface WithdrawalRequest {
  pack: string
  slot: number
  item: Item
}

/** deconstruction.ts's DeconstructionCatalog, keyed by internal item id -
 *  whether an item CAN be deconstructed at all (and, for compoundable
 *  items, that its level is > 0) is a real server-side rule, not
 *  something safe to assume for every item shown in the bank. */
export interface DeconstructionCatalogEntry {
  compound: boolean
  cost?: number
  rewards?: { name: string; quantity: number; chance: number }[]
}
export type DeconstructionCatalog = Record<string, DeconstructionCatalogEntry>

/** deconstruction.ts's deconstructionRewards, verbatim: recipe rolls are
 *  independent; compounded items return three items at one lower level. */
export function deconstructionRewards(item: Item, catalog: DeconstructionCatalog) {
  const definition = catalog[item.name]
  if (!definition) return null
  if (definition.compound && Number(item.level) > 0) return [{ name: item.name, level: Number(item.level) - 1, quantity: 3, chance: 1 }]
  return definition.rewards?.map((reward) => ({ ...reward, level: 0 })) || null
}

/** deconstruction.ts's canDeconstruct, ported verbatim. */
export function canDeconstruct(item: Item, catalog: DeconstructionCatalog): boolean {
  const entry = catalog[item.name]
  return !!entry && !item.l && !item.b && (!entry.compound || Number(item.level) > 0)
}

/** The rule-key format both autoItemMarks and autoUpgradeMarks use:
 *  "{item.name}@+{level or 0}" - see automatic-commerce-rule-key.ts. */
export const autoMarkRuleKey = (item: Item): string => `${item.name}@+${item.level ?? 0}`

/** automatic-commerce-rule-key.tsx, verbatim - the key autoStandMarks and
 *  autoNpcSales use. */
export const automaticCommerceRuleKey = (item: Item): string =>
  JSON.stringify({
    name: item.name,
    level: Math.max(0, Number(item.level) || 0),
    p: item.p || null,
    stat_type: item.stat_type || null,
  })

/** Whether a mark's own carried `item` still matches what's actually in
 *  that slot right now - ported from item-identity.ts's sameMarkedItem
 *  (name+level are the two fields that matter here; a quantity change on
 *  an otherwise-unchanged stack shouldn't invalidate a mark). A mark is
 *  only as fresh as the last state poll, and slot numbers get reused once
 *  the originally-marked item moves, gets consumed, or gets replaced -
 *  matching by slot number alone can badge a completely unrelated item
 *  (or an empty slot) as "marked". */
export function sameMarkedItem(markItem: Item, liveItem: Item): boolean {
  return markItem.name === liveItem.name && (markItem.level ?? 0) === (liveItem.level ?? 0)
}

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

/** One item queued to be hand-delivered to another character (state.
 *  merchantDeliveries[target], keyed by the RECIPIENT's name) - `slot` is
 *  the SENDER's inventory slot (always the merchant in practice; the
 *  item physically stays there, still visible/actionable, until the
 *  delivery actually happens), see transfer-commands.ts's `delivery()`. */
export interface MerchantDelivery {
  id: string
  slot: number
  item: Item
  equipOnDelivery?: boolean
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

/** realm-character.tsx */
export interface RealmCharacter {
  name: string
  ctype: string
  realm: string | null
  online: boolean
}

/** realm-operation.tsx - a realm switch (and optional home change) in progress. */
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

/** realm-control.tsx */
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
  // The leader's own effective monster focus (party-state.tsx's flat
  // field) - navigation/focus.ts's characterFocus() deliberately keeps
  // monsterFocusByCharacter[leader] empty (that's what followers/others
  // inherit from instead), so this is the fallback CharacterDetailScreen
  // needs for the leader's own screen - see connected-character-card.tsx's
  // `monsterFocusByCharacter?.[char.name] || selectedFocus`.
  monsterFocus?: string[]
  restockPolicies: Record<string, RestockPolicy>
  bank?: BankSnapshot | null
  // Every bank pack the account could ever have, locked or not (see BankVault) - locked ones
  // aren't in `bank.packs` yet.
  bankVaults: BankVault[]
  bestiaryCatalog: BestiaryMonster[]
  // Spawn-area geometry for farmingAreas.ts (farming-area-picker.tsx's port) -
  // a SEPARATE catalog from bestiaryCatalog's own spawnRecords (confirmed
  // against the real coordinator source, status/catalogs.ts/public-state.ts:
  // both are sent alongside each other, same `section=catalog` channel).
  monsterChoices: MonsterLocationCatalog
  // Saved Phoenix 5-region search order (state.phoenixRouteOrder).
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
  // Pending bank-withdrawal requests, keyed by the character who will
  // collect them (usually the merchant) - see WithdrawalRequest.
  withdrawals: Record<string, WithdrawalRequest[]>
  deconstructionCatalog: DeconstructionCatalog
  // Both keyed by character, then by autoMarkRuleKey(item).
  autoItemMarks: Record<string, Record<string, string>>
  autoUpgradeMarks: Record<string, Record<string, unknown>>
  // Pending one-time inventory marks (not standing rules) - see UpgradeMark/
  // CompoundGroup/StatScrollMark above.
  upgrades: Record<string, UpgradeMark[]>
  compounds: Record<string, CompoundGroup[]>
  statScrolls: Record<string, StatScrollMark[]>
  // Flat, account-wide (not keyed by character) - see NpcSaleMark/DeconstructionMark above.
  npcSaleMarks: NpcSaleMark[]
  deconstructionMarks: DeconstructionMark[]
  // Keyed by the RECIPIENT's name - see MerchantDelivery above.
  merchantDeliveries: Record<string, MerchantDelivery[]>
  // Lucky-upgrade-slot evidence, both keyed by character - see
  // SlotRollStatistics/LuckySlotTracking above. luckyUpgradeSlots holds
  // the inferred/verified slot number once confidence is high enough.
  luckyUpgradeSlots: Record<string, number>
  luckySlotTracking: Record<string, LuckySlotStreams>
  bankboiPrefix: string
  // "Send anniversary chat message when receiving cake from a kiss" (anniversary-dialog.tsx).
  anniversaryAutoChat: boolean
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
  // BankScreen's own one-shot "sort on next visit" trigger (bank-sort-control.tsx), distinct from
  // bankSortMode's standing automatic/on-request choice - only relevant while mode is "request".
  bankSortRequest?: { id: string; status: 'queued' | 'sorting' | 'retry'; message?: string } | null
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
  // The party's current Hunt quest (coordinator's HuntCycle) - which monster
  // it's chasing right now and for which member. Already arrives in the same
  // state?section=core poll this app already fetches (confirmed against the
  // real coordinator source), just never modeled before now.
  monsterHunt?: MonsterHuntCycle | null
  // Per-character Hunt quest assignment - see MonsterHuntStatus. Keyed by character name.
  characterHunt: Record<string, MonsterHuntStatus | null>
  farmAreaState?: FarmAreaState | null
  // Keyed by character name - see resolveFarmingContext. There is only one
  // account `leader`; the leader's OWN effective policy/blacklist/hunt/area
  // are always the simple top-level fields above, never a profile entry.
  // A character that follows the leader also uses those same top-level
  // fields. Every OTHER character (not the leader, not following) runs
  // independently and has its own entry here instead.
  farmingProfiles: Record<string, FarmingProfile>
  // Marketplace "manage WTB orders" (wtborder-dialog.tsx) - one standing
  // buy order per item id, automatically filled up to `price`.
  standBids: Record<string, StandBid>
  // Upgrade offering rules (upgrade-offering-controls.tsx) - "use a
  // Primling/Primordial Essence/Primordial X instead of scrolls" during
  // AUTOMATIC upgrades within a level range, independent of the item's
  // own upgrade-mark tier.
  upgradeOfferingRules: UpgradeOfferingRule[]
  // The configured merchant (party-state.tsx) - config section only. Never
  // infer the merchant from character class; bankbois are merchants too.
  merchantCharacter?: string | null
  // Shared merchant rules (inventory/shared-rules.ts's SharedRules) - when
  // present, rules are owned by `owner` for every name in `members`.
  merchantRules?: SharedRules | null
  // Full entries (with items) only arrive from section=bank&dashboard=1;
  // section=core carries item-less summaries (public-state.ts bankboiSummaries).
  bankbois: Bankboi[]
  bankboiQueue?: { id: string; item: Item; state: string; bootstrap?: boolean }[]
  buyUpgradeBatchSize?: number

  // ---- F6: the rest of party-state.tsx's PartyState, typed as the
  // dashboard does where the shape is simple; `unknown` where it imports a
  // deep runtime type - the package that renders a field ports its shape.
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

/** inventory/shared-rules.ts's SharedRules (conflicts kept opaque until the
 *  rule-conflict panel is ported). */
export interface SharedRules {
  version: 1
  owner: string
  members: string[]
  backup?: unknown
  conflicts: unknown[]
}

/** bankboi.tsx's Bankboi. `items`/`slots` are absent on core's summaries. */
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
/** Minimal slice of the coordinator's HuntCycle worth showing - the full
 *  type carries a lot of internal travel/recovery bookkeeping no screen
 *  needs. */
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

/** One character's own Hunt quest assignment - party-console's
 *  monster-hunt-status.tsx, ported. Arrives via characterDetails in the
 *  state?section=core&dashboard=1 poll (diagnosticCharacters already
 *  allowlists `monsterHunt` there - this app just wasn't requesting the
 *  dashboard-shaped payload that carries it before now). */
export interface MonsterHuntStatus {
  id: string | null
  count: number
  remainingMs: number | null
  server: string | null
}
/** farmAreaState's real shape (party-state.tsx) - was too narrow before (just `paused`). */
export interface FarmAreaState {
  message?: string
  paused?: boolean
  active?: { map: string; x: number; y: number; monsterIds?: string[] }
}

/** state.farmingProfiles[name] - one non-leader, non-following character's
 *  own independent farming policy/blacklist/hunt/area, kept separate from
 *  the account's simple top-level fields (which only ever reflect the
 *  leader's own settings) - see resolveFarmingContext below, ported from
 *  party-console's farming-context.ts. */
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

/** hunt-settings-control.tsx's config - when Hunt mode should relocate to
 *  avoid a competing party, and when a monster should get auto-
 *  blacklisted (too many character deaths or quest expirations to it). */
export interface HuntSettings {
  // hunt/spawn-preferences.ts - preferred spawn per monster (C2).
  preferredSpawns?: Record<string, string>
  relocateIfCompeting: boolean
  blacklistDeaths: boolean
  deathThreshold: number
  blacklistExpirations: boolean
  expirationThreshold: number
}

/** What a character's farming setup ACTUALLY is right now - ported verbatim
 *  from party-console's farming-context.ts. The leader's own effective
 *  policy/blacklist/hunt/area always live in the simple top-level fields,
 *  and a character following the leader inherits those same top-level
 *  fields too. Everyone else (not the leader, not following) runs
 *  independently, so their effective values come from their own
 *  farmingProfiles entry instead. `savedMode` is what THIS character
 *  personally selected (or inherited by simply being the leader);
 *  `effectiveMode` is what's actually running right now. */
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

/** One character's entry in core's `characterDetails` - the allow-list in
 *  runtime/coordinator/telemetry/public-state-characters.ts
 *  (diagnosticCharacters). Only present for characters in active slots, so
 *  a missing field means "unknown", never 0. */
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

/** active-slot.tsx */
export interface ActiveSlot {
  index: number
  kind: 'native' | 'headless'
  primary?: boolean
  character: string | null
  state: 'empty' | 'starting' | 'online' | 'stopping' | 'offline' | 'failed'
}

/** steam-switch.tsx - a Steam handoff in progress. */
export interface SteamSwitch {
  from: string | null
  target: string | null
  startedAt: number
  timedOut: boolean
  phase?: 'awaiting-realm-choice' | 'preparing' | 'release' | 'confirm-release' | 'navigate' | 'complete' | 'failed'
  error?: string | null
}

/** runtime/roster/connection-status.ts CharacterConnection. */
export interface CharacterConnection {
  name: string
  primary?: boolean
  error?: string | null
  since: number
  seenAt: number
  status: 'loading' | 'code' | 'stopped' | 'waiting' | 'connected' | 'lost'
  delayed: boolean
}

/** appearance-choice.tsx - one of a class's starting looks. */
export interface AppearanceChoice {
  index: number
  html?: string | null
  layers?: unknown[]
}
