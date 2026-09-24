package com.partyconsole.companion.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** Mirrors party-console's MerchantJob type (dashboard/features/party/merchant-job.tsx),
 *  trimmed to what the queue widget displays (see merchant-job-label.ts for
 *  how routine/reason/order become the human label shown per row - this
 *  app derives its own short label from the same fields rather than
 *  porting that whole lookup table for v1). Everything nullable/defaulted:
 *  a job's shape varies a lot by what kind of errand it is. */
@Serializable
data class MerchantJob(
    val id: String? = null,
    val target: String,
    val reason: String,
    val routine: String? = null,
    val priority: Int? = null,
    val phase: String? = null,
    val realmBlockedReason: String? = null,
    val realmRetryExhausted: Boolean = false,
)

/** One HP or MP auto-potion threshold - see restock-policy.tsx. */
@Serializable
data class RestockRange(
    val min: Int = 0,
    val max: Int = 0,
    val item: String? = null,
)

/** A character's restock policy (restock-controls.tsx) - defaults to a
 *  zeroed range rather than requiring both hp/mp, since a character with
 *  no policy saved yet should still render (as "0/0", editable from
 *  there) instead of vanishing from RestockSection entirely. */
@Serializable
data class RestockPolicy(
    val hp: RestockRange = RestockRange(),
    val mp: RestockRange = RestockRange(),
)

/** Shared bank vault (bank-sheet.tsx's BankSnapshot) - packs keys are pack
 *  names like "items1"/"bank_b1"; each pack is a fixed-length list of
 *  entries, same empty-slot-preserving shape as a character's inventory. */
@Serializable
data class BankSnapshot(
    val gold: Long = 0,
    val packs: Map<String, List<InventoryEntry?>> = emptyMap(),
)

/** One drop-table entry within a BestiaryMonster - `rate` is the chance
 *  per kill (e.g. 0.0002 = 0.02%). */
@Serializable
data class BestiaryDrop(
    val id: String,
    val name: String,
    val rate: Double = 0.0,
    val quantity: Int = 1,
    val sprite: Sprite? = null,
)

/** bestiary-dialog.tsx's monster reference entry. `definition` (raw skill/
 *  achievement data) stays untyped/unsurfaced for v1 - drops are the
 *  concrete, actionable data players actually look this screen up for. */
@Serializable
data class BestiaryMonster(
    val id: String,
    val name: String,
    val hp: Long = 0,
    val attack: Long = 0,
    val xp: Long = 0,
    val threat: Double = 0.0,
    val drops: List<BestiaryDrop> = emptyList(),
)

/** skills-dialog.tsx's per-class skill list. */
@Serializable
data class SkillClass(
    val id: String,
    val name: String,
    val skills: List<SkillEntry> = emptyList(),
)

/** Only the human-readable fields this app's Skills screen shows - the
 *  real `definition` object varies a lot per skill (buffs/summons/etc
 *  carry very different fields), these are the ones common enough to be
 *  worth a fixed field each. */
@Serializable
data class SkillDefinition(
    val explanation: String? = null,
    val range: Double? = null,
    val mp: Int? = null,
    val cooldown: Long? = null,
    val level: Int? = null,
)

@Serializable
data class SkillEntry(
    val id: String,
    val name: String,
    val definition: SkillDefinition? = null,
)

/** One activity-feed line (merchant-activity or combat log) - shared shape
 *  across both per merchant-card-controls.tsx / combat log readers. */
@Serializable
data class ActivityEntry(
    val at: Long = 0,
    val message: String = "",
    val level: String? = null,
    val details: JsonElement? = null,
)

/** One of the merchant's own 16 stand listing slots (stand-sheet.tsx).
 *  `slot` is the merchant's own INVENTORY slot the item occupies while
 *  listed (needed to remove the listing via PartyApiClient.markForStand
 *  with remove=true) - distinct from `tradeSlot` (the stand UI position,
 *  not modeled here since nothing in this app needs it yet). */
@Serializable
data class StandListing(
    val id: String? = null,
    val slot: Int? = null,
    val item: Item,
    val price: Long = 0,
    val quantity: Int = 1,
)

/** One public market listing from ALData or Ponty (stand-sheet.tsx's
 *  market tab) - confirmed against the real GET /party-api/state payload
 *  (there is no flat top-level "marketListings" field, the Phase-3
 *  assumption that one existed was wrong - real listings live under
 *  `aldata.listings` and `ponty.listings`, unified into this one shape
 *  since both are "someone selling an item for a price" at heart).
 *  ALData's price is already per-unit; Ponty's `price` is the TOTAL for
 *  `quantity` (its own `unitPrice` is the per-unit figure) - `unitPrice`
 *  is nullable so callers can prefer it when present, matching how each
 *  source actually reports it rather than assuming one convention. */
