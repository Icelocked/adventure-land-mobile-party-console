package com.partyconsole.companion.notify

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

// Alert detection: pure functions over the console's section JSON. The app
// runs them on the phone by polling instead of receiving Web Push.
// PWA: web/notifier/detect.mjs.

/** Every alert a device can switch on, grouped for Settings. */
val ALERTS = listOf("stuck", "idle", "deaths", "errors", "inventory", "bank", "rules", "orders", "events", "rare", "trading", "mail")

/** Character-health alerts still arrive during quiet hours. */
val URGENT_ALERTS = setOf("stuck", "idle", "deaths", "errors")

@Serializable
data class Burst(val count: Int = 5, val minutes: Int = 10)

@Serializable
data class RareRule(val mode: String = "chance", val chanceOneIn: Long = 10000, val minGold: Long = 1_000_000)

/** Account-wide alert limits, with their defaults. */
@Serializable
data class NotifierLimits(
    val stuckMinutes: Int = 2,
    val idleMinutes: Int = 5,
    val errors: Burst = Burst(5, 10),
    val deaths: Burst = Burst(3, 30),
    val rare: RareRule = RareRule(),
)

/** Clamps a patch onto the current limits. */
fun mergeLimits(current: NotifierLimits, patch: NotifierLimits): NotifierLimits {
    fun positive(value: Long, fallback: Long, max: Long = 1_000_000_000): Long = if (value >= 1) min(max, value) else fallback
    return NotifierLimits(
        stuckMinutes = positive(patch.stuckMinutes.toLong(), current.stuckMinutes.toLong(), 1440).toInt(),
        idleMinutes = positive(patch.idleMinutes.toLong(), current.idleMinutes.toLong(), 1440).toInt(),
        errors = Burst(positive(patch.errors.count.toLong(), current.errors.count.toLong(), 1000).toInt(), positive(patch.errors.minutes.toLong(), current.errors.minutes.toLong(), 1440).toInt()),
        deaths = Burst(positive(patch.deaths.count.toLong(), current.deaths.count.toLong(), 1000).toInt(), positive(patch.deaths.minutes.toLong(), current.deaths.minutes.toLong(), 1440).toInt()),
        rare = RareRule(
            mode = if (patch.rare.mode in setOf("chance", "value", "both")) patch.rare.mode else current.rare.mode,
            chanceOneIn = positive(patch.rare.chanceOneIn, current.rare.chanceOneIn),
            minGold = positive(patch.rare.minGold, current.rare.minGold, 10_000_000_000_000),
        ),
    )
}

