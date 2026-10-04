package com.partyconsole.companion.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

// Port of the PWA's models/state.ts (itself the dashboard's party-state
// types, party-console v1.2.0). Every field is optional with a default: the
// console omits empty fields, and one missing key must never fail a decode.

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
    // Every bank pack the account could ever have, locked or not (see BankVault) - locked ones
    // aren't in bank.packs yet.
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
    val marked: Map<String, List<BankMark>> = emptyMap(),
    val merchantMarked: Map<String, List<BankMark>> = emptyMap(),
    // Both keyed by character, then by autoMarkRuleKey(item).
    val autoItemMarks: Map<String, Map<String, String>> = emptyMap(),
    val autoUpgradeMarks: Map<String, Map<String, JsonElement>> = emptyMap(),
    val bankboiPrefix: String = "",
    // "Send anniversary chat message when receiving cake from a kiss" (anniversary-dialog.tsx).
    val anniversaryAutoChat: Boolean = false,
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
    // Keyed by "$itemName@$level" (inventory-panel.tsx's autoExchangeKey) - presence alone marks the item for auto-exchange.
    val autoExchanges: Map<String, JsonElement> = emptyMap(),
    // Per character, then by rule key (see itemFromRuleKey).
    val autoDeconstruction: Map<String, Map<String, AutoDeconstructionRule>> = emptyMap(),
    val autoCompounds: Map<String, List<AutoCompoundRule>> = emptyMap(),
    val travelPlaces: List<TravelPlace> = emptyList(),
    // Merchant Card Controls (merchant-card-controls.tsx): force-stand
    // pauses all other merchant work; gatheringModes is the standing
    // mining/fishing toggle set, each independently on or off.
    val merchantForceStand: Boolean = false,
    val gatheringModes: List<String> = emptyList(),
    // Routine priorities dialog - reason -> 0-100 priority, and which
    // AUTOMATIC routines (the ones with an enable checkbox) are on.
    val merchantRoutinePriorities: Map<String, Int> = emptyMap(),
    val merchantAutomations: Map<String, Boolean> = emptyMap(),
    // Merchant collection settings (merchant-collection-settings.tsx).
    val threshold: Long = 0,
    val itemCollectionThreshold: Int = 1,
    val bankSortMode: String? = null,
    // BankScreen's own one-shot "sort on next visit" trigger (bank-sort-control.tsx), distinct
    // from bankSortMode's standing automatic/on-request choice - only relevant while mode is "request".
    val bankSortRequest: BankSortRequest? = null,
    // Farming/Hunting (farming-mode-control.tsx). `farmingPolicy` is the
    // account-wide CURRENT mode - unlike almost everything else here,
    // /farming-mode takes no `character` field, so this is one shared
    // value, not per-character (confirmed against the real route source,
    // runtime/coordinator/http/hunt-mode.ts). Monster focus IS per-
    // character, keyed by character name.
    val farmingPolicy: String = "auto",
    val monsterFocusByCharacter: Map<String, List<String>> = emptyMap(),
    val monsterSearchRadiusByCharacter: Map<String, Int> = emptyMap(),
    val huntBlacklist: Map<String, HuntBlacklistEntry> = emptyMap(),
    val huntSettings: HuntSettings? = null,
    // Marketplace "manage WTB orders" (wtborder-dialog.tsx) - one
    // standing buy order per item id, automatically filled up to `price`.
    val standBids: Map<String, StandBid> = emptyMap(),
    // Upgrade offering rules (upgrade-offering-controls.tsx) - "use a
    // Primling/Primordial Essence/Primordial X instead of scrolls" during
    // AUTOMATIC upgrades within a level range, independent of the item's
    // own upgrade-mark tier.
    val upgradeOfferingRules: List<UpgradeOfferingRule> = emptyList(),
    // The configured merchant (party-state.tsx). Never infer the merchant
    // from character class; bankbois are merchants too.
    val merchantCharacter: String? = null,
    // Per-character farming profiles for characters that neither lead nor
    // follow - see resolveFarmingContext.
    val farmingProfiles: Map<String, FarmingProfile> = emptyMap(),
    // The leader's own focus (party-wide fallback) and the monsters the
    // server accepts as focus (monster-choice.tsx).
    // A string or a list on the wire, so it stays raw (see selectedFocus).
    val monsterFocus: JsonElement? = null,
    val monsterChoices: List<MonsterChoice> = emptyList(),
    // Pending bank withdrawals per character (the merchant) - withdraw is a
    // server toggle, so these decide "Mark" vs "Unmark".
    val withdrawals: Map<String, List<WithdrawalRequest>> = emptyMap(),

    // --- The rest of models/state.ts's PartyStateDynamic (F6). Shapes that
    // no ported feature reads yet stay raw JSON until their package types them.
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

/** state.ts sameMarkedItem: a mark still refers to this live item. */
fun sameMarkedItem(markItem: Item, liveItem: Item): Boolean =
    markItem.name == liveItem.name && (markItem.level ?: 0) == (liveItem.level ?: 0)

/** connected-character-card.tsx: `monsterFocusByCharacter[name] ||
 *  selectedFocus`, where selectedFocus is use-party-console.tsx's flat
 *  `monsterFocus` (an array, or one id, defaulting to "goo"). The server
 *  keeps the leader's own focus in the flat field. */
fun PartyStateDynamic.focusFor(name: String): List<String> {
    monsterFocusByCharacter[name]?.let { return it }
    return when (val flat = monsterFocus) {
        is kotlinx.serialization.json.JsonArray -> flat.mapNotNull { (it as? kotlinx.serialization.json.JsonPrimitive)?.content }
        is kotlinx.serialization.json.JsonPrimitive -> listOf(flat.content.ifBlank { "goo" })
        else -> listOf("goo")
    }
}

/** monster-choice.tsx's MonsterChoice - only what the focus picker shows. */
@Serializable
data class MonsterChoice(
    val id: String,
    val name: String? = null,
    val sprite: Sprite? = null,
)

/** farming-context.ts's per-character profile. */
@Serializable
data class FarmingProfile(
    val farmingPolicy: String? = null,
    val huntSettings: HuntSettings? = null,
    val huntBlacklist: Map<String, HuntBlacklistEntry>? = null,
    val monsterFocus: JsonElement? = null,
)

/** farming-context.ts (via the PWA's resolveFarmingContext): whose farming
 *  settings a character runs on. The leader and its followers use the
 *  top-level fields; every other character has its own profile. */
data class FarmingContext(
    val owner: String,
    val followingLeader: String?,
    val savedMode: String,
    val effectiveMode: String,
    val blacklist: Map<String, HuntBlacklistEntry>,
    val settings: HuntSettings?,
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
    )
}


/** deconstruction.ts's catalog entry: whether an item can be scrapped. */
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
    // shared-rules.ts offeringUpgradePending inputs.
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

/** inventory/shared-rules.ts: with shared rules, `owner` holds every member's rules. */
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

/** lib/eventPolicy.ts EventSchedule. */
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
data class MerchantBlacklistEntry(val reason: String? = null, val at: Long? = null)

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

/** core's characterDetails entry (state.ts CharacterDiagnostics): the
 *  character script's own report for an active slot. Common fields are
 *  typed; [raw] keeps every field for the features that read others. */
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

    /** query-cache.tsx presence: seen by the coordinator within the last 10s. */
    fun online(now: Long = System.currentTimeMillis()): Boolean = now - (seenAt ?: 0) < 10_000
}

/** suggestedItemValue.ts StandPriceHistory: observed stand prices per item,
 *  each with the +level it was seen at. */
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
