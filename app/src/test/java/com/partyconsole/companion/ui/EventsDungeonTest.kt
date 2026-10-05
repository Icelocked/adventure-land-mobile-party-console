package com.partyconsole.companion.ui

import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.partyconsole.companion.domain.eventPolicy
import com.partyconsole.companion.domain.selectedEvents
import com.partyconsole.companion.model.PartyStateDynamic
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.account.AnniversaryScreen
import com.partyconsole.companion.ui.characterdetail.sections.LeaderFollowerSection
import com.partyconsole.companion.ui.dungeon.CaveEventRow
import com.partyconsole.companion.ui.dungeon.DungeonPanel
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** daily-dungeons.spec.ts / events.spec.ts on the native screens. */
@RunWith(RobolectricTestRunner::class)
class EventsDungeonTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun posts(path: String) = console.requests.filter { it.method == "POST" && it.path == "/party-api/$path" }.map { Json.parseToJsonElement(it.body).jsonObject }
    private fun JsonObject.text(key: String) = (this[key] as? JsonPrimitive)?.content
    private val uuid = Regex("^[0-9a-f-]{36}$")

    private fun member(name: String, fresh: Boolean = true, extra: String = "") = """{"name":"$name","fresh":$fresh,"observation":{"at":${System.currentTimeMillis()},"supported":true,"alive":true,"ready":true,"members":[],"cave":null,"visit":{"available":true,"resets":0,"home":"EU I","checkedAt":${System.currentTimeMillis()}}$extra}}"""

    private fun activeCave(choice: String? = null): String {
        val now = System.currentTimeMillis()
        val cave = """{"run":"ab12","floor":1,"expires":${now + 9 * 60_000 + 30_000},"remainingMs":120000,"paused":${choice != null && "\"resolved\":false" in choice},"gold":100,"amber":3,"points":[
            {"id":"p1","room":"r1","label":"Fountain","map":"zone_ab12_1","x":0,"y":0,"required":true},
            {"id":"p2","room":"r2","label":"Library","map":"zone_ab12_1","x":10,"y":0,"done":true},
            {"id":"p3","room":"r3","label":"Vault","map":"zone_ab12_1","x":20,"y":0,"locked":true},
            {"id":"p4","room":"r4","label":"Stairs","map":"zone_ab12_2","x":0,"y":0},
            {"id":"p5","label":"Exit","map":"zone_ab12_1","x":0,"y":0,"exit":true}]${choice?.let { ",\"choice\":$it" } ?: ""}}"""
        return """{"state":{"phase":"active","participants":["Leada","Folla"],"protectFromEvents":true,"commands":{},"run":"ab12"},"members":[${member("Leada", extra = ",\"cave\":$cave")},${member("Folla", fresh = false)}]}"""
    }

    @Test
    fun eventPolicyFollowsTheLeaderAndDefaultsToAnniversary() {
        val state = PartyStateDynamic(leader = "Leada", followers = mapOf("Folla" to true), eventSelectionsByCharacter = mapOf("Leada" to listOf("goobrawl", "nope")), eventsByCharacter = mapOf("Rangy" to true))
        assertTrue(eventPolicy(state, "Folla").inherited)
        assertEquals(listOf("goobrawl"), selectedEvents(state, "Folla"))
        assertEquals(7, selectedEvents(state, "Rangy").size)
        assertEquals(listOf("anniversary"), selectedEvents(state, "Merchy"))
        assertFalse(eventPolicy(state, "Merchy").enabled)
    }

    @Test
    fun caveRowEntersAndTogglesProtectionWithFreshOperationIds() {
        console.dailyDungeon = """{"state":{"phase":"idle","participants":["Leada","Folla"],"protectFromEvents":true,"commands":{}},"members":[${member("Leada")},${member("Folla")}]}"""
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { CaveEventRow(viewModel) }
        eventually { viewModel.dungeons.view.value != null }
        compose.waitForIdle()
        compose.onNodeWithText("Cave of Many Dreams — Available now").assertExists()
        compose.onNodeWithContentDescription("Cave of Many Dreams settings").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Participants: Leada, Folla.").assertExists()
        compose.onNodeWithText("Don’t leave the Cave of Many Dreams for other events").performClick()
        eventually { posts("daily-dungeons").isNotEmpty() }
        compose.onNodeWithText("Enter now").performScrollTo().performClick()
        eventually { posts("daily-dungeons").size == 2 }
        val (settings, enter) = posts("daily-dungeons")
        assertEquals("settings", settings.text("action"))
        assertEquals("false", settings.text("protectFromEvents"))
        assertEquals("enter", enter.text("action"))
        assertTrue(uuid.matches(settings.text("operationId")!!))
        assertNotEquals(settings.text("operationId"), enter.text("operationId"))
    }

    @Test
    fun dungeonPanelShowsTheRunAndSendsRoomExplorationAndConfirmedExit() {
        console.dailyDungeon = activeCave()
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { DungeonPanel(viewModel) }
        eventually { viewModel.dungeons.view.value != null }
        compose.waitForIdle()
        val summary = compose.onNode(hasText("Floor ", substring = true)).fetchSemanticsNode().config[SemanticsProperties.Text].joinToString()
        assertTrue(summary, summary.startsWith("Floor 2 · 0h ") && summary.endsWith(" remaining · 100 gold · 3 Amber"))
        compose.onNodeWithText("Leada · Folla — awaiting connection").assertExists()
        compose.onNodeWithText("Library — complete").assertIsNotEnabled()
        compose.onNodeWithText("Vault — locked").assertIsNotEnabled()
        compose.onNodeWithText("Stairs — different floor").assertIsEnabled()
        compose.onNodeWithText("Exit").assertDoesNotExist()

        compose.onNodeWithText("Fountain").performClick()
        eventually { posts("daily-dungeons").size == 1 }
        compose.onNodeWithText("Start automatic exploration").performClick()
        eventually { posts("daily-dungeons").size == 2 }
        compose.onNodeWithText("Exit dungeon").performClick()
        compose.onNodeWithText("Stay in dungeon").performClick()
        compose.onNodeWithText("Confirm exit").assertDoesNotExist()
        compose.onNodeWithText("Exit dungeon").performClick()
        compose.onNodeWithText("Confirm exit").performClick()
        eventually { posts("daily-dungeons").size == 3 }
        val (move, progress, exit) = posts("daily-dungeons")
        assertEquals(listOf("move", "p1", "ab12"), listOf(move.text("action"), move.text("target"), move.text("run")))
        assertEquals(listOf("progress", "true"), listOf(progress.text("action"), progress.text("enabled")))
        assertEquals("exit", exit.text("action"))
    }

    @Test
    fun aPaidEncounterVoteIsConfirmedFirst() {
        val deadline = System.currentTimeMillis() + 60_000
        console.dailyDungeon = activeCave("""{"id":"c1","title":"A Talking Mushroom","text":"It asks for gold.","deadline":$deadline,"resolved":false,"votes":{"Leada":"pay"},"options":[{"id":"leave","label":"Walk away"},{"id":"pay","label":"Pay it","cost":50,"amber":1},{"id":"steal","label":"Steal","unavailable":"Needs a rogue"}]}""")
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { DungeonPanel(viewModel) }
        eventually { viewModel.dungeons.view.value != null }
        compose.waitForIdle()
        val inChoice = hasAnyAncestor(isDialog())
        compose.onNode(hasText("Party funds: 100 gold · 3 Amber") and inChoice).assertExists()
        compose.onNode(hasContentDescription("Close encounter")).assertDoesNotExist()
        compose.onNode(hasText("Steal — Needs a rogue", substring = true) and inChoice).assertIsNotEnabled()
        compose.onNode(hasText("Pay it — 50 shared gold — 1 Amber", substring = true) and inChoice).performClick()
        compose.onNode(hasText("Spend 50 shared gold and 1 Amber if this choice wins?") and inChoice).assertExists()
        assertEquals(0, posts("daily-dungeons").size)
        compose.onNode(hasText("Confirm vote") and inChoice).performScrollTo().performClick()
        eventually { posts("daily-dungeons").isNotEmpty() }
        posts("daily-dungeons")[0].let {
            assertEquals(listOf("vote", "c1", "pay", "50", "1", "true"), listOf("action", "choice", "option", "cost", "amber", "confirmed").map { k -> it.text(k) })
        }
    }

    @Test
    fun eventsListSavesTheSelectionAndFollowersUseTheLeaders() {
        console.override("config", mapOf(
            "eventSchedules" to Json.parseToJsonElement("""[{"id":"goobrawl","name":"Goo Brawl","live":true},{"id":"crabxx","name":"Giant Crab","stale":true},{"id":"mystery","name":"Mystery"}]"""),
            "eventSelectionsByCharacter" to Json.parseToJsonElement("""{"Leada":["anniversary"]}"""),
        ))
        val viewModel = PartyViewModel(console.settings)
        compose.setContent {
            val state by viewModel.dynamicState.collectAsState()
            androidx.compose.foundation.layout.Column {
                LeaderFollowerSection("Leada", state, viewModel)
                LeaderFollowerSection("Folla", state, viewModel)
            }
        }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.eventSchedules.isNotEmpty() }
        compose.waitForIdle()
        compose.onAllNodes(hasText("Events (1) ▾"))[0].performClick()
        compose.onNodeWithText("Goo Brawl — LIVE").assertExists()
        compose.onNodeWithText("Giant Crab — Time not announced · timing stale").assertExists()
        compose.onNodeWithText("Mystery — Unsupported").assertExists()
        compose.onNodeWithContentDescription("Goo Brawl").performClick()
        eventually { posts("formation").isNotEmpty() }
        posts("formation")[0].let {
            assertEquals("Leada", it.text("character"))
            assertEquals(listOf("anniversary", "goobrawl"), (it["eventSelections"] as JsonArray).map { e -> (e as JsonPrimitive).content })
        }
        // Close Leada's list, then open Folla's (a follower of Leada).
        compose.onAllNodes(hasText("Events (1) ▾"))[0].performClick()
        compose.onAllNodes(hasText("Events (1) ▾"))[1].performClick()
        compose.onNodeWithText("Using Leada’s events").assertExists()
        compose.onNodeWithContentDescription("Goo Brawl").assertIsNotEnabled()
    }

    @Test
    fun anniversaryShowsTheRoundSlicesAndQueuesTheChatAdvertisement() {
        console.override("config", mapOf("anniversary" to Json.parseToJsonElement(
            """{"slices":["a","b"],"labels":{"a":"Vanilla"},"counts":{"a":3},"completeSets":1,"tradableNative":2,"live":{"target":"Wizard","map":"main","x":10,"y":-5,"expires":${System.currentTimeMillis() + 125_000}},"chatMessage":"WTS slices","activity":[{"at":1,"message":"Leada kissed Wizard"}]}""",
        )))
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { AnniversaryScreen(viewModel, onBack = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.anniversary != null }
        compose.waitForIdle()
        compose.onNodeWithText("LIVE · Wizard").assertExists()
        compose.onNode(hasText("· main [10, -5]", substring = true)).assertExists()
        compose.onNodeWithText("Cake slices · 1 complete set(s)").assertExists()
        compose.onNodeWithText("Vanilla").assertExists()
        compose.onNodeWithText("Tradable native surplus: 2").performScrollTo().assertExists()
        compose.onNodeWithText("Send in game chat").performScrollTo().performClick()
        eventually { posts("anniversary/chat-advertise").isNotEmpty() }
    }
}
