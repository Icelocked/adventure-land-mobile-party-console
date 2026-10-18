package com.partyconsole.companion.domain

import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.ItemMeta
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.math.BigDecimal
import java.math.RoundingMode
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import kotlin.math.floor
import kotlin.math.truncate

// A port of the PWA's web/src/lib/itemCardLines.ts, which ports the console's
// dashboard/features/party/item-card-lines.ts, which ports the game's item card
// (render_item in the game's js/html.js): its line order, English labels
// (languages/en/interface.js) and colors (colors in js/old_common_functions.js plus the
// literals in render_item). app/docs/cards.md holds the failure inventory.

/** One line of a game box: "Label: value", or a text-only line such as "Locked". */
sealed interface CardLine {
    val key: String
    val color: String
    fun display(): String
}

/** [suffix] trails the value in [suffixColor]: the character card's "[C]" tag or an
 *  attribute's "Primary". [skill] and [monster] make the value a link. */
data class PropLine(
    override val key: String,
    val label: String,
    val value: String,
    override val color: String,
    val valueColor: String? = null,
    val skill: String? = null,
    val monster: String? = null,
    val suffix: String? = null,
    val suffixColor: String? = null,
) : CardLine {
    override fun display() = "$label: $value${suffix.orEmpty()}"
}

data class TextLine(override val key: String, val text: String, override val color: String) : CardLine {
    override fun display() = text
}

/** An extras box line: a readable label colored by meaning, and the value. */
data class CardExtra(val key: String, val label: String, val value: String, val color: String) {
    fun display() = "$label: $value"
}

// JavaScript value semantics, so the lines read as they do in the PWA and the console.

/** JavaScript truthiness of a JSON value. */
fun jsTruthy(value: JsonElement?): Boolean = when (value) {
    null, is JsonNull -> false
    is JsonPrimitive -> when {
        value.isString -> value.content.isNotEmpty()
        value.content == "true" -> true
        value.content == "false" -> false
        else -> value.content.toDoubleOrNull()?.let { it != 0.0 && !it.isNaN() } ?: false
    }
    else -> true
}

/** `Number(value) || 0`. */
fun jsNumber(value: JsonElement?): Double {
    val primitive = value as? JsonPrimitive ?: return 0.0
    if (primitive is JsonNull) return 0.0
    val number = when {
        !primitive.isString && primitive.content == "true" -> 1.0
        !primitive.isString && primitive.content == "false" -> 0.0
        primitive.isString && primitive.content.isBlank() -> 0.0
        else -> primitive.content.trim().toDoubleOrNull()
    } ?: return 0.0
    return if (number.isNaN()) 0.0 else number
}

/** `String(value)` for a number. */
fun jsString(value: Double): String = when {
    value.isNaN() -> "NaN"
    value.isInfinite() -> if (value > 0) "Infinity" else "-Infinity"
    value == floor(value) && kotlin.math.abs(value) < 1e21 -> value.toLong().toString()
    else -> value.toString()
}

/** The item card's `text()`: strings, numbers and booleans print; anything else is "". */
fun jsText(value: JsonElement?): String {
    val primitive = value as? JsonPrimitive ?: return ""
    if (primitive is JsonNull) return ""
    if (primitive.isString) return primitive.content
    if (primitive.content == "true" || primitive.content == "false") return primitive.content
    return primitive.content.toDoubleOrNull()?.let { jsString(it) } ?: primitive.content
}

/** `Number.prototype.toLocaleString("en-US")`: grouping and at most [maxFraction]
 *  decimals, rounded half away from zero on the exact value as ECMA-402 does. */
fun jsLocale(value: Double, maxFraction: Int = 3): String {
    val format = DecimalFormat("#,##0." + "#".repeat(maxFraction), DecimalFormatSymbols(Locale.US))
    format.roundingMode = RoundingMode.HALF_UP
    // 0.0 + -0.0 is 0.0, so a negative zero prints "0" as in JavaScript.
    return format.format(value + 0.0)
}

/** `Number.prototype.toFixed(digits)`: rounds the exact binary value half up. */
fun jsFixed(value: Double, digits: Int): String = when {
    !value.isFinite() -> jsString(value)
    value < 0 -> "-" + jsFixed(-value, digits)
    else -> BigDecimal(value).setScale(digits, RoundingMode.HALF_UP).toPlainString()
}

