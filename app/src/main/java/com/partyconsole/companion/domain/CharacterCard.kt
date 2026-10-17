package com.partyconsole.companion.domain

import com.partyconsole.companion.model.CharacterVitals
import com.partyconsole.companion.model.EquippedEntry
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToLong

// The character stats sheet as the game's character panel (render_character in the
// game's js/html.js) beside every other entry the old grid showed. A port of the PWA's
// CharacterStatsSheet.tsx, which mirrors the console's character-stats-dialog.tsx and
// docs/character-card.md.

/** One effect in an attribute's breakdown: the value in the color of the stat it
 *  changes, then a gray per-point detail. */
data class CharacterEffect(val key: String, val value: String, val color: String, val detail: String? = null) {
    fun display() = value + (detail?.let { " $it" } ?: "")
}

/** One extras line; [effects] makes it a collapsible breakdown. */
data class CharacterExtra(val line: PropLine, val effects: List<CharacterEffect> = emptyList())

/** Run speed as the dashboard displays it: a merchant reads its unrestricted speed, and
 *  an open stand without one reads null ("Waiting for speed data"). */
fun displayRunSpeed(ctype: String, speed: Double?, unrestrictedSpeed: Double?, standOpen: Boolean?): Double? {
    if (ctype == "merchant") {
        if (unrestrictedSpeed != null && unrestrictedSpeed.isFinite()) return unrestrictedSpeed
        if (standOpen == true) return null
    }
    return speed
}

/** The damage multiplier for a defense value. */
fun damageMultiplier(defense: Double): Double {
    fun band(from: Double, rate: Double) = max(0.0, min(100.0, defense - from)) * rate
    val reduction = band(0.0, 0.001) + band(100.0, 0.001) + band(200.0, 0.00095) + band(300.0, 0.0009) + band(400.0, 0.00082) +
        band(500.0, 0.0007) + band(600.0, 0.0006) + band(700.0, 0.0005) + max(0.0, defense - 800) * 0.0004
    return min(1.32, max(0.05, 1 - reduction))
}

