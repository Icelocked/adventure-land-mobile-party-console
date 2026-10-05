package com.partyconsole.companion.domain

import com.partyconsole.companion.model.InventoryEntry
import com.partyconsole.companion.model.ItemSuggestedPrice
import com.partyconsole.companion.model.MerchantBuyItem
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/** Upgrade success chance per level, by item grade. */
val UPGRADE_CHANCES: Map<Int, List<Double>> = mapOf(
    0 to listOf(1.0, 0.9999999, 0.98, 0.95, 0.7, 0.6, 0.4, 0.25, 0.15, 0.07, 0.024, 0.14, 0.11),
    1 to listOf(1.0, 0.99998, 0.97, 0.94, 0.68, 0.58, 0.38, 0.24, 0.14, 0.066, 0.018, 0.13, 0.1),
    2 to listOf(1.0, 0.97, 0.94, 0.92, 0.64, 0.52, 0.32, 0.232, 0.13, 0.062, 0.015, 0.12, 0.09),
)

/** ECMAScript ToInt32 for an integral double. */
private fun toInt32(value: Double): Int = (value % 4294967296.0).toLong().toInt()

data class UpgradeEstimate(val attempts: Long, val gold: Double, val scrolls: List<Long>)

private val estimateCache = java.util.concurrent.ConcurrentHashMap<String, UpgradeEstimate>()

/** The 90th-percentile cost of producing [quantity] items at +[target] from
 *  a seeded 3000-run simulation. The generator reproduces JavaScript integer
 *  semantics (Math.imul, >>>, a seed that grows as a double) so the numbers
 *  match the dashboard. */
fun upgradeEstimate(item: MerchantBuyItem, quantity: Int, target: Int): UpgradeEstimate {
    if (target == 0 || !item.upgradeable) return UpgradeEstimate(quantity.toLong(), item.cost.toDouble() * quantity, emptyList())
    val cacheKey = "${item.id}:${item.cost}:${item.upgradeGrade ?: 0}:$quantity:$target"
    estimateCache[cacheKey]?.let { return it }
    val chances = item.upgradeChances.orEmpty()
    val grades = item.grades ?: listOf(9, 10, 11, 12)
    val itemGrade = max(0, item.upgradeGrade ?: 0)
    // The seed is a JavaScript number: it grows as a double and, past 2^53,
    // loses integer precision just as the dashboard's does.
    var seed = 2166136261.0
    for (char in "${item.id}:$quantity:$target") seed = ((toInt32(seed) xor char.code) * 16777619).toDouble()
    fun random(): Double {
        seed += 0x6d2b79f5.toDouble()
        var value = toInt32(seed)
        value = (value xor (value ushr 15)) * (value or 1)
        value = value xor (value + (value xor (value ushr 7)) * (value or 61))
        return ((value xor (value ushr 14)).toLong() and 0xFFFFFFFFL) / 4294967296.0
    }
    val runs = ArrayList<UpgradeEstimate>(3000)
    repeat(3000) {
        val personalGrace = DoubleArray(20)
        val scrolls = LongArray(4)
        var attempts = 0L
        var successes = 0
        var guard = 0
        while (successes < quantity && guard++ < 2_000_000) {
            attempts += 1
            var level = 0
            var survived = true
            while (level < target && survived) {
                val newLevel = level + 1
                val scrollGrade = if (level >= (grades.getOrNull(2) ?: 11)) 3 else if (level >= (grades.getOrNull(1) ?: 10)) 2 else if (level >= (grades.getOrNull(0) ?: 9)) 1 else 0
                scrolls[scrollGrade] += 1
                val base = chances.getOrNull(newLevel) ?: 0.0
                val graceNumber = max(0.0, min((newLevel + 1).toDouble(), min(3.0, personalGrace.getOrElse(newLevel) { 0.0 } / 4.5) + itemGrade))
                var graceChance = (base * graceNumber) / newLevel + graceNumber / 1000
                val distance = newLevel - 0.999
                graceChance = max(0.0, graceChance / 4.8 - 0.4 / (distance * distance))
                val chance = min(base + graceChance, min(base + 0.24, base * 2))
                if (random() <= chance) {
                    if (newLevel < 20) personalGrace[newLevel] = 0.0
                    level = newLevel
                } else {
                    personalGrace[newLevel - 1] += 1
                    if (newLevel < 20) personalGrace[newLevel] += 1
                    if (newLevel in 8..15) {
                        personalGrace[newLevel - 1] += 1
                        personalGrace[newLevel - 2] += 2
                        personalGrace[newLevel - 3] += 2
                    }
                    survived = false
                }
            }
            if (survived) successes += 1
        }
        val scrollGold = scrolls.withIndex().sumOf { (grade, count) -> count * (item.scrollCosts?.getOrNull(grade) ?: 0L).toDouble() }
        runs += UpgradeEstimate(attempts, attempts * item.cost.toDouble() + scrollGold, scrolls.toList())
    }
    runs.sortBy { it.gold }
    val result = runs[min(runs.size - 1, ceil(runs.size * 0.9).toInt() - 1)]
    estimateCache[cacheKey] = result
    return result
}

