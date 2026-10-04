package com.partyconsole.companion.ui

import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.characterdetail.sections.AutoMarksSection
import com.partyconsole.companion.ui.itemicon.rememberCatalogLookup
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** auto-rules.spec.ts on the native automatic-rules section. */
@RunWith(RobolectricTestRunner::class)
class AutoMarksTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun commands() = console.requests.filter { it.method == "POST" && it.path == "/party-api/command" }.map { Json.parseToJsonElement(it.body).jsonObject }
    private fun JsonObject.text(key: String) = (this[key] as? JsonPrimitive)?.content

    private fun show(character: String = "Merchy", isMerchant: Boolean = true): PartyViewModel {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent {
            val state by viewModel.dynamicState.collectAsState()
            AutoMarksSection(character, isMerchant, state, viewModel, rememberCatalogLookup(state.merchantCatalog))
        }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.merchantCatalog != null }
        compose.waitForIdle()
        return viewModel
    }

    private fun desc(text: String): SemanticsNodeInteraction = compose.onNodeWithContentDescription(text)

    @Test
    fun upgradeRuleEditsValidateAndUpdateTheOwnersRule() {
        console.override("config", mapOf("autoUpgradeMarks" to Json.parseToJsonElement("""{"Leada":{"bow@+2":{"tiers":3,"quantity":4}}}""")))
        val viewModel = show()
        eventually { viewModel.dynamicState.value.autoUpgradeMarks.isNotEmpty() }
        compose.waitForIdle()

        desc("Auto upgrades, 1").performClick()
        desc("View Bow +2 · +2 → +5").assertExists()
        compose.onNodeWithText("Leada").assertExists()

        compose.onNodeWithText("3 tiers → +5").performClick()
        desc("New target for Bow +2").performTextReplacement("12")
        desc("Save target for Bow +2").assertIsNotEnabled()
        desc("New target for Bow +2").performTextReplacement("4")
        desc("Save target for Bow +2").performClick()
        eventually { commands().size == 1 }
        commands()[0].let {
            assertEquals("Leada", it.text("character"))
            assertEquals("update-auto-upgrade-rule", it.text("type"))
            assertEquals("bow@+2", it.text("ruleKey"))
            assertEquals("4", it.text("tiers"))
        }

        compose.waitForIdle()
        compose.onNodeWithText("Remaining 4").performClick()
        desc("New quantity for Bow +2").performTextReplacement("-1")
        desc("Save quantity for Bow +2").performClick()
        eventually { commands().size == 2 }
        assertEquals("-1", commands()[1].text("quantity"))
    }

    @Test
    fun compoundTargetEditAndClearAllAsksFirst() {
        console.override("config", mapOf("autoCompounds" to Json.parseToJsonElement("""{"Merchy":[{"name":"ringsj","targetTier":3,"quantity":-1}]}""")))
        val viewModel = show()
        eventually { viewModel.dynamicState.value.autoCompounds.isNotEmpty() }
        compose.waitForIdle()

        desc("Auto compounds, 1").performClick()
        compose.onNodeWithText("Remaining ∞").assertExists()
        compose.onNodeWithText("Target +3").performClick()
        desc("New target for Ring of Strength").performTextReplacement("5")
        desc("Save target for Ring of Strength").performClick()
        eventually { commands().size == 1 }
        commands()[0].let {
            assertEquals("Merchy", it.text("character"))
            assertEquals("auto-compound-mark", it.text("type"))
            assertEquals("5", it.text("targetTier"))
        }

        desc("Clear all Auto compounds").performClick()
        assertEquals(1, commands().size)
        desc("Really clear all Auto compounds").performClick()
        eventually { commands().size == 2 }
        assertEquals("clear-auto-compounds", commands()[1].text("type"))
    }

    @Test
    fun automaticRulesAreMerchantOnly() {
        show(character = "Leada", isMerchant = false)
        compose.onNodeWithText("Automatic rules").assertDoesNotExist()
    }
}
