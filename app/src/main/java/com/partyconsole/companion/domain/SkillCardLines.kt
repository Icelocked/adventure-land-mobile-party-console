package com.partyconsole.companion.domain

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// A port of the PWA's web/src/lib/skillCardLines.ts, which ports the console's
// skill-card.tsx line builders, which port the game's skill card (render_skill in the
// game's js/html.js): its line order and English labels (interface.skill.*). The game
// prints most lines gray; each line here takes a meaning color from the shared palette.

private const val WEAPON = "#56A244"
private val REQUIRED_COLORS = listOf("str", "int", "dex", "vit", "for").associateWith { statColor(it) }

// Skill extras labels colored by meaning; anything else reads light gray.
private val SKILL_EXTRA_COLORS = mapOf(
    "hostile" to "#E13758", "target" to statColor("evasion"), "procs" to "#3BE681", "projectile" to "#B484E5", "party" to "#CB83AC",
    "heal" to "#CB83AC", "damage" to "#DB2900", "damage_multiplier" to "#DB2900", "ratio" to "#DB2900", "pierces_immunity" to "#E52967",
    "multi" to "#FFDE2F", "class" to "#4EB7DE", "aura" to "#FC5F39",
)
private val HEADER_KEYS = setOf("name", "skin", "explanation")
// Fields the card turns into lines; the rest go to the extras box.
private val SKILL_CARD_KEYS = setOf(
    "mp", "duration", "cooldown", "reuse_cooldown", "share", "cooldown_multiplier", "range", "use_range", "range_multiplier", "range_bonus",
    "level", "wtype", "offhand_type", "max", "damage_type", "condition", "levels", "mp_return_levels", "requirements",
)

private fun seconds(ms: JsonElement?) = "${jsString(jsNumber(ms) / 1000)} seconds"
private fun weaponType(type: JsonElement?) = jsText(type).let { WEAPON_TYPES[it] ?: titleCase(it) }
private fun pairs(value: JsonElement?): List<JsonArray> = (value as? JsonArray)?.filterIsInstance<JsonArray>().orEmpty()
private val DAMAGE_TYPES = mapOf("pure" to ("Pure" to "#AA9B55"), "magical" to ("Magical" to "#8998AA"), "physical" to ("Physical" to "#93AB98"))

/** The game's skill card lines. The game's card lists stats only for skills with an explanation. */
fun skillCardLines(definition: Map<String, JsonElement>?, skillName: (String) -> String?): List<CardLine> {
    val d = definition.orEmpty()
    if (!jsTruthy(d["explanation"])) return emptyList()
    val lines = mutableListOf<CardLine>()
    fun add(key: String, label: String, value: String, color: String) { lines += PropLine(key, label, value, color) }
    fun number(key: String) = jsNumber(d[key])
    if (number("mp") != 0.0) add("mp", "MP", jsText(d["mp"]), statColor("mp"))
    if (number("duration") != 0.0) add("duration", "Duration", seconds(d["duration"]), statColor("duration"))
    if (number("cooldown") != 0.0) add("cooldown", "Cooldown", seconds(d["cooldown"]), statColor("cooldown"))
    if (number("reuse_cooldown") != 0.0) add("reuse_cooldown", "Reuse Cooldown", seconds(d["reuse_cooldown"]), statColor("cooldown"))
    if (jsTruthy(d["share"])) {
        val shared = jsText(d["share"])
        add("share", "Cooldown", "${prettyFloat(number("cooldown_multiplier").takeIf { it != 0.0 } ?: 1.0)}× ${skillName(shared) ?: titleCase(shared)}", statColor("cooldown"))
    }
    if (number("range") != 0.0) add("range", "Range", jsText(d["range"]), statColor("range"))
    if (jsTruthy(d["use_range"])) add("use_range", "Range", "Character Range", statColor("range"))
    if (number("range_multiplier") != 0.0 && number("range_bonus") != 0.0) add("range_multiplier", "Range", "${prettyFloat(number("range_multiplier"))}X + ${jsText(d["range_bonus"])}", statColor("range"))
    else if (number("range_multiplier") != 0.0) add("range_multiplier", "Range", "${prettyFloat(number("range_multiplier"))}× Character Range", statColor("range"))
    if (number("level") != 0.0) add("level", "Level Requirement", jsText(d["level"]), statColor("level"))
    if (jsTruthy(d["wtype"])) {
        val types = (d["wtype"] as? JsonArray)?.toList() ?: listOf(d["wtype"]!!)
        add("wtype", "Weapon Requirement", types.joinToString(", ") { "\"${weaponType(it)}\"" }, WEAPON)
    }
    if (jsTruthy(d["offhand_type"])) add("offhand_type", "Offhand Requirement", weaponType(d["offhand_type"]), WEAPON)
    if (number("max") != 0.0) add("max", "Max", jsText(d["max"]), "#FFDE2F")
    if (jsText(d["type"]) == "passive") lines += TextLine("passive", "Passive", "#9FA7B6")
    DAMAGE_TYPES[jsText(d["damage_type"])]?.let { (label, color) -> add("damage_type", "Damage Type", label, color) }
    if (jsTruthy(d["condition"])) add("condition", "Condition", titleCase(jsText(d["condition"])), "#A59FFF")
    pairs(d["levels"]).forEachIndexed { index, pair ->
        val level = pair.getOrNull(0)
        add("levels_$index", "Output", if (jsNumber(level) > 0) "${jsText(pair.getOrNull(1))} (Lv. ${jsText(level)})" else jsText(pair.getOrNull(1)), statColor("output"))
    }
    pairs(d["mp_return_levels"]).forEachIndexed { index, pair ->
        add("mp_return_$index", "HP loss to MP", "${Math.round(jsNumber(pair.getOrNull(1)) * 100)}% (Lv. ${jsText(pair.getOrNull(0))})", statColor("mp"))
    }
    for ((stat, amount) in d["requirements"] as? JsonObject ?: emptyMap()) {
        add("required_$stat", "Required ${STAT_NAMES[stat] ?: titleCase(stat)}", jsText(amount), REQUIRED_COLORS[stat] ?: "#C3C3C3")
    }
    return lines
}

private fun skillExtraValue(value: JsonElement): String = when {
    value is JsonPrimitive && !value.isString && (value.content == "true" || value.content == "false") -> if (value.content == "true") "Yes" else "No"
    value is JsonArray -> value.joinToString(", ") { entry ->
        if (entry is JsonArray) entry.joinToString(" ") { jsText(it) } else jsText(entry).ifEmpty { entry.toString() }
    }
    value is JsonObject -> value.toString()
    else -> jsText(value)
}

/** Definition fields with no line on the game's card, other than the header's. */
fun skillExtras(definition: Map<String, JsonElement>?): List<CardExtra> {
    val d = definition.orEmpty()
    val explained = jsTruthy(d["explanation"])
    val shown = if (explained) SKILL_CARD_KEYS else emptySet()
    return d.entries
        .filter { (key, value) ->
            key !in HEADER_KEYS && key !in shown && !(key == "type" && jsText(value) == "passive" && explained) &&
                value !is JsonNull && !(value is JsonPrimitive && value.isString && value.content.isEmpty())
        }
        .sortedWith(compareBy<Map.Entry<String, JsonElement>> { it.key.lowercase() }.thenBy { it.key })
        .map { (key, value) -> CardExtra(key, titleCase(key), skillExtraValue(value), SKILL_EXTRA_COLORS[key] ?: "#C3C3C3") }
}