data class SuggestedValue(val suggested: Double, val defaultPrice: Double, val sources: List<ItemSuggestedPrice>)

/** PWA: web/src/lib/suggestedItemValue.ts. */
fun suggestedItemValue(entry: InventoryEntry, buyable: List<MerchantBuyItem>): SuggestedValue {
    val definition = entry.meta?.definition.orEmpty()
    fun num(key: String) = (definition[key] as? JsonPrimitive)?.content?.toDoubleOrNull()
    val defaultPrice = max(1.0, num("g") ?: 1.0)
    val level = max(0, entry.item.level ?: 0)
    val catalogItem = buyable.find { it.id == entry.item.name }
    val sources = entry.meta?.world?.suggestedPrices.orEmpty().map { source ->
        var suggested = max(defaultPrice, source.suggested.takeIf { it != 0.0 } ?: defaultPrice)
        if (level > 0 && entry.meta?.upgradeable == true) {
            val grade = max(0, min(2, catalogItem?.upgradeGrade ?: num("igrade")?.toInt() ?: 0))
            val estimated = upgradeEstimate(
                MerchantBuyItem(
                    id = entry.item.name,
                    name = (definition["name"] as? JsonPrimitive)?.content ?: entry.item.name,
                    cost = suggested.toLong(),
                    seller = "",
                    sprite = entry.meta.sprite,
                    upgradeable = true,
                    upgradeGrade = grade,
                    grades = catalogItem?.grades ?: (definition["grades"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.content?.toDoubleOrNull()?.toInt() },
                    upgradeChances = catalogItem?.upgradeChances ?: UPGRADE_CHANCES[grade],
                    scrollCosts = catalogItem?.scrollCosts ?: listOf(1000L, 40000L, 1600000L, 64000000L),
                ),
                1,
                level,
            )
            suggested = max(suggested, estimated.gold)
        }
        source.copy(suggested = max(1.0, ceil(suggested)), purchase = false)
    }.toMutableList()
    if (catalogItem != null) {
        val estimated = upgradeEstimate(catalogItem, 1, level)
        sources += ItemSuggestedPrice(
            monsterId = "__buy__",
            monsterName = if (level > 0) "buy + upgrade" else "buy",
            rate = if (level > 0) 0.9 else 1.0,
            quantity = 1.0,
            kills = estimated.attempts.toDouble(),
            goldPerKill = 0.0,
            suggested = max(1.0, estimated.gold),
            purchase = true,
            attempts = estimated.attempts,
            scrolls = estimated.scrolls,
        )
    }
    sources.sortWith(compareBy<ItemSuggestedPrice> { it.suggested }.thenBy { it.monsterName })
    return SuggestedValue(suggested = sources.firstOrNull()?.suggested ?: defaultPrice, defaultPrice = defaultPrice, sources = sources)
}
