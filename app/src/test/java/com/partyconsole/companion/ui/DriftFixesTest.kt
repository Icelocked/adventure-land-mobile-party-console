package com.partyconsole.companion.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTextReplacement
import com.partyconsole.companion.data.liveInventoryDisplaySize
import com.partyconsole.companion.domain.compactInventory
import com.partyconsole.companion.domain.huntBlacklistLabel
import com.partyconsole.companion.domain.huntSpawnKey
import com.partyconsole.companion.domain.migratePassiveSettings
import com.partyconsole.companion.model.HuntBlacklistEntry
import com.partyconsole.companion.model.InventoryEntry
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.account.HuntSettingsScreen
import com.partyconsole.companion.ui.characterdetail.sections.GoldTargetSection
import com.partyconsole.companion.ui.components.NpcSaleSheet
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Overflow inventory layout, Hunt settings, and the NPC sale and gold
 *  target wording. */
@RunWith(RobolectricTestRunner::class)
class DriftFixesTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun obj(text: String) = Json.parseToJsonElement(text).jsonObject
    private fun posts(path: String) = console.requests.filter { it.method == "POST" && it.path == "/party-api/$path" }.map { Json.parseToJsonElement(it.body).jsonObject }
    private fun entry(slot: Int, name: String) = InventoryEntry(slot, Item(name = name))

    @Test
    fun inventoryPinsTheTrackerAndKeepsOverflowLikeV130() {
        // A tracker in the last usable slot stays there.
        val items = listOf(entry(0, "hpot0"), null, entry(3, "tracker"), null)
        val grid = compactInventory(items, size = 4)
        assertEquals(listOf("hpot0", null, null, "tracker"), grid.map { it?.item?.name })
        // Overflow beyond the bag size follows the pinned tracker.
        val overflow = compactInventory(listOf(entry(0, "a"), entry(3, "supercomputer"), entry(5, "b")), size = 4)
        assertEquals(listOf("a", null, null, "supercomputer", "b"), overflow.map { it?.item?.name })
        // Without a pinned item: occupied first.
        assertEquals(listOf("a", "b", null), compactInventory(listOf(null, entry(1, "a"), entry(2, "b"))).map { it?.item?.name })
        // Occupied numeric keys past isize extend the grid.
        assertEquals(44, liveInventoryDisplaySize(obj("""{"0":{"name":"a"},"43":{"name":"b"},"50":null,"x":{"name":"c"}}"""), 42))
        assertEquals(42, liveInventoryDisplaySize(obj("""{"0":{"name":"a"}}"""), 42))
    }

    @Test
    fun huntingHelpersMatchThePwa() {
        assertEquals("""["main",0,700]""", huntSpawnKey("main", 0.0, 700.0))
        assertEquals("""["main",1.5,-2]""", huntSpawnKey("main", 1.5, -2.0))
        assertEquals("manually added", huntBlacklistLabel(HuntBlacklistEntry("x", 1, reason = "Manually blacklisted")))
        assertEquals("3 hunt deaths", huntBlacklistLabel(HuntBlacklistEntry("x", 1, deaths = 3, reason = "deaths")))
        assertEquals("1 hunt death · 1 hunt expired", huntBlacklistLabel(HuntBlacklistEntry("x", 1, deaths = 1, reason = "Hunt quest expired before completion")))
        val legacy = migratePassiveSettings(null, mapOf("tinyp" to true))
        assertTrue(legacy.useFieldGenerators)
        assertEquals(101, legacy.rules.getValue("tinyp").priority)
        val saved = migratePassiveSettings(obj("""{"version":1,"useFieldGenerators":false,"rules":{"goo":{"enabled":true,"keepMoving":true,"priority":7,"maxLevel":20}}}"""))
        assertFalse(saved.useFieldGenerators)
        assertEquals(20, saved.rules.getValue("goo").maxLevel)
        assertNull(migratePassiveSettings(obj("""{"version":1,"rules":{"goo":{"enabled":true,"priority":7}}}""")).rules.getValue("goo").maxLevel)
    }

    private val scrollable = SemanticsMatcher.keyIsDefined(androidx.compose.ui.semantics.SemanticsProperties.VerticalScrollAxisRange)
    private fun scrollTo(text: String) = compose.onAllNodes(scrollable)[0].performScrollToNode(hasText(text))

    @Test
    fun huntSettingsHavePreferredSpawnsPassiveHuntingAndTheBlacklistPicker() {
        console.override("catalog", mapOf("monsterChoices" to Json.parseToJsonElement(
            """[{"id":"goo","name":"Goo","locations":[{"map":"main","x":0,"y":700},{"map":"main","x":900,"y":-300}]},{"id":"bat","name":"Bat","locations":[{"map":"cave","x":300,"y":-1000}]}]""",
        )))
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { HuntSettingsScreen(viewModel, "Leada", onBack = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.monsterChoices.size == 2 }
        compose.waitForIdle()
        // The blacklist label for the fixture's crab entry.
        compose.onNode(hasText("3 hunt deaths", substring = true)).performScrollTo().assertExists()

        scrollTo("Set preferred hunt spawns")
        compose.onNodeWithText("Set preferred hunt spawns").performClick()
        scrollTo("Goo")
        compose.onNodeWithText("Goo").performClick()
        scrollTo("main")
        compose.onAllNodes(hasText("(900, -300)", substring = true))[0].performClick()
        eventually { posts("hunt-settings").isNotEmpty() }
        val spawn = posts("hunt-settings").last()
        assertEquals("Leada", (spawn["character"] as JsonPrimitive).content)
        assertEquals("""["main",900,-300]""", ((spawn["preferredSpawns"] as JsonObject)["goo"] as JsonPrimitive).content)

        scrollTo("Open passive hunting menu")
        compose.onNodeWithText("Open passive hunting menu").performClick()
        // Inside the table's own scroller: use the click action rather than a touch.
        compose.onNodeWithContentDescription("Passively hunt Goo").performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.OnClick)
        eventually { posts("rare-hunting").isNotEmpty() }
        assertEquals("true", (((posts("rare-hunting").last()["rules"] as JsonObject)["goo"] as JsonObject)["enabled"] as JsonPrimitive).content)

        scrollTo("Hunt blacklist")
        compose.onNodeWithText("Add").performScrollTo().performClick()
        compose.onNodeWithContentDescription("Add Bat to blacklist").performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.OnClick)
        eventually { posts("hunt-blacklist").any { (it["action"] as? JsonPrimitive)?.content == "add" } }
        assertEquals("bat", (posts("hunt-blacklist").last()["monsterId"] as JsonPrimitive).content)
    }

    @Test
    fun npcSaleAndGoldTargetUseTheDashboardWording() {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                NpcSaleSheet(Item(name = "hpot0", q = 3), null, location = "Leada inventory · slot 4", available = 3, collects = true, onConfirm = { _, _ -> null }, onCancel = {})
                GoldTargetSection("Merchy", serverTarget = 5000, gold = 1_250_000, viewModel = viewModel)
            }
        }
        eventually { viewModel.stateLoaded.value }
        compose.waitForIdle()
        compose.onNodeWithText("The merchant will collect this item and sell it to an NPC. Once sold, the sale cannot be undone.").assertExists()
        compose.onNodeWithText("Leada inventory · slot 4").assertExists()
        compose.onNodeWithText("Gold target").assertDoesNotExist()
        compose.onNodeWithText("Merchant's pocket money").assertExists()
        compose.onNodeWithText("1.250m").assertExists()
        compose.onNodeWithContentDescription("Merchant's pocket money").performScrollTo().performTextReplacement("7000")
        compose.onNodeWithText("Exchange gold and items with bank").performScrollTo().performClick()
        eventually { posts("command").map { (it["type"] as? JsonPrimitive)?.content }.containsAll(listOf("gold-target", "bank")) }
        val target = posts("command").first { (it["type"] as JsonPrimitive).content == "gold-target" }
        assertEquals("7000", (target["amount"] as JsonPrimitive).content)
    }
}