@Serializable
data class MarketListing(
    val key: String? = null,
    val source: String? = null,
    val seller: String? = null,
    val item: Item,
    val price: Long = 0,
    val unitPrice: Long? = null,
    val quantity: Int = 1,
)

/** One live "someone's stand is open nearby" result from a stand search -
 *  a different, more transient source than ALData/Ponty's aggregated
 *  market snapshots (player-stand-market-dialog.tsx). Buying one requires
 *  echoing these exact fields back so the coordinator can re-match the
 *  same physical listing (see PartyApiClient.buyFromStand). */
@Serializable
data class StandSearchListing(
    val seller: String,
    val slot: String,
    val rid: String? = null,
    val item: Item,
    val price: Long = 0,
    val quantity: Int = 1,
    val map: String? = null,
    val x: Double? = null,
    val y: Double? = null,
)

@Serializable
data class StandSearchState(
    val status: String = "idle",
    val itemId: String? = null,
    val listings: List<StandSearchListing> = emptyList(),
    val error: String? = null,
)

@Serializable
data class AlDataState(
    val listings: List<MarketListing> = emptyList(),
)

@Serializable
data class PontyState(
    val listings: List<MarketListing> = emptyList(),
)

/** One tile within a shared sprite sheet (e.g. items/pack_20vt8.png) - x/y
 *  are grid COLUMN/ROW indices, not pixel offsets. `tileSize` (the
 *  sheet's real native pixel size per tile) matters for rendering: asking
 *  Coil to decode the whole sheet pre-scaled up to an arbitrary display
 *  size (size*columns, which for a 64-row sheet at a 56dp tile is a
 *  ~3584dp decode target) risks a silent OOM/decode-limit failure that
 *  looks exactly like "icon slot with nothing in it" - rendering at the
 *  sheet's own native size and scaling the already-decoded bitmap avoids
 *  that (see ui/itemicon/SpriteIcon.kt). */
@Serializable
data class Sprite(
    val url: String,
    val tileSize: Int = 20,
    val columns: Int,
    val rows: Int,
    val x: Int,
    val y: Int,
)

/** merchantCatalog.allItems - browsing (CatalogScreen), icon/display-name
 *  lookup (item.name on a live inventory/equipment entry matches `id`
 *  here, NOT `name` - the catalog's `name` is the human-readable display
 *  name, `id` is the internal identifier every live item instance
 *  actually carries as its own `.name`), and the full item-details view
 *  (ui/itemdetail/ItemDetailBrowser.kt) via `meta`. */
@Serializable
data class CatalogItem(
    val id: String,
    val name: String,
    val upgradeable: Boolean = false,
    val compoundable: Boolean = false,
    val maxLevel: Int? = null,
    val sprite: Sprite? = null,
    val meta: ItemMeta? = null,
)

@Serializable
data class MerchantCatalog(
    val allItems: List<CatalogItem> = emptyList(),
    // NPC exchange/box tables - matched against an item by id+level to
    // build the item-details "Exchange price"/"reward"/"Reward in"
    // sections (see ItemFormulas.exchangeSections).
    val exchangeable: List<MerchantExchangeItem> = emptyList(),
)

/** One entry in `marked`/`merchantMarked` (bank/merchant hold marks) -
 *  slot-based, one specific item instance, as opposed to autoItemMarks'
 *  item-identity-keyed standing rules. `auto` distinguishes a rule-
 *  generated mark (shown as "Auto bank"/"Auto merchant") from a manual
 *  one-off mark (shown as "Mark for bank"/"Mark for merchant"). */
@Serializable
data class BankMark(
    val slot: Int,
    val item: Item,
    val auto: Boolean = false,
)

/** The rule-key format both autoItemMarks and autoUpgradeMarks use:
 *  "{item.name}@+{level or 0}" - see automatic-commerce-rule-key.ts. */
fun autoMarkRuleKey(item: Item): String = "${item.name}@+${item.level ?: 0}"

/** Parses a rule key (see autoMarkRuleKey) back into a displayable Item -
 *  used when a collection is keyed by rule string rather than holding a
 *  real Item (autoItemMarks, autoUpgradeMarks). */
fun itemFromRuleKey(ruleKey: String): Item {
    val parts = ruleKey.split("@+")
    return Item(name = parts.getOrElse(0) { ruleKey }, level = parts.getOrNull(1)?.toIntOrNull())
}

/** One entry in the flat, account-wide autoNpcSales map - `character`
 *  distinguishes a per-character rule from the merchant's own (absent
 *  character = merchant), matching inventory-panel.tsx's
 *  `!rule.character` check for "is this the merchant's own rule". */
@Serializable
data class AutoNpcSaleRule(
    val item: Item,
    val character: String? = null,
)

