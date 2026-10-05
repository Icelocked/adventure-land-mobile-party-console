package com.partyconsole.companion.ui

import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isPopup
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import com.partyconsole.companion.domain.ComparisonSource
import com.partyconsole.companion.domain.achievementMilestones
import com.partyconsole.companion.domain.aggregateMonsterAchievements
import com.partyconsole.companion.model.BestiaryMonster
import com.partyconsole.companion.model.CharacterDiagnostics
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.SkillEntry
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.account.BestiaryScreen
import com.partyconsole.companion.ui.account.CatalogScreen
import com.partyconsole.companion.ui.account.LogsScreen
import com.partyconsole.companion.ui.account.SettingsScreen
import com.partyconsole.companion.ui.account.classifyGameLog
import com.partyconsole.companion.ui.account.skillRangeLabel
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** bestiary / catalog / logs / settings specs on the native screens. */
@RunWith(RobolectricTestRunner::class)
class ReferenceSettingsTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun obj(text: String) = Json.parseToJsonElement(text).jsonObject

    @Test
    fun logClassificationSkillRangesAndAchievementsFollowTheDashboard() {
        assertEquals("errors", classifyGameLog("Route rejected: collisions detected"))
        assertEquals("kills", classifyGameLog("Leada killed a goo"))
        assertEquals("gold", classifyGameLog("Received 50 gold"))
        assertEquals("info", classifyGameLog("Hello"))

        assertEquals("Global", skillRangeLabel(SkillEntry("x", "X", definition = obj("""{"global":true,"range":10}"""))))
        assertEquals("150", skillRangeLabel(SkillEntry("x", "X", definition = obj("""{"range":100,"range_multiplier":1.5}"""))))
        assertEquals("2 × attack range − 20", skillRangeLabel(SkillEntry("x", "X", definition = obj("""{"use_range":true,"range_multiplier":2,"range_bonus":-20}"""))))
        assertEquals("100 + character level", skillRangeLabel(SkillEntry("throw", "Throw", definition = obj("""{"range":100}"""))))
        assertEquals("Not specified", skillRangeLabel(SkillEntry("x", "X")))

        val leada = CharacterDiagnostics(monsterAchievements = obj("""{"goo":{"score":40}}"""))
        val folla = CharacterDiagnostics(monsterAchievements = obj("""{"goo":{"score":90,"owner":"Somebody"}}"""))
        val best = aggregateMonsterAchievements(mapOf("Leada" to leada, "Folla" to folla))
        assertEquals(90.0, best.getValue("goo").score, 0.0)
        assertEquals("Somebody", best.getValue("goo").owner)
        assertEquals(listOf(10.0, 100.0), achievementMilestones(BestiaryMonster("goo", "Goo", definition = obj("""{"achievements":[[100,"stat","luck",1],[10,"stat","hp",5]]}"""))))
    }

    private fun bestiary() {
        console.override("catalog", mapOf("bestiaryCatalog" to Json.parseToJsonElement(
            """[{"id":"goo","name":"Goo","hp":100,"attack":5,"xp":10,"threat":1.0,"definition":{"hp":100,"achievements":[[10,"stat","hp",5],[100,"stat","luck",1]]},"drops":[{"id":"hpot0","name":"Health Potion","rate":2.5,"quantity":1}],"spawnRecords":[{"sourceMap":"main","map":"main","mapName":"Mainland","x":0,"y":700,"restrictions":[]}]},
                {"id":"bat","name":"Bat","hp":900,"attack":40,"xp":300,"threat":8.5,"drops":[],"spawnRecords":[{"sourceMap":"cave","map":"cave","restrictions":["instance"]}]}]""",
        )))
    }

    @Test
    fun bestiaryFiltersSortsAndOpensMonsterDetailsWithFormattedDrops() {
        bestiary()
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { BestiaryScreen(viewModel, onBack = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.bestiaryCatalog.size == 2 }
        compose.waitForIdle()
        compose.onNodeWithText("Goo").assertExists()
        compose.onNodeWithText("Bat").assertExists()
        // No Tracktrix data from any character: score totals are unavailable.
        compose.onAllNodesWithText("Tracktrix required for score totals")[0].assertExists()
        compose.onNodeWithText("cave").performClick()
        compose.onNodeWithText("Goo").assertDoesNotExist()
        compose.onNodeWithText("All").performClick()

        compose.onNodeWithText("Goo").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("G.monsters.goo").assertExists()
        compose.onNodeWithText("Tracktrix data unavailable").assertExists()
        compose.onNodeWithText("Mainland (main) · (0, 700)").assertExists()
        compose.onNode(hasText("MONSTER-SPECIFIC DROPS (1)")).performScrollTo().assertExists()
        // drop-rate.ts: 250% is two guaranteed plus a 50% chance.
        compose.onNodeWithText("100% ×2 + 50%").performScrollTo().assertExists()
    }

    @Test
    fun catalogFiltersByTypeAndComparesAlternativesAgainstA() {
        fun item(id: String, type: String, attack: Int, classes: String = """[{"id":"warrior","name":"Warrior"}]""") =
            """{"id":"$id","name":"${id.replaceFirstChar { it.uppercase() }}","meta":{"definition":{"name":"${id.replaceFirstChar { it.uppercase() }}","type":"$type","tier":1,"attack":$attack,"g":100},"properties":{"attack":$attack},"usage":{"classes":$classes,"hands":[]}}}"""
        val catalog = console.sections.getValue("catalog")["merchantCatalog"]!!.jsonObject
        console.override("catalog", mapOf("merchantCatalog" to JsonObject(catalog + ("allItems" to Json.parseToJsonElement(
            "[${item("blade", "weapon", 30)},${item("staff", "weapon", 20, """[{"id":"mage","name":"Mage"}]""")},${item("helm", "helmet", 0)},{\"id\":\"hpot0\",\"name\":\"Health Potion\",\"meta\":{\"definition\":{\"type\":\"pot\"}}}]",
        )))))
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { CatalogScreen(viewModel, onBack = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.merchantCatalog?.allItems?.size == 4 }
        compose.waitForIdle()
        compose.onNodeWithText("3 ITEMS · SORTED BY TIER").assertExists()
        compose.onNodeWithText("Health Potion").assertDoesNotExist()
        compose.onNodeWithText("helmet").performClick()
        compose.onNodeWithText("1 ITEM · SORTED BY TIER").assertExists()
        compose.onAllNodesWithText("All")[0].performClick()
        compose.onNodeWithContentDescription("Sort equipment").performClick()
        compose.onNode(hasText("Attack") and hasAnyAncestor(isPopup())).performClick()
        compose.onNodeWithText("ATTACK 30").assertExists()

        compose.runOnIdle {
            val blade = viewModel.dynamicState.value.merchantCatalog!!.allItems.first { it.id == "blade" }
            viewModel.catalogComparison.value = ComparisonSource(-1, Item(name = "blade", level = 0), blade.meta)
        }
        compose.waitForIdle()
        compose.onNodeWithText("A: Blade +0").assertExists()
        compose.onNodeWithText("weapon").performClick() // the type filter starts on A's type
        compose.onNodeWithText("weapon").performClick()
        // Sorted by attack: Blade (A's own item) then Staff.
        compose.onAllNodesWithText("Add to compare")[1].performClick()
        compose.onNodeWithText("1/3 selected").assertExists()
        compose.onNodeWithText("Compare selected").performClick()
        compose.waitForIdle()
        compose.onNodeWithContentDescription("attack B").assertExists()
        compose.onNode(hasText("(-10 · -33.333%)", substring = true)).assertExists()
    }

    @Test
    fun logsListGameLogsWithFiltersAndDashboardSources() {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { LogsScreen(viewModel, onBack = {}) }
        eventually(12_000) { viewModel.gameLogs.value.isNotEmpty() }
        compose.waitForIdle()
        compose.onNodeWithText("Route rejected", substring = true).assertExists()
        compose.onNodeWithText("Errors").performClick()
        compose.onNodeWithText("No matching logs yet.").assertExists()
        compose.onNodeWithText("Errors").performClick()
        compose.onNodeWithText("Dashboard logs").performClick()
        compose.onNode(hasText("Looted", substring = true)).assertExists()
        compose.onNode(hasText("hpot0 at stand", substring = true)).assertExists()
        compose.onNodeWithContentDescription("Dashboard log source").performClick()
        compose.onNode(hasText("Combat") and hasAnyAncestor(isPopup())).performClick()
        compose.onNode(hasText("hpot0 at stand", substring = true)).assertDoesNotExist()
    }

    @Test
    fun settingsShowTheMemberGridAndPrepareTheAlDataMailDraft() {
        console.override("market", mapOf("aldata" to Json.parseToJsonElement("""{"listings":[],"hasKey":true,"auth":"NO"}""")))
        console.gets["/party-api/aldata/key"] = """{"key":"secret-key"}"""
        console.gets["/console-update"] = """{"current":"1.2.0","managed":false,"phase":"idle","checkedAt":1}"""
        console.gets["/console-debug"] = """{"phase":"idle","message":"Debug instance stopped"}"""
        var openedMail = false
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { SettingsScreen(viewModel, onBack = {}, onOpenMail = { openedMail = true }) }
        eventually { viewModel.stateLoaded.value && viewModel.roster.value.isNotEmpty() && viewModel.dynamicState.value.aldata?.hasKey == true }
        compose.waitForIdle()
        compose.onNodeWithText("Interface settings").assertExists()
        compose.onNodeWithContentDescription("Leada").performScrollTo().assertExists()
        compose.onAllNodes(hasContentDescription("Empty character slot")).fetchSemanticsNodes().let { assertEquals(4, it.size) }
        compose.onNodeWithText("Prepare mail").performScrollTo().performClick()
        eventually { openedMail }
        assertEquals("earthiverse", viewModel.mailDraft.value?.recipient)
        assertEquals("aldata_auth", viewModel.mailDraft.value?.subject)
        assertTrue(viewModel.mailDraft.value?.message?.isNotEmpty() == true)
        compose.onNodeWithText("Installed version: 1.2.0").performScrollTo().assertExists()
        compose.onNodeWithText("Development checkout: update notifications only. Update your source manually, or use the editable release package for managed updates.").assertExists()
        compose.onNodeWithText("Start debug instance").performScrollTo().assertExists()
    }
}
