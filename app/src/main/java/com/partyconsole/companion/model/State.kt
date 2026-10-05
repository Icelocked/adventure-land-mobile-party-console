package com.partyconsole.companion.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

// PWA: web/src/models/state.ts. Every field is optional with a default: the
// console omits empty fields, and one missing key must never fail a decode.

/** The polled part of GET /party-api/state (everything but the roster).
 *  `followers` maps character name -> following the leader. */
@Serializable
data class PartyStateDynamic(
    val merchantCurrent: MerchantJob? = null,
    val merchantQueue: List<MerchantJob> = emptyList(),
    val leader: String? = null,
    val followers: Map<String, Boolean> = emptyMap(),
    val restockPolicies: Map<String, RestockPolicy> = emptyMap(),
    val bank: BankSnapshot? = null,
    // Every bank pack, locked or not; locked ones aren't in bank.packs.
    val bankVaults: List<BankVault> = emptyList(),
    val bestiaryCatalog: List<BestiaryMonster> = emptyList(),
    val skillCatalog: List<SkillClass> = emptyList(),
    val combatLogs: Map<String, List<ActivityEntry>> = emptyMap(),
    val merchantActivity: List<ActivityEntry> = emptyList(),
    val standListings: List<StandListing> = emptyList(),
    val aldata: AlDataState? = null,
    val ponty: PontyState? = null,
    val merchantCatalog: MerchantCatalog? = null,
    val standSearch: StandSearchState = StandSearchState(),
    // Bank / merchant hold marks: {slot, item} entries, or plain items for
    // older auto marks - raw, see markedIn.
    val marked: Map<String, List<JsonElement>> = emptyMap(),
    val merchantMarked: Map<String, List<JsonElement>> = emptyMap(),
    // Both keyed by character, then by autoMarkRuleKey(item).
    val autoItemMarks: Map<String, Map<String, String>> = emptyMap(),
    val autoUpgradeMarks: Map<String, Map<String, JsonElement>> = emptyMap(),
    val bankboiPrefix: String = "",
    // Send the anniversary chat message when receiving cake from a kiss.
    val anniversaryAutoChat: Boolean = false,
    val realmControl: RealmControl? = null,
    // Gold each character should carry; merchant bank errands deposit the
    // excess or top up the shortfall. This is the only way gold moves
    // between a character and the bank.
    val goldTargets: Map<String, Long> = emptyMap(),
    // Account-wide, not per character. Keys are opaque; only values matter.
    val autoNpcSales: Map<String, AutoNpcSaleRule> = emptyMap(),
    val autoStandMarks: Map<String, AutoStandRule> = emptyMap(),
    // Keyed by "$itemName@$level"; presence alone marks the item for auto-exchange.
    val autoExchanges: Map<String, JsonElement> = emptyMap(),
    // Per character, then by rule key (see itemFromRuleKey).
    val autoDeconstruction: Map<String, Map<String, AutoDeconstructionRule>> = emptyMap(),
    val autoCompounds: Map<String, List<AutoCompoundRule>> = emptyMap(),
    val travelPlaces: List<TravelPlace> = emptyList(),
    // Force-stand pauses all other merchant work; gatheringModes holds the
    // mining/fishing toggles that are on.
    val merchantForceStand: Boolean = false,
    val gatheringModes: List<String> = emptyList(),
    // Routine reason -> 0-100 priority, and which automatic routines are on.
    val merchantRoutinePriorities: Map<String, Int> = emptyMap(),
    val merchantAutomations: Map<String, Boolean> = emptyMap(),
    // Merchant collection settings.
    val threshold: Long = 0,
    val itemCollectionThreshold: Int = 1,
    val bankSortMode: String? = null,
    // One-shot "sort on next visit" request; only relevant in "request" mode.
    val bankSortRequest: BankSortRequest? = null,
    // The leader's farming mode; see farmingContext for other characters.
    val farmingPolicy: String = "auto",
    val monsterFocusByCharacter: Map<String, List<String>> = emptyMap(),
    val monsterSearchRadiusByCharacter: Map<String, Int> = emptyMap(),
    val huntBlacklist: Map<String, HuntBlacklistEntry> = emptyMap(),
    val huntSettings: HuntSettings? = null,
    // WTB orders: one standing buy order per item id, filled up to `price`.
    val standBids: Map<String, StandBid> = emptyMap(),
    // Use an offering instead of scrolls for automatic upgrades within a
    // level range.
    val upgradeOfferingRules: List<UpgradeOfferingRule> = emptyList(),
    // The configured merchant. Never infer the merchant from character
    // class; bankbois are merchants too.
    val merchantCharacter: String? = null,
    // Per-character farming profiles for characters that neither lead nor
    // follow - see resolveFarmingContext.
    val farmingProfiles: Map<String, FarmingProfile> = emptyMap(),
    // The leader's own focus (party-wide fallback) and the monsters the
    // server accepts as focus. A string or a list on the wire, so it stays
    // raw (see focusFor).
    val monsterFocus: JsonElement? = null,
    val monsterChoices: List<MonsterChoice> = emptyList(),
    // Pending bank withdrawals per character (the merchant) - withdraw is a
    // server toggle, so these decide "Mark" vs "Unmark".
    val withdrawals: Map<String, List<WithdrawalRequest>> = emptyMap(),

    // Shapes nothing reads in detail yet stay raw JSON.
    // Marks and rules
    val phoenixRouteOrder: List<String> = emptyList(),
    val deconstructionCatalog: Map<String, DeconstructionCatalogEntry> = emptyMap(),
    val upgrades: Map<String, List<UpgradeMark>> = emptyMap(),
    val compounds: Map<String, List<CompoundGroup>> = emptyMap(),
    val statScrolls: Map<String, List<StatScrollMark>> = emptyMap(),
    val npcSaleMarks: List<NpcSaleMark> = emptyList(),
    val deconstructionMarks: List<DeconstructionMark> = emptyList(),
    val merchantDeliveries: Map<String, List<MerchantDelivery>> = emptyMap(),
    val luckyUpgradeSlots: Map<String, Int> = emptyMap(),
    val luckySlotTracking: Map<String, Map<String, LuckySlotTracking>> = emptyMap(),
    val merchantRules: SharedRules? = null,
    // Hunting and farming
    val monsterHunt: MonsterHuntCycle? = null,
    val characterHunt: Map<String, MonsterHuntStatus?> = emptyMap(),
    val farmAreaState: FarmAreaState? = null,
    val monsterPrioritiesByCharacter: Map<String, Map<String, Int>> = emptyMap(),
    val passiveHunting: JsonElement? = null,
    val passiveRareHunts: PassiveRareHunts? = null,
    val scatterMonsterTypes: List<String> = emptyList(),
    val huntFailures: Map<String, HuntFailures> = emptyMap(),
    val characterLocations: Map<String, MapLocation> = emptyMap(),
    val partyLocation: MapLocation? = null,
    // The party's live farming mode, the last fallback.
    val partyFarmingMode: String? = null,
    val combatRecovery: CombatRecovery? = null,
    val activeConvoy: JsonElement? = null,
    // Events
    val eventSchedules: List<EventSchedule> = emptyList(),
    val eventSelectionsByCharacter: Map<String, List<String>> = emptyMap(),
    val eventsByCharacter: Map<String, Boolean> = emptyMap(),
    val anniversary: JsonElement? = null,
    // Bankbois, slots, session
    val bankbois: List<Bankboi> = emptyList(),
    val bankboiQueue: List<BankboiQueueEntry> = emptyList(),
    val bankboiTransaction: BankboiTransaction? = null,
    val activeSlots: List<ActiveSlot> = emptyList(),
    val characterConnections: List<CharacterConnection> = emptyList(),
    val steamSwitch: SteamSwitch? = null,
    val classChoices: List<String> = emptyList(),
    val appearanceChoices: Map<String, List<AppearanceChoice>> = emptyMap(),
    val characterAppearances: Map<String, CharacterAppearance> = emptyMap(),
    // Account and server
    val accountId: String? = null,
    val referenceRevision: String? = null,
    val gameVersion: Int? = null,
    val bankGold: Long? = null,
    // Merchant
    val buyUpgradeBatchSize: Int? = null,
    val giveawayRealms: List<GiveawayRealm> = emptyList(),
    val giveawayPlayers: Map<String, List<String>> = emptyMap(),
    val merchantWeapon: MerchantWeapon? = null,
    val merchantBlacklist: Map<String, MerchantBlacklistEntry> = emptyMap(),
    val autoStandBuys: Boolean = false,
    val autoBlacklistMerchants: Boolean = false,
    val merchantStandLocation: MapLocation? = null,
    val standPriceHistory: Map<String, StandPriceHistory> = emptyMap(),
    val nativeStand: NativeStand? = null,
    val mluckSchedule: MluckSchedule? = null,
    val gatheringCooldowns: GatheringCooldowns? = null,
    val gatheringNoTool: Map<String, Boolean> = emptyMap(),
    val purchases: Map<String, List<PurchaseRecord>> = emptyMap(),
    val upgradeOfferingStock: Map<String, Int> = emptyMap(),
)

