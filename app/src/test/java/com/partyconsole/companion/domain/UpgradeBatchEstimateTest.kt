package com.partyconsole.companion.domain

import com.partyconsole.companion.model.MerchantBuyItem
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test

/** web/src/lib/upgradeEstimate.ts (console 1.4 runtime/upgrade-estimate.ts).
 *  The reference numbers come from running that file under Node 22 with the
 *  same inputs.
 *
 *  Failure modes:
 *  - The generator drifts from JavaScript integer semantics, so the app's
 *    90% budget differs from the one the server checks the order against.
 *  - Lines don't share one 60M-roll budget in canonical order, so a cart's
 *    estimates change with the order its lines were added.
 *  - A level the chance table can't reach, or one too unlikely to finish
 *    30 runs, gets a number instead of "unavailable".
 *  - The highest level ignores the item's own chance table or its grade.
 */
class UpgradeBatchEstimateTest {
    private val bow = MerchantBuyItem(id = "bow", name = "Bow", cost = 1000, upgradeable = true, upgradeGrade = 0, grades = listOf(9, 10, 11, 12), scrollCosts = listOf(1000, 40000, 1600000, 64000000))
    private val blade = MerchantBuyItem(id = "blade", name = "Blade", cost = 5000, upgradeable = true, upgradeGrade = 1)
    private val hpot = MerchantBuyItem(id = "hpot0", name = "Health Potion", cost = 20)

    @Test
    fun matchesTheTypeScriptReferenceForOneLine() = runBlocking {
        assertEquals(listOf(BuyEstimate.Available(57, 347000.0, listOf(290, 0, 0, 0), 3000, 381110)), estimateUpgradeBatch(listOf(EstimateLine(bow, 1, 7))))
    }

    @Test
    fun linesShareOneBudgetInCanonicalOrderWhateverTheCartOrder() = runBlocking {
        // blade sorts before bow, uses up the whole budget, and leaves bow none.
        val expected = listOf(
            BuyEstimate.Available(18012, 180658000.0, listOf(90598, 0, 0, 0), 1193, 60_000_000),
            BuyEstimate.Available(5, 100.0, emptyList(), 3000, 0),
            BuyEstimate.Unavailable(0, 0),
        )
        assertEquals(expected, estimateUpgradeBatch(listOf(EstimateLine(blade, 3, 9), EstimateLine(hpot, 5, 0), EstimateLine(bow, 2, 5))))
        assertEquals(expected.reversed(), estimateUpgradeBatch(listOf(EstimateLine(bow, 2, 5), EstimateLine(hpot, 5, 0), EstimateLine(blade, 3, 9))))
    }

    @Test
    fun unreachableOrTooUnlikelyLevelsAreUnavailable() = runBlocking {
        assertEquals(listOf(BuyEstimate.Unavailable(3, 60_000_000)), estimateUpgradeBatch(listOf(EstimateLine(bow.copy(upgradeChances = listOf(1.0, 1.0, 0.0000001)), 1, 2))))
        assertEquals(listOf(BuyEstimate.Unavailable(0, 0)), estimateUpgradeBatch(listOf(EstimateLine(bow.copy(upgradeGrade = 2), 1, 13))))
    }

    @Test
    fun theHighestLevelFollowsTheChanceTable() {
        assertEquals(4, highestUpgradeLevel(bow.copy(upgradeChances = listOf(1.0, 1.0, 1.0, 1.0, 1.0))))
        assertEquals(12, highestUpgradeLevel(bow))
        assertEquals(0, highestUpgradeLevel(MerchantBuyItem(id = "x", name = "x", cost = 1)))
        assertEquals(12, highestUpgradeLevel(bow.copy(upgradeGrade = 2)))
    }
}
