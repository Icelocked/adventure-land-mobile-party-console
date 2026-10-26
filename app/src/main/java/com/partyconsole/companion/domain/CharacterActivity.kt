package com.partyconsole.companion.domain

import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.model.ConsoleControlState
import com.partyconsole.companion.model.MerchantJob
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull

// A port of the PWA's web/src/lib/characterActivity.ts, itself a port of the
// console fork's dashboard/features/party/character-activity.ts (topic15r/
// release-ui af92de45). Keep the branches and strings in step with it;
// CharacterActivityTest replays characterActivity.test.ts.

// Core's read-only activityPhases types: web/src/models/activityPhases.ts,
// copied from the console fork's telemetry/activity-phases.ts.

@Serializable
data class PlacePhase(val map: String? = null, val mapName: String? = null, val monsterIds: List<String>? = null)

@Serializable
data class HuntMission(val target: String? = null)

@Serializable
data class PhaseOnly(val phase: String? = null)

@Serializable
data class HuntPhase(
    val stage: String = "",
    val participants: List<String>? = null,
    val target: String? = null,
    val message: String? = null,
    val recovering: Boolean? = null,
    val encounter: JsonElement? = null,
    val currentIndex: Int? = null,
    val missions: List<HuntMission>? = null,
    val turnIn: PhaseOnly? = null,
)

@Serializable
data class ConvoyPhase(
    val id: String? = null,
    val phase: String = "",
    val purpose: String? = null,
    val label: String? = null,
    val failure: String? = null,
    val defenseReason: String? = null,
    val participants: List<String>? = null,
    val walkingActivity: String? = null,
    val walkingEvent: String? = null,
    val eventPursuitBossId: String? = null,
    val merchantInterruption: PhaseOnly? = null,
    val location: PlacePhase? = null,
)

@Serializable
data class RareEncounter(val mtype: String = "", val stage: String? = null)

@Serializable
data class RarePatrol(val stage: String? = null)

@Serializable
data class RarePhase(val encounter: RareEncounter? = null, val patrol: RarePatrol? = null)

@Serializable
data class EventReturnPhase(val phase: String = "", val event: String? = null, val participants: List<String>? = null)

@Serializable
data class RecoveryPhase(val phase: String? = null, val names: List<String> = emptyList())

@Serializable
data class AchievementTarget(val id: String? = null, val milestone: Double? = null, val step: Double? = null)

@Serializable
data class AchievementPhase(val target: AchievementTarget? = null, val message: String? = null)

@Serializable
data class EventSessionPhase(val event: String? = null, val spawnAt: Long? = null, val live: Boolean = false)

/** activity-phases.ts profilePhases(): one character's owning farming
 *  profile. Only the fields read straight from the profile; the rest
 *  override the party fields through [characterActivity]'s merge. */
@Serializable
data class ProfilePhases(val achievement: AchievementPhase? = null, val eventSession: EventSessionPhase? = null)

@Serializable
data class BossChaseTrip(val boss: String? = null, val realm: String? = null, val arrived: Boolean = false, val respawnAt: Long? = null)

@Serializable
data class BossChasePhase(val trip: BossChaseTrip? = null, val returning: Boolean = false)

@Serializable
data class AttendancePhase(val ignored: String? = null, val dead: Boolean = false)

@Serializable
data class EscapePhase(val stage: String? = null)

@Serializable
data class DungeonReviving(val priest: String? = null, val target: String? = null)

@Serializable
data class DungeonPhase(
    val phase: String? = null,
    val participants: List<String> = emptyList(),
    val travel: String? = null,
    val message: String? = null,
    val reviving: DungeonReviving? = null,
)

@Serializable
data class CharacterPhases(val eventExit: String? = null, val farmReunion: String? = null)

@Serializable
data class ActivityPhases(
    val profiles: Map<String, JsonElement> = emptyMap(),
    val bossChase: BossChasePhase? = null,
    val attendance: Map<String, Map<String, AttendancePhase?>?> = emptyMap(),
    val escape: EscapePhase? = null,
    val dungeon: DungeonPhase? = null,
    val characters: Map<String, CharacterPhases?> = emptyMap(),
)

@Serializable
data class RealmOperation(val phase: String? = null)

@Serializable
data class RealmOperationHolder(val operation: RealmOperation? = null)

@Serializable
data class FarmAreaPhase(val pending: JsonElement? = null, val paused: Boolean? = null, val active: PlacePhase? = null)

