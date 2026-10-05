package com.partyconsole.companion.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** One merchant queue job, trimmed to what the queue widget shows.
 *  Everything is nullable/defaulted: a job's shape varies a lot by errand. */
@Serializable
data class MerchantJob(
    val id: String? = null,
    // Defaulted: one malformed job must not fail the whole state decode.
    val target: String = "",
    val reason: String = "",
    val routine: String? = null,
    // Inputs for working out which routine a job belongs to.
    val manual: Boolean? = null,
    val bidItemId: String? = null,
    val order: JsonElement? = null,
    val autoExchangeKeys: List<String> = emptyList(),
    // Stuck detection, labels and status.
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

/** One HP or MP auto-potion threshold. */
@Serializable
data class RestockRange(
    val min: Int = 0,
    val max: Int = 0,
    val item: String? = null,
)

/** A character's restock policy. Defaulted so a character with no saved
 *  policy still renders and can be edited. */
@Serializable
data class RestockPolicy(
    // Same defaults as the server.
    val hp: RestockRange = RestockRange(min = 5, max = 20),
    val mp: RestockRange = RestockRange(),
)

/** Shared bank. `packs` keys are pack names like "items1"; each pack is a
 *  fixed-length slot list with nulls for empty slots, like an inventory. */
@Serializable
data class BankSnapshot(
    val gold: Long = 0,
    val packs: Map<String, List<InventoryEntry?>> = emptyMap(),
)

/** Lock state for every bank pack the account could have. A pack is
 *  unlocked once it appears in [BankSnapshot.packs]. Base-floor ("bank")
 *  packs open for `gold`; on other floors the first (gold = 0) vault needs
 *  its `key` item before any vault on that floor is accessible. */
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

/** A map location where a [BestiaryMonster] spawns. */
@Serializable
data class MonsterSpawnRecord(
    val sourceMap: String = "",
    val map: String,
    val mapName: String? = null,
    val x: Double? = null,
    val y: Double? = null,
    val count: Int? = null,
    val boundary: List<Double>? = null,
    val restrictions: List<String> = emptyList(),
)

/** A bestiary monster entry. */
@Serializable
data class BestiaryMonster(
    val id: String,
    val name: String,
    val hp: Long = 0,
    val attack: Long = 0,
    val xp: Long = 0,
    val threat: Double = 0.0,
    // Attack range and the raw G.monsters definition.
    val range: Double? = null,
    val definition: kotlinx.serialization.json.JsonObject? = null,
    val sprite: Sprite? = null,
    val drops: List<BestiaryDrop> = emptyList(),
    val spawnRecords: List<MonsterSpawnRecord> = emptyList(),
)

/** One class's skill list. */
@Serializable
data class SkillClass(
    val id: String,
    val name: String,
    val skills: List<SkillEntry> = emptyList(),
)

@Serializable
data class SkillEntry(
    val id: String,
    val name: String,
    val sprite: Sprite? = null,
    // The full G.skills definition.
    val definition: kotlinx.serialization.json.JsonObject? = null,
)

/** One merchant-activity or combat-log line. */
@Serializable
data class ActivityEntry(
    val at: Long = 0,
    val message: String = "",
    val level: String? = null,
    // Combat log: skill | kill | loot | death | item.
    val type: String? = null,
    val details: JsonElement? = null,
)

@Serializable
data class BankSortRequest(
    val id: String,
    val status: String,
    val message: String? = null,
)

/** One of the merchant's 16 stand listings. `slot` is the merchant's
 *  inventory slot holding the item, distinct from `tradeSlot`. */
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

/** One public ALData or Ponty listing, unified from `aldata.listings` and
 *  `ponty.listings`. ALData's `price` is per unit; Ponty's is the total for
 *  `quantity`, with `unitPrice` the per-unit figure - prefer `unitPrice`
 *  when present. */
@Serializable
data class MarketListing(
    val key: String? = null,
    val source: String? = null,
    val seller: String? = null,
    val item: Item,
    val price: Long = 0,
    val unitPrice: Long? = null,
    val quantity: Int = 1,
    // Used to count only fresh, non-PVP listings.
    val seenAt: Long? = null,
    val serverIdentifier: String? = null,
    val serverRegion: String? = null,
)

/** One live stand-search result. Buying echoes these fields back so the
 *  coordinator can re-match the same listing. */
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

/** ALData market state. Rows stay as raw JSON because a purchase or sale
 *  echoes the listing back; domain/Market.kt reads them. */
@Serializable
data class AlDataState(
    val listings: List<kotlinx.serialization.json.JsonObject> = emptyList(),
    val buyOrders: List<kotlinx.serialization.json.JsonObject> = emptyList(),
    // Other owners' published trade intentions (classifieds).
    val trades: List<kotlinx.serialization.json.JsonObject> = emptyList(),
    val merchantsUpdatedAt: Long? = null,
    // Only used when publishing the merchant's own listings to ALData.
    val hasKey: Boolean = false,
    val auth: String? = null,
    val publishStatus: String? = null,
    val error: String? = null,
)

@Serializable
data class PontyState(
    val listings: List<kotlinx.serialization.json.JsonObject> = emptyList(),
    val error: String? = null,
)

/** One tile in a sprite sheet; x/y are column/row indices, not pixels.
 *  `tileSize` is unreliable for monster sheets (monster2.png is 720x512 but
 *  reports tileSize=1), so SpriteIcon derives the tile size from the
 *  bitmap's dimensions and columns/rows instead. */
@Serializable
data class Sprite(
    val url: String,
    val tileSize: Int = 20,
    val columns: Int,
    val rows: Int,
    val x: Int,
    val y: Int,
)

/** merchantCatalog.allItems entry. A live item's `name` matches `id` here;
 *  `name` is the display name. */
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

/** merchantCatalog.craftable - recipes the merchant can craft. */
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
    // NPC exchange/box tables, matched by item id+level for the item
    // details' exchange sections.
    val exchangeable: List<MerchantExchangeItem> = emptyList(),
)

