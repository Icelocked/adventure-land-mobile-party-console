package com.partyconsole.companion.ui

import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.performClick
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.testing.field
import com.partyconsole.companion.testing.put
import com.partyconsole.companion.testing.ryanV140
import com.partyconsole.companion.ui.characterlist.CharacterListScreen
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** The party header's Pause, Play and clean shutdown (web/e2e/console-controls.spec.ts).
 *
 *  Failure modes:
 *  - A button posts the wrong action, or shutdown sends {force: true} without the confirm.
 *  - The indicator ignores core's consoleControl after a reload, or keeps a stale reply.
 *  - The shutdown sheet closes before the console reports safe, or hides the stop command.
 *  - The resume banner hides whom it waits for, or Cancel unpauses the console.
 *  - Ryan's v1.4.0, which has no console control, shows the buttons.
 */
@RunWith(RobolectricTestRunner::class)
class ConsoleControlsTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun actions() = console.requests.filter { it.method == "POST" && it.path.startsWith("/party-api/console-control/") }
        .map { it.path.removePrefix("/party-api/console-control/") to Json.parseToJsonElement(it.body).jsonObject }
    private fun waitForText(text: String) = compose.waitUntil(5_000) { compose.onAllNodes(hasText(text, substring = true)).fetchSemanticsNodes().isNotEmpty() }
    private fun waitForLabel(label: String) = compose.waitUntil(5_000) { compose.onAllNodes(hasContentDescription(label)).fetchSemanticsNodes().isNotEmpty() }
    private fun waitGone(label: String) = compose.waitUntil(5_000) { compose.onAllNodes(hasContentDescription(label)).fetchSemanticsNodes().isEmpty() }
    private val empty = JsonObject(emptyMap())

    private fun show(): PartyViewModel {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { CharacterListScreen(viewModel, onSelectCharacter = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.consoleControl != null }
        compose.waitForIdle()
        return viewModel
    }

    @Test
    fun pauseShowsThePausedIndicatorAndPlayRemovesIt() {
        show()
        waitForLabel("Pause all automated actions")
        compose.onNode(hasContentDescription("Pause all automated actions")).assertIsEnabled().performClick()
        waitForLabel("Paused")
        assertEquals(listOf("pause" to empty), actions())
        compose.onNode(hasContentDescription("Play: resume automated actions")).assertIsEnabled().performClick()
        waitGone("Paused")
        waitForLabel("Pause all automated actions")
        assertEquals(listOf("pause", "play"), actions().map { it.first })
    }

    @Test
    fun aFightDefersTheShutdownForceAsksToConfirmAndSafeToStopShowsTheStopCommand() {
        console.shutdownHold = "Cave run"
        val viewModel = show()
        waitForLabel("Clean shutdown")
        compose.onNode(hasContentDescription("Clean shutdown")).performClick()
        waitForText("The console resumes the same activity after its next start.")
        compose.onNode(hasText("Start clean shutdown")).assertIsEnabled().performClick()
        waitForText("Waiting for the fight to end: Cave run.")
        compose.onNode(hasText("Force shutdown")).performClick()
        waitForText("They only defend themselves until the console resumes.")
        compose.onNode(hasText("Confirm: stop now")).assertIsEnabled().performClick()
        waitForText("Pausing and saving the state.")
        waitForText("Waiting for: Leada, Folla")
        assertEquals(listOf("shutdown" to empty, "shutdown" to JsonObject(mapOf("force" to JsonPrimitive(true)))), actions())

        // The characters acknowledged: the next core poll reports safe.
        val control = console.field("consoleControl")!!.jsonObject
        val shutdown = control["shutdown"]!!.jsonObject
        console.put("consoleControl", JsonObject(control + ("shutdown" to JsonObject(shutdown + mapOf("phase" to JsonPrimitive("safe"), "waiting" to JsonArray(emptyList()))))))
        // The paused main looper holds the poll loop's delay until its clock moves on.
        eventually(10_000) {
            org.robolectric.shadows.ShadowLooper.idleMainLooper(500, java.util.concurrent.TimeUnit.MILLISECONDS)
            viewModel.dynamicState.value.consoleControl?.shutdown?.phase == "safe"
        }
        waitForText("docker compose stop party-console")
        waitForText("In /opt/party-console:")
        waitForLabel("Safe to stop")
        compose.onNode(hasText("Cancel shutdown")).assertIsEnabled().performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Cancel shutdown")).fetchSemanticsNodes().isEmpty() }
        assertEquals("cancel-shutdown" to empty, actions().last())
    }

    @Test
    fun theResumeBannerNamesWhoItWaitsForAndCancelKeepsTheConsolePaused() {
        val now = System.currentTimeMillis()
        console.put("consoleControl", Json.parseToJsonElement("""{"paused":true,"pausedAt":$now,"resume":{"since":$now,"waiting":["Folla"]},"shutdown":null,"log":[]}"""))
        show()
        waitForText("Resuming previous activity · waiting for Folla")
        waitForLabel("Resuming")
        compose.onNode(hasText("Cancel")).assertIsEnabled().performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Resuming previous activity", substring = true)).fetchSemanticsNodes().isEmpty() }
        waitForLabel("Paused")
        assertEquals(listOf("cancel-resume" to empty), actions())
    }

    @Test
    fun ryanV140HasNoConsoleControls() {
        console.ryanV140()
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { CharacterListScreen(viewModel, onSelectCharacter = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.characters.value.isNotEmpty() }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Send party to town")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNode(hasContentDescription("Pause all automated actions")).assertDoesNotExist()
        compose.onNode(hasContentDescription("Clean shutdown")).assertDoesNotExist()
    }
}