// to_pretty_float and to_pretty_num in the game's js/old_common_functions.js.
fun prettyFloat(value: Double): String = jsLocale(0.0 + truncate((if (value.isNaN()) 0.0 else value) * 100) / 100)
fun prettyNum(value: Double): String = jsLocale(floor(if (value.isNaN()) 0.0 else value) + 0.0)

// A monster's speeds round to hundredths: prettyFloat truncates, and 0.706 x 100 is
// 70.5999... in floating point (console item-card-lines.ts hundredths).
fun hundredths(value: Double): String = jsLocale(Math.round(value * 100) / 100.0, 2)

private fun signed(value: Double, shown: String = jsString(value)) = (if (value > 0) "+" else "") + shown

private val WORD_START = Regex("\\b\\w")
fun titleCase(value: String): String = value.replace('_', ' ').replace(WORD_START) { it.value.uppercase() }

private const val GRAY = "gray"
private const val TEXT = "#C3C3C3"
private const val POISON = "#41834A"
private const val ABILITY = "#ff9100"

val WEAPON_TYPES: Map<String, String> = mapOf(
    "sword" to "Sword", "short_sword" to "Short Sword", "great_sword" to "Great Sword", "axe" to "Axe", "wblade" to "Magical Sword",
    "basher" to "Basher", "dartgun" to "Dart Gun", "bow" to "Bow", "crossbow" to "Crossbow", "rapier" to "Rapier", "spear" to "Spear",
    "fist" to "Fist Weapon", "dagger" to "Dagger", "stars" to "Throwing Stars", "mace" to "Mace", "pmace" to "Priest Mace", "staff" to "Staff",
    "wand" to "Wand", "quiver" to "Quiver", "shield" to "Shield", "misc_offhand" to "Misc Offhand", "source" to "Source",
)
private val OFFHAND_TYPES = setOf("quiver", "shield", "misc_offhand", "source")
val STAT_NAMES: Map<String, String> = mapOf("str" to "Strength", "int" to "Intelligence", "dex" to "Dexterity", "vit" to "Vitality", "for" to "Fortitude")

private class Ability(val name: String, val color: String, val text: String?)

// Abilities with their own game description; {value} is attr0 and {value2} attr1.
private val ABILITIES = mapOf(
    "bash" to Ability("Bash", ABILITY, "Stuns the opponent for {value} seconds with {value2}% chance."),
    "freeze" to Ability("Freeze", "#2EBCE2", "Freezes the opponent with a {value}% chance."),
    "poison" to Ability("Poison", POISON, "Poisons the opponent with a {value}% chance."),
    "burn" to Ability("Burn", "#E03D31", "Burns the opponent with a {value}% chance. Deals damage over time."),
    "weave" to Ability("Weave", "#AAA9D2", "Each hit slows the opponent more and more."),
    "secondchance" to Ability("Second Chance", ABILITY, "Avoid death with a {value}% chance."),
    "sugarrush" to Ability("Sugar Rush", "#D64770", "Trigger a Sugar Rush on attack with {value}% chance. Gain 240 Attack Speed for 10 seconds!"),
    "charm" to Ability("Charm", "#D64770", "Charm an enemy with {value}% chance. Activate the ability from the 'SKILLS' system."),
    "restore_mp" to Ability("Restore MP", "#5D9ED9", "Instead of using MP, skills restore 2X the amount with {value}% chance."),
)

private val GRADES = listOf(null, "High" to "#696354", "Rare" to "#6668AC", "Legendary" to "#39A868", "Exalted" to "#2875F9")

/** calculate_item_grade in the game's js/old_common_functions.js. */
fun itemGrade(definition: Map<String, JsonElement>, level: Int): Int {
    if (!(jsTruthy(definition["upgrade"]) || jsTruthy(definition["compound"]))) return 0
    val grades = (definition["grades"] as? JsonArray)?.map { jsNumber(it) } ?: listOf(9.0, 10.0, 11.0, 12.0)
    for (grade in 4 downTo 1) if (level >= (grades.getOrNull(grade - 1) ?: Double.NaN)) return grade
    return 0
}