@Serializable
data class WithdrawalRequest(
    val pack: String,
    val slot: Int,
    val item: Item,
)

/** Whether a mark still refers to this live item. */
fun sameMarkedItem(markItem: Item, liveItem: Item): Boolean =
    markItem.name == liveItem.name && (markItem.level ?: 0) == (liveItem.level ?: 0)

/** A character's own focus, else the flat `monsterFocus` (the leader's,
 *  an array or one id), defaulting to "goo". */
fun PartyStateDynamic.focusFor(name: String): List<String> {
    monsterFocusByCharacter[name]?.let { return it }
    return when (val flat = monsterFocus) {
        is kotlinx.serialization.json.JsonArray -> flat.mapNotNull { (it as? kotlinx.serialization.json.JsonPrimitive)?.content }
        is kotlinx.serialization.json.JsonPrimitive -> listOf(flat.content.ifBlank { "goo" })
        else -> listOf("goo")
    }
}

/** A monster the focus picker offers. */
@Serializable
data class MonsterChoice(
    val id: String,
    val name: String? = null,
    val sprite: Sprite? = null,
    // The spawn geometry farming areas are built from.
    val locations: List<com.partyconsole.companion.domain.Area> = emptyList(),
    // Every recorded spawn and why routing can't use it.
    val spawnRecords: List<MonsterSpawnRecord>? = null,
)

