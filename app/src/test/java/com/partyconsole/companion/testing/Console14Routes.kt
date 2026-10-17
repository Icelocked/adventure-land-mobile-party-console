package com.partyconsole.companion.testing

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
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
    // Console 1.4 defaults (initial-core.ts initialBossChase, initialRealmHopBlacklist).
    put("bossChase", Json.parseToJsonElement("""{"enabled":false,"minEtaMinutes":15,"trip":null,"returning":null,"retryAt":0,"lastError":null,"checkedAt":0,"sightings":[],"respawns":[]}"""), "config")
    put("realmHopBlacklist", JsonArray(emptyList()), "config")
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

    // Franky routine: http/encounter-mode.ts behind farming-scope.ts, which refuses followers.
    routes["encounter-mode"] = route@{ body ->
        val name = body["character"].str() ?: return@route error(400, "invalid character")
        val leader = field("leader").str()
        if (leader != null && name != leader && field("followers").obj()?.get(name).str() == "true") return@route error(409, "following leader settings")
        if (body["encounter"].str() != "franky") return@route error(400, "invalid encounter mode")
        val mode = body["mode"].str()
        val deathLimit = body["deathLimit"]
        if (mode == null && deathLimit == null) return@route error(400, "no encounter setting provided")
        if (mode != null && mode !in listOf("auto", "offtank", "tank")) return@route error(400, "invalid encounter mode")
        val limit = (deathLimit as? JsonPrimitive)?.doubleOrNull
        if (deathLimit != null && (limit == null || limit < 0 || limit != Math.floor(limit))) return@route error(400, "invalid death limit")
        fun JsonObject?.with(key: String, value: JsonElement?) = if (value == null) (this ?: JsonObject(emptyMap())) else JsonObject(this.orEmpty() + (key to value))
        if (name == leader) {
            put("encounterRoutines", field("encounterRoutines").obj().with("franky", mode?.let { JsonPrimitive(it) }))
            put("encounterAutoDeathLimits", field("encounterAutoDeathLimits").obj().with("franky", deathLimit))
        } else {
            val profiles = field("farmingProfiles").obj().orEmpty()
            val profile = profiles[name].obj().orEmpty()
            val next = JsonObject(
                profile + ("encounterRoutines" to profile["encounterRoutines"].obj().with("franky", mode?.let { JsonPrimitive(it) })) +
                    ("encounterAutoDeathLimits" to profile["encounterAutoDeathLimits"].obj().with("franky", deathLimit)),
            )
            put("farmingProfiles", JsonObject(profiles + (name to next)), "config")
        }
        ok(""","encounter":"franky"""")
    }

    // Gear sets: characters/gear-sets.ts. Save captures the character's worn gear.
    routes["gear-sets"] = route@{ body ->
        val name = body["character"].str().orEmpty()
        val set = body["set"].str().orEmpty()
        if (name !in characterNames()) return@route error(400, "invalid character")
        if (set !in listOf("luck", "tank", "gold")) return@route error(400, "invalid gear set")
        val all = field("gearSets").obj().orEmpty()
        val sets = all[name].obj().orEmpty()
        val next: JsonObject = when (body["action"].str()) {
            "clear" -> JsonObject(sets - set)
            "save" -> {
                if (name in staleEquipment) return@route error(409, "no fresh equipment report for $name")
                val worn = ((sections["inventory"]?.get("characters") as? JsonObject)?.get(name) as? JsonObject)?.get("slots").obj().orEmpty()
                val slots = buildMap {
                    for (slot in listOf("mainhand", "offhand", "chest", "pants", "helmet", "gloves", "shoes", "cape", "belt", "orb", "amulet", "ring1", "ring2", "earring1", "earring2", "elixir")) {
                        val item = worn[slot].obj()?.get("item").obj() ?: continue
                        put(slot, JsonObject(item.filterKeys { it in setOf("name", "level", "p", "stat_type") }))
                    }
                }
                if (slots.isEmpty()) return@route error(409, "nothing is equipped in the gear set slots")
                JsonObject(sets + (set to JsonObject(mapOf("slots" to JsonObject(slots), "savedAt" to JsonPrimitive(System.currentTimeMillis())))))
            }
            else -> return@route error(400, "invalid gear set action")
        }
        put("gearSets", JsonObject(all + (name to next)), "config")
        ok()
    }

    // http/party-actions.ts escape/resume releases the hold (stage "released") and answers {escape}.
    routes["escape/resume"] = { _ ->
        escape = escape?.let { JsonObject(Json.parseToJsonElement(it).jsonObject + ("stage" to JsonPrimitive("released"))).toString() }
        200 to """{"escape":${escape ?: "null"}}"""
    }

    // events/boss-chase.ts update() and navigation/realm-hop-blacklist.ts.
    routes["realm/boss-chase"] = route@{ body ->
        val chase = field("bossChase").obj().orEmpty().toMutableMap()
        body["enabled"]?.let { chase["enabled"] = JsonPrimitive((it as? JsonPrimitive)?.booleanOrNull == true) }
        body["minEtaMinutes"]?.let {
            val minEta = (it as? JsonPrimitive)?.doubleOrNull
            if (minEta == null || minEta < 0 || minEta > 600) return@route error(400, "minEtaMinutes must be between 0 and 600")
            chase["minEtaMinutes"] = it
        }
        if (chase["enabled"].str() != "true") { chase["trip"] = JsonNull; chase["returning"] = JsonNull }
        put("bossChase", JsonObject(chase), "config")
        ok()
    }
    routes["realm/hop-blacklist"] = route@{ body ->
        val realms = (body["realms"] as? JsonArray)?.map { it.str() }
        if (realms == null || realms.any { it == null }) return@route error(400, "realms must be a list of realm keys")
        if (realms.toSet().size != realms.size) return@route error(400, "realms must not repeat")
        val known = (field("realmControl").obj()?.get("realms") as? JsonArray)?.mapNotNull { it.obj()?.get("key").str() }.orEmpty()
        val unknown = realms.filter { it !in known }
        if (unknown.isNotEmpty()) return@route error(400, "unknown Adventure Land realm: " + unknown.joinToString(", "))
        put("realmHopBlacklist", body["realms"]!!, "config")
        ok()
    }

    // merchant/bank-sort.ts configure(): the layout part.
    routes["merchant/bank-sort"] = route@{ body ->
        val layout = body["layout"].str() ?: return@route null
        if (layout !in listOf("packed", "gapped")) return@route error(400, "invalid bank sort setting")
        put("bankSortLayout", JsonPrimitive(layout))
        ok()
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

    // http/native-stand.ts resolvePurchase(): settles one unconfirmed purchase.
    routes["merchant/native-stand"] = route@{ body ->
        if (body["action"].str() != "resolve-purchase") return@route null
        val stand = field("nativeStand").obj().orEmpty()
        val purchases = stand["purchases"].obj().orEmpty()
        val id = body["id"].str().orEmpty()
        if (id !in purchases || (body["bought"] as? JsonPrimitive)?.booleanOrNull == null) return@route error(409, "That purchase is no longer pending")
        put("nativeStand", JsonObject(stand + ("purchases" to JsonObject(purchases - id))), "config")
        ok()
    }

    // http/manual-market-orders.ts: a snapshot entry older than two minutes is refused unless `check` is true.
    for (path in listOf("merchant/aldata-order", "merchant/aldata-sale")) {
        routes[path] = route@{ body ->
            val sale = path == "merchant/aldata-sale"
            val key = (if (sale) body["order"] else body["listing"]).obj()?.get("key").str()
            val aldata = field("aldata").obj()
            val listing = (aldata?.get(if (sale) "buyOrders" else "listings") as? JsonArray)?.mapNotNull { it.obj() }?.firstOrNull { it["key"].str() == key } ?: return@route null
            if (listing["serverIdentifier"].str() == "PVP") return@route error(409, "automatic PVP realm travel is disabled")
            val seenAt = listing["seenAt"].str()?.toDoubleOrNull() ?: 0.0
            if (body["check"].str() != "true" && seenAt < System.currentTimeMillis() - 120_000) return@route error(409, if (sale) "buy order is stale; refresh the market first" else "listing is stale; refresh the market first")
            null
        }
    }

    // characters/cosmetic-commands.ts: each cx- command is checked against the latest cosmetics report.
    routes["command"] = route@{ body ->
        val type = body["type"].str().orEmpty()
        if (!type.startsWith("cx-")) return@route null
        val report = ((sections["core"]?.get("characterDetails") as? JsonObject)?.get(body["character"].str()) as? JsonObject)?.get("cosmetics").obj()
            ?: return@route error(409, "No cosmetics report from this character yet")
        val owned = (report["owned"] as? JsonArray)?.mapNotNull { it.obj() }?.firstOrNull { it["name"].str() == body["name"].str() }
        when (type) {
            "cx-open-jar" -> {
                val jar = (report["jars"] as? JsonArray)?.mapNotNull { it.obj() }?.firstOrNull { it["inventorySlot"].str() == body["inventorySlot"].str() }
                if (jar?.get("usable").str() != "true" || jar?.get("data").str() == null) return@route error(400, "That inventory slot has no usable CX jar")
            }
            "cx-wear" -> if (owned == null || owned["kind"].str() != "appearance" || owned["slot"].str() == null || owned["slot"].str() != body["slot"].str()) return@route error(400, "Only an owned appearance cosmetic can be worn, in its own slot")
            "cx-emote" -> if (owned == null || owned["kind"].str() != "emote") return@route error(400, "Only an owned emote can be used")
            "cx-remove" -> if (body["slot"].str() == "skin" || report["worn"].obj()?.get(body["slot"].str()) == null) return@route error(400, "Nothing removable is worn in that slot")
            else -> return@route error(400, "invalid command")
        }
        ok()
    }

    // Access-code pairing (tools/hosting/access.ts, setup-routes.ts): /setup/invite
    // issues a code that replaces the previous one; /setup/pair ignores case,
    // spaces and dashes, and the fifth wrong guess cancels the code.
    // setup-routes.ts setupState(): accessCodeExpiresAt only while pairing is required.
    setupState = { if (requirePairing) """{"ok":true,"requirePairing":true,"accessCodeExpiresAt":${activeAccessCode()?.second ?: "null"}}""" else """{"ok":true,"requirePairing":false}""" }
    routes["/setup/invite"] = route@{ _ ->
        if (requirePairing && !setupPaired) return@route error(401, "Pair this browser before changing setup")
        accessCode = Triple(nextAccessCode, System.currentTimeMillis() + accessCodeTtlMs, 0)
        200 to """{"token":"${"c0ffee".repeat(10)}c0de","code":"$nextAccessCode","expiresAt":${accessCode!!.second},"expiresIn":$accessCodeTtlMs}"""
    }
    routes["/setup/pair"] = route@{ body ->
        pairRequests += body
        val typed = body["code"].str()?.takeIf { it.isNotEmpty() } ?: return@route ok().also { setupPaired = true }
        val code = activeAccessCode() ?: return@route error(400, "Access code is invalid or expired")
        if (typed.uppercase().replace(Regex("[\\s-]"), "") != code.first.replace("-", "")) {
            accessCode = if (code.third + 1 >= 5) null else code.copy(third = code.third + 1)
            return@route error(400, "Access code is invalid or expired")
        }
        accessCode = null
        setupPaired = true
        ok()
    }
}

private fun FakeConsole.activeAccessCode(): Triple<String, Long, Int>? {
    accessCode?.let { if (System.currentTimeMillis() >= it.second) accessCode = null }
    return accessCode
}