private fun fill(template: String, value: JsonElement?, value2: JsonElement?) =
    template.replaceFirst("{value2}", jsText(value2)).replaceFirst("{value}", jsText(value))

private val DAMAGE_TYPES = mapOf("pure" to ("Pure" to "#AA9B55"), "magical" to ("Magical" to "#8998AA"), "physical" to ("Physical" to "#93AB98"))

// monster: render_item's monster mode, where XP is a plain number, Range and Speed carry
// no plus sign and A.Speed always shows as frequency x 100.
private fun statLines(prop: Map<String, JsonElement>, definition: Map<String, JsonElement>, monster: Boolean = false): List<CardLine> {
    val lines = mutableListOf<CardLine>()
    fun add(key: String, label: String, value: String, color: String) { lines += PropLine(key, label, value, color) }
    fun n(key: String) = jsNumber(prop[key])
    fun percent(key: String, label: String, color: String) { if (n(key) != 0.0) add(key, label, prettyFloat(n(key)) + "%", color) }
    fun plain(key: String, label: String, color: String) { if (n(key) != 0.0) add(key, label, jsText(prop[key]), color) }
    val type = jsText(definition["type"])
    if (n("miss") != 0.0 && type == "elixir") add("miss", "Alcohol", jsString(n("miss")) + "%", "#7CAAF6")
    for (gift in (definition["gives"] as? JsonArray).orEmpty()) {
        val pair = gift as? JsonArray ?: continue
        val stat = jsText(pair.getOrNull(0))
        val amount = jsNumber(pair.getOrNull(1))
        if (stat == "hp") add("gives_hp", "HP", if (amount < 0) prettyNum(amount) else "+" + prettyNum(amount), statColor("hp"))
        if (stat == "mp") add("gives_mp", "MP", "+" + prettyNum(amount), statColor("mp"))
    }
    if (jsTruthy(definition["debuff"])) add("debuff", "Effect", "Debuff", "#343792")
    if (n("gold") != 0.0) add("gold", "Gold", signed(n("gold")) + "%", "gold")
    if (n("luck") != 0.0) add("luck", "Luck", signed(n("luck")) + "%", statColor("luck"))
    if (n("xp") != 0.0) add("xp", "XP", if (monster) jsText(prop["xp"]) else signed(n("xp")) + "%", statColor("xp"))
    percent("lifesteal", "Lifesteal", statColor("lifesteal"))
    percent("manasteal", "Manasteal", statColor("manasteal"))
    if (jsTruthy(definition["goldsteal"])) add("goldsteal", "Goldsteal", "Dynamic", "gold")
    percent("evasion", "Evasion", statColor("evasion"))
    percent("avoidance", "Avoidance", statColor("avoidance"))
    if (n("miss") != 0.0 && type != "elixir") add("miss", "Miss", jsString(n("miss")) + "%", statColor("miss"))
    percent("reflection", "Reflection", statColor("reflection"))
    percent("dreturn", "D.Return", statColor("dreturn"))
    percent("crit", "Crit", statColor("crit"))
    if (n("critdamage") != 0.0) add("critdamage", "Crit Damage", "+" + prettyFloat(n("critdamage")) + "%", statColor("critdamage"))
    plain("attack", "Damage", statColor("attack"))
    DAMAGE_TYPES[jsText(definition["damage_type"])]?.let { (label, color) -> add("damage_type", "Type", label, color) }
    if (n("range") != 0.0) add("range", "Range", (if (monster) "" else "+") + jsText(prop["range"]), statColor("range"))
    plain("hp", "HP", statColor("hp"))
    plain("str", "Strength", statColor("str"))
    plain("int", "Intelligence", statColor("int"))
    plain("dex", "Dexterity", statColor("dex"))
    plain("vit", "Vitality", statColor("hp"))
    plain("for", "Fortitude", statColor("for"))
    plain("mp", "MP", statColor("mp"))
    if (n("mp_cost") != 0.0) add("mp_cost", "Attack MP Cost", signed(n("mp_cost")), statColor("mp"))
    if (n("mp_reduction") > 0) add("mp_reduction", "Skill MP Reduction", "%" + jsString(n("mp_reduction")), statColor("mp"))
    else if (n("mp_reduction") != 0.0) add("mp_reduction", "Skill MP Increase", "%" + jsString(-n("mp_reduction")), statColor("mp"))
    if (n("stat") != 0.0) add("stat", "Stat", jsText(prop["stat"]), GRAY)
    plain("armor", "Armor", statColor("armor"))
    plain("apiercing", "A.Piercing", statColor("armor"))
    plain("rpiercing", "R.Piercing", statColor("resistance"))
    plain("resistance", "Resistance", statColor("resistance"))
    plain("pnresistance", "Poison Res.", statColor("pnresistance"))
    plain("firesistance", "Fire Res.", statColor("firesistance"))
    plain("fzresistance", "Freeze Res.", statColor("fzresistance"))
    plain("phresistance", "Impact Res.", statColor("phresistance"))
    plain("stresistance", "Status Res.", statColor("stresistance"))
    if (jsTruthy(definition["wspeed"])) add("wspeed", "Speed", titleCase(jsText(definition["wspeed"])), GRAY)
    if (n("speed") != 0.0) add("speed", if (jsTruthy(definition["wtype"])) "Run Speed" else "Speed", if (monster) hundredths(n("speed")) else signed(n("speed")), statColor("speed"))
    if (n("frequency") != 0.0 || monster) {
        add("frequency", "A.Speed", if (monster) hundredths((n("frequency").takeIf { it != 0.0 } ?: 1.0) * 100) else jsText(prop["frequency"]), statColor("frequency"))
    }
    if (n("output") != 0.0) add("output", "Damage Output", signed(n("output")) + "%", statColor("output"))
    if (n("incdmgamp") != 0.0) add("incdmgamp", "Incoming Damage", jsString(n("incdmgamp")) + "%", "#D93319")
    for ((key, label, color) in listOf(Triple("stun", "Stun", "#784224"), Triple("explosion", "Explosion", "#782D33"), Triple("blast", "Blast", "#685079"))) {
        if (n(key) != 0.0) add(key, label, jsString(n(key)) + "%", color)
    }
    if (n("breaks") > 0) add("breaks", "Breaks", prettyFloat(n("breaks")) + "%", "#782D33")
    for ((key, label, color) in listOf(
        Triple("charisma", "Charisma", "#4DB174"), Triple("awesomeness", "Awesomeness", "#FFDE2F"), Triple("bling", "Bling", "#A4E6FF"),
        Triple("cuteness", "Cuteness", "#FD82F0"), Triple("intensity", "Intensity", "#786D6A"), Triple("courage", "Courage", "#9E1813"),
        Triple("mcourage", "M.Courage", "#4628A0"), Triple("pcourage", "P.Courage", "#D19D32"),
    )) plain(key, label, color)
    return lines
}

