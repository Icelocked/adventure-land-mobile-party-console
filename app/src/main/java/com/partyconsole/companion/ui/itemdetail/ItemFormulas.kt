package com.partyconsole.companion.ui.itemdetail

import com.partyconsole.companion.model.ItemDropSource
import com.partyconsole.companion.model.ItemMeta
import com.partyconsole.companion.model.MerchantExchangeItem
import com.partyconsole.companion.model.MerchantExchangeResult
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import java.math.BigDecimal
import java.math.MathContext

/** Faithful Kotlin ports of party-console's item-detail math (calculated-
 *  level-properties.tsx, npc-sale-value.tsx, item-maximum-level.tsx,
 *  format-duration.ts, item-detail-property-order.tsx) - pure functions,
 *  no UI, so ui/itemdetail/ItemDetailBrowser.kt can stay purely
 *  presentational. Every game-balance constant here (grade thresholds,
 *  stat-scroll multipliers, upgrade/compound tier multipliers) is copied
 *  verbatim from the web dashboard's own source rather than re-derived. */

private fun JsonElement.asDoubleOrNull(): Double? = (this as? JsonPrimitive)?.doubleOrNull
private fun JsonElement.asBooleanOrNull(): Boolean? = (this as? JsonPrimitive)?.booleanOrNull
private fun JsonElement.asStringOrNull(): String? = (this as? JsonPrimitive)?.content
private fun JsonElement.asIntListOrNull(): List<Int>? =
    (this as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.doubleOrNull?.toInt() }

private fun JsonElement.isTruthy(): Boolean = when (this) {
    is JsonPrimitive -> when {
        this.booleanOrNull != null -> this.booleanOrNull == true
        this.doubleOrNull != null -> this.doubleOrNull != 0.0
        else -> this.content.isNotEmpty()
    }
    else -> true
}

/** The subset of a definition/scaling record that represents a numeric
 *  in-game stat (item-property-keys.tsx) - everything else (name, skin,
 *  type, grades, ...) is metadata, not a stat to preview at other levels. */
private val ITEM_PROPERTY_KEYS = setOf(
    "gold", "luck", "xp", "int", "str", "dex", "vit", "for", "charisma", "cuteness", "awesomeness",
    "bling", "hp", "mp", "attack", "range", "armor", "incdmgamp", "resistance", "pnresistance",
    "firesistance", "fzresistance", "phresistance", "stresistance", "stun", "blast", "explosion",
    "breaks", "stat", "speed", "evasion", "miss", "reflection", "lifesteal", "manasteal", "attr0",
    "attr1", "rpiercing", "apiercing", "crit", "critdamage", "dreturn", "frequency", "mp_cost",
    "mp_reduction", "output", "courage", "mcourage", "pcourage",
)

/** stat-scrolls.tsx's per-stat multiplier, used when a generic "stat"
 *  scaling value needs to redirect into the specific stat a stat-scroll-
 *  marked item's `stat_type` names. */
private val STAT_SCROLL_MULTIPLIER = mapOf(
    "str" to 1.0, "int" to 1.0, "dex" to 1.0, "vit" to 1.0, "for" to 1.0,
    "evasion" to 0.325, "reflection" to 0.15, "gold" to 0.5, "luck" to 1.0, "xp" to 0.5,
    "armor" to 2.25, "resistance" to 2.25, "speed" to 0.325, "lifesteal" to 0.15, "manasteal" to 0.04,
    "rpiercing" to 2.25, "apiercing" to 2.25, "crit" to 0.125, "dreturn" to 0.5, "frequency" to 0.325,
    "mp_cost" to 0.6, "output" to 0.175,
)

private val NO_ROUND_KEYS = setOf(
    "evasion", "miss", "reflection", "dreturn", "lifesteal", "manasteal", "attr0", "attr1", "crit",
    "critdamage", "breaks",
)

/** Recomputes an item's stat block AT [level] from its base definition
 *  plus per-level scaling deltas - upgrade/compound tiers apply different
 *  multipliers at specific breakpoints (tier 7+ for upgrades, 5+ for
 *  compounds), matching the game's own progression curve exactly. */