/** The party state fields the label reads: core's top-level task fields
 *  (the leader's profile), consoleControl and activityPhases. */
@Serializable
data class ActivityState(
    val consoleControl: ConsoleControlState? = null,
    val combatRecovery: RecoveryPhase? = null,
    val merchantCharacter: String? = null,
    val gatheringModes: List<String>? = null,
    val realmControl: RealmOperationHolder? = null,
    val partyFarmingMode: String? = null,
    val partyFarmingMonsterType: String? = null,
    val activeConvoy: ConvoyPhase? = null,
    val monsterHunt: HuntPhase? = null,
    val eventReturn: EventReturnPhase? = null,
    val deferredEventReturns: Map<String, PhaseOnly?>? = null,
    val rareHuntState: RarePhase? = null,
    val merchantCurrent: MerchantJob? = null,
    val farmAreaState: FarmAreaPhase? = null,
    val activityPhases: ActivityPhases? = null,
)

@Serializable
data class LootStatus(val pending: Boolean? = null, val capacityBlocked: Boolean? = null)

@Serializable
data class OwnRecovery(val phase: String? = null, val status: String? = null, val recoveredAt: Double? = null)

@Serializable
data class AnniversaryActivity(val busy: Boolean? = null, val stage: String? = null)

@Serializable
data class NavigationDebug(val town: Boolean? = null, val forceTravel: Boolean? = null, val cancelled: Boolean? = null)

/** The live vitals merged over core's characterDetails for one character. */
@Serializable
data class ActivityCharacter(
    val name: String,
    val map: String? = null,
    val rip: Boolean? = null,
    val activeEvent: String? = null,
    val joinedEvent: String? = null,
    val banking: Boolean? = null,
    val bankQueued: Boolean? = null,
    val stocking: Boolean? = null,
    val upgrading: Boolean? = null,
    val standOpen: Boolean? = null,
    val gatheringPhase: String? = null,
    val monsterAchievementKills: Map<String, Double>? = null,
    val lootStatus: LootStatus? = null,
    val recovery: OwnRecovery? = null,
    val anniversaryState: AnniversaryActivity? = null,
    val farmingNavigationDebug: NavigationDebug? = null,
)

/** The state keys [characterActivity] reads; the repository keeps them raw. */
val ACTIVITY_STATE_KEYS = setOf(
    "consoleControl", "combatRecovery", "merchantCharacter", "gatheringModes", "realmControl", "partyFarmingMode",
    "partyFarmingMonsterType", "activeConvoy", "monsterHunt", "eventReturn", "deferredEventReturns", "rareHuntState",
    "merchantCurrent", "farmAreaState", "activityPhases",
)

private val activityJson = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false }

/** Decodes [source], dropping any field whose shape does not match, so one
 *  odd field never blanks the whole label. */
fun <T> decodeActivity(serializer: KSerializer<T>, source: JsonObject): T =
    runCatching { activityJson.decodeFromJsonElement(serializer, source) }.getOrElse {
        val good = source.filter { (key, value) -> runCatching { activityJson.decodeFromJsonElement(serializer, JsonObject(mapOf(key to value) + requiredKeys(source))) }.isSuccess }
        activityJson.decodeFromJsonElement(serializer, JsonObject(good))
    }

// ActivityCharacter needs its name in every per-field probe.
private fun requiredKeys(source: JsonObject): Map<String, JsonElement> = source["name"]?.let { mapOf("name" to it) }.orEmpty()

/** The character record the label reads: live vitals over core's characterDetails (card-name-strip.tsx). */
fun activityCharacter(name: String, diagnostics: JsonObject?, vitals: JsonObject?): ActivityCharacter =
    decodeActivity(ActivityCharacter.serializer(), JsonObject(diagnostics.orEmpty() + vitals.orEmpty() + ("name" to JsonPrimitive(name))))

typealias MonsterNames = (String) -> String

private val REGROUPING = setOf("assemble", "prepare", "shared-prepare", "scheduled", "shared-hold", "plan-return", "observing")
private val FARM_TRIPS = setOf("farm-relocation", "empty-spawn-recovery", "party-travel", "party-force-travel", "grouped-approach")

private fun title(value: String): String = value.replaceFirstChar { it.uppercase() }