private fun abilityLines(prop: Map<String, JsonElement>, definition: Map<String, JsonElement>, skillName: (String) -> String?): List<CardLine> {
    val lines = mutableListOf<CardLine>()
    val id = if (jsTruthy(definition["ability"])) jsText(definition["ability"]) else ""
    // `prop.attr0 ?? definition.attr0`: only a missing value falls through.
    val value = prop["attr0"]?.takeIf { it !is JsonNull } ?: definition["attr0"]
    val value2 = prop["attr1"]?.takeIf { it !is JsonNull } ?: definition["attr1"]
    if (id.isNotEmpty()) {
        val known = ABILITIES[id]
        val skill = if (known == null) skillName(id) else null
        // A granted skill links to its details, as the game's card opens render_skill.
        lines += PropLine("ability", "Ability", known?.name ?: skill ?: titleCase(id), known?.color ?: "#E1924D", skill = if (skill != null) id else null)
        if (known?.text != null) lines += TextLine("ability_text", fill(known.text, value, value2), TEXT)
        else {
            if (jsTruthy(value)) lines += PropLine("ability_chance", "Chance", "%" + jsText(value), "grey")
            lines += TextLine("ability_text", "Activate the ability from the 'SKILLS' system.", TEXT)
        }
    }
    if (jsTruthy(definition["aura"])) {
        lines += PropLine("aura", "Aura", titleCase(jsText(definition["aura"])), "#E1924D")
        if (jsTruthy(value)) lines += PropLine("aura_amount", "Amount", "%" + jsText(value), "grey")
    }
    return lines
}

