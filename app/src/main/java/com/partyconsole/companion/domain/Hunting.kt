package com.partyconsole.companion.domain

import com.partyconsole.companion.model.HuntBlacklistEntry
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// Passive rare-hunt settings, spawn keys and blacklist labels.
// PWA: web/src/lib/hunting.ts.

data class PassiveRule(val enabled: Boolean, val keepMoving: Boolean, val priority: Int, val maxLevel: Int? = -1)
data class PassiveSettings(val rules: Map<String, PassiveRule>, val useFieldGenerators: Boolean)

val LEGACY_PRIORITIES = mapOf("tinyp" to 101, "phoenix" to 100, "goldenbat" to 100, "cutebee" to 100, "hen" to 100, "rooster" to 100)

fun defaultPassiveRule(id: String) = PassiveRule(enabled = false, keepMoving = false, priority = LEGACY_PRIORITIES[id] ?: 100, maxLevel = -1)

private fun JsonElement?.bool(): Boolean? = (this as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content?.toBooleanStrictOrNull()
private fun JsonElement?.int(): Int? = (this as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content?.toDoubleOrNull()?.toInt()

/** Version-1 settings as saved, else the legacy passiveRareHunts booleans
 *  as rules (field generators on). */
fun migratePassiveSettings(saved: JsonElement?, legacy: Map<String, Boolean> = emptyMap()): PassiveSettings {
    val obj = saved as? JsonObject
    if (obj != null && obj["version"].int() == 1) {
        val rules = (obj["rules"] as? JsonObject).orEmpty().mapNotNull { (id, raw) ->
            val rule = raw as? JsonObject ?: return@mapNotNull null
            val base = defaultPassiveRule(id)
            id to PassiveRule(
                enabled = rule["enabled"].bool() ?: false,
                keepMoving = rule["keepMoving"].bool() ?: false,
                priority = rule["priority"].int() ?: base.priority,
                maxLevel = if ("maxLevel" in rule) rule["maxLevel"].int() else null,
            )
        }.toMap()
        return PassiveSettings(rules, obj["useFieldGenerators"].bool() ?: false)
    }
    return PassiveSettings(legacy.mapValues { (id, enabled) -> defaultPassiveRule(id).copy(enabled = enabled) }, useFieldGenerators = true)
}

/** JSON.stringify of a number: integers without a decimal point. */
private fun jsNumber(value: Double): String =
    if (value.isNaN() || value.isInfinite()) "null" else if (value == Math.floor(value) && Math.abs(value) < 1e21) value.toLong().toString() else value.toString()

/** Stable across catalog ordering; coordinates identify the spawn center. */
fun huntSpawnKey(map: String, x: Double, y: Double): String =
    "[${JsonPrimitive(map)},${jsNumber(x)},${jsNumber(y)}]"

fun huntSpawnKey(area: Area): String = huntSpawnKey(area.map, area.x, area.y)

fun huntBlacklistLabel(entry: HuntBlacklistEntry): String {
    if (entry.reason == "Manually blacklisted") return "manually added"
    val expired = entry.expirations ?: if (entry.reason == "Hunt quest expired before completion") 1 else 0
    return listOfNotNull(
        if (entry.deaths != 0) "${entry.deaths} hunt death${if (entry.deaths == 1) "" else "s"}" else null,
        if (expired != 0) "$expired hunt${if (expired == 1) "" else "s"} expired" else null,
    ).joinToString(" · ")
}
