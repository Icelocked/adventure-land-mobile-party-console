package com.partyconsole.companion.ui

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.characterdetail.CharacterDetailScreen
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Console 1.4 cosmetics panel (web/e2e/cosmetics.spec.ts, cosmetics-panel.tsx)
 *  on the native character screen.
 *
 *  Failure modes:
 *  - The panel shows for a character that sent no cosmetics report, or
 *    starts expanded.
 *  - A jar, emote, wear or remove posts the wrong command type or leaves
 *    out the slot, name or target the server checks against the report.
 *  - A ranged emote offers its own user when the emote forbids it, or
 *    players out of range; an unranged emote asks for a target.
 *  - A cooling emote can still be used, or hides its remaining time.
 *  - The skin offers Remove, or a worn cosmetic offers Wear again.
 *  - The last emote's outcome or a refused command's server message is hidden.
 */
@RunWith(RobolectricTestRunner::class)
class CosmeticsTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun posts(path: String) = console.requests.filter { it.method == "POST" && it.path == "/party-api/$path" }.map { Json.parseToJsonElement(it.body).jsonObject }
    private fun json(text: String): JsonElement = Json.parseToJsonElement(text)
    private val scroller = SemanticsMatcher.keyIsDefined(SemanticsProperties.VerticalScrollAxisRange)
    private val sprite = """{"url":"/e2e-sprite.png","tileSize":8,"columns":1,"rows":1,"x":0,"y":0}"""

    // characters/shared.js cosmeticsSnapshot(), as served in core characterDetails.
    private val cosmetics = """{
        "jars":[{"inventorySlot":4,"data":"hat221","kind":"appearance","type":"hat","slot":"hat","label":"hat221","sprite":$sprite,"locked":false,"usable":true},
                {"inventorySlot":9,"data":null,"kind":"empty","type":null,"slot":null,"locked":false,"usable":false}],
        "owned":[{"name":"hat221","kind":"appearance","type":"hat","slot":"hat","label":"hat221","sprite":$sprite,"count":1},
                 {"name":"makeup117","kind":"appearance","type":"face","slot":"face","label":"makeup117","count":2},
                 {"name":"emotion_wink","kind":"emote","type":"emote","slot":null,"label":"Wink","explanation":"A cheeky wink","mp":10,"cooldownMs":3000,"range":120,"noSelf":true,"cooldownLeftMs":0,"count":1},
                 {"name":"emotion_wave","kind":"emote","type":"emote","slot":null,"label":"Wave","cooldownMs":120000,"range":null,"cooldownLeftMs":45000,"count":1}],
        "worn":{"skin":"mranger","hat":"hat221"},
        "nearbyPlayers":[{"name":"Friend","distance":40},{"name":"Faraway","distance":400}],
        "lastEmote":{"name":"emotion_wink","target":"Friend","at":1,"ok":false,"reason":"cooldown"}}"""

    private fun show(name: String) {
        val core = console.sections.getValue("core")
        val details = core["characterDetails"]!!.jsonObject
        console.override("core", mapOf("characterDetails" to JsonObject(details + ("Folla" to JsonObject(details.getValue("Folla").jsonObject + ("cosmetics" to json(cosmetics)))))))
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { CharacterDetailScreen(viewModel, name, onBack = {}, onSwitchCharacter = {}, onNavigate = {}, onOpenMerchantCommerce = {}, onOpenRoutines = {}, onOpenHuntSettings = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.characters.value[name]?.vitals != null && viewModel.characterDetails.value.isNotEmpty() }
        compose.waitForIdle()
    }

    private fun scrollTo(text: String) = compose.onAllNodes(scroller)[0].performScrollToNode(hasText(text, substring = true))

    @Test
    fun theCollapsedSummaryThenJarsEmotesWornAndOwnedPostTheDashboardCommands() {
        show("Folla")
        scrollTo("Cosmetics · 2 CX jars (1 usable) · 2 emotes")
        compose.onNodeWithText("Slot 4 · hat221 · hat").assertDoesNotExist()
        compose.onNodeWithText("Cosmetics · 2 CX jars (1 usable) · 2 emotes", substring = true).performClick()

        compose.onNodeWithText("Slot 4 · hat221 · hat").performScrollTo().assertExists()
        compose.onNodeWithText("Slot 9 · empty").assertExists()
        compose.onNode(hasText("Empty") and SemanticsMatcher.keyNotDefined(SemanticsProperties.ContentDescription)).assertExists()
        compose.onNodeWithContentDescription("Open CX jar in slot 4").performScrollTo().performClick()
        eventually { posts("command").isNotEmpty() }
        assertEquals(json("""{"character":"Folla","type":"cx-open-jar","inventorySlot":4}"""), posts("command").last())

        // Wink is ranged and can't target its user, so only Friend (40) is in range.
        val target = compose.onNodeWithContentDescription("Target for Wink")
        target.performScrollTo().assertTextContains("Friend · 40")
        target.performClick()
        compose.onNode(hasText("Faraway", substring = true)).assertDoesNotExist()
        compose.onNode(hasText("Folla (self)")).assertDoesNotExist()
        compose.onAllNodes(hasText("Friend · 40"))[1].performClick()
        compose.onNodeWithText("A cheeky wink · 10 MP · 3s cooldown · range 120").assertExists()
        compose.onNodeWithContentDescription("Use Wink").performScrollTo().performClick()
        eventually { posts("command").size == 2 }
        assertEquals(json("""{"character":"Folla","type":"cx-emote","name":"emotion_wink","target":"Friend"}"""), posts("command").last())
        // Wave has no range, so it takes no target, and it is cooling down.
        compose.onNodeWithContentDescription("Target for Wave").assertDoesNotExist()
        compose.onNodeWithContentDescription("Use Wave").assertTextContains("Ready in 45s").assertIsNotEnabled()
        compose.onNodeWithText("Last emote: Wink → Friend · refused: cooldown").assertExists()

        // Skin can't be removed; the hat can.
        compose.onNodeWithText("skin · mranger").performScrollTo().assertExists()
        compose.onNodeWithContentDescription("Remove mranger from skin").assertDoesNotExist()
        compose.onNodeWithContentDescription("Remove hat221 from hat").performScrollTo().performClick()
        eventually { posts("command").size == 3 }
        assertEquals(json("""{"character":"Folla","type":"cx-remove","slot":"hat"}"""), posts("command").last())

        compose.onNodeWithContentDescription("Wear hat221").performScrollTo().assertTextContains("Worn").assertIsNotEnabled()
        compose.onNodeWithText("makeup117 ×2 · face").assertExists()
        compose.onNodeWithContentDescription("makeup117 has no preview").assertExists()
        compose.onNodeWithContentDescription("Wear makeup117").performScrollTo().performClick()
        eventually { posts("command").size == 4 }
        assertEquals(json("""{"character":"Folla","type":"cx-wear","name":"makeup117","slot":"face"}"""), posts("command").last())
    }

    @Test
    fun aRefusedCommandShowsTheServerError() {
        show("Folla")
        scrollTo("Cosmetics ·")
        compose.onNodeWithText("Cosmetics ·", substring = true).performClick()
        console.failOnce["command"] = 409 to """{"error":"This character is busy with another command; try again shortly"}"""
        compose.onNodeWithContentDescription("Open CX jar in slot 4").performScrollTo().performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("This character is busy with another command; try again shortly")).fetchSemanticsNodes().isNotEmpty() }
    }

    @Test
    fun aCharacterWithoutAReportShowsNoPanel() {
        show("Rangy")
        scrollTo("Restock")
        compose.onNode(hasText("Cosmetics", substring = true)).assertDoesNotExist()
    }
}