private fun hoursLine(hours: Double): CardLine = when {
    hours <= 1.0 / 60 -> PropLine("duration", "Seconds", prettyFloat(hours * 3600), GRAY)
    hours < 1 -> PropLine("duration", "Minutes", prettyFloat(hours * 60), GRAY)
    else -> PropLine("duration", "Hours", prettyFloat(hours), GRAY)
}

/** "Strength +10 · A.Piercing +40" for a bonus's stats, with the card's labels. */
/** The item card's label and color for one stat key, or null when the card has no line for it. */
fun itemCardStat(key: String): Pair<String, String>? =
    statLines(mapOf(key to JsonPrimitive(1)), emptyMap()).filterIsInstance<PropLine>().firstOrNull { it.key == key }?.let { it.label to it.color }

fun statSummary(stats: Map<String, JsonElement>): String = statLines(stats, emptyMap())
    .filterIsInstance<PropLine>()
    .joinToString(" · ") { "${it.label} ${if (it.value.startsWith("+") || it.value.startsWith("-")) it.value else "+" + it.value}" }

/** The game's item card lines. [properties] are the stats at the shown level (live item
 *  properties merged with the level preview); [usable] says whether a party class can
 *  wield the weapon, which colors its type line. */
fun itemCardLines(
    meta: ItemMeta?,
    item: Item,
    level: Int,
    properties: Map<String, JsonElement>,
    setName: String?,
    usable: Boolean,
    skillName: (String) -> String? = { null },
): List<CardLine> {
    val definition = meta?.definition.orEmpty()
    val prop = LinkedHashMap(definition).apply { putAll(properties) }
    // A stat scroll folds the base stat into the scrolled stat (calculate_item_properties sets prop.stat=0).
    if (!item.statType.isNullOrEmpty()) prop["stat"] = JsonPrimitive(0)
    val lines = statLines(prop, definition).toMutableList()
    val type = jsText(definition["type"])
    GRADES[itemGrade(definition, level)]?.takeIf { type != "booster" }?.let { (name, color) -> lines += PropLine("grade", "Grade", name, color) }
    if (jsTruthy(definition["poisonous"])) lines += TextLine("poisonous", "Poisonous", POISON)
    if (jsTruthy(definition["cooperative"])) lines += TextLine("cooperative", "Cooperative", "#aeaeae")
    if (jsTruthy(definition["peaceful"])) lines += TextLine("peaceful", "Peaceful", "#54B25F")
    if (jsTruthy(definition["supporter"])) lines += TextLine("supporter", "Supporter", "#CA5931")
    for (bonus in meta?.bonuses.orEmpty()) {
        lines += PropLine("bonus_${bonus.id}", "Bonus", "${bonus.name} [Only] ${statSummary(bonus.stats)}".trim(), "#7738E8")
    }
    val classes = when (val value = definition["class"]) {
        is JsonArray -> value.toList()
        null, is JsonNull -> emptyList()
        else -> if (jsTruthy(value)) listOf(value) else emptyList()
    }
    if (classes.isNotEmpty()) lines += PropLine("class", "Class", classes.joinToString(", ") { titleCase(jsText(it)) }, GRAY)
    if (type == "elixir" && jsNumber(definition["duration"]) != 0.0) lines += hoursLine(jsNumber(definition["duration"]))
    lines += abilityLines(prop, definition, skillName)
    if (jsTruthy(definition["explanation"])) lines += TextLine("explanation", jsText(definition["explanation"]), TEXT)
    else if (type == "material") lines += TextLine("unknown_material", "An unknown material, as in, you have no idea what to do with it!", TEXT)
    val multiplier = jsNumber(definition["multiplier"])
    if (multiplier != 0.0 && multiplier != 1.0) lines += PropLine("multiplier", "Multiplier", jsText(definition["multiplier"]), GRAY)
    if (!setName.isNullOrEmpty()) lines += PropLine("set", "Set", setName, "#f1c054")
    lines += stateLines(item)
    val wtype = jsText(definition["wtype"]?.takeIf { jsTruthy(it) } ?: definition["type"])
    if (type == "weapon" || type in OFFHAND_TYPES) {
        lines += PropLine(
            "weapon_type", "Type", "T${prettyFloat(jsNumber(definition["tier"]))} ${WEAPON_TYPES[wtype] ?: titleCase(wtype)}", GRAY,
            valueColor = if (usable) "#56A244" else "#CC3837",
        )
    }
    lines += PropLine("info", "[i]", infoPhrase(meta, level), GRAY)
    return lines
}

