package com.partyconsole.companion.ui

import androidx.compose.ui.test.isEnabled
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.characterlist.CharacterListScreen
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Console 1.4 escape hold and Resume automation (web/e2e/combat-party.spec.ts,
 *  escape-control.tsx) on the native party screen.
 *
 *  Failure modes:
 *  - Resume isn't offered after a "complete" or "failed-hold" escape, or is
 *    offered while one runs or after it was released.
 *  - The hold's error is hidden, or still shows once the hold is released.
 *  - Resume posts to the wrong path or with a body; the console expects {}.
 *  - A refused resume hides the server's message.
 *  - The button keeps its held state after the release because the escape
 *    state isn't fetched again.
 */
@RunWith(RobolectricTestRunner::class)
class EscapeResumeTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun posts(path: String) = console.requests.filter { it.method == "POST" && it.path == "/party-api/$path" }

    private fun show(): PartyViewModel {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { CharacterListScreen(viewModel, onSelectCharacter = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.characters.value.isNotEmpty() && viewModel.escape.value != null }
        compose.waitForIdle()
        return viewModel
    }

    @Test
    fun aHeldEscapeShowsItsErrorAndResumeReleasesTheHold() {
        console.escape = """{"id":"escape-1","stage":"failed-hold","error":"Rendezvous timed out","progress":{}}"""
        show()
        compose.onNodeWithText("Escape - failed").assertExists()
        compose.onNodeWithText("Rendezvous timed out").assertExists()
        compose.onNodeWithText("Automation is held until you resume it.").assertExists()

        console.failOnce["escape/resume"] = 409 to """{"error":"Error: dungeon participants are still inside"}"""
        compose.onNodeWithText("Resume automation").performClick()
        eventually { posts("escape/resume").size == 1 }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("dungeon participants are still inside", substring = true)).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Automation is held until you resume it.").assertExists()

        // The button stays disabled until the refresh after the failed resume ends.
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Resume automation") and isEnabled()).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Resume automation").performClick()
        eventually { posts("escape/resume").size == 2 }
        assertEquals("{}", posts("escape/resume")[1].body)
        assertEquals(listOf("escape/resume", "escape/resume"), console.escapeActions.toList())
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Automation is held until you resume it.")).fetchSemanticsNodes().isEmpty() }
        compose.onNodeWithText("Escape").assertExists()
        compose.onNodeWithText("Rendezvous timed out").assertDoesNotExist()
    }

    @Test
    fun aCompletedEscapeOffersResumeUntilAnotherOneRuns() {
        console.escape = """{"id":"escape-2","stage":"complete","error":null,"progress":{}}"""
        show()
        compose.onNodeWithText("Escape - success").assertExists()
        compose.onNodeWithText("Resume automation").assertExists()
        console.escape = """{"id":"escape-2","stage":"recovering","error":null,"progress":{}}"""
        compose.onNodeWithContentDescription("Refresh").performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Resume automation")).fetchSemanticsNodes().isEmpty() }
    }
}