/** Farming settings for a character that neither leads nor follows. */
@Serializable
data class FarmingProfile(
    val farmingPolicy: String? = null,
    val huntSettings: HuntSettings? = null,
    val huntBlacklist: Map<String, HuntBlacklistEntry>? = null,
    val monsterFocus: JsonElement? = null,
    val location: MapLocation? = null,
    val monsterHunt: MonsterHuntCycle? = null,
    val farmAreaState: FarmAreaState? = null,
)

/** Whose farming settings a character runs on. The leader and its
 *  followers use the top-level fields; every other character has its own
 *  profile. */
data class FarmingContext(
    val owner: String,
    val followingLeader: String?,
    val savedMode: String,
    val effectiveMode: String,
    val blacklist: Map<String, HuntBlacklistEntry>,
    val settings: HuntSettings?,
    val farmArea: FarmAreaState? = null,
    val hunt: MonsterHuntCycle? = null,
)

fun PartyStateDynamic.farmingContext(name: String): FarmingContext {
    val followingLeader = leader?.takeIf { it != name && followers[name] == true }
    val owner = followingLeader ?: name
    val legacy = owner == leader
    val personal = farmingProfiles[name]
    val effective = farmingProfiles[owner]
    return FarmingContext(
        owner = owner,
        followingLeader = followingLeader,
        savedMode = personal?.farmingPolicy ?: (if (name == leader) farmingPolicy else null) ?: "auto",
        effectiveMode = effective?.farmingPolicy ?: (if (legacy) farmingPolicy else null) ?: "auto",
        blacklist = effective?.huntBlacklist ?: (if (legacy) huntBlacklist else null) ?: emptyMap(),
        settings = effective?.huntSettings ?: if (legacy) huntSettings else null,
        farmArea = effective?.farmAreaState ?: if (legacy) farmAreaState else null,
        hunt = effective?.monsterHunt ?: if (legacy) monsterHunt else null,
    )
}