// render_item's "[i]" phrase: exchange, then upgrade below +10, compound, then
// collector-quest and other crafting uses.
private fun infoPhrase(meta: ItemMeta?, level: Int): String {
    val definition = meta?.definition.orEmpty()
    if (jsTruthy(definition["e"])) return "Exchangeable"
    if (jsTruthy(definition["upgrade"]) && level < 10) return "Upgradeable"
    if (jsTruthy(definition["compound"])) return "Compoundable"
    val uses = meta?.world?.usedIn.orEmpty()
    if (uses.any { it.quest == "mcollector" }) return "Collectable"
    return if (uses.isNotEmpty()) "Usable" else "Information"
}

// Per-copy state the game shows on the card. Quantity and stat scroll show on the
// game's inventory slot instead, so the extras box carries them (itemSlotExtras).
private fun stateLines(item: Item): List<CardLine> {
    val lines = mutableListOf<CardLine>()
    val lock = item.l
    when {
        lock is JsonPrimitive && lock.isString && lock.content == "s" -> lines += TextLine("lock", "Sealed", "#C45F5F")
        lock is JsonPrimitive && lock.isString && lock.content == "u" -> lines += TextLine("lock", "Unsealing", "#C4A35F")
        // The game colors Locked #404141, close to invisible on black; #8C8C8C keeps it muted but readable.
        jsTruthy(lock) -> lines += TextLine("lock", "Locked", "#8C8C8C")
    }
    if (jsTruthy(item.acl)) lines += TextLine("acl", "Account Bound", "#ADA68E")
    if (jsTruthy(item.expires)) lines += PropLine("expires", "Expires", formatExpiry(item.expires!!), GRAY)
    return lines
}

/** `new Date(expires).toLocaleString()`: an ISO string or epoch milliseconds in this
 *  device's zone and locale; anything unparsable prints as sent. */
fun formatExpiry(expires: JsonElement, zone: ZoneId = ZoneId.systemDefault(), locale: Locale = Locale.getDefault()): String {
    val primitive = expires as? JsonPrimitive ?: return expires.toString()
    val instant = runCatching {
        if (primitive.isString) Instant.parse(primitive.content) else Instant.ofEpochMilli(primitive.content.toDouble().toLong())
    }.getOrNull() ?: return primitive.content
    return DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM).withLocale(locale).withZone(zone).format(instant)
}

/** render_item's name line: the title before the name ("Shiny Blade +7"). The console
 *  sends no G.titles, so every title prints as the id in title case, which matches
 *  G.titles' own names for shiny and glitched. PWA: titledName in itemCardLines.ts. */
fun titledName(name: String, title: String?): String = if (title.isNullOrEmpty()) name else "${titleCase(title)} $name"

/** Quantity, stat scroll and title for the extras box. */
fun itemSlotExtras(item: Item): List<Pair<String, String>> {
    val extras = mutableListOf<Pair<String, String>>()
    item.q?.takeIf { it > 1 }?.let { extras += "quantity" to prettyNum(it.toDouble()) }
    item.statType?.takeIf { it.isNotEmpty() }?.let { extras += "stat_type" to (STAT_NAMES[it] ?: titleCase(it)) }
    item.p?.takeIf { it.isNotEmpty() }?.let { extras += "title" to titleCase(it) }
    // calculate_item_properties rolls a glitched copy's +1 at random, so only the game knows which.
    if (item.p == "glitched") extras += "title_bonus" to "+1 DEX, INT or STR, rolled at random"
    return extras
}