// JS truthiness for the loosely typed fields.
private fun truthy(value: JsonElement?): Boolean = when (value) {
    null, JsonNull -> false
    is JsonPrimitive -> when {
        value.isString -> value.content.isNotEmpty()
        value.booleanOrNull != null -> value.booleanOrNull!!
        else -> value.doubleOrNull?.let { it != 0.0 && !it.isNaN() } ?: true
    }
    is JsonObject, is JsonArray -> true
}

private fun String?.orFalsy(): String? = this?.takeIf { it.isNotEmpty() }

// A number as JavaScript prints it in a template string.
private fun jsNumberText(value: Double): String = if (value == Math.floor(value) && !value.isInfinite()) value.toLong().toString() else value.toString()

private class Labeler(val monster: MonsterNames) {
    // Boss events like mrpumpkin read with the bestiary name ("Mr. Pumpkin") instead of the raw id.
    fun eventName(id: String?): String {
        if (id.isNullOrEmpty()) return "event"
        val name = monster(id)
        return EVENT_DISPLAY_NAMES[id] ?: if (name.isNotEmpty() && name != id) name else title(id)
    }

    // A convoy leg reads as regrouping until it walks; the phase list comes from
    // navigation/convoy.ts and shared-navigation.ts.
    fun trip(convoy: ConvoyPhase, goal: String): String = when {
        convoy.phase == "communication-hold" -> "Waiting for party connection"
        convoy.phase == "failed" -> "Travel held" + (convoy.failure.orFalsy()?.let { " - $it" } ?: "")
        convoy.phase == "defending" -> "Defending party" + (convoy.defenseReason.orFalsy()?.let { " - $it" } ?: "")
        convoy.phase == "hunt-arrival" -> "Arriving at $goal"
        convoy.phase in REGROUPING -> "Regrouping for travel"
        else -> "Travelling to $goal"
    }

    fun huntActivity(hunt: HuntPhase, convoy: ConvoyPhase?): String? {
        val id = hunt.missions?.getOrNull(hunt.currentIndex ?: -1)?.target.orFalsy() ?: hunt.target.orFalsy()
        val target = "Hunt target - ${if (id != null) monster(id) else "unknown"}"
        val message = hunt.message.orEmpty()
        if (hunt.recovering == true) return "Regrouping after death"
        if (hunt.turnIn?.phase == "claiming") return "Turning in hunt"
        // These holds keep the stage and change only the message (hunt/recovery.ts:175, hunt/convoy.ts:33 and :37).
        if (message.startsWith("Hunt movement is paused")) return "Waiting - Hunt paused; select Hunt again"
        if (message.contains("paused by Escape")) return "Waiting - Hunt paused by Escape"
        if (Regex("^(Waiting|Backup Hunt waiting|Hunt waiting)").containsMatchIn(message)) return message
        if (Regex("^(Trying alternate|Recovering Hunt route)").containsMatchIn(message)) return "Rerouting to $target"
        return when (hunt.stage) {
            "checking-quests", "assigning" -> "Acquiring new hunt target"
            "daisy-sync-travel" -> if (message.startsWith("Regrouping")) "Regrouping at Daisy" else "Travelling to Daisy for new hunt"
            "at-daisy" -> "At Daisy"
            "waiting-expiry" -> "Waiting at Daisy for hunt to expire"
            // Between convoy legs the convoy is null and the trip is still running.
            "mission-travel" -> if (convoy?.purpose == "monster-hunt") trip(convoy, target) else "Travelling to $target"
            "farming" -> if (truthy(hunt.encounter)) "Fighting $target (en route)" else "Fighting $target"
            "returning" -> "Hunt finished - Travelling to turn in"
            "batch-loot" -> "Collecting hunt loot"
            "blacklist-retreat" -> "Retreating - hunt target blacklisted"
            "backup-travel" -> "Travelling to backup farm"
            "backup-farming" -> "Backup farming while hunts expire"
            // A member outside the event waits while the rest of the party attends it.
            "paused-event" -> "Waiting - Hunt paused for event"
            else -> null
        }
    }

