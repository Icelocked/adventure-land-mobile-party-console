package com.partyconsole.companion.ui

import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.characterdetail.sections.LeaderFollowerSection
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** formation.spec.ts on the native screen: Follow sends only
 *  {character, follow}, Leader only {leader}. */
@RunWith(RobolectricTestRunner::class)
class FormationScreenTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun formationBodies() = console.requests.filter { it.method == "POST" && it.path == "/party-api/formation" }
        .map { Json.parseToJsonElement(it.body).jsonObject }

    @Test
    fun followAndLeaderSendOnlyTheirOwnKeys() {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent {
            val state by viewModel.dynamicState.collectAsState()
            LeaderFollowerSection("Rangy", state, viewModel)
        }
        eventually { viewModel.stateLoaded.value }
        compose.waitForIdle()

        compose.onNodeWithText("Follow").assertIsEnabled().performClick()
        eventually { formationBodies().size == 1 }
        assertEquals(setOf("character", "follow"), formationBodies()[0].keys)
        assertEquals("Rangy", formationBodies()[0]["character"].toString().trim('"'))

        compose.onNodeWithText("Leader").performClick()
        eventually { formationBodies().size == 2 }
        assertEquals(setOf("leader"), formationBodies()[1].keys)
    }
}