/** Whether an item can be scrapped, and for what. */
@Serializable
data class DeconstructionCatalogEntry(
    val compound: Boolean = false,
    val cost: Long? = null,
    val rewards: List<DeconstructionReward> = emptyList(),
)

@Serializable
data class DeconstructionReward(val name: String, val quantity: Int = 1, val chance: Double = 1.0)

/** A pending one-time upgrade mark (state.upgrades[character]). `slot` is a
 *  bag index or an equip-slot name, so it stays raw. */
@Serializable
data class UpgradeMark(
    val slot: JsonElement? = null,
    val item: Item,
    val tiers: Int? = null,
    val auto: Boolean = false,
    val equipped: Boolean = false,
    // Set while an upgrade waits on an offering.
    val passId: String? = null,
    val waitingOffering: JsonElement? = null,
)

@Serializable
data class CompoundMark(val slot: JsonElement? = null, val item: Item)

@Serializable
data class CompoundGroup(val id: String, val name: String = "", val items: List<CompoundMark> = emptyList())

@Serializable
data class StatScrollMark(
    val slot: JsonElement? = null,
    val item: Item,
    val tiers: Int? = null,
    val auto: Boolean = false,
    val equipped: Boolean = false,
    val statType: String = "",
    val scroll: String = "",
)

@Serializable
data class NpcSaleMark(
    val id: String,
    val auto: Boolean = false,
    val pack: String? = null,
    val source: String? = null, // "bank" | "merchant" | "character"
    val character: String? = null,
    val slot: Int = 0,
    val item: Item,
    val quantity: Int = 1,
    val state: String? = null,
    val error: String? = null,
    val retryAt: Long? = null,
)

@Serializable
data class StorageSlot(val pack: String, val slot: Int)

@Serializable
data class DeconstructionMark(
    val id: String,
    val owner: String = "",
    val slot: Int = 0,
    val item: Item,
    val quantity: Int = 1,
    val state: String = "", // collecting | withdrawing | ready | running | blocked | complete
    val error: String? = null,
    val auto: Boolean = false,
    val storage: StorageSlot? = null,
)

/** A queued delivery, keyed by the RECIPIENT (state.merchantDeliveries). */
@Serializable
data class MerchantDelivery(val id: String, val slot: Int = 0, val item: Item, val equipOnDelivery: Boolean = false)

@Serializable
data class SlotRollStatistics(
    val totalRolls: Long = 0,
    val sumRolls: Double = 0.0,
    val rollsAbove96_3: Long = 0,
    val perfectRolls: Long = 0,
)

/** One evidence stream's slot table (state.luckySlotTracking[character][stream]). */
@Serializable
data class LuckySlotTracking(val version: Int = 1, val streamId: String? = null, val slots: Map<String, SlotRollStatistics> = emptyMap())

/** With shared rules, `owner` holds every member's rules. */
@Serializable
data class SharedRules(
    val version: Int = 1,
    val owner: String,
    val members: List<String> = emptyList(),
    val backup: JsonElement? = null,
    val conflicts: List<JsonElement> = emptyList(),
)

@Serializable
data class HuntMission(val target: String = "", val owners: List<String> = emptyList())

@Serializable
data class HuntBackupMember(val target: String? = null, val remainingMs: Long = 0, val ready: Boolean = false, val fresh: Boolean = false)

@Serializable
data class HuntBackup(val members: Map<String, HuntBackupMember> = emptyMap())

@Serializable
data class HuntTurnIn(val owner: String = "", val phase: String = "") // returning | claiming | complete