fun calculatedLevelProperties(meta: ItemMeta?, statType: String?, level: Int): Map<String, Double> {
    val definition = meta?.definition.orEmpty()
    val scaling = meta?.scaling.orEmpty()
    val values = mutableMapOf<String, Double>()
    for (key in ITEM_PROPERTY_KEYS) {
        val base = definition[key]?.asDoubleOrNull() ?: continue
        values[key] = base
    }
    for (step in 1..level) {
        val multiplier = when {
            meta?.upgradeable == true -> when (step) {
                7 -> 1.25; 8 -> 1.5; 9 -> 2.0; 10 -> 3.0
                else -> if (step >= 11) 1.25 else 1.0
            }
            meta?.compoundable == true -> when (step) {
                5 -> 1.25; 6 -> 1.5; 7 -> 2.0
                else -> if (step >= 8) 3.0 else 1.0
            }
            else -> 1.0
        }
        for ((key, rawEl) in scaling) {
            val amount = rawEl.asDoubleOrNull() ?: continue
            val delta = if (key == "stat") Math.round(amount * multiplier).toDouble() else amount * multiplier
            values[key] = (values[key] ?: 0.0) + delta
            if (key == "stat" && step >= 7) values["stat"] = (values["stat"] ?: 0.0) + 1.0
        }
    }
    val tier = definition["tier"]?.asDoubleOrNull() ?: 0.0
    if (level == 10 && (values["stat"] ?: 0.0) != 0.0 && tier >= 3) {
        values["stat"] = (values["stat"] ?: 0.0) + 2.0
    }
    for (key in values.keys.toList()) {
        if (key !in NO_ROUND_KEYS) values[key] = Math.round(values[key]!!).toDouble()
    }
    if (statType != null && (values["stat"] ?: 0.0) != 0.0) {
        val multiplier = STAT_SCROLL_MULTIPLIER[statType] ?: 1.0
        values[statType] = (values[statType] ?: 0.0) + (values["stat"] ?: 0.0) * multiplier
        values.remove("stat")
    }
    return values
}

/** The stat block to actually display at [previewLevel]: the server's own
 *  current-level `properties` (authoritative - covers anything the client
 *  formula above doesn't model) adjusted by the DELTA between the formula
 *  evaluated at the preview level vs. the actual level, rather than the
 *  formula's raw output - mirrors item-details.tsx's `previewProperties`
 *  exactly so a "no scaling data" stat doesn't silently vanish. */
fun previewProperties(meta: ItemMeta?, actualLevel: Int, previewLevel: Int, statType: String?): Map<String, Double> {
    val current = calculatedLevelProperties(meta, statType, actualLevel)
    val preview = calculatedLevelProperties(meta, statType, previewLevel)
    val properties = meta?.properties.orEmpty()
    return (current.keys + preview.keys).associateWith { key ->
        val currentValue = properties[key]?.asDoubleOrNull() ?: current[key] ?: 0.0
        val delta = (preview[key] ?: 0.0) - (current[key] ?: 0.0)
        currentValue + delta
    }.filterValues { it != 0.0 }
}

fun definitionNumber(meta: ItemMeta?, key: String): Double? = meta?.definition?.get(key)?.asDoubleOrNull()
fun definitionString(meta: ItemMeta?, key: String): String? = meta?.definition?.get(key)?.asStringOrNull()

fun itemMaximumLevel(meta: ItemMeta?): Int {
    val maxLevel = meta?.maxLevel
    if (maxLevel != null && maxLevel > 0) return maxLevel
    return if (meta?.compoundable == true) 7 else if (meta?.upgradeable == true) 13 else 0
}

/** upgrade-scroll-cost.tsx ported verbatim, including its hardcoded
 *  scroll-price fallback (not the live catalog price - this function has
 *  no catalog access at its call site in the dashboard either, so the
 *  approximation is intentional, not a bug to "fix" here). */
