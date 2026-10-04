package com.partyconsole.companion.ui

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.characterlist.CharacterListScreen
import com.partyconsole.companion.ui.components.SessionControls
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** roster.spec.ts / party-parity.spec.ts on the native home screen. */
@RunWith(RobolectricTestRunner::class)
class HomeScreenTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun slot(index: Int, character: String?, state: String) = JsonObject(
        mapOf("index" to JsonPrimitive(index), "kind" to JsonPrimitive("headless"), "character" to (character?.let { JsonPrimitive(it) } ?: kotlinx.serialization.json.JsonNull), "state" to JsonPrimitive(state)),
    )

    private fun posts(path: String) = console.requests.filter { it.method == "POST" && it.path == "/party-api/$path" }.map { Json.parseToJsonElement(it.body).jsonObject }

    @Test
    fun emptySlotLoadsAnOfflineRosterMember() {
        // Slot 4 is empty; Offliner is in the roster but not online.
        val slots = console.sections.getValue("core")["activeSlots"]!!.jsonArray
        console.override("core", mapOf("activeSlots" to JsonArray(slots + slot(4, null, "empty"))))
        val roster = console.sections.getValue("config")["roster"]!!.jsonArray
        console.override("config", mapOf("roster" to JsonArray(roster + JsonObject(mapOf("name" to JsonPrimitive("Offliner"), "ctype" to JsonPrimitive("mage"), "level" to JsonPrimitive(40), "online" to JsonPrimitive(false))))))

        val viewModel = PartyViewModel(console.settings)
        compose.setContent { CharacterListScreen(viewModel, onSelectCharacter = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.activeSlots.size == 5 && viewModel.characters.value.size == 4 }
        compose.waitForIdle()

        compose.onNodeWithText("Leada").assertExists()
        compose.onNodeWithText("Load character slot 5").performScrollTo().performClick()
        compose.mainClock.advanceTimeBy(2_000)
        compose.waitForIdle()
        compose.onNodeWithText("Choose a roster member").assertExists()
        compose.onNodeWithText("Offliner").performClick()
        eventually { posts("slots/4/spawn").size == 1 }
        assertEquals("Offliner", (posts("slots/4/spawn")[0]["character"] as JsonPrimitive).content)
    }

    @Test
    fun logOutIsConfirmedFirst() {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { SessionControls(viewModel, "Rangy") }
        eventually { viewModel.dynamicState.value.activeSlots.isNotEmpty() }
        compose.waitForIdle()

        compose.onNodeWithContentDescription("Log out Rangy").performClick()
        compose.onNodeWithText("Log out Rangy?").assertExists()
        assertEquals(0, posts("slots/2/logout").size)
        compose.onNodeWithText("Log out").performClick()
        eventually { posts("slots/2/logout").size == 1 }
    }
}
