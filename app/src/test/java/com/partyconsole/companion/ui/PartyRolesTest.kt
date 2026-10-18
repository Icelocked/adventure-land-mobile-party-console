package com.partyconsole.companion.ui

import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.performClick
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.testing.field
import com.partyconsole.companion.testing.ryanV140
import com.partyconsole.companion.ui.characterlist.CharacterListScreen
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** The designated tank on the party list (web/e2e/combat-party.spec.ts and
 *  console-v140-gates.spec.ts). Only the stable console fork has it.
 *
 *  Failure modes:
 *  - Picking a tank posts more than {tank}, or None posts anything but null.
 *  - Choosing the current tank posts again (the console's select fires only
 *    on a change).
 *  - A refusal ("unknown tank") hides the server's message.
 *  - The tank control shows on Ryan's v1.4.0, which has no `designatedTank`.
 */
@RunWith(RobolectricTestRunner::class)
class PartyRolesTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun posts() = console.requests.filter { it.method == "POST" && it.path == "/party-api/formation" }.map { Json.parseToJsonElement(it.body).jsonObject }
    private fun inChoices() = hasAnyAncestor(hasContentDescription("Tank"))
    private fun waitFor(text: String, choice: Boolean = false) =
        compose.waitUntil(5_000) { compose.onAllNodes(if (choice) hasText(text) and inChoices() else hasText(text, substring = true)).fetchSemanticsNodes().isNotEmpty() }

    private fun show(): PartyViewModel {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { CharacterListScreen(viewModel, onSelectCharacter = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.characters.value.isNotEmpty() }
        compose.waitForIdle()
        return viewModel
    }

    @Test
    fun theTankPickerPostsTheTankNoneClearsItAndARefusalShowsTheReason() {
        show()
        waitFor("Holds melee range for the party")
        waitFor("Tank: None ▾")
        compose.onNode(hasText("Tank: None ▾")).performClick()
        waitFor("Folla", choice = true)
        // Every connected character is a choice, the merchant included.
        for (name in listOf("None", "Leada", "Folla", "Merchy")) compose.onNode(hasText(name) and inChoices()).assertExists()
        compose.onNode(hasText("Folla") and inChoices()).performClick()
        eventually { posts().size == 1 }
        assertEquals(Json.parseToJsonElement("""{"tank":"Folla"}"""), posts()[0])
        assertEquals(JsonPrimitive("Folla"), console.field("designatedTank"))
        waitFor("Tank: Folla ▾")

        // Choosing the current tank sends nothing.
        compose.onNode(hasText("Tank: Folla ▾")).performClick()
        waitFor("Folla", choice = true)
        compose.onNode(hasText("Folla") and inChoices()).performClick()
        compose.onNode(hasText("Tank: Folla ▾")).performClick()
        waitFor("None", choice = true)
        compose.onNode(hasText("None") and inChoices()).performClick()
        eventually { posts().size == 2 }
        assertEquals(Json.parseToJsonElement("""{"tank":null}"""), posts()[1])
        assertEquals(JsonNull, console.field("designatedTank"))
        waitFor("Tank: None ▾")

        console.failOnce["formation"] = 400 to """{"error":"unknown tank"}"""
        compose.onNode(hasText("Tank: None ▾")).performClick()
        waitFor("Leada", choice = true)
        compose.onNode(hasText("Leada") and inChoices()).performClick()
        waitFor("unknown tank")
    }

    @Test
    fun ryanV140HasNoTankControl() {
        console.ryanV140()
        val viewModel = show()
        eventually { viewModel.dynamicState.value.stateKeys.contains("leader") }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Send party to town")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNode(hasText("Tank:", substring = true)).assertDoesNotExist()
        compose.onNode(hasText("Holds melee range for the party", substring = true)).assertDoesNotExist()
    }
}
