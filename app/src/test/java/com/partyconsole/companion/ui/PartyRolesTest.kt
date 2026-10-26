package com.partyconsole.companion.ui

import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.testing.field
import com.partyconsole.companion.testing.put
import com.partyconsole.companion.testing.ryanV140
import com.partyconsole.companion.ui.account.HuntSettingsScreen
import com.partyconsole.companion.ui.characterlist.CharacterListScreen
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** The party roles in Farming settings (web/e2e/combat-party.spec.ts and
 *  console-v140-gates.spec.ts). Only the stable console fork has them.
 *
 *  Failure modes:
 *  - Picking a role posts more than its own field, or None posts anything but null.
 *  - Choosing the current tank posts again (the console's select fires only
 *    on a change).
 *  - A refusal ("unknown tank") hides the server's message.
 *  - The party list still shows the Tank chip.
 *  - A follower's Farming settings locks the party-wide roles.
 *  - Off tank and Pull show on a console without config's pullMode.
 *  - The roles show on Ryan's v1.4.0, which has no `designatedTank`.
 */
@RunWith(RobolectricTestRunner::class)
class PartyRolesTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun posts() = console.requests.filter { it.method == "POST" && it.path == "/party-api/formation" }.map { Json.parseToJsonElement(it.body).jsonObject }
    private fun inRoles() = hasAnyAncestor(hasContentDescription("Party roles"))
    private fun inChoices(role: String) = hasAnyAncestor(hasContentDescription(role))
    private fun waitFor(text: String, role: String? = null) =
        compose.waitUntil(5_000) { compose.onAllNodes(if (role != null) hasText(text) and inChoices(role) else hasText(text, substring = true)).fetchSemanticsNodes().isNotEmpty() }
    private fun chip(text: String) = compose.onNode(hasText(text) and inRoles())
    private fun pull() = compose.onNode(hasContentDescription("Pull") and inRoles())

    private fun settings(name: String = "Leada"): PartyViewModel {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { HuntSettingsScreen(viewModel, name, onBack = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.characters.value.keys.containsAll(listOf("Leada", "Folla", "Merchy")) }
        compose.waitForIdle()
        return viewModel
    }

    @Test
    fun theTankPickerPostsTheTankNoneClearsItAndARefusalShowsTheReason() {
        settings()
        waitFor("The tank holds its target at its own range and owns taunt and absorb.")
        waitFor("Tank: None ▾")
        chip("Tank: None ▾").performScrollTo().assertIsEnabled().performClick()
        waitFor("Folla", role = "Tank")
        // Every connected character is a choice, the merchant included.
        for (name in listOf("None", "Leada", "Folla", "Merchy")) compose.onNode(hasText(name) and inChoices("Tank")).assertExists()
        compose.onNode(hasText("Folla") and inChoices("Tank")).performClick()
        eventually { posts().size == 1 }
        assertEquals(Json.parseToJsonElement("""{"tank":"Folla"}"""), posts()[0])
        assertEquals(JsonPrimitive("Folla"), console.field("designatedTank"))
        waitFor("Tank: Folla ▾")

        // Choosing the current tank sends nothing.
        chip("Tank: Folla ▾").performClick()
        waitFor("Folla", role = "Tank")
        compose.onNode(hasText("Folla") and inChoices("Tank")).performClick()
        chip("Tank: Folla ▾").performClick()
        waitFor("None", role = "Tank")
        compose.onNode(hasText("None") and inChoices("Tank")).performClick()
        eventually { posts().size == 2 }
        assertEquals(Json.parseToJsonElement("""{"tank":null}"""), posts()[1])
        assertEquals(JsonNull, console.field("designatedTank"))
        waitFor("Tank: None ▾")

        console.failOnce["formation"] = 400 to """{"error":"unknown tank"}"""
        chip("Tank: None ▾").performClick()
        waitFor("Leada", role = "Tank")
        compose.onNode(hasText("Leada") and inChoices("Tank")).performClick()
        waitFor("unknown tank")
    }

    @Test
    fun offTankAndPullPostTheirOwnFieldAndAFollowerEditsTheSameRoles() {
        console.put("followers", JsonObject(mapOf("Folla" to JsonPrimitive(true))), "config")
        settings("Folla")
        waitFor("The off tank takes the tank's attackers while the tank is in danger")
        waitFor("Off tank: None ▾")
        chip("Off tank: None ▾").performScrollTo().assertIsEnabled().performClick()
        waitFor("Leada", role = "Off tank")
        compose.onNode(hasText("Leada") and inChoices("Off tank")).performClick()
        eventually { posts().size == 1 }
        assertEquals(Json.parseToJsonElement("""{"offTank":"Leada"}"""), posts()[0])
        assertEquals(JsonPrimitive("Leada"), console.field("offTank"))
        waitFor("Off tank: Leada ▾")

        pull().performScrollTo().assertIsOff().assertIsEnabled().performClick()
        eventually { posts().size == 2 }
        assertEquals(Json.parseToJsonElement("""{"pullMode":true}"""), posts()[1])
        assertEquals(JsonPrimitive(true), console.field("pullMode"))
        compose.waitUntil(5_000) { runCatching { pull().assertIsOn() }.isSuccess }
        pull().performClick()
        eventually { posts().size == 3 }
        assertEquals(Json.parseToJsonElement("""{"pullMode":false}"""), posts()[2])
    }

    @Test
    fun aConsoleWithoutPullModeShowsOnlyTheTank() {
        console.sections.replaceAll { _, section -> JsonObject(section - setOf("offTank", "pullMode")) }
        val viewModel = settings()
        eventually { "designatedTank" in viewModel.dynamicState.value.stateKeys }
        waitFor("Tank: None ▾")
        compose.onNode(hasText("Off tank", substring = true)).assertDoesNotExist()
        pull().assertDoesNotExist()
    }

    @Test
    fun thePartyListHasNoTankChip() {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { CharacterListScreen(viewModel, onSelectCharacter = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.characters.value.isNotEmpty() }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Send party to town")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNode(hasText("Tank:", substring = true)).assertDoesNotExist()
    }

    @Test
    fun ryanV140HasNoPartyRoles() {
        console.ryanV140()
        val viewModel = settings()
        eventually { viewModel.dynamicState.value.stateKeys.contains("leader") }
        waitFor("Configure Hunt relocation")
        compose.onNode(hasText("Tank:", substring = true)).assertDoesNotExist()
        compose.onNode(hasContentDescription("Party roles")).assertDoesNotExist()
    }
}
