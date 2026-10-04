package com.partyconsole.companion.domain

import com.partyconsole.companion.model.AutoNpcSaleRule
import com.partyconsole.companion.model.AutoStandRule
import com.partyconsole.companion.model.Bankboi
import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.MerchantJob
import com.partyconsole.companion.model.PartyStateDynamic
import com.partyconsole.companion.model.SharedRules
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Locale

/** The same cases as the PWA's lib/ports.test.ts for these ports. */
class MerchantTest {
    @Test
    fun labelsJobsLikeTheDashboard() {
        assertEquals("Party restock", merchantJobLabel(MerchantJob(target = "A", reason = "restock")))
        assertEquals("Bank retrieval", merchantJobLabel(MerchantJob(target = "A", reason = "x", operationStage = "retrieving")))
        assertEquals(
            "Join Gen's giveaway for Green Gem",
            merchantJobLabel(MerchantJob(target = "A", reason = "join giveaway", seller = "Gen", expectedItem = Item(name = "gem0")), listOf(CatalogItem(id = "gem0", name = "Green Gem"))),
        )
        val order = JsonObject(mapOf("buys" to JsonArray(listOf(JsonObject(mapOf("desiredLevel" to JsonPrimitive(2)))))))
        assertEquals("Buy and upgrade", merchantJobLabel(MerchantJob(target = "A", reason = "merchant commerce", order = order)))
    }

    @Test
    fun groupsFollowersUnderTheLeaderSkippingTheMerchantAndBankbois() {
        val state = PartyStateDynamic(leader = "L", followers = mapOf("F" to true), merchantCharacter = "M", bankbois = listOf(Bankboi(name = "B")))
        assertEquals(listOf(PartyGroup("L", listOf("L", "F")), PartyGroup("S", listOf("S"))), merchantPartyGroups(state, listOf("F", "L", "S", "M", "B")))
    }

    @Test
    fun formatsDurations() {
        assertEquals(listOf("Active", "Expiring", "2m 5s", "1h 1s"), listOf(null, 0L, 125_000L, 3_600_500L).map(::durationLabel))
    }

    @Test
    fun normalisesTheCommerceRuleKey() {
        assertEquals("""{"name":"ore","level":0,"p":null,"stat_type":null}""", automaticCommerceRuleKey(Item(name = "ore")))
        assertEquals("""{"name":"bow","level":0,"p":null,"stat_type":"dex"}""", automaticCommerceRuleKey(Item(name = "bow", level = -2, statType = "dex")))
    }

    @Test
    fun flagsAnItemTwoSharedRulesWouldBothActOn() {
        val key = automaticCommerceRuleKey(Item(name = "ore"))
        val shared = PartyStateDynamic(merchantCharacter = "M", merchantRules = SharedRules(owner = "M", members = listOf("A")))
        val state = shared.copy(autoNpcSales = mapOf(key to AutoNpcSaleRule(Item(name = "ore"))), autoStandMarks = mapOf(key to AutoStandRule(Item(name = "ore"), price = 5)))
        assertEquals(listOf("NPC sale", "Stand sale"), itemRuleConflicts(state, Item(name = "ore")))
        assertEquals(listOf("ore"), conflictingItems(state).map { it.item.name })
        // Outside shared mode, or with a single rule, nothing is flagged.
        assertEquals(emptyList<String>(), itemRuleConflicts(PartyStateDynamic(autoNpcSales = mapOf(key to AutoNpcSaleRule(Item(name = "ore")))), Item(name = "ore")))
        assertEquals(emptyList<String>(), itemRuleConflicts(shared.copy(autoNpcSales = mapOf(key to AutoNpcSaleRule(Item(name = "ore")))), Item(name = "ore")))
    }

    @Test
    fun describesRuleValues() {
        Locale.setDefault(Locale.US)
        assertEquals("3 upgrade levels · Unlimited", describeRule(JsonObject(mapOf("tiers" to JsonPrimitive(3), "quantity" to JsonPrimitive(-1)))))
        assertEquals("Compound to +4 · 2 remaining", describeRule(JsonObject(mapOf("targetTier" to JsonPrimitive(4), "quantity" to JsonPrimitive(2)))))
        assertEquals("12,000g", describeRule(JsonObject(mapOf("price" to JsonPrimitive(12000)))))
        assertEquals("Automatic rule", describeRule(JsonObject(emptyMap())))
    }
}
