package com.partyconsole.companion.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.domain.ComparisonSource
import com.partyconsole.companion.domain.itemSlotExtras
import com.partyconsole.companion.domain.titledName
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.ItemMeta
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.account.CatalogScreen
import com.partyconsole.companion.ui.itemdetail.ItemDetailBrowser
import com.partyconsole.companion.ui.itemdetail.calculatedLevelProperties
import com.partyconsole.companion.ui.itemdetail.propertiesAtLevel
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Item titles (item.p): app/docs/cards.md lines 39-43. PWA: web/src/lib/itemTitles.test.ts
 *  and web/e2e/item-titles.spec.ts. */
@RunWith(RobolectricTestRunner::class)
class ItemTitlesTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()
    private val json = Json { ignoreUnknownKeys = true }

    @After fun stop() = console.close()

    private fun meta(definition: String, properties: String = "{}") =
        json.decodeFromString(ItemMeta.serializer(), """{"definition":$definition,"upgradeable":true,"scaling":{"attack":2,"armor":1},"properties":$properties}""")

    @Test
    fun theTitleGoesBeforeTheName() {
        assertEquals("Shiny Blade +7", titledName("Blade +7", "shiny"))
        assertEquals("Superfast Blade", titledName("Blade", "superfast"))
        assertEquals("Blade", titledName("Blade", null))
    }

    @Test
    fun shinyAddsTheBonusTheDefinitionPicks() {
        assertEquals(24.0, calculatedLevelProperties(meta("""{"attack":20,"wtype":"sword"}"""), null, 0, "shiny")["attack"])
        assertEquals(57.0, calculatedLevelProperties(meta("""{"attack":50,"wtype":"axe"}"""), null, 0, "shiny")["attack"])
        assertEquals(53.0, calculatedLevelProperties(meta("""{"attack":40,"wtype":"great_staff"}"""), null, 3, "shiny")["attack"])
        calculatedLevelProperties(meta("""{"stat":3,"armor":10}"""), null, 0, "shiny").let { assertEquals(5.0, it["stat"]); assertEquals(10.0, it["armor"]) }
        // A stat scroll folds the shiny stat into the scrolled stat.
        assertEquals(5.0, calculatedLevelProperties(meta("""{"stat":3}"""), "int", 0, "shiny")["int"])
        calculatedLevelProperties(meta("""{"armor":10}"""), null, 0, "shiny").let { assertEquals(22.0, it["armor"]); assertEquals(10.0, it["resistance"]) }
        calculatedLevelProperties(meta("""{"hp":100}"""), null, 0, "shiny").let { props -> for (key in listOf("dex", "int", "str")) assertEquals(key, 1.0, props[key]) }
        assertEquals(20.0, calculatedLevelProperties(meta("""{"attack":20}"""), null, 0, null)["attack"])
        assertEquals(20.0, calculatedLevelProperties(meta("""{"attack":20}"""), null, 0, "glitched")["attack"])
    }

    @Test
    fun aLiveCopyKeepsItsReportedStatsAndACatalogCopyGetsTheBonus() {
        val live = meta("""{"attack":20,"wtype":"sword"}""", """{"attack":30}""")
        assertEquals(30.0, propertiesAtLevel(live, Item(name = "blade", level = 3, p = "shiny"), 3, null)["attack"])
        assertEquals(32.0, propertiesAtLevel(live, Item(name = "blade", level = 3, p = "shiny"), 4, null)["attack"])
        assertEquals(28.0, propertiesAtLevel(meta("""{"attack":20}"""), Item(name = "blade", level = 0, p = "shiny"), 2, null)["attack"])
    }

    @Test
    fun theExtrasNameTheTitle() {
        assertEquals(listOf("title" to "Shiny"), itemSlotExtras(Item(name = "blade", p = "shiny")))
        assertEquals(listOf("title" to "Glitched", "title_bonus" to "+1 DEX, INT or STR, rolled at random"), itemSlotExtras(Item(name = "ring", p = "glitched")))
    }

    private val blade = """[{"id":"blade","name":"Blade","upgradeable":true,"meta":{"definition":{"name":"Blade","type":"weapon","wtype":"sword","tier":1,"attack":20},"upgradeable":true,"maxLevel":10,"scaling":{"attack":2},"usage":{"classes":[{"id":"warrior","name":"Warrior","hands":1}],"hands":[1]}}}]"""

    private fun viewModelWithBlade(): PartyViewModel {
        val merchant = console.sections.getValue("catalog")["merchantCatalog"]!!.jsonObject
        console.override("catalog", mapOf("merchantCatalog" to JsonObject(merchant + ("allItems" to JsonArray((merchant["allItems"] as JsonArray) + (Json.parseToJsonElement(blade) as JsonArray))))))
        return PartyViewModel(console.settings)
    }

    @Test
    fun itemDetailsShowTheTitleTheBonusAndTheExtrasLine() {
        val viewModel = viewModelWithBlade()
        compose.setContent {
            val state by viewModel.dynamicState.collectAsState()
            Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
                ItemDetailBrowser(rootItemId = "blade", rootLevel = 3, catalog = state.merchantCatalog, monsters = state.bestiaryCatalog, viewModel = viewModel, rootItem = Item(name = "blade", level = 3, p = "shiny"))
            }
        }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.merchantCatalog?.allItems?.any { it.id == "blade" } == true }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Shiny Blade +3")).fetchSemanticsNodes().isNotEmpty() }
        // 20 + 3 levels × 2 + 4.
        compose.onNode(hasText("Damage: 30") and hasAnyAncestor(hasContentDescription("Item card"))).assertExists()
        compose.onNode(hasText("Title: Shiny") and hasAnyAncestor(hasContentDescription("Item extras"))).assertExists()
    }

    @Test
    fun theCatalogComparisonNamesTheTitle() {
        val viewModel = viewModelWithBlade()
        compose.setContent { CatalogScreen(viewModel, onBack = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.merchantCatalog?.allItems?.any { it.id == "blade" } == true }
        compose.runOnIdle {
            val entry = viewModel.dynamicState.value.merchantCatalog!!.allItems.first { it.id == "blade" }
            viewModel.catalogComparison.value = ComparisonSource(-1, Item(name = "blade", level = 3, p = "shiny"), entry.meta)
        }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("A: Shiny Blade +3")).fetchSemanticsNodes().isNotEmpty() }
    }
}
