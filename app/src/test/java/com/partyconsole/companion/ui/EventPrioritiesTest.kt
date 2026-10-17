package com.partyconsole.companion.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.characterdetail.sections.LeaderFollowerSection
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Console 1.4 event priorities, per-event limits and skipped instances
 *  (web/e2e/event-priorities.spec.ts, events.spec.ts) on the native events list.
 *
 *  Failure modes:
 *  - A move posts a partial list or swaps the wrong rows; the server 400s
 *    anything but a full permutation of supportedEvents.
 *  - A saved order from an older console drops the 1.4 events instead of
 *    appending them, so they can't be selected.
 *  - The first row's up arrow or the last row's down arrow stays enabled.
 *  - A selection toggle drops events selected elsewhere, or saves the
 *    selection out of priority order.
 *  - A legacy all-events flag opts a character into the seasonal 1.4 events.
 *  - A follower can reorder or edit limits; the server 409s "using leader events".
 *  - A refused move hides the server's message.
 *  - Limits send a blank as 0 or "" instead of null, or save a negative or
 *    fractional death limit or a zero time limit.
 *  - The limits panel closes on a server error and hides the message, or
 *    stays open after a save.
 *  - An ended instance still reads as skipped, or a leader's manual travel
 *    skip shows on its followers.
 *  - Rows take the schedule feed's names instead of the console's display names.
 *  - The anniversary visit settings become unreachable from the list.
 */