fun upgradeScrollCost(meta: ItemMeta?, startLevel: Int, tiers: Int): Long {
    val grades = meta?.definition?.get("grades")?.asIntListOrNull() ?: listOf(9, 10, 11, 12)
    val scrollCosts = listOf(1_000L, 40_000L, 1_600_000L, 64_000_000L)
    var total = 0L
    for (level in startLevel until startLevel + tiers) {
        val grade = when {
            level >= (grades.getOrNull(2) ?: 11) -> 3
            level >= (grades.getOrNull(1) ?: 10) -> 2
            level >= (grades.getOrNull(0) ?: 9) -> 1
            else -> 0
        }
        total += scrollCosts.getOrElse(grade) { 0L }
    }
    return total
}

data class CompoundCost(val gold: Long, val scrolls: Long)

/** lib/compound-cost.ts's compoundPassCost ported verbatim - minimum
 *  scroll spend to build one target item entirely from +0 copies, using
 *  real compound-scroll ("cscroll0".."cscroll3") prices from the live
 *  merchant catalog rather than a hardcoded approximation. */
fun compoundPassCost(grades: List<Int>?, targetLevel: Int, buyable: List<com.partyconsole.companion.model.MerchantBuyItem>): CompoundCost? {
    val thresholds = grades ?: listOf(9, 10, 11, 12)
    val prices = buyable.associate { it.id to it.cost }
    var gold = 0L
    var scrolls = 0L
    for (level in 0 until targetLevel) {
        var grade = 0
        for (index in thresholds.indices) {
            if (level >= thresholds[index]) grade = index + 1
        }
        val price = prices["cscroll$grade"] ?: return null
        val count = Math.pow(3.0, (targetLevel - level - 1).toDouble()).toLong()
        gold += count * price
        scrolls += count
    }
    return CompoundCost(gold, scrolls)
}

/** stat-scrolls.tsx's table - `purchasable` stats (str/int/dex/vit) are
 *  bought outright for gold; the rest require already owning the scroll
 *  (stat-scroll-quantity.tsx/primary-stat-scroll-cost.tsx). */
data class StatScrollOption(val stat: String, val scroll: String, val label: String, val purchasable: Boolean)

val STAT_SCROLLS = listOf(
    StatScrollOption("str", "strscroll", "STR", true),
    StatScrollOption("int", "intscroll", "INT", true),
    StatScrollOption("dex", "dexscroll", "DEX", true),
    StatScrollOption("vit", "vitscroll", "VIT", true),
    StatScrollOption("for", "forscroll", "FOR", false),
    StatScrollOption("evasion", "evasionscroll", "Evasion", false),
    StatScrollOption("reflection", "reflectionscroll", "Reflection", false),
    StatScrollOption("gold", "goldscroll", "Gold", false),
    StatScrollOption("luck", "luckscroll", "Luck", false),
    StatScrollOption("xp", "xpscroll", "XP", false),
    StatScrollOption("armor", "armorscroll", "Armor", false),
    StatScrollOption("resistance", "resistancescroll", "Resistance", false),
    StatScrollOption("speed", "speedscroll", "Speed", false),
    StatScrollOption("lifesteal", "lifestealscroll", "Lifesteal", false),
    StatScrollOption("manasteal", "manastealscroll", "Manasteal", false),
    StatScrollOption("rpiercing", "rpiercingscroll", "Resistance piercing", false),
    StatScrollOption("apiercing", "apiercingscroll", "Armor piercing", false),
    StatScrollOption("crit", "critscroll", "Critical hit", false),
    StatScrollOption("dreturn", "dreturnscroll", "Damage return", false),
    StatScrollOption("frequency", "frequencyscroll", "Attack speed", false),
    StatScrollOption("mp_cost", "mpcostscroll", "MP cost reduction", false),
    StatScrollOption("output", "outputscroll", "Output", false),
)

/** stat-scroll-quantity.tsx ported verbatim - how many scrolls of a stat
 *  type a mark at this item's current level requires. */
