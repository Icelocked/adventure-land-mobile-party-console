package com.partyconsole.companion.domain

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The PWA's npcPrice.test.ts (copied from the console fork's
 *  scripts/tests/npc-price.test.cjs) and npcShop.test.ts.
 *
 *  Failure modes:
 *  - A price drifts from calculate_item_value or the sbuy multipliers.
 *  - A reversed level range lists nothing, or "until I stop" gets a total.
 *  - A watch label drops its level range, shop, kind, cap or last purchase.
 */
class NpcShopTest {
    private val defs: PriceDefinitions = Json.parseToJsonElement(
        """{"coat":{"g":1000,"upgrade":{}},"ring":{"g":1000,"compound":{}},"cashy":{"g":50,"cash":1},"marked":{"g":900,"markup":3},
           "scroll0":{"g":1000},"scroll1":{"g":40000},"scroll2":{"g":1600000},"cscroll0":{"g":6400},"cscroll1":{"g":240000},"cscroll2":{"g":9200000}}""",
    ).jsonObject.mapValues { (_, value) -> value.jsonObject as Map<String, JsonElement> }

    @Test
    fun itemValueFollowsCalculateItemValueAtZeroUpgradeLevelsAndCompoundLevels() {
        assertEquals(600L, itemValue(defs, "coat", 0))
        // 0.6 g plus half a scroll0.
        assertEquals(1100L, itemValue(defs, "coat", 1))
        // +4 doubles the base value.
        assertEquals(2L * 600 + 4 * 500, itemValue(defs, "coat", 4))
        assertEquals(Math.round(600 * 3.2 + 6400 / 2.4), itemValue(defs, "ring", 1))
        // Cash items take their full g.
        assertEquals(50L, itemValue(defs, "cashy", 0))
        // Markup divides the value.
        assertEquals(180L, itemValue(defs, "marked", 0))
        // An item the catalog lacks has no price.
        assertEquals(0L, itemValue(defs, "unknown", 0))
    }

    @Test
    fun pontyChargesTwiceTheValueThreeTimesForCashItemsAndRonFourTimes() {
        assertEquals(1200L, npcUnitPrice(defs, "coat", 0, "ponty"))
        assertEquals(150L, npcUnitPrice(defs, "cashy", 0, "ponty"))
        assertEquals(2400L, npcUnitPrice(defs, "coat", 0, "ron"))
        // Ron has no cash multiplier.
        assertEquals(200L, npcUnitPrice(defs, "cashy", 0, "ron"))
    }

    @Test
    fun aLevelRangeListsTheUnitPriceOfEveryIncludedLevel() {
        assertEquals(listOf(LevelPrice(0, 1200), LevelPrice(1, 2200)), levelPrices(defs, "coat", 0, 1, "ponty"))
        // A reversed range still lists both.
        assertEquals(listOf(LevelPrice(0, 2400), LevelPrice(1, 4400)), levelPrices(defs, "coat", 1, 0, "ron"))
    }

    @Test
    fun theEstimatedTotalSpansTheCheapestToTheDearestLevel() {
        assertEquals(360000L to 660000L, estimateTotal(levelPrices(defs, "coat", 0, 1, "ponty"), 300))
        assertEquals(3600L to 3600L, estimateTotal(levelPrices(defs, "coat", 0, 0, "ponty"), 3))
        // Until stopped has no total.
        assertNull(estimateTotal(levelPrices(defs, "coat", 0, 0, "ponty"), null))
    }

    private fun order(levelMin: Int = 0, levelMax: Int = 0, npc: String = "ponty", kind: String = "watch", quantity: Int? = 300, spendCap: Long? = null, bought: Int = 0, spent: Long = 0, status: String = "active", lastBoughtAt: Long? = null, lastRealm: String? = null) =
        NpcShopOrder(id = "npc-order-1", npc = npc, kind = kind, item = "stramulet", levelMin = levelMin, levelMax = levelMax, quantity = quantity, spendCap = spendCap, bought = bought, spent = spent, status = status, lastBoughtAt = lastBoughtAt, lastRealm = lastRealm)

    @Test
    fun watchLabelsNameTheLevelsShopKindCapAndProgress() {
        assertEquals("+0", orderLevels(order()))
        assertEquals("+0 to +2", orderLevels(order(levelMax = 2)))
        assertEquals("Amulet of Strength +0 · Ponty · watch", orderSummary(order(), "Amulet of Strength"))
        assertEquals("Ring +0 · Ron · buy now · cap 50,000g", orderSummary(order(npc = "ron", kind = "now", spendCap = 50000), "Ring"))
        assertEquals("12/300 bought · 60,000g spent · active", orderProgress(order(bought = 12, spent = 60000)))
        val last = java.util.GregorianCalendar(2026, 9, 22, 9, 30).timeInMillis
        assertEquals(
            "2 (until stopped) bought · 10g spent · last ${localTime(last)} on USIII · paused",
            orderProgress(order(quantity = null, bought = 2, spent = 10, status = "paused", lastBoughtAt = last, lastRealm = "USIII")),
        )
    }

    @Test
    fun typedNumbersSendAsJsonStringifyNumberDoes() {
        assertEquals("0", jsNumberField(" ").toString())
        assertEquals("300", jsNumberField("300").toString())
        assertEquals("null", jsNumberField("abc").toString())
    }
}
