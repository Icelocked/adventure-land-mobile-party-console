package com.partyconsole.companion.notify

import android.content.Context
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.network.PartyApiClient
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.util.Calendar

/** One notification: what the PWA's push payload carries. [url] is the
 *  PWA route; [routeFor] maps it onto this app's navigation. */
data class Notice(val title: String, val body: String, val tag: String, val url: String)

/** The notifier's memory between polls, kept on the phone. */
@Serializable
data class WatchState(
    val problems: Map<String, String> = emptyMap(),
    val merchantSince: Long? = null,
    val combatSince: Long? = null,
    val mailSeen: List<String>? = null,
    val credentialFailed: Boolean = false,
    val activity: Map<String, Long> = emptyMap(),
    val positions: Map<String, Position> = emptyMap(),
    val idleAlerted: List<String> = emptyList(),
    val deathAlertAt: Map<String, Long> = emptyMap(),
    val errorAlertAt: Map<String, Long> = emptyMap(),
    val rules: JsonObject? = null,
    val queue: List<JsonObject>? = null,
    val schedules: List<ScheduleSeen>? = null,
    val selectedEvents: List<String>? = null,
    val merchant: String? = null,
    val fullBags: List<String> = emptyList(),
    val bankFull: Boolean = false,
    val liveNames: List<String> = emptyList(),
    val catalogRevision: String? = null,
    val tick: Long = 0,
)

/** This device's notification settings, limits and watch state. The PWA
 *  keeps limits on its notifier server; here they live on the phone. */
class NotifierStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("notifier", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    var enabled: Boolean
        get() = prefs.getBoolean("enabled", false)
        set(value) = prefs.edit().putBoolean("enabled", value).apply()

    /** Poll every 15 s from a foreground service instead of every 15 min. */
    var live: Boolean
        get() = prefs.getBoolean("live", false)
        set(value) = prefs.edit().putBoolean("live", value).apply()

    var device: DevicePrefs
        get() = read("device") ?: DevicePrefs()
        set(value) = write("device", value)

    var limits: NotifierLimits
        get() = read("limits") ?: NotifierLimits()
        set(value) = write("limits", value)

    var watch: WatchState
        get() = read("watch") ?: WatchState()
        set(value) = write("watch", value)

    /** Rare-drop index for the catalog revision in [WatchState.catalogRevision]. */
    var rareIndex: Map<String, RareInfo>?
        get() = read("rareIndex")
        set(value) = if (value == null) prefs.edit().remove("rareIndex").apply() else write("rareIndex", value)

    private inline fun <reified T> read(key: String): T? = prefs.getString(key, null)?.let { runCatching { json.decodeFromString<T>(it) }.getOrNull() }
    private inline fun <reified T> write(key: String, value: T) = prefs.edit().putString(key, json.encodeToString(kotlinx.serialization.serializer<T>(), value)).apply()
}

/** The notifier poll, run on the phone (PWA: web/notifier/server.mjs).
 *  Config, bank and mail are read every 4th tick, logs and inventory every
 *  2nd. [deliver] shows one notice. */