@RunWith(RobolectricTestRunner::class)
class EventPrioritiesTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun posts(path: String) = console.requests.filter { it.method == "POST" && it.path == "/party-api/$path" }.map { Json.parseToJsonElement(it.body).jsonObject }
    private fun JsonObject.list(key: String) = (this[key] as JsonArray).map { (it as JsonPrimitive).content }
    private fun button(description: String) = compose.onNode(hasContentDescription(description) and SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
    private fun inGroup(group: String) = hasAnyAncestor(hasContentDescription(group) and SemanticsMatcher.keyNotDefined(SemanticsProperties.Role))
    private fun priority(name: String) = compose.onNodeWithContentDescription("$name priority")
    private fun hasValue(value: String) = SemanticsMatcher.expectValue(SemanticsProperties.EditableText, androidx.compose.ui.text.AnnotatedString(value))

    private fun show(name: String, onOpenAnniversary: () -> Unit = {}): PartyViewModel {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent {
            val state by viewModel.dynamicState.collectAsState()
            Column(Modifier.verticalScroll(rememberScrollState())) { LeaderFollowerSection(name, state, viewModel, onOpenAnniversary) }
        }
        eventually { viewModel.stateLoaded.value }
        compose.waitForIdle()
        compose.onNode(hasText("Events (", substring = true)).performClick()
        compose.waitForIdle()
        return viewModel
    }

    @Test
    fun arrowsSendTheFullPermutationAndTheSavedOrderRenumbersTheList() {
        show("Leada")
        compose.onNodeWithText("Higher numbers attend first. Use the arrows to reorder.").assertExists()
        priority("Anniversary").assertTextEquals("10")
        priority("Goobrawl").assertTextEquals("8")
        priority("Mr. Pumpkin").assertTextEquals("1")
        button("Move Anniversary up").assertIsNotEnabled()
        button("Move Mr. Pumpkin down").performScrollTo().assertIsNotEnabled()

        button("Move Goobrawl up").performScrollTo().performClick()
        eventually { posts("formation").isNotEmpty() }
        posts("formation")[0].let {
            assertEquals("Leada", (it["character"] as JsonPrimitive).content)
            assertEquals(listOf("anniversary", "goobrawl", "abtesting", "crabxx", "franky", "icegolem", "snowman", "slenderman", "mrgreen", "mrpumpkin"), it.list("eventPriorities"))
        }
        compose.waitUntil(5_000) { runCatching { priority("Goobrawl").assertTextEquals("9") }.isSuccess }
        priority("A/B Testing").assertTextEquals("8")

        button("Move Anniversary down").performScrollTo().performClick()
        eventually { posts("formation").size == 2 }
        assertEquals(listOf("goobrawl", "anniversary"), posts("formation")[1].list("eventPriorities").take(2))
    }

    @Test
    fun aRefusedMoveShowsTheErrorAndFollowersUseTheLeadersOrderReadOnly() {
        console.override("config", mapOf("eventPrioritiesByCharacter" to Json.parseToJsonElement("""{"Leada":["mrpumpkin"]}""")))
        val viewModel = PartyViewModel(console.settings)
        compose.setContent {
            val state by viewModel.dynamicState.collectAsState()
            Column(Modifier.verticalScroll(rememberScrollState())) {
                LeaderFollowerSection("Leada", state, viewModel)
                LeaderFollowerSection("Folla", state, viewModel)
            }
        }
        eventually { viewModel.stateLoaded.value }
        compose.waitForIdle()
        compose.onAllNodes(hasText("Events (1) ▾"))[0].performClick()
        // An older saved order keeps the 1.4 events, appended after it.
        compose.onAllNodesWithContentDescription("Mr. Pumpkin priority")[0].assertTextEquals("10")
        compose.onAllNodesWithContentDescription("Anniversary priority")[0].assertTextEquals("9")
        console.failOnce["formation"] = 409 to """{"error":"using leader events"}"""
        compose.onAllNodes(hasContentDescription("Move Anniversary up") and SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))[0].performScrollTo().performClick()
        eventually { posts("formation").isNotEmpty() }
        compose.onNodeWithText("using leader events").assertExists()
        compose.onAllNodes(hasText("Events (1) ▾"))[0].performClick()

        compose.onAllNodes(hasText("Events (1) ▾"))[1].performClick()
        compose.onNodeWithText("Using Leada’s events").assertExists()
        priority("Mr. Pumpkin").assertTextEquals("10")
        button("Move Anniversary up").assertIsNotEnabled()
        button("Move Anniversary down").assertIsNotEnabled()
    }

    @Test
    fun aToggleKeepsOtherSelectionsInPriorityOrderAndLegacyFlagsSkipTheNewEvents() {
        console.override("config", mapOf(
            "eventSchedules" to Json.parseToJsonElement("""[{"id":"goobrawl","name":"Goo Brawl","live":true},{"id":"crabxx","name":"Giant Crab","stale":true},{"id":"mrpumpkin","name":"Mr. Pumpkin"},{"id":"mystery","name":"Mystery"}]"""),
            "eventSelectionsByCharacter" to Json.parseToJsonElement("""{"Leada":["anniversary","mrpumpkin"]}"""),
            "eventPrioritiesByCharacter" to Json.parseToJsonElement("""{"Leada":["mrpumpkin","anniversary"]}"""),
            "eventsByCharacter" to Json.parseToJsonElement("""{"Rangy":true}"""),
        ))
        val viewModel = PartyViewModel(console.settings)
        compose.setContent {
            val state by viewModel.dynamicState.collectAsState()
            Column(Modifier.verticalScroll(rememberScrollState())) {
                LeaderFollowerSection("Leada", state, viewModel)
                LeaderFollowerSection("Rangy", state, viewModel)
            }
        }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.eventSchedules.isNotEmpty() }
        compose.waitForIdle()
        // The legacy flag covers the seven events it was saved with.
        compose.onNodeWithText("Events (7) ▾").assertExists()
        compose.onNodeWithText("Events (2) ▾").performClick()
        // Display names win over the schedule feed's names.
        compose.onNodeWithText("Goobrawl — LIVE").assertExists()
        compose.onNodeWithText("Crabxx — Time not announced · timing stale").assertExists()
        compose.onNodeWithText("Mystery — Unsupported").performScrollTo().assertExists()
        compose.onNodeWithContentDescription("Mystery").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Goobrawl").performScrollTo().performClick()
        eventually { posts("formation").isNotEmpty() }
        assertEquals(listOf("mrpumpkin", "anniversary", "goobrawl"), posts("formation")[0].list("eventSelections"))
    }

    @Test
    fun limitsSaveBlanksAsNullValidateAndKeepThePanelOpenOnAnError() {
        val viewModel = show("Leada")
        button("Crabxx settings").performScrollTo().performClick()
        val deaths = compose.onNode(hasContentDescription("Death limit") and inGroup("Crabxx settings"))
        val minutes = compose.onNode(hasContentDescription("Time limit (mins)") and inGroup("Crabxx settings"))
        val save = compose.onNode(hasText("Save event settings"))
        compose.onNodeWithText("Blank means unlimited.", substring = true).assertExists()
        deaths.performScrollTo().performTextReplacement("-1")
        save.performScrollTo().assertIsNotEnabled()
        deaths.performTextReplacement("1.5")
        save.assertIsNotEnabled()
        deaths.performTextReplacement("2")
        minutes.performTextReplacement("0")
        save.assertIsNotEnabled()
        minutes.performTextReplacement("")
        save.assertIsEnabled().performClick()
        eventually { posts("formation").isNotEmpty() }
        val limits = (posts("formation")[0]["eventLimits"] as JsonObject)
        assertEquals("crabxx", (limits["event"] as JsonPrimitive).content)
        assertEquals(JsonObject(mapOf("deathLimit" to JsonPrimitive(2), "timeLimitMinutes" to JsonNull)), limits["limits"])
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Save event settings")).fetchSemanticsNodes().isEmpty() }

        // The saved limits come back into the reopened panel.
        eventually { console.sections["config"]?.get("eventLimitsByCharacter") != null }
        compose.waitUntil(5_000) {
            button("Crabxx settings").performScrollTo().performClick()
            val shown = compose.onAllNodes(hasContentDescription("Death limit") and hasValue("2")).fetchSemanticsNodes().isNotEmpty()
            if (!shown) button("Crabxx settings").performClick()
            shown
        }
        minutes.performTextReplacement("1.5")
        console.failOnce["formation"] = 400 to """{"error":"invalid event limits"}"""
        save.performScrollTo().performClick()
        eventually { posts("formation").size == 2 }
        compose.onNodeWithText("invalid event limits").assertExists()
        save.assertExists().performClick()
        eventually { posts("formation").size == 3 }
        assertEquals(JsonPrimitive(1.5), ((posts("formation")[2]["eventLimits"] as JsonObject)["limits"] as JsonObject)["timeLimitMinutes"])
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Save event settings")).fetchSemanticsNodes().isEmpty() }

        button("Crabxx settings").performScrollTo().performClick()
        button("Close event settings").performScrollTo().performClick()
        compose.onNode(hasText("Save event settings")).assertDoesNotExist()
        assertEquals(3, posts("formation").size)
    }

    @Test
    fun aFollowerSeesTheLeadersLimitsReadOnlyAndAnniversaryLinksToItsVisitSettings() {
        console.override("config", mapOf("eventLimitsByCharacter" to Json.parseToJsonElement("""{"Leada":{"franky":{"deathLimit":0,"timeLimitMinutes":30}}}""")))
        var opened = false
        show("Folla") { opened = true }
        button("Franky settings").performScrollTo().performClick()
        compose.onNode(hasContentDescription("Death limit") and inGroup("Franky settings") and hasValue("0")).assertIsNotEnabled()
        compose.onNode(hasContentDescription("Time limit (mins)") and inGroup("Franky settings") and hasValue("30")).assertExists()
        compose.onNodeWithText("Using the leader’s event settings.").assertExists()
        compose.onNode(hasText("Save event settings")).assertDoesNotExist()

        button("Anniversary settings").performScrollTo().performClick()
        compose.onNodeWithText("Anniversary visit settings").performScrollTo().performClick()
        assertTrue(opened)
    }

    @Test
    fun aSkippedUnfinishedInstanceShowsItsReasonAndALeadersManualTravelSkipStaysOnTheLeader() {
        console.override("config", mapOf("eventAttendance" to Json.parseToJsonElement(
            """{"Leada":{"crabxx":{"ended":false,"ignored":"manual travel"},"goobrawl":{"ended":false,"ignored":"death limit"},"franky":{"ended":true,"ignored":"time limit"}},"Folla":{"snowman":{"ended":false,"ignored":"manual travel"}}}""",
        )))
        val viewModel = PartyViewModel(console.settings)
        compose.setContent {
            val state by viewModel.dynamicState.collectAsState()
            Column(Modifier.verticalScroll(rememberScrollState())) {
                LeaderFollowerSection("Leada", state, viewModel)
                LeaderFollowerSection("Folla", state, viewModel)
            }
        }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.leader != null }
        compose.waitForIdle()
        compose.onAllNodes(hasText("Events (1) ▾"))[0].performClick()
        compose.onNodeWithText("Skipped this instance: manual travel", substring = true).assertExists()
        compose.onNodeWithText("Skipped this instance: death limit", substring = true).assertExists()
        // An ended instance no longer counts as skipped.
        compose.onNodeWithText("Skipped this instance: time limit", substring = true).assertDoesNotExist()
        compose.onAllNodes(hasText("Events (1) ▾"))[0].performClick()

        compose.onAllNodes(hasText("Events (1) ▾"))[1].performClick()
        compose.onNodeWithText("Skipped this instance: death limit", substring = true).assertExists()
        // Folla's own manual travel skip shows; the leader's on Crabxx does not.
        assertEquals(1, compose.onAllNodes(hasText("Skipped this instance: manual travel", substring = true)).fetchSemanticsNodes().size)
    }
}