fun statScrollQuantity(meta: ItemMeta?, level: Int): Int {
    val grades = meta?.definition?.get("grades")?.asIntListOrNull() ?: listOf(9, 10, 11, 12)
    val lvl = maxOf(0, level)
    val grade = when {
        lvl >= (grades.getOrNull(2) ?: 11) -> 3
        lvl >= (grades.getOrNull(1) ?: 10) -> 2
        lvl >= (grades.getOrNull(0) ?: 9) -> 1
        else -> 0
    }
    return listOf(1, 10, 100, 1000).getOrElse(grade) { 1 }
}

fun primaryStatScrollCost(meta: ItemMeta?, level: Int): Long = statScrollQuantity(meta, level) * 8_000L

/** npc-sale-value.tsx ported verbatim - the exact upgrade/compound grade-
 *  tier gold curve the game itself uses, not an approximation. */
fun npcSaleValue(level: Int, gift: Boolean, expires: JsonElement?, meta: ItemMeta?): Long {
    val definition = meta?.definition.orEmpty()
    if (gift) return 1L
    var value = definition["g"]?.asDoubleOrNull() ?: 0.0
    val isCash = definition["cash"]?.asBooleanOrNull() == true
    value *= if (isCash) 1.0 else 0.6
    val markup = definition["markup"]?.asDoubleOrNull()
    if (markup != null && markup != 0.0) value /= markup
    val effectiveLevel = maxOf(0, level)
    val grades = definition["grades"]?.asIntListOrNull() ?: listOf(11, 12)
    val gradeAt = { tier: Int -> if (tier > (grades.getOrNull(1) ?: 12)) 2 else if (tier > (grades.getOrNull(0) ?: 11)) 1 else 0 }
    val defType = definition["type"]?.asStringOrNull()
    if ((definition["compound"]?.asBooleanOrNull() == true || meta?.compoundable == true) && effectiveLevel > 0) {
        for (tier in 1..effectiveLevel) {
            val grade = gradeAt(tier)
            value *= if (isCash) 1.5 else 3.2
            if (defType != "booster") value += listOf(1000.0, 40000.0, 1600000.0)[grade] / 2.4
            else value *= 0.75
        }
    }
    if ((definition["upgrade"]?.asBooleanOrNull() == true || meta?.upgradeable == true) && effectiveLevel > 0) {
        var scrollValue = 0.0
        for (tier in 1..effectiveLevel) {
            val grade = gradeAt(tier)
            scrollValue += listOf(1000.0, 40000.0, 1600000.0)[grade] / 2.0
            when {
                tier >= 7 -> { value *= 3.0; scrollValue *= 1.32 }
                tier == 6 -> value *= 2.4
                tier >= 4 -> value *= 2.0
            }
            if (tier == 9) { value *= 2.64; value += 400000.0 }
            if (tier == 10) value *= 5.0
            if (tier == 12) value *= 0.8
        }
        value += scrollValue
    }
    if (expires?.isTruthy() == true) value /= 8.0
    return maxOf(0L, Math.round(value))
}

fun formatDuration(ms: Double): String {
    if (!ms.isFinite()) return "Unknown"
    if (ms <= 0) return "0s"
    if (ms < 1) return "<0.001s"
    val total = Math.round(ms)
    val hours = total / 3600000
    val minutes = (total % 3600000) / 60000
    val seconds = (total % 60000) / 1000.0
    val parts = buildList {
        if (hours > 0) add("${hours}h")
        if (minutes > 0) add("${minutes}m")
        if (seconds > 0) add("${formatSeconds(seconds)}s")
    }
    return if (parts.isEmpty()) "0s" else parts.joinToString(" ")
}

private fun formatSeconds(seconds: Double): String =
    if (seconds == Math.floor(seconds)) seconds.toLong().toString() else seconds.toString()

private val DURATION_KEY_REGEX =
    Regex("^(duration(?:_min|_max)?|cooldown(?:_min|_max)?|reuse_cooldown|ms|remainingMs)$")

