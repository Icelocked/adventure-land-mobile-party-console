package com.partyconsole.companion.model

import com.partyconsole.companion.domain.alDataBuyOrder
import com.partyconsole.companion.domain.filterBuyOrders
import com.partyconsole.companion.domain.ownedKey
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** consoleFeatures reads the state fields only the stable console fork
 *  sends. PartyRepository.publish fills `stateKeys` from the merged state;
 *  this test builds it the same way from the decoded JSON's keys. PWA:
 *  web/src/models/consoleFeatures.test.ts.
 *
 *  Failure modes:
 *  - A v1.4.0 console unlocks a fork control because the model fills a
 *    missing field with its default (realmHopBlacklist []).
 *  - The stable fork's unset designated tank (null) reads as no tank support.
 *  - designatedTank alone unlocks Check, Keep and the other commerce controls.
 *  - Owned-first sorting runs on v1.4.0, or not on the fork.
 */
class ConsoleFeaturesTest {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }
    private fun state(text: String): PartyStateDynamic {
        val raw = Json.parseToJsonElement(text).jsonObject
        return json.decodeFromJsonElement(PartyStateDynamic.serializer(), raw).copy(stateKeys = raw.keys)
    }

    private val v140 = """{"leader":"Lead","merchantRoutinePriorities":{"upgrade preview":70},"farmingProfiles":{"Lead":{"farmingPolicy":"auto"}}}"""
    private val stable = """{"leader":"Lead","designatedTank":null,"offTank":null,"pullMode":false,"realmHopBlacklist":[],"bankSortLayout":"packed",
        "bossChase":{"enabled":false,"minEtaMinutes":15,"sightings":[],"respawns":[]},
        "merchantRoutinePriorities":{"upgrade preview":70,"prim stack":70},
        "farmingProfiles":{"Lead":{"farmingPolicy":"auto","encounterRoutines":{}}}}"""

    @Test
    fun ryanV140SupportsNoForkFeature() {
        assertEquals(ConsoleFeatures(false, false, false, false, false, false, false, false), state(v140).consoleFeatures)
    }

    @Test
    fun theStableForkSupportsEveryFeatureFromItsInitialStateWithNoTankPicked() {
        assertEquals(ConsoleFeatures(true, true, true, true, true, true, true, true), state(stable).consoleFeatures)
    }

    @Test
    fun eachSignalStandsAlone() {
        assertTrue(state("""{"designatedTank":"Tanky"}""").consoleFeatures.designatedTank)
        assertTrue(state("""{"pullMode":false}""").consoleFeatures.tankRoles)
        assertTrue(state("""{"encounterRoutines":{"franky":"tank"}}""").consoleFeatures.frankyRoutine)
        assertTrue(state("""{"merchantRoutinePriorities":{"prim stack":10}}""").consoleFeatures.primStack)
        val tankOnly = state("""{"designatedTank":null}""").consoleFeatures
        assertTrue(tankOnly.designatedTank)
        // Commerce needs bossChase as well.
        assertFalse(tankOnly.forkCommerce)
        assertFalse(state("""{"bossChase":null}""").consoleFeatures.bossChase)
    }

    @Test
    fun ownedFirstPutsOffersTheMerchantCanFillAheadOfFreshOnes() {
        val now = 1_000_000_000L
        fun order(name: String, seenAt: Long) = alDataBuyOrder(
            Json.parseToJsonElement("""{"key":"$name","buyer":"B","serverRegion":"EU","serverIdentifier":"I","price":900,"quantity":1,"seenAt":$seenAt,"item":{"name":"$name"}}""") as JsonObject,
        )
        val orders = listOf(order("fresh", now), order("owned", now - 600_000))
        val owned = mapOf(ownedKey(Item(name = "owned")) to 2)
        assertEquals(listOf("fresh", "owned"), filterBuyOrders(orders, "", now, false, owned, { null }).map { it.item.name })
        assertEquals(listOf("owned", "fresh"), filterBuyOrders(orders, "", now, false, owned, { null }, ownedFirst = true).map { it.item.name })
    }
}
