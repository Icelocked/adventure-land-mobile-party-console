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
    // Defaulted: one malformed job must not fail the whole state decode.
    val target: String = "",
    val reason: String = "",
    val routine: String? = null,
    // routines.ts routineFor inputs.
    val manual: Boolean? = null,
    val bidItemId: String? = null,
    val order: JsonElement? = null,
    val autoExchangeKeys: List<String> = emptyList(),
    // merchant-card-controls.tsx: stuck detection, labels and status.
    val recoveryAttempts: Int? = null,
    val lastDeferredReason: String? = null,
    val firstDeferredAt: Long? = null,
    val operationStage: String? = null,
    val listings: List<JsonElement> = emptyList(),
    val seller: String? = null,
    val expectedItem: Item? = null,
    val retryAt: Long? = null,
    val pauseReason: String? = null,
    val commandReport: JsonElement? = null,
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
    // restock-controls.tsx defaults, the same as the server's.
    val hp: RestockRange = RestockRange(min = 5, max = 20),
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

/** One bank pack's lock state (http/bank-unlock.ts / bank-sheet.tsx's BankVault) - every
 *  pack the account could ever have, locked or not. A pack is unlocked once it shows up as
 *  a key in BankSnapshot.packs; until then this describes what opens it: `floor == "bank"`
 *  packs open for `gold` alone once accessible, but a non-base floor's first (gold = 0)
 *  vault needs its own `key` item owned and unlocked with kind "key" before ANY vault on
 *  that floor (including that one) becomes accessible - see bank-unlock.ts's access(). */
@Serializable
data class BankVaultKey(
    val id: String,
    val name: String? = null,
    val sprite: Sprite? = null,
)

