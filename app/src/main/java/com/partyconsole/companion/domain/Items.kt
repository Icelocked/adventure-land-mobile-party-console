package com.partyconsole.companion.domain

import com.partyconsole.companion.model.DeconstructionCatalogEntry
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.ItemMeta
import com.partyconsole.companion.model.StandPriceHistory
import com.partyconsole.companion.ui.itemdetail.npcSaleValue
import kotlinx.serialization.json.JsonPrimitive

private fun ItemMeta?.def(key: String) = this?.definition?.get(key) as? JsonPrimitive

data class DeconstructionRewardRow(val name: String, val level: Int, val quantity: Int, val chance: Double)

/** deconstruction.ts deconstructionRewards, verbatim: recipe rolls are
 *  independent; compounded items return three items at one lower level. */
fun deconstructionRewards(item: Item, catalog: Map<String, DeconstructionCatalogEntry>): List<DeconstructionRewardRow>? {
    val definition = catalog[item.name] ?: return null
    if (definition.compound && (item.level ?: 0) > 0) return listOf(DeconstructionRewardRow(item.name, (item.level ?: 0) - 1, 3, 1.0))
    return definition.rewards.map { DeconstructionRewardRow(it.name, 0, it.quantity, it.chance) }.ifEmpty { null }
}

/** deconstruction.ts canDeconstruct, verbatim. */
fun canDeconstruct(item: Item, catalog: Map<String, DeconstructionCatalogEntry>): Boolean {
    val entry = catalog[item.name] ?: return false
    return item.l == null && item.b != true && (!entry.compound || (item.level ?: 0) > 0)
}

/** ponty-price.tsx, verbatim: 2 × the item's calculated value (3 × for cash
 *  items), inferring upgrade/compound when lightweight meta omits it. */
fun pontyPrice(item: Item, meta: ItemMeta?): Long {
    val level = maxOf(0, item.level ?: 0)
    val type = meta.def("type")?.content.orEmpty()
    val maxLevel = meta?.maxLevel
    val compoundable = meta?.compoundable == true || meta.def("compound")?.content == "true" || maxLevel == 7 || (level > 0 && type in setOf("ring", "earring", "amulet", "belt", "orb"))
    val upgradeable = meta?.upgradeable == true || meta.def("upgrade")?.content == "true" || maxLevel == 13 || (level > 0 && !compoundable)
    val pricing = (meta ?: ItemMeta()).copy(compoundable = compoundable, upgradeable = upgradeable)
    val cash = meta.def("cash")?.content == "true"
    return npcSaleValue(level, item.gift == true, item.expires, pricing) * (if (cash) 3 else 2)
}

/** suggestedItemValue.ts exactLevelPrice: only observations at this exact level. */
fun exactLevelPrice(price: Double?, observedLevel: Int?, itemLevel: Int): Double? =
    if (price != null && price != 0.0 && observedLevel != null && observedLevel == itemLevel) price else null

data class LevelPrices(val lowest: Double?, val recent: Double?, val marketLow: Double?, val highestPublicWTB: Double?)

/** level-price-history.ts. */
fun levelPriceHistory(history: StandPriceHistory?, level: Int) = LevelPrices(
    lowest = exactLevelPrice(history?.lowest, history?.lowestLevel, level),
    recent = exactLevelPrice(history?.recent, history?.recentLevel, level),
    marketLow = exactLevelPrice(history?.marketLow, history?.marketLowLevel, level),
    highestPublicWTB = exactLevelPrice(history?.highestPublicWTB, history?.highestPublicWTBLevel, level),
)