    // Achievement Hunt states come from hunt/achievement-hunt.ts, which reports
    // them only as achievementMessage text next to achievementTarget.
    fun achievementActivity(character: ActivityCharacter, phases: AchievementPhase, convoy: ConvoyPhase?): String {
        val message = phases.message.orEmpty()
        val id = phases.target?.id.orFalsy()
        if (message.startsWith("Waiting")) return "Waiting - ${message.replaceFirst(Regex("^Waiting(: | for )"), "")}"
        if (message.startsWith("Skipping")) return "Achievement Hunt - Switching achievement target"
        if (id == null) return if (message.startsWith("Nothing left")) "Achievement Hunt - Nothing left to farm" else "Achievement Hunt - Acquiring target"
        val target = "achievement target - ${monster(id)}"
        if (convoy?.purpose == "manual-monster-override") return trip(convoy, target)
        if (message.startsWith("Returning to the")) return "Travelling to $target"
        val kills = character.monsterAchievementKills?.get(id)
        val goal = phases.target?.milestone
        return "Fighting $target" + if (kills != null && goal != null && goal != 0.0) " (${jsNumberText(kills)}/${jsNumberText(goal)})" else ""
    }

    fun dungeonActivity(name: String, dungeon: DungeonPhase): String {
        val reviving = dungeon.reviving
        if (reviving != null && (reviving.priest == name || reviving.target == name)) return "Cave - reviving ${reviving.target}"
        when (dungeon.phase) {
            "gathering" -> return "Gathering for cave"
            "entering" -> return "Entering cave"
            "held" -> return "Cave held"
            "exiting" -> return "Leaving cave for event"
        }
        if (dungeon.travel == "assembling") return "Cave - grouping up"
        if (dungeon.travel == "travelling") return "Cave - travelling"
        return dungeon.message.orFalsy()?.let { "In cave - $it" } ?: "In cave"
    }

    fun eventExitActivity(phase: String): String = when {
        phase.contains("goobrawl") -> "Leaving event - Goobrawl (transporter)"
        phase.startsWith("leaving") -> "Leaving event"
        phase == "convoy-assembling" -> "Regrouping after event"
        phase == "convoy-returning" || phase == "returning" -> "Returning from event"
        phase == "retry-wait" -> "Waiting - event exit retry"
        else -> "Teleporting to town"
    }

    fun merchantActivity(character: ActivityCharacter, state: ActivityState, catalog: List<CatalogItem>): String {
        val job = state.merchantCurrent
        val event = character.activeEvent.orFalsy() ?: character.joinedEvent.orFalsy()
        if (event != null) return "Fighting event - ${eventName(event)}"
        // A gathering attempt runs while a newly assigned job waits for the cast
        // to finish (observed live: deconstruction "assigned" during a fishing trip).
        val gathering = !character.gatheringPhase.isNullOrEmpty() && character.gatheringPhase != "idle"
        if (gathering && (job == null || job.phase == "assigned")) {
            // The status report omits which mode the attempt uses, so two enabled modes read as "Gathering".
            val modes = state.gatheringModes.orEmpty()
            val mode = if (modes.size == 1) (if (modes[0] == "mining") "Mining" else "Fishing") else "Gathering"
            return if (character.gatheringPhase == "travelling") "$mode - travelling" else mode
        }
        if (job != null) {
            val label = merchantJobLabel(job.copy(operationStage = null), catalog)
            val phase = job.phase.orEmpty()
            if (phase == "handoff") return "Collecting items from ${job.target}"
            if (phase.startsWith("collecting materials from")) return title(phase)
            if (phase.startsWith("switching")) return "$label - switching realm"
            if (!job.pauseReason.isNullOrEmpty()) return "$label - paused"
            if (job.operationStage == "retrieving") return "$label - bank retrieval"
            if (job.operationStage == "storing") return "$label - bank storage"
            return label
        }
        val anniversary = character.anniversaryState
        if (anniversary?.busy == true && !anniversary.stage.isNullOrEmpty()) return "Anniversary - ${anniversary.stage}"
        if (character.banking == true) return "Banking"
        if (character.upgrading == true) return "Upgrading"
        if (character.stocking == true) return "Restocking"
        if (character.standOpen == true) return "Idle at stand"
        return "Idle"
    }
}

/**
 * A character's activity label. It follows the coordinator's party task
 * and its phase (hunt stage, convoy phase, event return, merchant job), so
 * retargets and short moves inside a phase leave it unchanged. Per-character
 * fields only pick the character's own branch and fill in names. [party]
 * holds the raw [ACTIVITY_STATE_KEYS] fields; [catalog] names merchant job items.
 */
