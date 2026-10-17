package com.partyconsole.companion.domain

import com.partyconsole.companion.model.MerchantBuyItem
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

// Console 1.4 runtime/upgrade-estimate.ts, which the server runs on every buy
// order, so the app shows what the server will accept.
// PWA: web/src/lib/upgradeEstimate.ts (a copy of the console's file).

/** One cart line's estimate. [completed] counts the simulated runs that
 *  finished; [rolls] the random rolls they used. */
sealed interface BuyEstimate {
    val completed: Int
    val rolls: Long

    data class Available(val attempts: Long, val gold: Double, val scrolls: List<Long>, override val completed: Int, override val rolls: Long) : BuyEstimate
    data class Unavailable(override val completed: Int, override val rolls: Long) : BuyEstimate
}

data class EstimateLine(val choice: MerchantBuyItem, val quantity: Int, val target: Int)

private val DEFAULT_CHANCES = listOf(
    listOf(1.0, 0.9999999, 0.98, 0.95, 0.7, 0.6, 0.4, 0.25, 0.15, 0.07, 0.024, 0.14, 0.11),
    listOf(1.0, 0.99998, 0.97, 0.94, 0.68, 0.58, 0.38, 0.24, 0.14, 0.066, 0.018, 0.13, 0.1),
    listOf(1.0, 0.97, 0.94, 0.92, 0.64, 0.52, 0.32, 0.232, 0.13, 0.062, 0.015, 0.12, 0.09),
)

private fun grade(choice: MerchantBuyItem) = max(0, min(2, choice.upgradeGrade ?: 0))

/** The last level the item's chance table reaches; 0 for an item that
 *  can't be upgraded. */
fun highestUpgradeLevel(choice: MerchantBuyItem): Int {
    if (!choice.upgradeable) return 0
    val chances = choice.upgradeChances ?: DEFAULT_CHANCES[grade(choice)]
    var level = 0
    while (level + 1 < chances.size && chances[level + 1] > 0) level++
    return level
}

private fun estimateKey(line: EstimateLine): String {
    fun list(values: List<Number>?) = values?.let { JsonArray(it.map { value -> JsonPrimitive(value) }) } ?: JsonNull
    val choice = line.choice
    return JsonArray(
        listOf(
            JsonPrimitive(choice.id), JsonPrimitive(choice.cost), JsonPrimitive(choice.upgradeable), choice.upgradeGrade?.let { JsonPrimitive(it) } ?: JsonNull,
            list(choice.upgradeChances), list(choice.grades), list(choice.scrollCosts), JsonPrimitive(line.quantity), JsonPrimitive(line.target),
        ),
    ).toString()
}

private val cache = object : LinkedHashMap<String, List<BuyEstimate>>() {
    override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, List<BuyEstimate>>?) = size > 256
}

private class Budget(var remaining: Long)

/** Canonical ordering makes the app's and the server's estimates
 *  independent of cart order, and every line shares one 60M-roll budget.
 *  Only complete batches are cached, so a cancelled edit never poisons a
 *  later estimate. */
suspend fun estimateUpgradeBatch(lines: List<EstimateLine>): List<BuyEstimate> {
    val sorted = lines.withIndex().map { (index, line) -> Triple(line, index, estimateKey(line)) }.sortedBy { it.third }
    val key = JsonArray(sorted.map { JsonPrimitive(it.third) }).toString()
    val results = synchronized(cache) { cache[key] } ?: run {
        val budget = Budget(60_000_000)
        val computed = sorted.map { (line) -> simulate(line.choice, line.quantity, line.target, budget) }
        synchronized(cache) { cache[key] = computed }
        computed
    }
    val output = arrayOfNulls<BuyEstimate>(lines.size)
    sorted.forEachIndexed { position, (_, index) -> output[index] = results[position] }
    return output.map { it!! }
}

/** ECMAScript ToInt32 for an integral double. */
private fun toInt32(value: Double): Int = (value % 4294967296.0).toLong().toInt()

private data class Policy(val target: Int, val igrace: Int, val chances: List<Double>, val grades: List<Int>, val costs: List<Long>)

