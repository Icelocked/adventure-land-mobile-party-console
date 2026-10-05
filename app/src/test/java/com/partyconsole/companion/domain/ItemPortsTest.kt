package com.partyconsole.companion.domain

import com.partyconsole.companion.model.InventoryEntry
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.ItemMeta
import com.partyconsole.companion.model.ItemSuggestedPrice
import com.partyconsole.companion.model.ItemWorldInfo
import com.partyconsole.companion.model.LuckySlotTracking
import com.partyconsole.companion.model.MerchantBuyItem
import com.partyconsole.companion.model.SlotRollStatistics
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Cases shared with web/src/lib/ports.test.ts, plus reference values from
 *  the PWA's TypeScript: the seeded upgrade estimate and the lucky-slot
 *  search must give identical numbers on both clients. */
class ItemPortsTest {
    private val bow = MerchantBuyItem(id = "bow", name = "Bow", cost = 1000, seller = "", upgradeable = true, upgradeChances = UPGRADE_CHANCES[0], scrollCosts = listOf(1000, 40000, 1600000, 64000000))

    @Test
    fun upgradeEstimateMatchesTheTypeScriptReference() {
        // vite-node: upgradeEstimate(bow, 1, 7) and (blade grade 1, 3, 9)
        assertEquals(UpgradeEstimate(59, 358000.0, listOf(299, 0, 0, 0)), upgradeEstimate(bow, 1, 7))
        val blade = bow.copy(id = "blade", upgradeGrade = 1, upgradeChances = UPGRADE_CHANCES[1])
        assertEquals(UpgradeEstimate(16848, 101801000.0, listOf(84953, 0, 0, 0)), upgradeEstimate(blade, 3, 9))
    }

    @Test
    fun aPlainBuyIsOneItemAtCostAndSourcesNeverFallBelowTheItemValue() {
        assertEquals(UpgradeEstimate(3, 150.0, emptyList()), upgradeEstimate(MerchantBuyItem(id = "x", name = "x", cost = 50, seller = ""), 3, 0))
        val value = suggestedItemValue(
            InventoryEntry(
                slot = 0,
                item = Item(name = "x"),
                meta = ItemMeta(
                    definition = mapOf("g" to JsonPrimitive(100)),
                    world = ItemWorldInfo(suggestedPrices = listOf(ItemSuggestedPrice(monsterId = "goo", monsterName = "Goo", rate = 0.1, quantity = 1.0, kills = 10.0, goldPerKill = 1.0, suggested = 40.0))),
                ),
            ),
            listOf(MerchantBuyItem(id = "x", name = "x", cost = 80, seller = "")),
        )
        assertEquals(100.0, value.defaultPrice, 0.0)
        assertEquals(listOf("buy" to 80.0, "Goo" to 100.0), value.sources.map { it.monsterName to it.suggested })
        assertEquals(80.0, value.suggested, 0.0)
    }

    @Test
    fun luckySlotSearchMatchesTheTypeScriptReference() {
        val tracking = LuckySlotTracking(
            slots = mapOf(
                "7" to SlotRollStatistics(totalRolls = 300, sumRolls = 150.0, rollsAbove96_3 = 4, perfectRolls = 12),
                "3" to SlotRollStatistics(totalRolls = 20, sumRolls = 10.0, rollsAbove96_3 = 1, perfectRolls = 0),
            ),
        )
        val result = luckySlotSearch(tracking)
        assertEquals(LuckySlotSearchResult(slot = 7, confidence = result.confidence, samples = 300, total = 320, inferred = true, nextSlot = 7), result)
        assertEquals(1.0, result.confidence, 1e-9)
    }

    @Test
    fun aggregatesTheLocalStreamWithoutDoubleCounting() {
        fun stats(total: Long) = SlotRollStatistics(totalRolls = total, sumRolls = total / 2.0)
        val streams = mapOf("abc-1" to LuckySlotTracking(slots = mapOf("5" to stats(10))), "def-2" to LuckySlotTracking(slots = mapOf("5" to stats(4))))
        val local = LuckySlotTracking(streamId = "abc-1", slots = mapOf("5" to stats(12), "7" to stats(3)))
        val result = aggregateSlotTracking(streams, local)
        assertEquals(16L, result.slots.getValue("5").totalRolls)
        assertEquals(3L, result.slots.getValue("7").totalRolls)
        assertEquals(14L, aggregateSlotTracking(streams, LuckySlotTracking(streamId = "abc-1", slots = mapOf("5" to stats(8)))).slots.getValue("5").totalRolls)
    }

    @Test
    fun bannerRanksLikeTheDashboard() {
        fun c(action: BannerAction, label: String, automatic: Boolean = false) = BannerCandidate(action, label, automatic)
        assertEquals("+0 → +1", itemActionBanner(listOf(c(BannerAction.BANK, "Bank"), c(BannerAction.STAND, "Auto stand", true), c(BannerAction.UPGRADE, "+0 → +1")), false)?.label)
        assertEquals("To X", itemActionBanner(listOf(c(BannerAction.BANK, "Bank"), c(BannerAction.DELIVERY, "To X")), false)?.label)
        assertNull(itemActionBanner(listOf(c(BannerAction.MERCHANT, "Mark for merchant")), true))
        val conflict = itemActionBanner(listOf(c(BannerAction.NPC, "NPC sale", true), c(BannerAction.DECONSTRUCTION, "Auto deconstruction", true)), true)
        assertEquals(ItemActionBanner(BannerAction.CONFLICT, "Rule conflict", "npc · deconstruction"), conflict)
        assertEquals("Auto → +3", itemActionBanner(listOf(c(BannerAction.UPGRADE, "Auto → +3", true), c(BannerAction.COMPOUND, "Auto compound → +2", true)), true)?.label)
    }
}