private fun JsonObject.number(key: String): Double? = (this[key] as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content?.toDoubleOrNull()
private fun JsonObject.value(key: String): Double = number(key) ?: 0.0

private class Character(vitals: CharacterVitals, val raw: JsonObject) {
    val ctype = vitals.ctype.ifEmpty { (raw["ctype"] as? JsonPrimitive)?.content.orEmpty() }
    val level = (vitals.level.takeIf { it != 0 } ?: raw.number("level")?.toInt() ?: 0).toDouble()
    val primary = (vitals.primaryStat ?: (raw["primaryStat"] as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content).orEmpty().lowercase()
    // The PWA spreads the vitals over the diagnostics, so a live standOpen wins.
    val standOpen = vitals.standOpen ?: (raw["standOpen"] as? JsonPrimitive)?.content?.toBooleanStrictOrNull()
    val combat = raw["combatStats"] as? JsonObject ?: JsonObject(emptyMap())
}

/** The game's character panel: NAME, LEVEL, HP, MP, HEAL when the character heals, ATT,
 *  ATTSPD, RANGE, RUNSPD, ARMOR, RESIST. and CODE. The lines take their stat colors
 *  instead of the game's gray (docs/stat-colors.md). */
fun characterCardLines(name: String, vitals: CharacterVitals, raw: JsonObject): List<PropLine> {
    val character = Character(vitals, raw)
    // The game tags ATT while cursed and ATTSPD while poisoned (info_line in js/html.js).
    fun has(id: String) = vitals.conditions.any { it.id == id }
    val heal = character.combat.value("heal")
    return buildList {
        add(PropLine("name", "NAME", name, "gray"))
        add(PropLine("level", "LEVEL", jsString(character.level), statColor("level")))
        add(PropLine("hp", "HP", "${vitals.hp}/${vitals.maxHp}", statColor("hp")))
        add(PropLine("mp", "MP", "${vitals.mp}/${vitals.maxMp}", statColor("mp")))
        if (heal > 0) add(PropLine("heal", "HEAL", jsString(Math.round(heal).toDouble()), statColor("heal")))
        add(PropLine("attack", "ATT", jsString(Math.round(raw.value("attack")).toDouble()), statColor("attack"), suffix = if (has("cursed")) " [C]" else null, suffixColor = "#7D4DAA"))
        add(PropLine("frequency", "ATTSPD", jsString(Math.round(raw.value("frequency") * 100).toDouble()), statColor("frequency"), suffix = if (has("poisoned")) " [P]" else null, suffixColor = "#45993F"))
        add(PropLine("range", "RANGE", jsString(raw.value("range")), statColor("range")))
        add(PropLine("speed", "RUNSPD", jsString(Math.round(raw.value("speed")).toDouble()), statColor("speed")))
        add(PropLine("armor", "ARMOR", jsString(raw.value("armor")), statColor("armor")))
        add(PropLine("resistance", "RESIST.", jsString(raw.value("resistance")), statColor("resistance")))
        add(PropLine("code", "CODE", "Active", "gold"))
    }
}

/** Every other entry of the old stats grid: the attributes with their effects, armor and
 *  resistance with their damage reduction, the unrestricted run speed, luck and the
 *  combat stats. */
fun characterExtras(vitals: CharacterVitals, raw: JsonObject, slots: Map<String, EquippedEntry?>): List<CharacterExtra> {
    val character = Character(vitals, raw)
    val ctype = character.ctype
    val primary = character.primary
    val weaponAttack = slots.filterKeys { it == "mainhand" || it == "offhand" }.values.sumOf { jsNumber(it?.meta?.properties?.get("attack")) }
    fun attributeEffects(stat: String, value: Double): List<CharacterEffect> {
        val effects = mutableListOf<CharacterEffect>()
        val divisor = if (ctype == "paladin" && stat == "int") 40 else if (primary == stat) 20 else 0
        if (divisor != 0) effects += CharacterEffect("attack", "+${jsFixed(weaponAttack * value / divisor, 1)} Attack", statColor("attack"), "+${jsFixed(weaponAttack / divisor, 2)} per point")
        when (stat) {
            "str" -> {
                effects += CharacterEffect("max_hp", "+${jsLocale((value * 21).roundToLong().toDouble())} Max HP", statColor("hp"), "+21 per point")
                effects += CharacterEffect("armor", "+${jsLocale(min(value, 160.0) + max(0.0, value - 160) * 0.25)} Armor", statColor("armor"), "+${if (value < 160) "1" else "0.25"} per next point")
                effects += CharacterEffect("run_speed", "+${jsFixed(min(value, 256.0) / 64, 2)} Run Speed", statColor("speed"), "+${if (value < 256) "0.0156" else "0"} per next point")
            }
            "int" -> {
                effects += CharacterEffect("max_mp", "+${jsLocale((value * 15).roundToLong().toDouble())} Max MP", statColor("mp"), "+15 per point")
                effects += CharacterEffect("resistance", "+${jsLocale(min(value, 180.0) + max(0.0, value - 180) * 0.25)} Resistance", statColor("resistance"), "+${if (value < 180) "1" else "0.25"} per next point")
                effects += CharacterEffect("attack_speed", "+${jsFixed(value / 1575, 3)} Attacks/sec", statColor("frequency"), "+0.000635 per point")
            }
            else -> {
                effects += CharacterEffect("run_speed", "+${jsFixed(min(value, 256.0) / 32, 2)} Run Speed", statColor("speed"), "+${if (value < 256) "0.0313" else "0"} per next point")
                effects += CharacterEffect(
                    "attack_speed", "+${jsFixed(min(160.0, value) / 640 + max(value - 160, 0.0) / 925, 3)} Attacks/sec", statColor("frequency"),
                    "+${if (value < 160) "0.00156" else "0.00108"} per next point",
                )
            }
        }
        return effects
    }
    fun attribute(key: String, label: String): CharacterExtra {
        val value = raw.value(key)
        return CharacterExtra(
            PropLine(key, label, jsLocale(value), statColor(key), suffix = if (primary == key) " Primary" else null, suffixColor = "gold"),
            attributeEffects(key, value),
        )
    }
    fun plain(key: String, label: String, color: String, value: String) = CharacterExtra(PropLine(key, label, value, color))
    fun combat(key: String) = character.combat.value(key)
    fun percent(value: Double) = "${jsLocale(value)}%"
    val level = character.level
    val vitality = raw.value("vit")
    val fortitude = raw.value("fortitude")
    val fortitudeMultiplier = damageMultiplier(fortitude * 5)
    val armorMultiplier = damageMultiplier(raw.value("armor"))
    val resistanceMultiplier = damageMultiplier(raw.value("resistance"))
    val runSpeed = displayRunSpeed(ctype, raw.number("speed"), raw.number("unrestrictedSpeed"), character.standOpen)
    return listOf(
        attribute("str", "Strength"),
        attribute("int", "Intelligence"),
        attribute("dex", "Dexterity"),
        CharacterExtra(
            PropLine("vit", "Vitality", jsLocale(vitality), statColor("hp")),
            listOf(CharacterEffect("max_hp", "+${jsLocale((vitality * (48 + level / 3)).roundToLong().toDouble())} Max HP", statColor("hp"), "${jsFixed(48 + level / 3, 2)} HP per VIT at level ${jsString(level)}")),
        ),
        CharacterExtra(
            PropLine("for", "Fortitude", jsLocale(fortitude), statColor("for")),
            listOf(CharacterEffect("pvp", "${jsFixed((1 - fortitudeMultiplier) * 100, 2)}% less incoming PvP damage", statColor("for"), "no PvE reduction")),
        ),
        CharacterExtra(
            PropLine("armor", "Armor", jsLocale(raw.value("armor")), statColor("armor")),
            listOf(CharacterEffect("reduction", "${jsFixed((1 - armorMultiplier) * 100, 2)}% physical damage reduction", statColor("armor"), "a 100-damage physical hit becomes ${jsFixed(100 * armorMultiplier, 1)}")),
        ),
        CharacterExtra(
            PropLine("resistance", "Resistance", jsLocale(raw.value("resistance")), statColor("resistance")),
            listOf(CharacterEffect("reduction", "${jsFixed((1 - resistanceMultiplier) * 100, 2)}% magical damage reduction", statColor("resistance"), "a 100-damage magical hit becomes ${jsFixed(100 * resistanceMultiplier, 1)}")),
        ),
        CharacterExtra(
            PropLine(
                "run_speed", "Run Speed", runSpeed?.let { jsFixed(it, 2) } ?: "Waiting for speed data", statColor("speed"),
                suffix = if (runSpeed != null && ctype == "merchant") " before movement restrictions" else null, suffixColor = "#808080",
            ),
        ),
        plain("luck", "Luck", statColor("luck"), percent(raw.value("luck").takeIf { it != 0.0 } ?: 100.0)),
        plain("crit", "Crit", statColor("crit"), percent(combat("crit"))),
        plain("critdamage", "Crit Damage", statColor("critdamage"), percent(200 + combat("critDamage"))),
        plain("evasion", "Evasion", statColor("evasion"), percent(combat("evasion"))),
        plain("miss", "Miss", statColor("miss"), percent(combat("miss"))),
        plain("lifesteal", "Lifesteal", statColor("lifesteal"), percent(combat("lifesteal"))),
        plain("manasteal", "Manasteal", statColor("manasteal"), percent(combat("manasteal"))),
        plain("dreturn", "D.Return", statColor("dreturn"), percent(combat("damageReturn"))),
        plain("reflection", "Reflection", statColor("reflection"), percent(combat("reflection"))),
        plain("apiercing", "A.Piercing", statColor("armor"), jsLocale(combat("armorPiercing"))),
        plain("rpiercing", "R.Piercing", statColor("resistance"), jsLocale(combat("resistancePiercing"))),
        plain("pnresistance", "Poison Res.", statColor("pnresistance"), jsLocale(combat("poisonResistance"))),
        plain("firesistance", "Fire Res.", statColor("firesistance"), jsLocale(combat("fireResistance"))),
        plain("fzresistance", "Freeze Res.", statColor("fzresistance"), jsLocale(combat("freezeResistance"))),
        plain("phresistance", "Physical Res.", statColor("phresistance"), jsLocale(combat("physicalResistance"))),
        plain("stresistance", "Status Res.", statColor("stresistance"), jsLocale(combat("statusResistance"))),
        plain("blastresistance", "Blast Res.", statColor("blastresistance"), jsLocale(combat("blastResistance"))),
        plain("mp_cost", "MP Cost", statColor("mp"), jsLocale(combat("mpCost"))),
        plain("heal", "Heal", statColor("heal"), jsLocale(combat("heal"))),
        plain("output", "Output", statColor("output"), percent(combat("output"))),
    )
}
