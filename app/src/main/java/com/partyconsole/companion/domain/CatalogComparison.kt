package com.partyconsole.companion.domain

import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.ItemMeta

/** equipment-types.ts, verbatim. */
val EQUIPMENT_TYPES = listOf("weapon", "shield", "source", "quiver", "misc_offhand", "helmet", "chest", "pants", "gloves", "shoes", "cape", "ring", "earring", "amulet", "belt", "orb", "elixir")

/** catalog-comparison.tsx ComparisonSource / CatalogComparisonEntry. */
data class ComparisonSource(val slot: Int, val item: Item, val meta: ItemMeta?)
data class CatalogComparisonEntry(val entry: ComparisonSource, val level: Int, val stat: String)

fun comparisonEntry(entry: ComparisonSource) = CatalogComparisonEntry(entry, entry.item.level ?: 0, entry.item.statType.orEmpty())