/** One entry in the flat autoStandMarks map - merchant-only. */
@Serializable
data class AutoStandRule(
    val item: Item,
    val price: Long = 0,
)

@Serializable
data class AutoDeconstructionRule(
    val item: Item,
)

/** One entry in a character's autoCompounds list - `name` only (no
 *  level: compound rules aren't level-specific the way upgrade/bank/
 *  merchant rules are, since compounding advances an item's own level
 *  automatically toward targetTier). */
@Serializable
data class AutoCompoundRule(
    val name: String,
    val targetTier: Int = 1,
    val quantity: Int = -1,
)

/** One preset map location the "Send to..." picker offers (travelPlaces) -
 *  `id` is the map name POST /party-api/command's character-travel
 *  command expects. */
@Serializable
data class TravelPlace(
    val id: String,
    val name: String,
    val x: Double = 0.0,
    val y: Double = 0.0,
)

/** One selectable Adventure Land realm/server option (realm-control's
 *  realms list) - `key` is what POST /party-api/realm/switch expects. */
@Serializable
data class RealmOption(
    val key: String,
    val label: String,
    val players: Int = 0,
    val pvp: Boolean = false,
)

/** realmControl - current/home realm plus the full switchable list. */
@Serializable
data class RealmControl(
    val activeRealm: String? = null,
    val homeRealm: String? = null,
    val realms: List<RealmOption> = emptyList(),
)

/** The slice of GET /party-api/state that changes often enough to poll
 *  (merchant errands, party formation, restock policy, bank/bestiary/
 *  skills/logs/stand/market for the account-wide screens) rather than
 *  fetch once like the roster - see PartyRepository.pollDynamicState.
 *  `followers` mirrors party-workspace.tsx's `state.followers?.[name]`
 *  map: character name -> is this character following the leader. */
@Serializable
data class PartyStateDynamic(
    val merchantCurrent: MerchantJob? = null,
    val merchantQueue: List<MerchantJob> = emptyList(),
    val leader: String? = null,
    val followers: Map<String, Boolean> = emptyMap(),
    val restockPolicies: Map<String, RestockPolicy> = emptyMap(),
    val bank: BankSnapshot? = null,
    val bestiaryCatalog: List<BestiaryMonster> = emptyList(),
    val skillCatalog: List<SkillClass> = emptyList(),
    val combatLogs: Map<String, List<ActivityEntry>> = emptyMap(),
    val merchantActivity: List<ActivityEntry> = emptyList(),
    val standListings: List<StandListing> = emptyList(),
    val aldata: AlDataState? = null,
    val ponty: PontyState? = null,
    val merchantCatalog: MerchantCatalog? = null,
    val standSearch: StandSearchState = StandSearchState(),
    val marked: Map<String, List<BankMark>> = emptyMap(),
    val merchantMarked: Map<String, List<BankMark>> = emptyMap(),
    // Both keyed by character, then by autoMarkRuleKey(item).
    val autoItemMarks: Map<String, Map<String, String>> = emptyMap(),
    val autoUpgradeMarks: Map<String, Map<String, JsonElement>> = emptyMap(),
    val bankboiPrefix: String = "",
    val realmControl: RealmControl? = null,
    // How much gold each character should carry - the merchant's own bank
    // errands automatically deposit the excess or withdraw the shortfall
    // to match this during normal trips. There is no manual "withdraw
    // gold" action anywhere in party-console itself; this target is the
    // real, only mechanism for moving gold between a character and the
    // bank (see runtime/coordinator/inventory/upgrade-commands.ts's
    // "gold-target" command).
    val goldTargets: Map<String, Long> = emptyMap(),
    // Flat/account-wide (not nested per character - see AutoNpcSaleRule/
    // AutoStandRule docs). Keys are opaque identity strings this app
    // never needs to parse (only the values matter for display/removal).
    val autoNpcSales: Map<String, AutoNpcSaleRule> = emptyMap(),
    val autoStandMarks: Map<String, AutoStandRule> = emptyMap(),
    // Per character, then by rule key (see itemFromRuleKey).
    val autoDeconstruction: Map<String, Map<String, AutoDeconstructionRule>> = emptyMap(),
    val autoCompounds: Map<String, List<AutoCompoundRule>> = emptyMap(),
    val travelPlaces: List<TravelPlace> = emptyList(),
)

/** One raw in-game chat/system log line (game-log-filters.ts's GameLog) -
 *  fetched separately via ?section=logs, not part of the main dynamic-
 *  state poll (see PartyRepository.pollGameLogs). */
@Serializable
data class GameLogEntry(
    val session: String? = null,
    val seq: Long = 0,
    val at: Long = 0,
    val message: String = "",
    val color: String? = null,
    val category: String? = null,
)

@Serializable
data class PartyStateGameLogs(
    val gameLogs: Map<String, List<GameLogEntry>> = emptyMap(),
)