class Notifier(
    private val api: PartyApiClient,
    private val store: NotifierStore,
    private val deliver: (Notice) -> Unit,
    private val minutesOfDay: () -> Int = { Calendar.getInstance().let { it.get(Calendar.HOUR_OF_DAY) * 60 + it.get(Calendar.MINUTE) } },
) {
    private val json = Json { ignoreUnknownKeys = true }
    private class AuthLost : Exception()

    private lateinit var watch: WatchState
    private lateinit var limits: NotifierLimits
    private lateinit var device: DevicePrefs

    private fun push(alert: String, notice: Notice, character: String? = null) {
        if (wanted(device, alert, character, minutesOfDay())) deliver(notice)
    }
    private fun wants(alert: String) = alert in device.alerts

    private suspend fun get(path: String): JsonObject = when (val result = api.get(path)) {
        is ApiResult.Success -> json.parseToJsonElement(result.value) as? JsonObject ?: JsonObject(emptyMap())
        is ApiResult.Failure -> if (result.code == "session_expired") throw AuthLost() else throw java.io.IOException(result.message)
    }
    private suspend fun section(name: String) = get("state?catalog=0&dashboard=1&section=$name")

    /** One poll. [tick] counts polls (1 first); a periodic job passes a
     *  multiple of 4 so every check runs. Returns false on failure. */
    suspend fun poll(tick: Long = store.watch.tick + 1): Boolean {
        watch = store.watch.copy(tick = tick)
        limits = store.limits
        device = store.device
        return try {
            if (tick == 1L || tick % 4 == 0L) checkConfig()
            val fast = section("fast")
            val positions = fast["characters"].obj().orEmpty().mapValues { (_, value) ->
                val v = value.obj()
                Position(v?.get("map").str(), v?.get("x").num(), v?.get("y").num())
            }
            val now = checkCore(positions)
            if (tick % 2 == 0L) checkLogs(now)
            if (tick % 2 == 0L) checkStorage(fast, tick % 4 == 0L)
            if (tick % 4 == 0L) checkMail()
            watch = watch.copy(credentialFailed = false)
            true
        } catch (_: AuthLost) {
            if (!watch.credentialFailed) {
                watch = watch.copy(credentialFailed = true)
                deliver(Notice("Notifications paused", "Open Party Console and pair this phone again to reconnect.", "notifier-credential", "/settings"))
            }
            false
        } catch (_: Exception) {
            false
        } finally {
            store.watch = watch
        }
    }

    private fun characterUrl(name: String) = "/characters/$name"

    private suspend fun checkCore(positions: Map<String, Position>): Long {
        val core = section("core")
        val now = core["serverNow"].num().toLong().takeIf { it != 0L } ?: System.currentTimeMillis()
        val names = liveCharacters(core)
        // Stuck or offline.
        val problems = characterProblems(core, now, limits.stuckMinutes * 60_000L)
        for (event in problemTransitions(watch.problems, problems)) {
            val problem = event.problem
            push(
                "stuck",
                if (problem != null) Notice("${event.name}: ${if (problem.startsWith("No update")) "not reporting" else problem}", problem, "character-${event.name}", characterUrl(event.name))
                else Notice("${event.name} is reporting again", "Back to normal.", "character-${event.name}", characterUrl(event.name)),
                event.name,
            )
        }
        // Buy-and-upgrade orders that left the merchant queue. The job being
        // worked on moves into merchantCurrent, which is not finishing.
        val queue = trackedOrders(core)
        watch.queue?.let { previous -> for (done in finishedUpgradeOrders(previous, queue)) push("orders", Notice(done.title, done.body, "order-${done.body}", "/")) }
        // Events that ended.
        val schedules = core["eventSchedules"].arr().mapNotNull { it.obj() }
        val previousSchedules = watch.schedules
        val selected = watch.selectedEvents
        if (previousSchedules != null && selected != null) {
            for (event in endedEvents(previousSchedules, schedules, selected.toSet())) push("events", Notice("${event.name ?: event.id} ended", "The event is over.", "event-${event.id}", "/"))
        }
        // No actions (activity is refreshed from logs and positions).
        val activity = activityTimes(watch.activity, null, null, positions, watch.positions, now)
        val idle = idleCharacters(activity, names.filter { it !in problems }, watch.merchant, now, limits.idleMinutes * 60_000L)
        for (name in idle) if (name !in watch.idleAlerted) push("idle", Notice("$name: no actions", "Nothing done for ${limits.idleMinutes}+ minutes.", "idle-$name", characterUrl(name)), name)
        watch = watch.copy(
            liveNames = names,
            problems = problems,
            queue = queue,
            schedules = schedules.map { ScheduleSeen(it["id"].str().orEmpty(), it["name"].str(), it["live"].str() == "true") },
            activity = activity,
            positions = positions,
            idleAlerted = idle,
        )
        val revision = core["referenceRevision"].str()
        if (revision != null && revision != watch.catalogRevision && wants("rare")) {
            val catalog = section("catalog")
            store.rareIndex = rareIndex(catalog["merchantCatalog"].obj()?.get("allItems").arr())
            watch = watch.copy(catalogRevision = revision)
        }
        return now
    }

    private suspend fun checkLogs(now: Long) {
        val logs = section("logs")
        val combatLogs = logs["combatLogs"].obj() ?: JsonObject(emptyMap())
        val gameLogs = logs["gameLogs"].obj() ?: JsonObject(emptyMap())
        val activity = logs["merchantActivity"].arr().mapNotNull { it.obj() }
        var next = watch.copy(activity = activityTimes(watch.activity, combatLogs, gameLogs, null, null, now))
        // Trading notices from the merchant activity log; the first read only marks where history ends.
        val latest = activity.maxOfOrNull { it["at"].num().toLong() }?.coerceAtLeast(0) ?: 0
        val merchantSince = next.merchantSince ?: latest
        tradeDigest(newEntries(activity, merchantSince).mapNotNull { tradeNotice(it) })?.let { push("trading", Notice(it.title, it.body, "trade-$latest", "/")) }
        // Rare drops from new loot entries.
        val combatEntries = combatLogs.flatMap { (name, entries) -> entries.arr().mapNotNull { it.obj() }.map { JsonObject(it + ("name" to JsonPrimitive(name))) } }
        val latestCombat = combatEntries.maxOfOrNull { it["at"].num().toLong() }?.coerceAtLeast(0) ?: 0
        val combatSince = next.combatSince ?: latestCombat
        val index = if (next.catalogRevision != null) store.rareIndex else null
        if (index != null) for (entry in newEntries(combatEntries, combatSince)) {
            if (entry["type"].str() != "loot") continue
            val details = entry["details"].obj()
            val info = index[details?.get("item").str()]
            if (info != null && isRareDrop(info, limits.rare)) {
                val name = entry["name"].str().orEmpty()
                val quantity = details?.get("quantity").str()?.takeIf { it != "0" } ?: "1"
                push("rare", Notice("Rare drop: ${info.name}", "$name looted $quantity × ${info.name}", "rare-$name-${entry["at"].num().toLong()}", characterUrl(name)), name)
            }
        }
        // Repeated deaths.
        val deathAlertAt = next.deathAlertAt.toMutableMap()
        for ((name, count) in bursts(deathTimes(combatLogs), now, limits.deaths.count, limits.deaths.minutes * 60_000L, next.deathAlertAt)) {
            deathAlertAt[name] = now
            push("deaths", Notice("$name keeps dying", "$count deaths in the last ${limits.deaths.minutes} minutes.", "deaths-$name", characterUrl(name)), name)
        }
        // Error bursts.
        val errorAlertAt = next.errorAlertAt.toMutableMap()
        for ((name, count) in bursts(errorTimes(gameLogs, activity, next.merchant), now, limits.errors.count, limits.errors.minutes * 60_000L, next.errorAlertAt)) {
            errorAlertAt[name] = now
            val last = latestError(gameLogs, activity, next.merchant, name)
            push("errors", Notice("$name: repeated errors", "$count errors in the last ${limits.errors.minutes} minutes." + if (last.isNotEmpty()) " Latest: $last" else "", "errors-$name", if (name == next.merchant) "/" else characterUrl(name)), name)
        }
        next = next.copy(
            merchantSince = maxOf(merchantSince, latest),
            combatSince = maxOf(combatSince, latestCombat),
            deathAlertAt = deathAlertAt,
            errorAlertAt = errorAlertAt,
        )
        watch = next
    }

    private suspend fun checkConfig() {
        val config = section("config")
        val rules = JsonObject(mapOf("autoUpgradeMarks" to (config["autoUpgradeMarks"].obj() ?: JsonObject(emptyMap())), "autoCompounds" to (config["autoCompounds"].obj() ?: JsonObject(emptyMap()))))
        watch.rules?.let { previous -> for (done in completedRules(previous, rules)) push("rules", Notice(done.title, done.body, "rule-${done.body}", "/")) }
        watch = watch.copy(merchant = config["merchantCharacter"].str()?.ifEmpty { null }, rules = rules, selectedEvents = selectedEventIds(config).toList())
    }

    /** Inventory full (each time a bag fills up) and bank full (each time
     *  the last free bank slot goes). */
    private suspend fun checkStorage(fast: JsonObject, withBank: Boolean) {
        if (wants("inventory")) {
            val inventory = section("inventory")
            val full = fullInventories(inventory["characters"].obj(), fast["characters"].obj(), watch.liveNames)
            for (name in newlyAdded(watch.fullBags, full)) push("inventory", Notice("$name: inventory full", "No free bag slots left.", "inventory-$name", characterUrl(name)), name)
            watch = watch.copy(fullBags = full)
        }
        if (withBank && wants("bank")) {
            val bank = get("state?section=bank&dashboard=1")
            val free = bankFreeSlots(bank["bank"].obj())
            if (free != null) {
                if (free == 0 && !watch.bankFull) push("bank", Notice("Bank full", "Every unlocked bank pack is out of free slots.", "bank-full", "/bank"))
                watch = watch.copy(bankFull = free == 0)
            }
        }
    }

    private suspend fun checkMail() {
        val messages = get("mail")["messages"].arr().mapNotNull { it.obj() }
        val ids = messages.map { it["id"].str().orEmpty() }
        val seen = (watch.mailSeen ?: ids).toSet()
        for (message in newMail(messages, seen)) push("mail", Notice("Mail from ${message["from"].str()?.ifEmpty { null } ?: "someone"}", message["subject"].str()?.ifEmpty { null } ?: "(No subject)", "mail-${message["id"].str()}", "/mail"))
        watch = watch.copy(mailSeen = ids)
    }
}

/** The PWA notice url → this app's navigation route (null: the party screen). */
fun routeFor(url: String): String? = when {
    url.startsWith("/characters/") -> "characters/" + java.net.URLDecoder.decode(url.removePrefix("/characters/"), "UTF-8")
    url == "/bank" -> "account/bank"
    url == "/mail" -> "account/mail"
    url == "/settings" -> "account/settings"
    else -> null
}

/** The screen a tapped notification asked for, consumed by the party view. */
object PendingRoute {
    val route = kotlinx.coroutines.flow.MutableStateFlow<String?>(null)

    fun from(intent: android.content.Intent?) {
        val url = intent?.getStringExtra(AlertNotifications.EXTRA_ROUTE) ?: return
        intent.removeExtra(AlertNotifications.EXTRA_ROUTE)
        routeFor(url)?.let { route.value = it }
    }
}