// Colors for the stats-table fields in the item extras box, in the game's palette.
private val ITEM_EXTRA_COLORS = mapOf(
    "equip_slot" to "#7AC0F5", "stackable" to "#7AC0F5", "max_stack_size" to "#7AC0F5", "tier" to "#56A244", "scroll" to "#B484E5",
    "extra_stat" to "#B484E5", "exclusive" to "#FC5F39", "id" to "#808080", "quantity" to "#C3C3C3", "stat_type" to "#B484E5",
    "title" to "#B484E5", "title_bonus" to "#B484E5",
)

private fun extraLabel(key: String) = if (key == "stat_type") "Stat Scroll" else key.split('_').joinToString(" ") { it.replaceFirstChar { c -> c.uppercase() } }

/** One item extras line, labelled and colored. */
fun itemExtra(key: String, value: String): CardExtra = CardExtra(key, extraLabel(key), value, ITEM_EXTRA_COLORS[key] ?: "#808080")

/** Whether the card shows a stats-table field. Tier appears only in a weapon's type line. */
fun onItemCard(key: String, definition: Map<String, JsonElement>): Boolean {
    if (key == "tier") return jsText(definition["type"]).let { it == "weapon" || it in OFFHAND_TYPES }
    return key in CARD_KEYS
}

// Definition fields the card already shows, or that only drive other sections.
val CARD_KEYS: Set<String> = setOf(
    "name", "skin", "skin_a", "skin_c", "skin_r", "explanation", "type", "g", "s", "grades", "upgrade", "compound",
    "level", "set", "wtype", "damage_type", "class", "ability", "aura", "attr0", "attr1", "gives", "debuff",
    "goldsteal", "wspeed", "duration", "multiplier", "poisonous", "cooperative", "peaceful", "supporter", "e",
    "miss", "gold", "luck", "xp", "lifesteal", "manasteal", "evasion", "avoidance", "reflection", "dreturn", "crit",
    "critdamage", "attack", "range", "hp", "str", "int", "dex", "vit", "for", "mp", "mp_cost", "mp_reduction", "stat",
    "armor", "apiercing", "rpiercing", "resistance", "pnresistance", "firesistance", "fzresistance", "phresistance",
    "stresistance", "speed", "frequency", "output", "incdmgamp", "stun", "explosion", "blast", "breaks", "charisma",
    "awesomeness", "bling", "cuteness", "intensity", "courage", "mcourage", "pcourage",
)

/** The game's monster card: render_item in monster mode (render_monster_info). The
 *  monster detail already shows the name, G.monsters id, Navigate, score and achievements. */
fun monsterCardLines(definition: Map<String, JsonElement>, skillName: (String) -> String?, monsterName: (String) -> String?): List<CardLine> {
    val lines = statLines(definition, definition, monster = true).toMutableList()
    for ((key, label, color) in listOf(
        Triple("poisonous", "Poisonous", POISON), Triple("cooperative", "Cooperative", "#aeaeae"),
        Triple("peaceful", "Peaceful", "#54B25F"), Triple("supporter", "Supporter", "#CA5931"),
    )) if (jsTruthy(definition[key])) lines += TextLine(key, label, color)
    for ((id, ability) in monsterAbilities(definition)) {
        // The game lists only abilities that are skills; monsterExtras keeps the rest.
        val name = skillName(id) ?: continue
        val aura = jsTruthy((ability as? JsonObject)?.get("aura"))
        lines += PropLine("ability_$id", if (aura) "Aura" else "Ability", name, "#FC5F39", skill = id)
    }
    (definition["spawns"] as? JsonArray).orEmpty().forEachIndexed { index, spawn ->
        val id = (spawn as? JsonArray)?.getOrNull(1)?.let { jsText(it) }.orEmpty()
        if (id.isNotEmpty()) lines += PropLine("spawn_$index", "Spawns", monsterName(id) ?: titleCase(id), "#237B2A", monster = id)
    }
    if (jsTruthy(definition["explanation"])) lines += TextLine("explanation", jsText(definition["explanation"]), TEXT)
    return lines
}

/** A monster's stats at a level: level_monster adds half the base HP and one base XP per
 *  level, and calculate_monster_stats (both in the game's node/server.js) raises attack
 *  12.5%, speed 0.24 and frequency 0.034 per level up to level 12. Speed and frequency
 *  round to thousandths, which drops float error (6 + 12 x 0.24 is 8.8799...). */