private fun simulationPolicy(choice: MerchantBuyItem, target: Int): Policy {
    val grade = grade(choice)
    return Policy(
        target = target,
        igrace = listOf(1, -1, -2)[grade],
        chances = choice.upgradeChances ?: DEFAULT_CHANCES[grade],
        grades = choice.grades ?: listOf(9, 10, 11, 12),
        costs = choice.scrollCosts ?: listOf(1000, 40000, 1600000, 64000000),
    )
}

private fun scrollGrade(level: Int, grades: List<Int>) = when {
    level >= (grades.getOrNull(2) ?: 11) -> 3
    level >= (grades.getOrNull(1) ?: 10) -> 2
    level >= (grades.getOrNull(0) ?: 9) -> 1
    else -> 0
}

private fun rollChance(base: Double, level: Int, grace: DoubleArray, igrace: Int): Double {
    val count = max(0.0, min((level + 1).toDouble(), min(3.0, grace[level] / 4.5) + igrace))
    var bonus = (base * count) / level + count / 1000
    bonus = max(0.0, bonus / 4.8 - 0.4 / (level - 0.999).pow(2))
    return min(base + bonus, min(base + 0.24, base * 2))
}

private fun failedGrace(grace: DoubleArray, level: Int) {
    grace[level - 1]++
    grace[level]++
    if (level in 8..15) {
        grace[level - 1]++
        grace[level - 2] += 2.0
        grace[level - 3] += 2.0
    }
}

/** One deterministic 3000-run batch. Runs cut off by the budget are
 *  discarded, and fewer than 30 completions yield no estimate. */
private suspend fun simulate(choice: MerchantBuyItem, quantity: Int, target: Int, budget: Budget): BuyEstimate {
    if (target == 0 || !choice.upgradeable) return BuyEstimate.Available(quantity.toLong(), choice.cost.toDouble() * quantity, emptyList(), 3000, 0)
    if (target > highestUpgradeLevel(choice)) return BuyEstimate.Unavailable(0, 0)
    val policy = simulationPolicy(choice, target)
    // A JavaScript number: Math.imul keeps it an int32 here, and the
    // generator below lets it grow as a double, as in the console.
    var seed = 2166136261.0
    for (char in "${choice.id}:$quantity:$target") seed = ((toInt32(seed) xor char.code) * 16777619).toDouble()
    fun random(): Double {
        seed += 0x6d2b79f5.toDouble()
        var value = toInt32(seed)
        value = (value xor (value ushr 15)) * (value or 1)
        value = value xor (value + (value xor (value ushr 7)) * (value or 61))
        return ((value xor (value ushr 14)).toLong() and 0xFFFFFFFFL) / 4294967296.0
    }
    data class Run(val attempts: Long, val gold: Double, val scrolls: List<Long>)
    val runs = ArrayList<Run>(3000)
    val startBudget = budget.remaining
    simulation@ for (run in 0 until 3000) {
        val grace = DoubleArray(20)
        val scrolls = LongArray(4)
        var attempts = 0L
        var successes = 0
        while (successes < quantity) {
            attempts++
            // upgradeOne: null when the budget runs out mid-item.
            var survived: Boolean? = true
            for (level in 1..policy.target) {
                if (budget.remaining == 0L) {
                    survived = null
                    break
                }
                if (budget.remaining % 32768 == 0L) currentCoroutineContext().ensureActive()
                budget.remaining--
                scrolls[scrollGrade(level - 1, policy.grades)]++
                if (random() <= rollChance(policy.chances.getOrNull(level) ?: 0.0, level, grace, policy.igrace)) {
                    grace[level] = 0.0
                } else {
                    failedGrace(grace, level)
                    survived = false
                    break
                }
            }
            if (survived == null) break@simulation
            if (survived) successes++
        }
        val gold = attempts * choice.cost.toDouble() + scrolls.withIndex().sumOf { (index, count) -> count * (policy.costs.getOrNull(index) ?: 0L).toDouble() }
        runs += Run(attempts, gold, scrolls.toList())
    }
    val rolls = startBudget - budget.remaining
    if (runs.size < 30) return BuyEstimate.Unavailable(runs.size, rolls)
    runs.sortBy { it.gold }
    val pick = runs[ceil(runs.size * 0.9).toInt() - 1]
    return BuyEstimate.Available(pick.attempts, pick.gold, pick.scrolls, runs.size, rolls)
}
