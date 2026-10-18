package com.partyconsole.companion.ui

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import com.partyconsole.companion.domain.ComparisonSource
import com.partyconsole.companion.domain.comparisonLine
import com.partyconsole.companion.domain.comparisonStat
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.cardShot
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.account.CatalogScreen
import com.partyconsole.companion.ui.components.cardColor
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Rule
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** The catalog comparison's stat rows as game boxes (app/docs/cards.md, lines 34-38).
 *  PWA: web/e2e/catalog-comparison-card.spec.ts. */
@RunWith(RobolectricTestRunner::class)
class CatalogComparisonCardTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private val labels = listOf("Stat", "STR", "Fortitude", "Armor", "Resistance")

    @Test
    fun labelsAndColorsFollowTheEquipmentComparisonThenTheItemCard() {
        assertEquals("Armor" to "#A3A9B0", comparisonStat("armor"))
        assertEquals("Resistance" to "#8B74C9", comparisonStat("resistance"))
        assertEquals("Fortitude" to "#9A6BC9", comparisonStat("for"))
        assertEquals("STR" to "#F07F2F", comparisonStat("str"))
        assertEquals("Run speed" to "#36B89E", comparisonStat("speed"))
        assertEquals("Armor piercing" to "#A3A9B0", comparisonStat("apiercing"))
        // No equipment comparison row: the item card's name, still in the palette color.
        assertEquals("Poison Res." to "#68B84B", comparisonStat("pnresistance"))
        assertEquals("Stat" to "gray", comparisonStat("stat"))
        assertEquals("Courage" to "#9E1813", comparisonStat("courage"))
    }

    @Test
    fun deltasReadAgainstAInGainAndLossColors() {
        assertEquals("Armor: 40 (+20 · +100.0%)", comparisonLine("armor", 40.0, 20.0, false).display())
        assertEquals("#85C76B", comparisonLine("armor", 40.0, 20.0, false).changeColor)
        assertEquals("Armor: 10 (-10 · -50.0%)", comparisonLine("armor", 10.0, 20.0, false).display())
        assertEquals("#E13758", comparisonLine("armor", 10.0, 20.0, false).changeColor)
        assertEquals("Resistance: 5 (+5 · new)", comparisonLine("resistance", 5.0, 0.0, false).display())
        assertEquals("Armor: 20", comparisonLine("armor", 20.0, 20.0, false).display())
        assertEquals("Attack: 1,234.567", comparisonLine("attack", 1234.5671, 0.0, true).display())
        assertNull(comparisonLine("armor", 20.0, 10.0, true).change)
    }

    // Wolf Coat is A. Plate Armor beats it on armor and adds resistance and a stat scroll
    // slot; Coat loses armor; Tunic matches A's armor, adds `for` and has no level slider.
    private fun openComparison() {
        fun chest(id: String, name: String, definition: String, upgradeable: Boolean = true) =
            """{"id":"$id","name":"$name","upgradeable":$upgradeable,"meta":{"definition":{"name":"$name","type":"chest","damage_type":"physical",$definition},"upgradeable":$upgradeable,"maxLevel":${if (upgradeable) 10 else 0},${if (upgradeable) "\"scaling\":{\"armor\":2}," else ""}"usage":{"classes":[{"id":"warrior","name":"Warrior"}],"hands":[]}}}"""
        val items = listOf(
            chest("wcoat", "Wolf Coat", """"tier":2,"armor":20,"str":4"""),
            chest("plate", "Plate Armor", """"tier":3,"armor":40,"resistance":5,"str":4,"stat":2"""),
            chest("coat", "Coat", """"tier":1,"armor":10,"str":2"""),
            chest("tunic", "Tunic", """"tier":1,"armor":20,"for":3""", upgradeable = false),
        )
        val catalog = console.sections.getValue("catalog")["merchantCatalog"]!!.jsonObject
        console.override("catalog", mapOf("merchantCatalog" to JsonObject(catalog + ("allItems" to Json.parseToJsonElement(items.joinToString(",", "[", "]"))))))
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { CatalogScreen(viewModel, onBack = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.merchantCatalog?.allItems?.size == 4 }
        compose.runOnIdle {
            val coat = viewModel.dynamicState.value.merchantCatalog!!.allItems.first { it.id == "wcoat" }
            viewModel.catalogComparison.value = ComparisonSource(-1, Item(name = "wcoat", level = 0), coat.meta)
        }
        // Sorted by tier then name: Plate Armor, Wolf Coat, Coat, Tunic.
        compose.waitUntil(5_000) { compose.onAllNodesWithText("Add to compare").fetchSemanticsNodes().size == 4 }
        for (index in listOf(0, 1, 1)) compose.onAllNodesWithText("Add to compare")[index].performClick()
        compose.onNodeWithText("Compare selected").performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(hasContentDescription("D stats")).fetchSemanticsNodes().isNotEmpty() }
    }

    private fun inBox(column: Char) = hasAnyAncestor(hasContentDescription("$column stats"))
    private fun line(column: Char, text: String): SemanticsMatcher = hasText(text, substring = true) and inBox(column)
    private fun spans(column: Char, text: String) =
        compose.onNode(line(column, text)).fetchSemanticsNode().config[SemanticsProperties.Text].first().spanStyles.map { it.item.color }

    @Test
    fun everyColumnIsOneGameBoxWithNamedColoredLinesAndDeltas() {
        openComparison()
        // 34 and 35: every stat in every column under its comparison name.
        for (column in 'A'..'D') for (label in labels) compose.onNode(line(column, "$label: ")).assertExists()
        compose.onNode(hasText("Armor: 20") and inBox('A')).assertExists()
        compose.onNode(hasText("Fortitude: 0") and inBox('A')).assertExists()
        compose.onAllNodes(hasContentDescription("armor B")).fetchSemanticsNodes().let { assertEquals(0, it.size) }
        assertEquals(cardColor("#A3A9B0"), spans('A', "Armor: ").first())
        assertEquals(cardColor("#9A6BC9"), spans('D', "Fortitude: ").first())
        // 36: deltas against A.
        compose.onNode(hasText("Armor: 40 (+20 · +100.0%)") and inBox('B')).assertExists()
        assertEquals(cardColor("#85C76B"), spans('B', "Armor: ").last())
        compose.onNode(hasText("Resistance: 5 (+5 · new)") and inBox('B')).assertExists()
        compose.onNode(hasText("STR: 4") and inBox('B')).assertExists()
        compose.onNode(hasText("Armor: 10 (-10 · -50.0%)") and inBox('C')).assertExists()
        assertEquals(cardColor("#E13758"), spans('C', "Armor: ").last())
        compose.onNode(hasText("Armor: 20") and inBox('D')).assertExists()
        // 38: headers and type rows stay, and a slider moves its column.
        compose.onNodeWithText("A · Baseline").assertExists()
        compose.onNode(hasContentDescription("Remove B Plate Armor")).assertExists()
        compose.onNode(hasContentDescription("B Plate Armor stat scroll")).assertExists()
        compose.onNode(hasContentDescription("D Tunic preview level")).assertDoesNotExist()
        assertEquals(4, compose.onAllNodesWithText("chest").fetchSemanticsNodes().size)
        assertEquals(4, compose.onAllNodesWithText("physical").fetchSemanticsNodes().size)
        cardShot("catalog-comparison-phone")
        compose.onNode(hasContentDescription("B Plate Armor preview level")).performSemanticsAction(SemanticsActions.SetProgress) { it(1f) }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Armor: 42 (+22 · +110.0%)") and inBox('B')).fetchSemanticsNodes().isNotEmpty() }
    }

    @Test
    @Config(qualifiers = "w900dp-h1400dp")
    fun statsLineUpAcrossColumns() {
        openComparison()
        // positionInRoot ignores the horizontal scroll's clip, which hides the columns past the screen edge.
        fun top(matcher: SemanticsMatcher) = compose.onNode(matcher).fetchSemanticsNode().positionInRoot.y
        fun lines(column: Char) = compose.onAllNodes(hasText(": ", substring = true) and inBox(column)).fetchSemanticsNodes()
        // 37: one row per line, so B's long delta lines never wrap and every stat sits level.
        for (column in 'A'..'D') assertEquals(labels.size, lines(column).size)
        for (label in labels) {
            val expected = top(line('A', "$label: "))
            for (column in 'B'..'D') assertEquals("$label in $column", expected, top(line(column, "$label: ")), 1f)
        }
        val height = lines('B').first().size.height.toFloat()
        for (column in 'A'..'D') for (node in lines(column)) assertEquals(height, node.size.height.toFloat(), 1f)
        cardShot("catalog-comparison-wide")
    }
}