fun monsterAtLevel(definition: Map<String, JsonElement>, level: Int): Map<String, JsonElement> {
    if (level <= 1) return definition
    fun base(key: String) = jsNumber(definition[key])
    val combat = minOf(level, 12)
    return LinkedHashMap(definition).apply {
        put("hp", JsonPrimitive(base("hp") + (level - 1) * floor(base("hp") / 2)))
        put("xp", JsonPrimitive(base("xp") * level))
        put("attack", JsonPrimitive(floor(base("attack") * (1 + combat * 0.125))))
        put("speed", JsonPrimitive(Math.round((base("speed") + combat * 0.24) * 1000) / 1000.0))
        put("frequency", JsonPrimitive(Math.round(((base("frequency").takeIf { it != 0.0 } ?: 1.0) + combat * 0.034) * 1000) / 1000.0))
    }
}

/** The level preview's note: the gold and drop multiplier above level 1, then the rules. */
fun monsterLevelNote(level: Int): String = (if (level > 1) "Gold and drop chance ×$level. " else "") +
    "Monsters level up while nobody fights them. Damage, speed and attack speed stop growing at level 12, and grow more slowly on maps whose packs keep spawning."

private fun monsterAbilities(definition: Map<String, JsonElement>): Map<String, JsonElement> = definition["abilities"] as? JsonObject ?: emptyMap()

// Monster extras labels colored by meaning from the game's palette; anything else reads light gray.
private val MONSTER_EXTRA_COLORS = mapOf(
    "respawn" to "#7AC0F5", "aggro" to "#E13758", "rage" to "#F36C6E", "charge" to "#36B89E", "roam" to "#36B89E", "difficulty" to "orange",
    "aa" to "#E1924D", "immune" to "#A59FFF", "abilities" to "#FC5F39", "special" to "gold", "global" to "#FFDE2F", "announce" to "#FFDE2F",
    "humanoid" to "#C6AA62", "cute" to "#FD82F0", "hit" to "#DB2900", "slots" to "#B484E5", "cbuff" to "#CB83AC", "rbuff" to "#CB83AC",
    "stationary" to "#9FA7B6", "passive" to "#9FA7B6",
)

// Item-only fields such as s (stack size) stay in the monster extras when a monster has them.
private val ITEM_ONLY = setOf("g", "s", "grades", "upgrade", "compound", "level", "set", "wtype", "tier", "class", "ability", "aura", "attr0", "attr1", "gives", "duration", "multiplier", "e", "type")
private val MONSTER_SHOWN = CARD_KEYS.filter { it !in ITEM_ONLY }.toSet() +
    setOf("name", "skin", "achievements", "abilities", "spawns", "explanation", "poisonous", "cooperative", "peaceful", "supporter")

private fun extraValue(value: JsonElement): String = when {
    value is JsonPrimitive && !value.isString && (value.content == "true" || value.content == "false") -> if (value.content == "true") "Yes" else "No"
    value is JsonObject || value is JsonArray -> value.toString()
    else -> jsText(value)
}

/** Definition fields the game's monster card has no line for. Abilities that aren't
 *  skills stay here by id, so nothing the old definition grid showed disappears. */
fun monsterExtras(definition: Map<String, JsonElement>, skillName: (String) -> String?): List<CardExtra> {
    val extras = definition.entries
        .filter { (key, value) -> key !in MONSTER_SHOWN && value !is JsonNull && !(value is JsonPrimitive && value.isString && value.content.isEmpty()) }
        .map { (key, value) -> CardExtra(key, key.split('_').joinToString(" ") { it.replaceFirstChar { c -> c.uppercase() } }, extraValue(value), MONSTER_EXTRA_COLORS[key] ?: TEXT) }
        .toMutableList()
    val unlisted = monsterAbilities(definition).keys.filter { skillName(it) == null }
    if (unlisted.isNotEmpty()) extras += CardExtra("abilities", "Abilities", unlisted.joinToString(", "), MONSTER_EXTRA_COLORS.getValue("abilities"))
    return extras.sortedWith(compareBy<CardExtra> { it.key.lowercase() }.thenBy { it.key })
}