@Serializable
data class BankVault(
    val pack: String,
    val floor: String,
    val gold: Long = 0,
    val shells: Long = 0,
    val key: BankVaultKey? = null,
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

/** One entry in a BestiaryMonster's spawnRecords - a real map location
 *  this monster spawns at, confirmed against a live GET /party-api/state
 *  capture (farming-area-picker.tsx's `farmingAreas()` groups these same
 *  records client-side using a separate static lib/farming-areas.ts data
 *  file this app doesn't port - picking a plain spawn record directly is
 *  simpler and uses only server-sourced data). */
@Serializable
data class MonsterSpawnRecord(
    val map: String,
    val mapName: String? = null,
    val x: Double = 0.0,
    val y: Double = 0.0,
    val count: Int? = null,
    val boundary: List<Double>? = null,
    val restrictions: List<String> = emptyList(),
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
    val sprite: Sprite? = null,
    val drops: List<BestiaryDrop> = emptyList(),
    val spawnRecords: List<MonsterSpawnRecord> = emptyList(),
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
data class BankSortRequest(
    val id: String,
    val status: String,
    val message: String? = null,
)

@Serializable
data class StandListing(
    val id: String? = null,
    val slot: Int? = null,
    // Set for a listing sold straight from the bank (pack and its slot).
    val bankPack: String? = null,
    val bankSlot: Int? = null,
    val item: Item,
    val price: Long = 0,
    val quantity: Int = 1,
    // Which stand slot (trade1..16) it occupies, and live | paused | queued.
    val tradeSlot: String? = null,
    val state: String? = null,
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
    // use-panel-model.ts standMarketCount: fresh, non-PVP listings only.
    val seenAt: Long? = null,
    val serverIdentifier: String? = null,
    val serverRegion: String? = null,
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
    // Publish/auth fields (aldata-state.tsx) - public market browsing needs neither; these only
    // matter for the merchant publishing their own listings to ALData.
    val hasKey: Boolean = false,
    val auth: String? = null,
    val publishStatus: String? = null,
    val error: String? = null,
)

@Serializable
data class PontyState(
    val listings: List<MarketListing> = emptyList(),
)

/** One tile within a shared sprite sheet (e.g. items/pack_20vt8.png) - x/y
 *  are grid COLUMN/ROW indices, not pixel offsets. `tileSize` is carried
 *  through because the server sends it, but ui/itemicon/SpriteIcon.kt
 *  deliberately does NOT use it for crop math: it's only reliable for
 *  item sheets (confirmed this session - raw_items.png really is
 *  400x800px, exactly tileSize=20 * columns=20/rows=40), not for monster
 *  sheets (monster2.png is really 720x512px, while tileSize=1 with
 *  columns=12/rows=8 would imply 12x8). SpriteIcon instead derives the
 *  real tile size from the loaded bitmap's own dimensions divided by
 *  columns/rows, which is correct for both. */
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

/** merchantCatalog.buyable - NPC-purchasable items, including the
 *  compound scrolls ("cscroll0".."cscroll3") whose real prices
 *  ItemFormulas.compoundPassCost looks up by id. */
@Serializable
data class MerchantBuyItem(
    val id: String,
    val name: String,
    val cost: Long,
    val seller: String? = null,
    val sprite: Sprite? = null,
    val upgradeable: Boolean = false,
    val compoundable: Boolean = false,
    val upgradeGrade: Int? = null,
    val grades: List<Int>? = null,
    val upgradeChances: List<Double>? = null,
    val scrollCosts: List<Long>? = null,
)

/** merchantCatalog.craftable - recipes buyable via the merchant crafting
 *  workflow (MerchantCommerceScreen "craft" mode). */
@Serializable
data class MerchantCraftRecipe(
    val id: String,
    val name: String,
    val cost: Long,
    val sprite: Sprite? = null,
    val materials: List<CraftMaterial> = emptyList(),
)

@Serializable
data class MerchantCatalog(
    val allItems: List<CatalogItem> = emptyList(),
    val buyable: List<MerchantBuyItem> = emptyList(),
    val craftable: List<MerchantCraftRecipe> = emptyList(),
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
    // Where the party actually is (activeRealm is where the coordinator aims it).
    val currentRealm: String? = null,
    val homeRealm: String? = null,
    val split: Boolean = false,
    val characters: List<RealmCharacter> = emptyList(),
    val realms: List<RealmOption> = emptyList(),
    val operation: RealmOperation? = null,
)

@Serializable
data class RealmCharacter(
    val name: String,
    val realm: String? = null,
)

/** realm-operation.tsx - a realm switch (and optional home change) in progress. */
@Serializable
data class RealmOperation(
    val phase: String = "",
    val realm: String? = null,
    val error: String? = null,
    val characters: List<RealmCharacter> = emptyList(),
)

/** upgrade-offerings.ts's table of the 3 offering item ids -> display
 *  name, ported verbatim. */
val UPGRADE_OFFERING_LABELS: Map<String, String> = linkedMapOf(
    "offeringp" to "Primling",
    "offering" to "Primordial Essence",
    "offeringx" to "Primordial X",
)

/** upgrade-offerings.ts's UpgradeOfferingRule, ported verbatim. `name` is
 *  the item's internal catalog id (e.g. "coat"), not its display name. */
@Serializable
data class UpgradeOfferingRule(
    val id: String,
    val name: String,
    val floor: Int,
    val ceiling: Int,
    val offering: String,
    val required: Boolean,
)

@Serializable
data class StandBid(
    val revision: Int? = null,
    val price: Long = 0,
    val quantity: Int = 1,
    val minimumQuality: Int? = null,
    val priorityOverride: Int? = null,
    val useStandSlot: Boolean? = null,
    val acceptHigherLevels: Boolean? = null,
)

/** hunt-blacklist-label.ts's source entry - a monster currently skipped
 *  by Hunt mode, either automatically (deaths/expirations threshold) or
 *  manually. */
@Serializable
data class HuntBlacklistEntry(
    val monsterId: String,
    val at: Long,
    val deaths: Int = 0,
    val reason: String = "",
    val expirations: Int? = null,
    val characters: List<String> = emptyList(),
    val lastDeathAt: Long? = null,
)

/** hunt-settings-control.tsx's config - when Hunt mode should relocate to
 *  avoid a competing party, and when a monster should get auto-
 *  blacklisted (too many character deaths or quest expirations to it). */
@Serializable
data class HuntSettings(
    // runtime/coordinator/hunt/settings.ts defaultHuntSettings.
    val relocateIfCompeting: Boolean = true,
    val blacklistDeaths: Boolean = true,
    val deathThreshold: Int = 1,
    val blacklistExpirations: Boolean = true,
    val expirationThreshold: Int = 1,
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