/** A bank/merchant hold mark on one item instance by slot, as opposed to
 *  the standing autoItemMarks rules. `auto` means a rule created it. */
@Serializable
data class BankMark(
    val slot: Int,
    val item: Item,
    val auto: Boolean = false,
)

/** Rule key used by autoItemMarks and autoUpgradeMarks: "{name}@+{level}". */
fun autoMarkRuleKey(item: Item): String = "${item.name}@+${item.level ?: 0}"

/** Parses a rule key back into a displayable Item. */
fun itemFromRuleKey(ruleKey: String): Item {
    val parts = ruleKey.split("@+")
    return Item(name = parts.getOrElse(0) { ruleKey }, level = parts.getOrNull(1)?.toIntOrNull())
}

/** One autoNpcSales rule; a null `character` means the merchant's own. */
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

/** One autoCompounds rule. No level: compounding advances the item's level
 *  toward `targetTier` on its own. */
@Serializable
data class AutoCompoundRule(
    val name: String,
    val targetTier: Int = 1,
    val quantity: Int = -1,
)

/** A preset "Send to..." location; `id` is the map name character-travel
 *  expects. */
@Serializable
data class TravelPlace(
    val id: String,
    val name: String,
    val x: Double = 0.0,
    val y: Double = 0.0,
)

/** A selectable realm; `key` is what /party-api/realm/switch expects. */
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

/** A realm switch (and optional home change) in progress. */
@Serializable
data class RealmOperation(
    val phase: String = "",
    val realm: String? = null,
    val error: String? = null,
    val characters: List<RealmCharacter> = emptyList(),
)

/** Offering item id -> display name. */
val UPGRADE_OFFERING_LABELS: Map<String, String> = linkedMapOf(
    "offeringp" to "Primling",
    "offering" to "Primordial Essence",
    "offeringx" to "Primordial X",
)

/** `name` is the item's catalog id (e.g. "coat"), not its display name. */
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

/** A monster Hunt mode currently skips, either automatically
 *  (deaths/expirations threshold) or manually. */
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

/** When Hunt mode relocates away from a competing party, and when a
 *  monster gets auto-blacklisted (too many deaths or quest expirations). */
@Serializable
data class HuntSettings(
    // Same defaults as the server.
    val relocateIfCompeting: Boolean = true,
    val blacklistDeaths: Boolean = true,
    val deathThreshold: Int = 1,
    val blacklistExpirations: Boolean = true,
    val expirationThreshold: Int = 1,
    // Monster id -> huntSpawnKey ("" = automatic).
    val preferredSpawns: Map<String, kotlinx.serialization.json.JsonElement> = emptyMap(),
)

/** One raw in-game chat/system log line, fetched separately via
 *  ?section=logs. */
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
