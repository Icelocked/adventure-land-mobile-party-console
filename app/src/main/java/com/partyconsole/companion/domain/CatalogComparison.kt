package com.partyconsole.companion.domain

import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.ItemMeta
import kotlin.math.abs

/** Item types that can be equipped. */
val EQUIPMENT_TYPES = listOf("weapon", "shield", "source", "quiver", "misc_offhand", "helmet", "chest", "pants", "gloves", "shoes", "cape", "ring", "earring", "amulet", "belt", "orb", "elixir")

/** PWA: web/src/lib/catalogComparison.ts. */
data class ComparisonSource(val slot: Int, val item: Item, val meta: ItemMeta?)
data class CatalogComparisonEntry(val entry: ComparisonSource, val level: Int, val stat: String)

fun comparisonEntry(entry: ComparisonSource) = CatalogComparisonEntry(entry, entry.item.level ?: 0, entry.item.statType.orEmpty())

// The equipment comparison card's labels (ui/itempanel/GearComparisonSheet.kt ROWS),
// keyed by item property instead of the projected character stat.
private val COMPARISON_LABELS = mapOf(
    "hp" to "HP", "mp" to "MP", "attack" to "Attack", "frequency" to "Attack speed", "range" to "Range", "speed" to "Run speed", "armor" to "Armor",
    "resistance" to "Resistance", "str" to "STR", "int" to "INT", "dex" to "DEX", "vit" to "VIT", "for" to "Fortitude", "luck" to "Luck", "gold" to "Gold",
    "xp" to "XP", "evasion" to "Evasion", "reflection" to "Reflection", "lifesteal" to "Lifesteal", "manasteal" to "Manasteal", "apiercing" to "Armor piercing",
    "rpiercing" to "Resistance piercing", "crit" to "Critical hit", "dreturn" to "Damage return", "mp_cost" to "MP cost reduction", "output" to "Output",
)

// Piercing and MP costs share their stat's palette color, as on the equipment comparison.
private val PALETTE_KEYS = mapOf("apiercing" to "armor", "rpiercing" to "resistance", "mp_cost" to "mp", "mp_reduction" to "mp")

/** One catalog comparison line: "Armor: 40" and, against A, " (+20 · +100.0%)" in [changeColor]. */
data class ComparisonLine(val key: String, val label: String, val color: String, val value: String, val change: String?, val changeColor: String?) {
    fun display() = "$label: $value${change.orEmpty()}"
}

/** A catalog comparison line's label and color: the equipment comparison's name, then the
 *  item card's, then the key in title case; the shared palette color, then the item card's.
 *  PWA: comparisonStat in web/src/lib/catalogComparison.ts. */
fun comparisonStat(key: String): Pair<String, String> {
    val card = itemCardStat(key)
    val color = STAT_COLORS[PALETTE_KEYS[key] ?: key] ?: card?.second ?: GAME_BOX_TEXT
    return (COMPARISON_LABELS[key] ?: card?.first ?: titleCase(key)) to color
}

/** The line for [key] in a column. Column A ([baselineColumn]) and a value equal to A's show
 *  no change; a rise reads in [GAIN_COLOR] and a drop in [LOSS_COLOR], as on the equipment
 *  comparison, and "new" replaces the percentage when A has none of the stat. */
fun comparisonLine(key: String, value: Double, baseline: Double, baselineColumn: Boolean): ComparisonLine {
    val (label, color) = comparisonStat(key)
    val delta = value - baseline
    val changed = !baselineColumn && abs(delta) > 0.0001
    val change = if (!changed) null else {
        val percent = if (baseline == 0.0) "new" else (delta / abs(baseline) * 100).let { "${if (it > 0) "+" else ""}${jsFixed(it, 1)}%" }
        " (${if (delta > 0) "+" else "-"}${jsLocale(abs(delta))} · $percent)"
    }
    return ComparisonLine(key, label, color, jsLocale(value), change, if (changed) (if (delta > 0) GAIN_COLOR else LOSS_COLOR) else null)
}