/** The party's Hunt cycle (state.monsterHunt). */
@Serializable
data class MonsterHuntCycle(
    val target: String? = null,
    val message: String? = null,
    val stage: String = "",
    val owner: String? = null,
    // Where Hunt returns between quests.
    val returnLocation: MapLocation? = null,
    val currentIndex: Int = 0,
    val missions: List<HuntMission> = emptyList(),
    val backup: HuntBackup? = null,
    val turnIn: HuntTurnIn? = null,
)

/** One character's own Hunt quest (characterDetails[name].monsterHunt). */
@Serializable
data class MonsterHuntStatus(val id: String? = null, val count: Int = 0, val remainingMs: Long? = null, val server: String? = null)

@Serializable
data class ActiveFarmArea(val map: String, val x: Double = 0.0, val y: Double = 0.0, val monsterIds: List<String> = emptyList())

@Serializable
data class FarmAreaState(val message: String? = null, val paused: Boolean = false, val active: ActiveFarmArea? = null)

@Serializable
data class PassiveRareHunts(
    val tinyp: Boolean = false,
    val phoenix: Boolean = false,
    val goldenbat: Boolean? = null,
    val cutebee: Boolean? = null,
    val hen: Boolean? = null,
    val rooster: Boolean? = null,
)

@Serializable
data class HuntFailures(val deaths: Int = 0, val expirations: Int = 0)

/** A map position (characterLocations, partyLocation, merchantStandLocation). */
@Serializable
data class MapLocation(val map: String, val x: Double = 0.0, val y: Double = 0.0)

@Serializable
data class CombatRecovery(val phase: String = "", val reason: String? = null, val names: List<String> = emptyList())

/** One game event's schedule. */
@Serializable
data class EventSchedule(
    val id: String,
    val name: String = "",
    val live: Boolean? = null,
    val next: Double? = null,
    val expires: Double? = null,
    val stale: Boolean? = null,
    val slotAt: Double? = null,
    val slotKind: String? = null,
)

@Serializable
data class BankboiTransactionState(val phase: String = "", val mode: String = "")

@Serializable
data class Bankboi(
    val name: String,
    val ctype: String? = null,
    val level: Int? = null,
    val state: String = "",
    val items: List<InventoryEntry?> = emptyList(),
    val slots: Map<String, EquippedEntry?> = emptyMap(),
    val gold: Long? = null,
    val seenAt: Long? = null,
    val error: String? = null,
    val transaction: BankboiTransactionState? = null,
)

@Serializable
data class BankboiQueueEntry(val id: String, val item: Item, val state: String = "", val bootstrap: Boolean = false)

@Serializable
data class BankboiTransaction(val bankboi: String, val phase: String = "", val mode: String = "")

@Serializable
data class ActiveSlot(
    val index: Int,
    val kind: String = "", // native | headless
    val primary: Boolean = false,
    val character: String? = null,
    val state: String = "", // empty | starting | online | stopping | offline | failed
)

@Serializable
data class CharacterConnection(
    val name: String,
    val primary: Boolean = false,
    val error: String? = null,
    val since: Long = 0,
    val seenAt: Long = 0,
    val status: String = "", // loading | code | stopped | waiting | connected | lost
    val delayed: Boolean = false,
)

@Serializable
data class SteamSwitch(
    val from: String? = null,
    val target: String? = null,
    val startedAt: Long = 0,
    val timedOut: Boolean = false,
    val phase: String? = null,
    val error: String? = null,
)

@Serializable
data class AppearanceChoice(val index: Int, val html: String? = null, val layers: List<JsonElement> = emptyList())

@Serializable
data class CharacterAppearance(
    val skin: String? = null,
    val characterSprite: JsonElement? = null,
    val characterDollHtml: String? = null,
    val updatedAt: Long = 0,
)

@Serializable
data class GiveawayRealm(val key: String, val label: String = "")

@Serializable
data class MerchantWeapon(val item: Item)

@Serializable
data class MerchantBlacklistEntry(
    val reason: String? = null,
    val at: Long? = null,
    val until: Double? = null,
    val seller: String? = null,
    val serverRegion: String? = null,
    val serverIdentifier: String? = null,
    val failures: Int? = null,
    val updatedAt: Long? = null,
)