internal fun JsonElement?.obj(): JsonObject? = this as? JsonObject
internal fun JsonElement?.arr(): List<JsonElement> = (this as? JsonArray).orEmpty()
internal fun JsonElement?.str(): String? = (this as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content
internal fun JsonElement?.num(): Double = (this as? JsonPrimitive)?.content?.toDoubleOrNull() ?: 0.0

/** Labels for the connection states worth a notification. */
private val CONNECTION_PROBLEMS = mapOf("lost" to "Connection lost", "stopped" to "CODE stopped")

/** The party's live (non-bankboi) characters from a core snapshot, in slot order. */
fun liveCharacters(core: JsonObject): List<String> {
    val bankbois = core["bankbois"].arr().mapNotNull { it.obj()?.get("name").str() }.toSet()
    val fromSlots = core["activeSlots"].arr().mapNotNull { it.obj()?.get("character").str()?.ifEmpty { null } }
    val names = fromSlots.ifEmpty { core["characterDetails"].obj()?.keys?.toList().orEmpty() }
    return names.distinct().filter { it !in bankbois }
}

/** Problems right now, per character: a lost/stopped connection, or no
 *  status report (diagnostics seenAt, server clock) for [stuckAfterMs]. */
fun characterProblems(core: JsonObject, now: Long, stuckAfterMs: Long): Map<String, String> {
    val problems = linkedMapOf<String, String>()
    val connections = core["characterConnections"].arr().mapNotNull { it.obj() }.associate { it["name"].str() to it["status"].str() }
    for (name in liveCharacters(core)) {
        val connectionProblem = CONNECTION_PROBLEMS[connections[name]]
        if (connectionProblem != null) {
            problems[name] = connectionProblem
            continue
        }
        val seenAt = core["characterDetails"].obj()?.get(name).obj()?.get("seenAt").num().toLong()
        if (seenAt != 0L && now - seenAt >= stuckAfterMs) problems[name] = "No update for ${floor((now - seenAt) / 60000.0).toLong()} min — may be hung"
    }
    return problems
}

data class ProblemEvent(val name: String, val problem: String?)

/** Transitions between two problem maps: new or changed problems, and recoveries. */
fun problemTransitions(previous: Map<String, String>, current: Map<String, String>): List<ProblemEvent> {
    // A stuck character's minute count keeps growing; only the kind of problem is a change.
    fun kind(text: String?) = if (text?.startsWith("No update") == true) "stuck" else text
    val events = mutableListOf<ProblemEvent>()
    for ((name, problem) in current) if (previous[name] == null || kind(previous[name]) != kind(problem)) events += ProblemEvent(name, problem)
    for (name in previous.keys) if (current[name] == null) events += ProblemEvent(name, null)
    return events
}

/** Same error rule the console uses to classify game log lines. */
private val GAME_LOG_ERROR = Regex("\\b\\w*error\\b|\\bexception\\b|\\bfailed\\b|route rejected|collisions detected|falling back to native|\\b(?:line|column)\\s*:?\\s*\\d+", RegexOption.IGNORE_CASE)
fun isGameLogError(message: String?) = GAME_LOG_ERROR.containsMatchIn(message.orEmpty())

/** The game's own messages for a failed upgrade or compound roll. The logs
 *  file them under errors, but they are expected outcomes, so a merchant
 *  grinding upgrades would otherwise trip the error alert every few minutes. */
private val EXPECTED_FAILURE = Regex("\\bItem (?:upgrade|combination) failed\\b", RegexOption.IGNORE_CASE)
fun isAlertableGameLogError(message: String?) = isGameLogError(message) && !EXPECTED_FAILURE.containsMatchIn(message.orEmpty())

/** The merchant's own error entries, minus an upgrade that destroyed the item
 *  ("X upgrade failed" with details "X was destroyed"): an expected outcome. */
private val DESTROYED = Regex("\\bwas destroyed\\b", RegexOption.IGNORE_CASE)
fun isAlertableActivityError(entry: JsonObject?) = entry?.get("level").str() == "error" && !DESTROYED.containsMatchIn(entry?.get("details").str().orEmpty())

/** Error timestamps per character: game-log errors (minus failed rolls),
 *  plus the merchant's error-level activity. */
fun errorTimes(gameLogs: JsonObject?, merchantActivity: List<JsonElement>, merchantName: String?): Map<String, List<Long>> {
    val times = linkedMapOf<String, MutableList<Long>>()
    for ((name, entries) in gameLogs.orEmpty()) for (entry in entries.arr()) if (isAlertableGameLogError(entry.obj()?.get("message").str())) times.getOrPut(name) { mutableListOf() } += entry.obj()?.get("at").num().toLong()
    if (merchantName != null) for (entry in merchantActivity) if (isAlertableActivityError(entry.obj())) times.getOrPut(merchantName) { mutableListOf() } += entry.obj()?.get("at").num().toLong()
    return times
}

/** Death timestamps per character from the combat logs. */
fun deathTimes(combatLogs: JsonObject?): Map<String, List<Long>> {
    val times = linkedMapOf<String, MutableList<Long>>()
    for ((name, entries) in combatLogs.orEmpty()) for (entry in entries.arr()) if (entry.obj()?.get("type").str() == "death") times.getOrPut(name) { mutableListOf() } += entry.obj()?.get("at").num().toLong()
    return times
}

/** Characters with at least [count] events in the last [windowMs], counting only
 *  events after their previous alert so one burst alerts once. */
fun bursts(times: Map<String, List<Long>>, now: Long, count: Int, windowMs: Long, lastAlertAt: Map<String, Long> = emptyMap()): Map<String, Int> {
    val hits = linkedMapOf<String, Int>()
    for ((name, list) in times) {
        val since = max(now - windowMs, lastAlertAt[name] ?: 0)
        val recent = list.count { it in (since + 1)..now }
        if (recent >= count) hits[name] = recent
    }
    return hits
}

@Serializable
data class Position(val map: String? = null, val x: Double = 0.0, val y: Double = 0.0)

/** Latest activity per character: newest combat or game log entry, or a position change. */
fun activityTimes(previous: Map<String, Long>, combatLogs: JsonObject?, gameLogs: JsonObject?, positions: Map<String, Position>?, previousPositions: Map<String, Position>?, now: Long): Map<String, Long> {
    val result = previous.toMutableMap()
    fun bump(name: String, at: Long) { if (at > (result[name] ?: 0)) result[name] = at }
    for ((name, entries) in combatLogs.orEmpty()) for (entry in entries.arr()) bump(name, entry.obj()?.get("at").num().toLong())
    for ((name, entries) in gameLogs.orEmpty()) for (entry in entries.arr()) bump(name, entry.obj()?.get("at").num().toLong())
    for ((name, position) in positions.orEmpty()) {
        val before = previousPositions?.get(name)
        if (before == null || before.map != position.map || hypot(position.x - before.x, position.y - before.y) > 5) bump(name, now)
    }
    return result
}

/** Characters idle for [idleMs] (not the merchant, who legitimately stands still). */
fun idleCharacters(activity: Map<String, Long>, names: List<String>, merchantName: String?, now: Long, idleMs: Long): List<String> =
    names.filter { it != merchantName && (activity[it] ?: 0) != 0L && now - activity.getValue(it) >= idleMs }

data class Done(val title: String, val body: String)

private fun upgradeQuantity(rule: JsonElement?): Long =
    rule.obj()?.get("quantity").str()?.toDoubleOrNull()?.takeIf { it == floor(it) && kotlin.math.abs(it) <= 9007199254740991.0 }?.toLong() ?: -1

/** auto-upgrade / auto-compound rules whose remaining count reached zero. */
fun completedRules(previous: JsonObject, config: JsonObject): List<Done> {
    val done = mutableListOf<Done>()
    for ((owner, rules) in config["autoUpgradeMarks"].obj().orEmpty()) for ((key, rule) in rules.obj().orEmpty()) {
        val before = upgradeQuantity(previous["autoUpgradeMarks"].obj()?.get(owner).obj()?.get(key))
        if (before > 0 && upgradeQuantity(rule) == 0L) {
            val name = key.substringBefore("@+")
            val level = key.substringAfter("@+", "0").toDoubleOrNull() ?: 0.0
            val tiers = rule.obj()?.get("tiers").num()
            done += Done("Auto-upgrade rule done", "$name reached +${(level + tiers).toLong()}")
        }
    }
    for ((owner, rules) in config["autoCompounds"].obj().orEmpty()) for (rule in rules.arr().mapNotNull { it.obj() }) {
        val before = previous["autoCompounds"].obj()?.get(owner).arr().mapNotNull { it.obj() }.find { it["name"].str() == rule["name"].str() }
        if (before != null && before["quantity"].num() > 0 && rule["quantity"].num() == 0.0 && rule["quantity"] != null) {
            done += Done("Auto-compound rule done", "${rule["name"].str()} reached +${rule["targetTier"].str()}")
        }
    }
    return done
}

/** Merchant buy orders with an upgrade target that left the queue. */
/** The queue plus merchantCurrent: the job being worked on moves out of the
 *  queue into merchantCurrent, which is not finishing. */
fun trackedOrders(core: JsonObject): List<JsonObject> =
    (core["merchantQueue"].arr().mapNotNull { it.obj() } + listOfNotNull(core["merchantCurrent"].obj())).map { job ->
        val order = job["order"].obj()
        JsonObject(buildMap {
            job["id"]?.let { put("id", it) }
            if (order != null) put("order", JsonObject(mapOf("buys" to (order["buys"] ?: kotlinx.serialization.json.JsonArray(emptyList())))))
        })
    }

fun finishedUpgradeOrders(previousQueue: List<JsonObject>, queue: List<JsonObject>): List<Done> {
    val remaining = queue.mapNotNull { it["id"].str() }.toSet()
    val finished = mutableListOf<Done>()
    for (job in previousQueue) {
        if (job["id"].str() in remaining) continue
        for (buy in job["order"].obj()?.get("buys").arr().mapNotNull { it.obj() }) {
            if (buy["level"].num() > 0) finished += Done("Buy-and-upgrade order finished", "${buy["quantity"].str()} × ${buy["id"].str()} to +${buy["level"].str()}")
        }
    }
    return finished
}

/** The event ids any character has selected (selectedEvents, unioned). */
fun selectedEventIds(config: JsonObject): Set<String> {
    val supported = listOf("anniversary", "abtesting", "goobrawl", "crabxx", "franky", "icegolem", "snowman")
    val ids = linkedSetOf<String>()
    for ((_, list) in config["eventSelectionsByCharacter"].obj().orEmpty()) for (id in list.arr()) id.str()?.let { ids += it }
    for ((_, enabled) in config["eventsByCharacter"].obj().orEmpty()) if (enabled.str() == "true") ids += supported
    return ids
}

@Serializable
data class ScheduleSeen(val id: String, val name: String? = null, val live: Boolean = false)

/** Selected events that were live and no longer are. */
fun endedEvents(previous: List<ScheduleSeen>, schedules: List<JsonObject>, selected: Set<String>): List<ScheduleSeen> {
    val live = schedules.filter { it["live"].str() == "true" }.mapNotNull { it["id"].str() }.toSet()
    return previous.filter { it.live && it.id !in live && it.id in selected }
}

@Serializable
data class RareInfo(val name: String, val gold: Double, val chance: Double?)

/** Item id → name, base value and best drop chance from the catalog. */
fun rareIndex(allItems: List<JsonElement>): Map<String, RareInfo> = allItems.mapNotNull { it.obj() }.associate { item ->
    val best = item["meta"].obj()?.get("world").obj()?.get("drops").arr().maxOfOrNull { it.obj()?.get("rate").num() } ?: 0.0
    val id = item["id"].str().orEmpty()
    id to RareInfo(item["name"].str() ?: id, item["meta"].obj()?.get("definition").obj()?.get("g").num(), if (best > 0) best else null)
}

/** Whether a looted item counts as rare under the account's rule. */
fun isRareDrop(info: RareInfo?, rare: RareRule): Boolean {
    info ?: return false
    val byChance = info.chance != null && info.chance < 1.0 / rare.chanceOneIn
    val byValue = info.gold >= rare.minGold
    return when (rare.mode) { "both" -> byChance && byValue; "value" -> byValue; else -> byChance }
}

/** merchant-activity entries worth a trading notification. */
/** One notification for every trade found in a poll, so a busy stand doesn't send a burst. */
fun tradeDigest(notices: List<Done>): Done? {
    if (notices.size <= 1) return notices.firstOrNull()
    val shown = notices.take(3).map { it.body } + listOfNotNull(if (notices.size > 3) "…and ${notices.size - 3} more" else null)
    return Done("${notices.size} trades", shown.joinToString("\n"))
}

/** The newest message counted as an error for [name], for the alert text. */
fun latestError(gameLogs: JsonObject?, merchantActivity: List<JsonElement>, merchantName: String?, name: String): String {
    val game = gameLogs?.get(name).arr().mapNotNull { it.obj() }.filter { isAlertableGameLogError(it["message"].str()) }
    val merchant = if (name == merchantName) merchantActivity.mapNotNull { it.obj() }.filter { isAlertableActivityError(it) } else emptyList()
    val newest = (game + merchant).maxByOrNull { it["at"].num() } ?: return ""
    return newest["message"].str().orEmpty().replace(Regex("\\s+"), " ").take(160)
}

fun tradeNotice(entry: JsonObject?): Done? {
    val message = entry?.get("message").str().orEmpty()
    val level = entry?.get("level").str()
    if (level == "error") return null
    // NPC sales are the merchant's own automatic selling, not a trade.
    if (Regex("\\bto NPC\\b", RegexOption.IGNORE_CASE).containsMatchIn(message)) return null
    return when {
        Regex("^Sold .+ at stand").containsMatchIn(message) -> Done("Stand sale", message)
        message.startsWith("WTB filled for ") -> Done("WTB order filled", message)
        message.startsWith("Bought ") -> Done("Purchase completed", message)
        level == "success" && Regex("\\bsold\\b", RegexOption.IGNORE_CASE).containsMatchIn(message) -> Done("Sale completed", message)
        else -> null
    }
}

/** Entries newer than [since] (the latest `at` already handled). */
fun newEntries(entries: List<JsonObject>, since: Long): List<JsonObject> = entries.filter { it["at"].num().toLong() > since }.sortedBy { it["at"].num() }

/** Mail ids not seen before. */
fun newMail(messages: List<JsonObject>, seen: Set<String>): List<JsonObject> = messages.filter { it["id"].str()?.let { id -> id.isNotEmpty() && id !in seen } == true }

@Serializable
data class QuietHours(val start: String, val end: String)

/** Whether [minutesOfDay] (local) falls in quiet hours ("HH:MM", may wrap midnight). */
fun inQuietHours(quiet: QuietHours?, minutesOfDay: Int): Boolean {
    quiet ?: return false
    fun minutes(text: String): Int {
        val parts = text.split(":")
        return ((parts.getOrNull(0)?.toIntOrNull() ?: 0) % 24) * 60 + (parts.getOrNull(1)?.toIntOrNull() ?: 0)
    }
    val start = minutes(quiet.start)
    val end = minutes(quiet.end)
    return if (start <= end) minutesOfDay in start until end else minutesOfDay >= start || minutesOfDay < end
}

/** Characters whose bag is full: every slot up to the reported inventory size is taken. */
fun fullInventories(inventory: JsonObject?, fast: JsonObject?, names: List<String>): List<String> = names.filter { name ->
    val items = inventory?.get(name).obj()?.get("items") as? JsonArray ?: return@filter false
    val size = fast?.get(name).obj()?.get("inventorySize").num().toInt().takeIf { it != 0 } ?: items.size
    size > 0 && items.take(size).count { it !is JsonNull } >= size
}

/** Free slots across every unlocked bank pack, or null before the bank has been seen. */
fun bankFreeSlots(bank: JsonObject?): Int? {
    val packs = bank?.get("packs").obj()?.takeIf { it.isNotEmpty() } ?: return null
    return packs.values.sumOf { pack -> (pack as? JsonArray)?.count { it is JsonNull } ?: 0 }
}

/** Names newly in [current] that weren't in [previous] - alert once per fill. */
fun newlyAdded(previous: List<String>, current: List<String>) = current.filter { it !in previous }

/** Whether this device wants [alert] now: switched on, not muted for the character,
 *  and not in quiet hours unless urgent. */
fun wanted(prefs: DevicePrefs, alert: String, character: String?, minutesOfDay: Int): Boolean =
    alert in prefs.alerts && !(character != null && character in prefs.muted) && !(alert !in URGENT_ALERTS && inQuietHours(prefs.quiet, minutesOfDay))

@Serializable
data class DevicePrefs(val alerts: List<String> = ALERTS, val quiet: QuietHours? = null, val muted: List<String> = emptyList())