fun durationStat(key: String, value: Double, definitionType: String?): String? {
    if (!DURATION_KEY_REGEX.matches(key)) return null
    val ms = value * (if (key == "duration" && definitionType == "elixir") 3600000.0 else 1.0)
    return formatDuration(ms)
}

/** item-detail-property-order.tsx's display order for the "Item stats"
 *  table - anything not listed sorts after, alphabetically. */
private val ITEM_DETAIL_PROPERTY_ORDER = listOf(
    "equip_slot", "stackable", "max_stack_size", "tier", "scroll", "stat", "str", "dex", "int", "vit",
    "for", "hp", "mp", "attack", "frequency", "range", "armor", "resistance", "apiercing", "rpiercing",
    "pnresistance", "firesistance", "fzresistance", "phresistance", "stresistance", "evasion", "miss",
    "reflection", "crit", "critdamage", "lifesteal", "manasteal", "speed", "luck", "gold", "xp",
    "ability", "attr0", "attr1", "buy", "id",
)
private val ITEM_DETAIL_PROPERTY_RANK = ITEM_DETAIL_PROPERTY_ORDER.withIndex().associate { (i, k) -> k to i }

/** Keys item-details.tsx never shows in the stats table - either shown
 *  elsewhere already (name, explanation, level, g/buy price) or purely
 *  internal (skin variants, the raw grades array, upgrade/compound
 *  booleans already surfaced via meta.upgradeable/compoundable). `type`
 *  is intentionally left visible here (unlike the desktop version, which
 *  replaces it with a derived "equip_slot" label this app doesn't compute)
 *  so the equip slot/category is still readable. */
private val IGNORED_STAT_KEYS = setOf(
    "skin", "skin_a", "skin_c", "skin_r", "name", "explanation", "g", "s", "grades", "upgrade",
    "compound", "level", "set",
)

data class StatRow(val key: String, val value: JsonElement)

/** Builds the "Item stats" table exactly as item-details.tsx does: the raw
 *  definition, with [previewProperties] (already-scaled current/preview
 *  stat values) overlaid on top, plus a derived stackable/max_stack_size
 *  pair, ignored keys stripped, and sorted by display rank. */
fun buildStatRows(meta: ItemMeta?, actualLevel: Int, previewLevel: Int, statType: String?): List<StatRow> {
    val definition = meta?.definition.orEmpty()
    val preview = previewProperties(meta, actualLevel, previewLevel, statType)
    val display = LinkedHashMap<String, JsonElement>(definition)
    for ((key, value) in preview) display[key] = JsonPrimitive(value)
    val stackSize = definition["s"]?.asDoubleOrNull() ?: 1.0
    display["stackable"] = JsonPrimitive(stackSize > 1)
    if (stackSize > 1) display["max_stack_size"] = JsonPrimitive(stackSize)
    return display.entries
        .filter { it.key !in IGNORED_STAT_KEYS }
        .map { StatRow(it.key, it.value) }
        .sortedWith(compareBy({ ITEM_DETAIL_PROPERTY_RANK[it.key] ?: Int.MAX_VALUE }, { it.key }))
}

/** Renders one stat value the way item-details.tsx's `<dd>` does: a
 *  duration-shaped key/value becomes "1h 30m", arrays join with commas,
 *  everything else is just its plain string form. */
fun formatStatValue(key: String, value: JsonElement, definitionType: String?): String {
    if (value is JsonPrimitive && value.doubleOrNull != null) {
        val num = value.doubleOrNull!!
        durationStat(key, num, definitionType)?.let { return it }
        return if (num == Math.floor(num) && num.isFinite()) num.toLong().toString() else num.toString()
    }
    if (value is JsonArray) {
        return value.joinToString(", ") { element ->
            if (element is JsonArray) element.joinToString(" ") { plainString(it) } else plainString(element)
        }
    }
    return plainString(value)
}

private fun plainString(element: JsonElement): String = (element as? JsonPrimitive)?.content ?: element.toString()

