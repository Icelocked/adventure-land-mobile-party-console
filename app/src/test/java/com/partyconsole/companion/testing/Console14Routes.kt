package com.partyconsole.companion.testing

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject

// The console 1.4 routes of the PWA's e2e mock (web/e2e/fixtures/mockPartyServer.ts
// on branch console-1.4), so the app's tests see the same answers and the
// same state changes as the PWA's. Each route answers like the mock and
// writes its change back into the section the mock serves it from.

/** dashboard/lib/event-policy.ts supportedEvents, which /formation's
 *  eventPriorities must permute and eventLimits must name. */
private val SUPPORTED_EVENTS = listOf("anniversary", "abtesting", "goobrawl", "crabxx", "franky", "icegolem", "snowman", "slenderman", "mrgreen", "mrpumpkin")

private fun ok(extra: String = "") = 200 to """{"ok":true$extra}"""
private fun error(status: Int, message: String) = status to Json.encodeToString(JsonObject.serializer(), JsonObject(mapOf("error" to JsonPrimitive(message))))
private fun JsonElement?.str() = (this as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content
private fun JsonElement?.obj() = this as? JsonObject

/** A state field from whichever section serves it. */
fun FakeConsole.field(key: String): JsonElement? = sections.values.firstNotNullOfOrNull { it[key] }

/** Writes a state field into the section that already has it, else [section]. */
fun FakeConsole.put(key: String, value: JsonElement, section: String = "core") {
    val owner = sections.entries.firstOrNull { key in it.value }?.key ?: section
    override(owner, mapOf(key to value))
}

private fun FakeConsole.characterNames(): List<String> =
    (sections["inventory"]?.get("characters") as? JsonObject)?.keys?.toList().orEmpty()

private fun FakeConsole.ctype(name: String): String? =
    ((sections["core"]?.get("characterDetails") as? JsonObject)?.get(name) as? JsonObject)?.get("ctype").str()

internal fun FakeConsole.installConsole14Routes() {
    // Console 1.4 default (initial-core.ts).
    put("eventAttendance", JsonObject(emptyMap()), "config")

    routes["formation"] = route@{ body ->
        val name = body["character"].str() ?: return@route null
        if (body["eventLimits"] == null && body["eventPriorities"] == null) return@route null
        // http/formation.ts limits() then priorities(), each 400 on a bad value before the follower 409.
        val leader = field("leader").str()
        val merchant = field("merchantCharacter").str() ?: characterNames().firstOrNull { ctype(it) == "merchant" }
        val inherited = leader != null && name != leader && name != merchant && field("followers").obj()?.get(name).str() == "true"
        body["eventLimits"]?.let { patch ->
            val event = patch.obj()?.get("event").str()
            val limits = patch.obj()?.get("limits").obj()
            fun valid(key: String, check: (Double) -> Boolean) = limits?.get(key).let { it is JsonNull || ((it as? JsonPrimitive)?.doubleOrNull?.let(check) == true) }
            if (event !in SUPPORTED_EVENTS || limits == null || !valid("deathLimit") { it >= 0 && it == Math.floor(it) } || !valid("timeLimitMinutes") { it > 0 }) return@route error(400, "invalid event limits")
            if (inherited) return@route error(409, "using leader events")
            val saved = field("eventLimitsByCharacter").obj().orEmpty()
            val mine = saved[name].obj().orEmpty() + (event!! to JsonObject(mapOf("deathLimit" to limits["deathLimit"]!!, "timeLimitMinutes" to limits["timeLimitMinutes"]!!)))
            put("eventLimitsByCharacter", JsonObject(saved + (name to JsonObject(mine))), "config")
        }
        body["eventPriorities"]?.let { value ->
            val ids = (value as? JsonArray)?.map { it.str() }
            if (ids == null || ids.size != SUPPORTED_EVENTS.size || ids.toSet().size != ids.size || ids.any { it !in SUPPORTED_EVENTS }) return@route error(400, "invalid event priorities")
            if (inherited) return@route error(409, "using leader events")
            put("eventPrioritiesByCharacter", JsonObject(field("eventPrioritiesByCharacter").obj().orEmpty() + (name to value)), "config")
        }
        ok()
    }

    // http/party-actions.ts escape/resume releases the hold (stage "released") and answers {escape}.
    routes["escape/resume"] = { _ ->
        escape = escape?.let { JsonObject(Json.parseToJsonElement(it).jsonObject + ("stage" to JsonPrimitive("released"))).toString() }
        200 to """{"escape":${escape ?: "null"}}"""
    }

    // http/market-ignored-items.ts + runtime/market-preferences.ts.
    routes["market/ignored-items"] = route@{ body ->
        var items = (field("marketIgnoredItems") as? JsonArray)?.mapNotNull { it.obj() }.orEmpty()
        when (body["action"].str()) {
            "clear" -> items = emptyList()
            "add", "remove" -> {
                val name = body["name"].str()
                val level = (body["level"] as? JsonPrimitive)?.doubleOrNull ?: 0.0
                if (name == null || !Regex("^[a-z0-9_]{1,80}$", RegexOption.IGNORE_CASE).matches(name) || level < 0 || level > 100 || level != Math.floor(level)) return@route error(400, "Provide an item name and nonnegative whole item level")
                items = items.filter { "${it["name"].str()}|${it["level"].str() ?: "0"}" != "$name|${level.toInt()}" }
                if (body["action"].str() == "add") items = items + JsonObject(mapOf("name" to JsonPrimitive(name), "level" to JsonPrimitive(level.toInt())))
            }
            else -> return@route error(400, "Choose add, remove, or clear")
        }
        put("marketIgnoredItems", JsonArray(items), "config")
        ok()
    }

    // http/merchant-settings.ts luckySlotAction.
    routes["merchant/config"] = route@{ body ->
        val action = body["action"].str()
        if (action != "lock-lucky-slot" && action != "unlock-lucky-slot") return@route null
        val name = body["character"].str()
        if (name == null || ctype(name) != "merchant") return@route error(400, "select an owned merchant character")
        if (name != field("merchantCharacter").str()) return@route error(409, "merchant is no longer configured")
        val locks = field("luckySlotLocks").obj().orEmpty().toMutableMap()
        val resume = field("luckySlotResume").obj().orEmpty().toMutableMap()
        if (action == "unlock-lucky-slot") {
            val locked = locks[name].str()?.toIntOrNull()?.takeIf { it in 0 until 42 } ?: return@route error(409, "lucky slot is not locked")
            val slot = (locked + 1) % 42
            val rolls = field("luckySlotTracking").obj()?.get(name).obj()?.values?.sumOf { stream -> stream.obj()?.get("slots").obj()?.get("$slot").obj()?.get("totalRolls").str()?.toLongOrNull() ?: 0L } ?: 0L
            resume[name] = JsonObject(mapOf("slot" to JsonPrimitive(slot), "rolls" to JsonPrimitive(rolls)))
            locks.remove(name)
        } else {
            val slot = body["slot"].str()?.toIntOrNull()?.takeIf { it in 0 until 42 } ?: return@route error(400, "invalid lucky slot")
            locks[name] = JsonPrimitive(slot)
            resume.remove(name)
        }
        put("luckySlotLocks", JsonObject(locks))
        put("luckySlotResume", JsonObject(resume))
        ok()
    }

    // http/manual-market-orders.ts refuses a snapshot entry older than two minutes.
    for (path in listOf("merchant/aldata-order", "merchant/aldata-sale")) {
        routes[path] = route@{ body ->
            val sale = path == "merchant/aldata-sale"
            val key = (if (sale) body["order"] else body["listing"]).obj()?.get("key").str()
            val aldata = field("aldata").obj()
            val listing = (aldata?.get(if (sale) "buyOrders" else "listings") as? JsonArray)?.mapNotNull { it.obj() }?.firstOrNull { it["key"].str() == key } ?: return@route null
            if (listing["serverIdentifier"].str() == "PVP") return@route error(409, "automatic PVP realm travel is disabled")
            val seenAt = listing["seenAt"].str()?.toDoubleOrNull() ?: 0.0
            if (seenAt < System.currentTimeMillis() - 120_000) return@route error(409, if (sale) "buy order is stale; refresh the market first" else "listing is stale; refresh the market first")
            null
        }
    }
}