@Serializable
data class NativeStandOffer(
    val itemId: String = "",
    val auto: Boolean = false,
    val phase: String = "",
    val slot: String = "",
    val level: Int? = null,
    val price: Long? = null,
    val quantity: Int? = null,
    val acknowledged: Long? = null,
    val problem: String? = null,
)

@Serializable
data class NativeStand(val offers: Map<String, NativeStandOffer> = emptyMap(), val problems: Map<String, String> = emptyMap())

@Serializable
data class MluckSchedule(
    val target: String = "",
    val remainingMs: Long = 0,
    val leadMs: Long = 0,
    val dispatchInMs: Long = 0,
    val marginMs: Long = 0,
    val status: String = "",
)

@Serializable
data class GatheringCooldowns(val fishing: Long? = null, val mining: Long? = null)

@Serializable
data class PurchaseRecord(val name: String)

/** A characterDetails entry: the character script's report for an active
 *  slot. Common fields are typed; [raw] keeps every field. */
@Serializable
data class CharacterDiagnostics(
    val name: String? = null,
    val ctype: String? = null,
    val server: String? = null,
    val level: Int? = null,
    val seenAt: Long? = null,
    val ping: Double? = null,
    val owner: JsonElement? = null,
    val skin: String? = null,
    val characterSprite: JsonElement? = null,
    val characterDollHtml: String? = null,
    val primaryStat: String? = null,
    val attack: Double? = null,
    val frequency: Double? = null,
    val range: Double? = null,
    val speed: Double? = null,
    val unrestrictedSpeed: Double? = null,
    val armor: Double? = null,
    val resistance: Double? = null,
    val str: Double? = null,
    val int: Double? = null,
    val dex: Double? = null,
    val vit: Double? = null,
    val fortitude: Double? = null,
    val luck: Double? = null,
    val goldBonus: Double? = null,
    val xpBonus: Double? = null,
    val combatStats: JsonElement? = null,
    val monsterHunt: MonsterHuntStatus? = null,
    val monsterAchievements: JsonElement? = null,
    val monsterAchievementKills: JsonElement? = null,
    val tracktrix: JsonElement? = null,
    val anniversaryVisit: JsonElement? = null,
    val anniversaryState: JsonElement? = null,
) {
    @kotlinx.serialization.Transient
    var raw: kotlinx.serialization.json.JsonObject = kotlinx.serialization.json.JsonObject(emptyMap())
        internal set

    /** Seen by the coordinator within the last 10s. */
    fun online(now: Long = System.currentTimeMillis()): Boolean = now - (seenAt ?: 0) < 10_000
}

/** Observed stand prices for an item, each with the +level it was seen at. */
@Serializable
data class StandPriceHistory(
    val lowest: Double = 0.0,
    val lowestLevel: Int? = null,
    val recent: Double = 0.0,
    val recentLevel: Int? = null,
    val seenAt: Long = 0,
    val marketLow: Double? = null,
    val marketLowLevel: Int? = null,
    val highestPublicWTB: Double? = null,
    val highestPublicWTBLevel: Int? = null,
)

/** True for a {slot, item} mark at this slot for this item, or a plain
 *  item mark for this item. */
fun markedIn(list: List<JsonElement>, entry: InventoryEntry, json: kotlinx.serialization.json.Json = MARK_JSON): Boolean = list.any { raw ->
    val obj = raw as? kotlinx.serialization.json.JsonObject ?: return@any false
    val nested = obj["item"] as? kotlinx.serialization.json.JsonObject
    if (nested != null) {
        val slot = (obj["slot"] as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull()
        val item = runCatching { json.decodeFromJsonElement(Item.serializer(), nested) }.getOrNull() ?: return@any false
        slot == entry.slot && sameMarkedItem(item, entry.item)
    } else {
        val item = runCatching { json.decodeFromJsonElement(Item.serializer(), obj) }.getOrNull() ?: return@any false
        sameMarkedItem(item, entry.item)
    }
}

private val MARK_JSON = kotlinx.serialization.json.Json { ignoreUnknownKeys = true; coerceInputValues = true }
