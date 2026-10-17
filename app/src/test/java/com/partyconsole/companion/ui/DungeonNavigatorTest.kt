package com.partyconsole.companion.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.dungeon.DungeonNavigator
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Console 1.4 "Open the dungeon controls when a dungeon starts"
 *  (web/src/components/DungeonNavigator.tsx, daily-dungeons.spec.ts).
 *
 *  Failure modes:
 *  - Opening the app while a run is already going jumps away from the
 *    current screen; only a run that starts while the app watches may jump.
 *  - A run that starts while another screen is open never brings the user
 *    to the dungeon controls.
 *  - The jump repeats on every poll while the run continues.
 *  - The bar shows on the party screen itself, or while the dungeon is
 *    idle or held.
 *  - The bar's button doesn't lead to the party screen.
 */
@RunWith(RobolectricTestRunner::class)
class DungeonNavigatorTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    // The dungeon poll waits a second of main-looper time between requests.
    private fun nextPoll() = org.robolectric.shadows.ShadowLooper.idleMainLooper(1_100, java.util.concurrent.TimeUnit.MILLISECONDS)

    private fun view(phase: String) = """{"state":{"phase":"$phase","participants":["Leada"],"protectFromEvents":true,"commands":{}},"members":[]}"""

    @Test
    fun aRunThatStartsWhileWatchingJumpsOnceAndOtherScreensShowTheBar() {
        console.dailyDungeon = view("idle")
        val viewModel = PartyViewModel(console.settings)
        var jumps = 0
        var onPartyScreen by mutableStateOf(false)
        compose.setContent { DungeonNavigator(viewModel, onPartyScreen = onPartyScreen, onOpenParty = { jumps++ }) }
        eventually { viewModel.dungeons.view.value?.state?.phase == "idle" }
        compose.waitForIdle()
        compose.onNodeWithText("Cave of Many Dreams is running.").assertDoesNotExist()

        console.dailyDungeon = view("active")
        eventually { nextPoll(); viewModel.dungeons.view.value?.state?.phase == "active" }
        compose.waitForIdle()
        assertEquals(1, jumps)
        compose.onNodeWithText("Cave of Many Dreams is running.").assertExists()
        // Later polls of the same run don't jump again.
        repeat(3) { nextPoll(); Thread.sleep(100) }
        compose.waitForIdle()
        assertEquals(1, jumps)
        compose.onNodeWithText("Dungeon controls").performClick()
        assertEquals(2, jumps)

        onPartyScreen = true
        compose.waitForIdle()
        compose.onNodeWithText("Cave of Many Dreams is running.").assertDoesNotExist()
    }

    @Test
    fun openingTheAppMidRunNeverJumpsAndHeldDungeonsShowNoBar() {
        console.dailyDungeon = view("active")
        val viewModel = PartyViewModel(console.settings)
        var jumps = 0
        compose.setContent { DungeonNavigator(viewModel, onPartyScreen = false, onOpenParty = { jumps++ }) }
        eventually { viewModel.dungeons.view.value?.state?.phase == "active" }
        compose.waitForIdle()
        assertEquals(0, jumps)
        compose.onNodeWithText("Cave of Many Dreams is running.").assertExists()

        console.dailyDungeon = view("held")
        eventually { nextPoll(); viewModel.dungeons.view.value?.state?.phase == "held" }
        compose.waitForIdle()
        compose.onNodeWithText("Cave of Many Dreams is running.").assertDoesNotExist()
        assertEquals(0, jumps)
    }
}