fun characterActivity(character: ActivityCharacter, party: JsonObject, monster: MonsterNames, catalog: List<CatalogItem> = emptyList(), now: Long = System.currentTimeMillis()): String {
    val labels = Labeler(monster)
    val name = character.name
    val phases = (party["activityPhases"] as? JsonObject)?.let { decodeActivity(ActivityPhases.serializer(), it) }
    // A character outside the leader's party reads its own farming profile.
    val scopedRaw = phases?.profiles?.get(name) as? JsonObject
    val scoped = scopedRaw?.let { decodeActivity(ProfilePhases.serializer(), it) }
    val state = decodeActivity(ActivityState.serializer(), if (scopedRaw != null) JsonObject(party + scopedRaw) else party)
    val control = state.consoleControl
    if (control?.shutdown?.phase == "safe") return "Safe to stop"
    if (control?.shutdown?.phase == "draining") return "Holding still for shutdown"
    if (control?.paused == true) return "Paused"
    if (character.rip == true) return "Dead"
    val operation = state.realmControl?.operation?.phase
    if (operation == "switching") return "Switching realm"
    if (operation == "setting-home") return "Switching realm - setting home"
    if (name == state.merchantCharacter) return labels.merchantActivity(character, state, catalog)
    // runtime/characters/roles/death-recovery.ts publishes these after a death outside party recovery.
    val ownRecovery = character.recovery
    if (!ownRecovery?.phase.isNullOrEmpty() && (ownRecovery?.recoveredAt == null || ownRecovery.recoveredAt == 0.0) && !Regex("complete|cancelled").containsMatchIn(ownRecovery?.status.orEmpty())) {
        when (ownRecovery?.phase) {
            "respawn" -> return "Respawning"
            "event-reentry" -> return "Rejoining event after death"
            "event-search" -> return "Searching for Slenderman"
            "event-travel" -> return "Travelling to event after death"
            "farm-return" -> return "Returning to farm"
        }
    }
    when (phases?.escape?.stage) {
        "blink", "warrior", "priest" -> return "Escaping"
        "recovering", "recovery-convoy" -> return "Regrouping after escape"
        "failed-hold" -> return "Escape held"
    }
    val job = state.merchantCurrent
    if (job?.phase == "handoff" && job.target == name) return "Handing items to merchant"
    val recovery = state.combatRecovery?.takeIf { name in it.names }
    when (recovery?.phase) {
        "finishing" -> return "Finishing fight after death"
        "escaping" -> return "Escaping"
        "recovering" -> return "Regrouping after death"
        "returning-to-farm" -> return "Returning to farm"
    }
    val convoy = state.activeConvoy?.takeIf { it.participants?.contains(name) == true }
    if (convoy?.purpose == "death-recovery") return "Regrouping after death"
    if (convoy?.purpose == "escape-recovery") return "Escaping to town"
    if (!convoy?.merchantInterruption?.phase.isNullOrEmpty()) return "Handing items to merchant"
    val dungeon = phases?.dungeon?.takeIf { name in it.participants }
    if (dungeon != null) return labels.dungeonActivity(name, dungeon)
    val chase = phases?.bossChase
    if (chase?.returning == true) return "Returning home after boss chase"
    if (chase?.trip != null && !chase.trip.arrived) return "Realm-hopping to ${labels.eventName(chase.trip.boss)}"
    val respawnAt = chase?.trip?.respawnAt
    if (respawnAt != null && respawnAt != 0L && respawnAt > now) return "Waiting for spawn - ${labels.eventName(chase.trip.boss)}"
    val exit = state.eventReturn?.takeIf { it.participants?.contains(name) == true }
    if (exit?.phase == "evacuating") return "Leaving event - ${labels.eventName(exit.event)}"
    if (exit?.phase == "checkpoint") return "Returning from event - ${labels.eventName(exit.event)}"
    if (exit?.phase == "handoff") return "Resuming hunt"
    when (state.deferredEventReturns?.get(name)?.phase) {
        "awaiting-event-handoff" -> return "Switching event"
        "awaiting-reconnect" -> return "Waiting to reconnect"
        "awaiting-event-admission" -> return "Waiting to rejoin event"
        "returning-to-checkpoint" -> return "Returning from event"
    }
    val characterPhases = phases?.characters?.get(name)
    characterPhases?.eventExit.orFalsy()?.let { return labels.eventExitActivity(it) }
    if (convoy?.walkingActivity == "event") {
        val event = labels.eventName(convoy.walkingEvent.orFalsy() ?: character.activeEvent.orFalsy() ?: character.joinedEvent.orFalsy())
        // Event walking legs repeat every few seconds on the event map itself
        // (observed live during Graveyard Rising); only a leg to another map is a trip.
        val legMap = convoy.location?.map.orFalsy()
        if (legMap != null && legMap != character.map) return labels.trip(convoy, "event - $event")
        if (!convoy.eventPursuitBossId.isNullOrEmpty()) return "Chasing event boss - $event"
        return "Fighting event - $event"
    }
    if (convoy?.walkingActivity == "event-return" || convoy?.purpose == "event-return") return "Returning from event"
    if (convoy?.walkingActivity == "town-return") return "Returning to town"
    if (convoy?.walkingActivity == "anniversary-staging") return labels.trip(convoy, "Anniversary")
    if (convoy?.purpose == "anniversary-return") return "Returning from Anniversary"
    if (convoy?.purpose == "franky-exit") return "Leaving Franky's map"
    val event = character.activeEvent.orFalsy() ?: character.joinedEvent.orFalsy()
    if (event != null) {
        val skipped = phases?.attendance?.get(name)?.get(event)?.ignored.orFalsy()
        if (skipped != null) return "Leaving event - ${labels.eventName(event)} ($skipped)"
        val session = scoped?.eventSession
        val spawnAt = session?.spawnAt
        if (session?.event == event && !session.live && spawnAt != null && spawnAt != 0L && spawnAt > now) return "Waiting for spawn - ${labels.eventName(event)}"
        return "Fighting event - ${labels.eventName(event)}"
    }
    val anniversary = character.anniversaryState
    if (anniversary?.busy == true && !anniversary.stage.isNullOrEmpty()) return "Anniversary - ${anniversary.stage}"
    if (character.banking == true) return "Banking"
    if (character.bankQueued == true) return "Bank queued"
    if (character.stocking == true) return "Buying potions"
    if (character.upgrading == true) return "Upgrading items"
    characterPhases?.farmReunion.orFalsy()?.let { reunion ->
        return if (reunion.contains("magiport")) "Rejoining party - magiport" else if (reunion.startsWith("blinking")) "Rejoining party - blink" else "Rejoining party at farm"
    }
    val hunt = state.monsterHunt?.takeIf { it.participants?.contains(name) == true && it.stage != "ended" }
    hunt?.let { labels.huntActivity(it, convoy) }?.let { return it }
    scoped?.achievement?.let { return labels.achievementActivity(character, it, convoy) }
    val rare = state.rareHuntState
    when (rare?.encounter?.stage) {
        "approach" -> return "Pursuing rare - ${monster(rare.encounter.mtype)}"
        "converge" -> return "Converging on Phoenix"
        "combat" -> return "Fighting rare - ${monster(rare.encounter.mtype)}"
        "loot" -> return "Collecting rare loot"
    }
    if (rare?.patrol?.stage == "searching") return "Phoenix patrol - searching"
    if (rare?.patrol?.stage == "respawn") return "Phoenix patrol - waiting for respawn"
    fun farmMonster(place: PlacePhase?): String =
        place?.monsterIds?.firstOrNull().orFalsy()?.let(monster) ?: place?.mapName.orFalsy() ?: place?.map.orFalsy() ?: "farm"
    if (convoy?.purpose == "hunt-fallback") return "Hunt ended - ${labels.trip(convoy, "farm")}"
    if (convoy != null && (convoy.purpose.orEmpty() in FARM_TRIPS || convoy.purpose == "manual-monster-override" || convoy.walkingActivity == "farm-recovery"))
        return labels.trip(convoy, "farm - ${farmMonster(convoy.location)}")
    if (convoy != null) return labels.trip(convoy, convoy.location?.mapName.orFalsy() ?: convoy.location?.map.orFalsy() ?: convoy.label.orFalsy() ?: "destination")
    val navigation = character.farmingNavigationDebug
    if (navigation?.cancelled == true) return "Waiting - manual stop"
    if (navigation?.town == true) return "Returning to town"
    if (navigation?.forceTravel == true) return "Travelling to party location"
    if (character.lootStatus?.capacityBlocked == true) return "Waiting - inventory full"
    val farm = state.farmAreaState
    if (farm?.paused == true) return "Farm travel paused"
    if (truthy(farm?.pending)) return "Relocating farm zone"
    val scatter = state.partyFarmingMonsterType.orFalsy()
    if (state.partyFarmingMode == "scatter" && scatter != null) return "Scatter farming - ${monster(scatter)}"
    if (farm?.active != null) return "Fighting farm - ${farmMonster(farm.active)}"
    if (job != null && job.target == name) return "Waiting for merchant"
    return "Idle"
}