data class ExchangeSourceRow(val entry: MerchantExchangeItem, val chance: Double)

data class ExchangeSections(
    val prices: List<MerchantExchangeItem>,
    val rewards: List<MerchantExchangeItem>,
    val sources: List<ExchangeSourceRow>,
)

private val REWARD_TARGET_REGEX = Regex("^(.*)-(\\d+)$")
private fun exchangeTarget(reward: String): Pair<String, Int> {
    val match = REWARD_TARGET_REGEX.matchEntire(reward)
    val id = match?.groupValues?.get(1)?.takeIf { it.isNotEmpty() } ?: reward
    val level = match?.groupValues?.get(2)?.toIntOrNull() ?: 0
    return id to level
}

/** item-exchange-details.tsx's three groupings, matched against the whole
 *  exchangeable table by [id]+[level]: what it costs to buy this item from
 *  an exchange NPC ([prices]), what an exchange/box keyed by this item
 *  itself gives back ([rewards]), and - for a base (+0) item only - every
 *  box/table this item can be pulled out of as a random result ([sources],
 *  "Reward in" on desktop). */
fun exchangeSections(id: String, level: Int, exchanges: List<MerchantExchangeItem>): ExchangeSections {
    val prices = exchanges.filter { it.reward != null && exchangeTarget(it.reward!!) == (id to level) }
    val rewards = exchanges.filter { it.id == id && it.level == level }
    val sources = if (level == 0) {
        exchanges.mapNotNull { entry ->
            if (entry.reward != null) return@mapNotNull null
            val chance = entry.results.filter { it.id == id && it.kind == id }.sumOf { it.chance }
            if (chance > 0) ExchangeSourceRow(entry, chance) else null
        }.sortedWith(compareByDescending<ExchangeSourceRow> { it.chance }.thenBy { it.entry.name })
    } else {
        emptyList()
    }
    return ExchangeSections(prices, rewards, sources)
}

fun rewardPercentage(chance: Double): String = when {
    chance > 0 && chance < 0.00000001 -> "<0.000001%"
    else -> "${roundTo(chance * 100, 6)}%"
}

private fun roundTo(value: Double, decimals: Int): String {
    val factor = Math.pow(10.0, decimals.toDouble())
    val rounded = Math.round(value * factor) / factor
    return if (rounded == Math.floor(rounded)) rounded.toLong().toString() else rounded.toString()
}

/** drop-rate.ts's `effectiveDropRate` - a direct monster kill retains its
 *  original chance even when the DISPLAYED rate was capped (e.g. by a
 *  luck multiplier elsewhere), but a multi-step acquisition path (a drop
 *  found by opening a box that's itself a drop) shows the actual chance. */
fun effectiveDropRate(drop: ItemDropSource): Double =
    if (drop.sourceType == "monster" && drop.acquisitionPath.size <= 1) drop.originRate ?: drop.rate else drop.rate

/** drop-rate.ts's `formatDropRate` ported verbatim - rates above 100%
 *  (guaranteed multi-drops) split into a guaranteed count plus a
 *  fractional remainder chance. */
fun formatDropRate(drop: ItemDropSource): String {
    val rate = maxOf(0.0, effectiveDropRate(drop))
    val quantity = maxOf(1, drop.quantity)
    fun percent(chance: Double): String = "${toPrecision(chance * 100, 6)}%"
    fun count(value: Int): String = if (value > 1) " ×${"%,d".format(value)}" else ""
    if (rate <= 1) return percent(rate) + count(quantity)
    val guaranteed = Math.floor(rate).toInt()
    val remainder = rate - guaranteed
    return "100%" + count(guaranteed * quantity) + if (remainder > 0) " + ${percent(remainder)}${count(quantity)}" else ""
}

private fun toPrecision(value: Double, sigFigs: Int): String {
    if (value == 0.0) return "0"
    return runCatching {
        BigDecimal(value).round(MathContext(sigFigs)).stripTrailingZeros().toPlainString()
    }.getOrDefault(value.toString())
}
