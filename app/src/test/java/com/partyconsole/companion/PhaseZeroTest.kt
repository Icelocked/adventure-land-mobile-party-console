package com.partyconsole.companion

import com.partyconsole.companion.model.HuntSettings
import com.partyconsole.companion.model.MerchantJob
import com.partyconsole.companion.model.PartyStateDynamic
import com.partyconsole.companion.model.farmingContext
import com.partyconsole.companion.model.focusFor
import com.partyconsole.companion.model.sameMarkedItem
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.network.sessionLost
import com.partyconsole.companion.ui.account.AUTOMATIC_ROUTINE_KEYS
import com.partyconsole.companion.ui.account.ROUTINE_LABELS
import com.partyconsole.companion.ui.account.routineFor
import com.partyconsole.companion.ui.components.isModifiedItem
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The pure pieces behind the Phase A0 write-path fixes, checked against
 *  the same cases the PWA's ports are built on. */
class PhaseZeroTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun routineLabelsMatchTheDashboard() {
        // The legacy "exchange" key is gone (the server ignores it); the
        // v1.2.0 keys the server accepts are present.
        assertFalse(ROUTINE_LABELS.containsKey("exchange"))
        for (key in listOf("deliveries", "withdrawals", "upgrade preview", "manual exchange", "automatic exchange")) assertTrue(key, ROUTINE_LABELS.containsKey(key))
        assertTrue(AUTOMATIC_ROUTINE_KEYS.contains("automatic exchange"))
        assertFalse(AUTOMATIC_ROUTINE_KEYS.contains("exchange"))
    }

    @Test
    fun routineForFollowsRoutinesTs() {
        assertEquals("automatic exchange", routineFor(MerchantJob(reason = "exchange", autoExchangeKeys = listOf("box@0"))))
        assertEquals("manual exchange", routineFor(MerchantJob(reason = "exchange")))
        assertEquals("auto upgrade", routineFor(MerchantJob(reason = "upgrades", routine = "auto upgrade")))
        assertEquals("manual marketplace purchases", routineFor(MerchantJob(reason = "Ponty purchases")))
        assertEquals("stand bid purchases", routineFor(MerchantJob(reason = "stand purchases", bidItemId = "bow")))
        assertEquals("manual crafting", routineFor(MerchantJob(reason = "merchant commerce", order = buildJsonObject { putJsonArray("crafts") { add(JsonPrimitive("x")) } })))
        assertEquals("manual buying", routineFor(MerchantJob(reason = "merchant commerce", order = buildJsonObject { putJsonArray("crafts") {} })))
        assertEquals("party collection", routineFor(MerchantJob(reason = "marked items")))
    }

    @Test
    fun farmingContextUsesTheRightProfile() {
        val state = PartyStateDynamic(
            leader = "Lead",
            followers = mapOf("Fol" to true),
            farmingPolicy = "hunt",
            huntSettings = HuntSettings(deathThreshold = 4),
            farmingProfiles = mapOf("Solo" to com.partyconsole.companion.model.FarmingProfile(farmingPolicy = "scatter", huntSettings = HuntSettings(deathThreshold = 9))),
        )
        val follower = state.farmingContext("Fol")
        assertEquals("Lead", follower.owner)
        assertEquals("Lead", follower.followingLeader)
        assertEquals(4, follower.settings?.deathThreshold)
        val solo = state.farmingContext("Solo")
        assertEquals("Solo", solo.owner)
        assertNull(solo.followingLeader)
        assertEquals("scatter", solo.savedMode)
        assertEquals(9, solo.settings?.deathThreshold)
        assertEquals("hunt", state.farmingContext("Lead").savedMode)
    }

    @Test
    fun focusKeepsAnExplicitEmptyListAndReadsTheFlatField() {
        val flatList = PartyStateDynamic(monsterFocus = buildJsonArray { add(JsonPrimitive("bat")) }, monsterFocusByCharacter = mapOf("B" to emptyList()))
        assertEquals(emptyList<String>(), flatList.focusFor("B"))
        assertEquals(listOf("bat"), flatList.focusFor("Lead"))
        assertEquals(listOf("crab"), PartyStateDynamic(monsterFocus = JsonPrimitive("crab")).focusFor("Lead"))
        assertEquals(listOf("goo"), PartyStateDynamic().focusFor("Lead"))
    }

    @Test
    fun stateWithNewFieldsDecodes() {
        // A string monsterFocus, a job without target and the new config
        // fields must not fail the whole state.
        val body = buildJsonObject {
            put("merchantCharacter", "Merchy")
            put("monsterFocus", "goo")
            putJsonArray("merchantQueue") { add(buildJsonObject { put("reason", "restock") }) }
            put("withdrawals", buildJsonObject { putJsonArray("Merchy") { add(buildJsonObject { put("pack", "items0"); put("slot", 3); put("item", buildJsonObject { put("name", "bow") }) }) } })
            putJsonArray("monsterChoices") { add(buildJsonObject { put("id", "bat"); put("name", "Bat") }) }
            put("realmControl", buildJsonObject { put("currentRealm", "USI"); put("split", false); put("operation", buildJsonObject { put("phase", "switching") }) })
        }.toString()
        val state = json.decodeFromString(PartyStateDynamic.serializer(), body)
        assertEquals("Merchy", state.merchantCharacter)
        assertEquals("", state.merchantQueue.single().target)
        assertEquals(3, state.withdrawals["Merchy"]?.single()?.slot)
        assertEquals("switching", state.realmControl?.operation?.phase)
    }

    @Test
    fun pairingGateAnswersMeanSessionLost() {
        assertTrue(sessionLost(302))
        assertTrue(sessionLost(401))
        assertTrue(sessionLost(403))
        assertFalse(sessionLost(409))
        assertFalse(sessionLost(503))
    }

    @Test
    fun modifiedGearNeedsAcknowledgement() {
        assertTrue(isModifiedItem(Item(name = "bow", level = 1)))
        assertTrue(isModifiedItem(Item(name = "bow", statType = "str")))
        assertTrue(isModifiedItem(Item(name = "bow", p = "shiny")))
        assertFalse(isModifiedItem(Item(name = "hpot0", q = 200)))
        assertTrue(sameMarkedItem(Item(name = "bow"), Item(name = "bow", level = 0)))
        assertFalse(sameMarkedItem(Item(name = "bow", level = 1), Item(name = "bow")))
    }
}
