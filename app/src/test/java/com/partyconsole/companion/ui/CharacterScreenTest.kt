package com.partyconsole.companion.ui

import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.onAllNodesWithText
import com.partyconsole.companion.domain.Area
import com.partyconsole.companion.domain.CatalogMonster
import com.partyconsole.companion.domain.canRouteToMonster
import com.partyconsole.companion.domain.farmingAreas
import com.partyconsole.companion.domain.observeStatus
import com.partyconsole.companion.domain.statusRemaining
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.characterdetail.CharacterDetailScreen
import com.partyconsole.companion.ui.characterdetail.damageMultiplier
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** character-header / combat-status / hunting / travel / combat-log specs on the native character screen. */
@RunWith(RobolectricTestRunner::class)
class CharacterScreenTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun posts(path: String) = console.requests.filter { it.method == "POST" && it.path == "/party-api/$path" }.map { Json.parseToJsonElement(it.body).jsonObject }
    private fun JsonObject.text(key: String) = (this[key] as? JsonPrimitive)?.content

    @Test
    fun farmingAreasStatsAndStatusHelpersMatchTheDashboard() {
        val a = CatalogMonster("a", listOf(Area(map = "main", x = 50.0, y = 50.0, boundary = listOf(0.0, 0.0, 100.0, 100.0))))
        val b = CatalogMonster("b", listOf(Area(map = "main", x = 100.0, y = 100.0, boundary = listOf(50.0, 50.0, 150.0, 150.0))))
        val areas = farmingAreas(listOf(a, b), listOf("a", "b"))
        assertEquals(listOf("a", "b"), areas[0].monsterIds)
        assertEquals(listOf(50.0, 50.0, 100.0, 100.0), areas[0].boundary)
        assertEquals(75.0, areas[0].x, 0.0)
        assertEquals(3, areas.size)

        assertEquals(1.0, damageMultiplier(0.0), 1e-9)
        assertEquals(0.9, damageMultiplier(100.0), 1e-9)
        assertEquals(0.05, damageMultiplier(100_000.0), 1e-9)

        val first = observeStatus(60_000, JsonPrimitive("x"), null, null, now = 1_000)!!
        assertEquals(40_000L, statusRemaining(first, 21_000))
        // The same telemetry again keeps its anchor; a shorter reading keeps the original total.
        assertTrue(observeStatus(60_000, JsonPrimitive("x"), null, first, 5_000) === first)
        assertEquals(60_000L, observeStatus(30_000, JsonPrimitive("x"), null, first, 31_000)!!.total)

        assertFalse(canRouteToMonster("Leada", mapOf("Folla" to true), "Folla"))
        assertTrue(canRouteToMonster("Leada", mapOf("Folla" to true), "Rangy"))
    }

    private fun show(name: String): PartyViewModel {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent {
            CharacterDetailScreen(viewModel, name, onBack = {}, onSwitchCharacter = {}, onNavigate = {}, onOpenMerchantCommerce = {}, onOpenRoutines = {}, onOpenHuntSettings = {})
        }
        eventually { viewModel.stateLoaded.value && viewModel.characters.value[name]?.vitals != null && viewModel.dynamicState.value.monsterChoices.isNotEmpty() }
        compose.waitForIdle()
        return viewModel
    }

    // The screen body is the outermost vertical scroller (lists inside it scroll too).
    private fun scrollTo(text: String) = compose.onAllNodes(hasScrollActionMatcher)[0].performScrollToNode(hasText(text))
    private val hasScrollActionMatcher = androidx.compose.ui.test.SemanticsMatcher.keyIsDefined(androidx.compose.ui.semantics.SemanticsProperties.VerticalScrollAxisRange)

    @Test
    @Config(qualifiers = "w844dp-h390dp")
    fun aTurnedPhoneShowsControlsLeftAndGearRight() {
        show("Leada")
        val formation = compose.onNodeWithText("Formation").fetchSemanticsNode().boundsInRoot
        val equipment = compose.onNodeWithText("Equipment").fetchSemanticsNode().boundsInRoot
        assertTrue("Equipment sits in the right column", equipment.left > formation.right)
        assertTrue("both columns start near the top", equipment.top < formation.top + 600)
    }

    @Test
    fun anUprightPhoneKeepsOneColumn() {
        show("Leada")
        val formation = compose.onNodeWithText("Formation").fetchSemanticsNode().boundsInRoot
        scrollTo("Equipment")
        val equipment = compose.onNodeWithText("Equipment").fetchSemanticsNode().boundsInRoot
        assertTrue("Equipment shares the column", kotlin.math.abs(equipment.left - formation.left) < 2f)
    }

    @Test
    fun statusesOpenWithTheirCountdownAndThePortraitOpensTheStats() {
        show("Leada")
        compose.onNode(hasText("Active status") and hasText("1")).assertExists()
        compose.onNodeWithText("Active status").performClick()
        compose.onNodeWithText("Merchant's Luck").assertExists()
        compose.onNodeWithContentDescription("View Leada stats").performClick()
        compose.waitForIdle()
        compose.onNodeWithContentDescription("Leada stats").assertExists()
        compose.onNodeWithText("ARMOR PIERCING").performScrollTo().assertExists()
    }

    @Test
    fun huntWithoutABackupOpensTheSetupAndSavesTheChosenArea() {
        show("Rangy")
        scrollTo("Hunt")
        compose.onNode(hasContentDescription("Hunt: One quest at a time: leader first, then the next member if its monster is blacklisted")).performClick()
        compose.waitForIdle()
        scrollTo("Getting ready to hunt")
        assertEquals(0, posts("farming-mode").size)
        compose.onNodeWithText("Save backup and start Hunt").performScrollTo().performClick()
        eventually { posts("farming-mode").isNotEmpty() }
        val body = posts("farming-mode")[0]
        assertEquals("hunt", body.text("mode"))
        assertEquals("Rangy", body.text("character"))
        val backup = body["backup"] as JsonObject
        assertEquals(listOf("bat"), (backup["monsterFocus"] as JsonArray).map { (it as JsonPrimitive).content })
        assertEquals("cave", (backup["location"] as JsonObject).text("map"))
    }

    @Test
    fun aFollowerCannotRouteAndTravelSendsTypedCoordinates() {
        show("Folla")
        scrollTo("Hunt settings...")
        compose.onNodeWithContentDescription("only leader can route to monster").performClick()
        compose.onAllNodesWithText("only leader can route to monster").fetchSemanticsNodes().let { assertTrue(it.isNotEmpty()) }

        scrollTo("Send to…")
        compose.onNodeWithText("Send to…").performClick()
        compose.onNodeWithText("X").performTextReplacement("abc")
        compose.onNodeWithText("Send character").performScrollTo().performClick()
        compose.onNodeWithText("Enter a map and finite coordinates").assertExists()
        compose.onNodeWithText("X").performTextReplacement("-174")
        compose.onNodeWithText("Send character").performScrollTo().performClick()
        eventually { posts("command").isNotEmpty() }
        posts("command")[0].let {
            assertEquals("character-travel", it.text("type"))
            assertEquals("main [-174, 121]", it.text("label"))
        }
    }

    @Test
    fun combatLogListsEventsAndClearsHistory() {
        console.override("logs", mapOf("combatLogs" to Json.parseToJsonElement("""{"Leada":[{"at":1,"message":"Killed a goo","type":"kill"}]}""")))
        val viewModel = show("Leada")
        scrollTo("Combat log")
        compose.onNodeWithText("Combat log").performClick()
        eventually(12_000) { viewModel.dynamicState.value.combatLogs["Leada"].orEmpty().isNotEmpty() }
        compose.waitForIdle()
        scrollTo("Killed a goo")
        compose.onNodeWithText("CLEAR HISTORY").performClick()
        eventually { posts("combat-log/Leada/clear").isNotEmpty() }
    }
}
