package com.partyconsole.companion.ui

import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import com.partyconsole.companion.domain.automaticCommerceRuleKey
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.testing.field
import com.partyconsole.companion.testing.ryanV140
import com.partyconsole.companion.ui.itempanel.ItemActionPanel
import com.partyconsole.companion.ui.itempanel.ItemActionTarget
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

/** "Keep in storage" on an automatic NPC sale (stable console fork #116;
 *  web/e2e/console14-wtb-prim-keep.spec.ts and console-v140-gates.spec.ts).
 *
 *  Failure modes:
 *  - Keep is not prefilled from the saved merchant-wide rule.
 *  - Keep is sent as a number, or a blank keep sends `keep` at all.
 *  - A per-player rule (another character) offers Keep, which the console refuses.
 *  - Ryan's v1.4.0 offers Keep, which it ignores and so sells every copy.
 */
@OptIn(ExperimentalMaterial3Api::class)
@RunWith(RobolectricTestRunner::class)
class NpcSaleKeepTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun posts() = console.requests.filter { it.method == "POST" && it.path == "/party-api/merchant/auto-npc-sale" }.map { Json.parseToJsonElement(it.body).jsonObject }
    private fun keepField() = compose.onNode(hasSetTextAction() and hasText("Keep in storage"))

    private fun open(item: Item, character: String, isMerchant: Boolean) {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent {
            ItemActionPanel(ItemActionTarget.InventorySlot(item, 0), character, isMerchant = isMerchant, roster = emptyMap(), viewModel = viewModel,
                sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), onDismiss = {})
        }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.merchantCatalog != null && viewModel.characterDetails.value.isNotEmpty() }
        compose.waitForIdle()
    }

    private fun startRule(label: String) {
        compose.waitUntil(5_000) { compose.onAllNodes(hasText(label)).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText(label).performScrollTo().performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Automatically sell to NPC?")).fetchSemanticsNodes().isNotEmpty() }
    }

    @Test
    fun theMerchantsKeepPrefillsFromTheRuleAndIsSentAsText() {
        val ore = Item(name = "ironore", q = 5)
        val key = automaticCommerceRuleKey(ore)
        console.override("config", mapOf("autoNpcSales" to JsonObject(mapOf(key to Json.parseToJsonElement("""{"item":{"name":"ironore"},"keep":3}""")))))
        open(ore, "Merchy", isMerchant = true)
        startRule("Update auto sell to NPC…")
        compose.waitUntil(5_000) { keepField().fetchSemanticsNode().config.getOrNull(androidx.compose.ui.semantics.SemanticsProperties.EditableText)?.text == "3" }
        keepField().performScrollTo().performTextReplacement("12")
        compose.onNodeWithText("Enable auto sale").performScrollTo().performClick()
        eventually { posts().size == 1 }
        assertEquals(Json.parseToJsonElement("""{"item":{"name":"ironore","q":5},"action":"set","keep":"12"}"""), posts()[0])
        assertEquals(JsonPrimitive(12), console.field("autoNpcSales")!!.jsonObject[key]!!.jsonObject["keep"])
    }

    @Test
    fun aBlankKeepOmitsTheField() {
        open(Item(name = "hpot0", q = 9), "Merchy", isMerchant = true)
        startRule("Auto sell to NPC…")
        compose.waitUntil(5_000) { keepField().fetchSemanticsNode().config.getOrNull(androidx.compose.ui.semantics.SemanticsProperties.EditableText)?.text == "" }
        compose.onNodeWithText("Enable auto sale").performScrollTo().performClick()
        eventually { posts().size == 1 }
        assertEquals(Json.parseToJsonElement("""{"item":{"name":"hpot0","q":9},"action":"set"}"""), posts()[0])
    }

    @Test
    fun anotherCharactersRuleHasNoKeep() {
        open(Item(name = "ironore", q = 5), "Leada", isMerchant = false)
        startRule("Auto sell to NPC…")
        keepField().assertDoesNotExist()
    }

    @Test
    fun ryanV140HasNoKeepAndSendsOnlyItemAndAction() {
        console.ryanV140()
        open(Item(name = "hpot0", q = 9), "Merchy", isMerchant = true)
        startRule("Auto sell to NPC…")
        keepField().assertDoesNotExist()
        compose.onNodeWithText("Enable auto sale").performScrollTo().performClick()
        eventually { posts().size == 1 }
        assertEquals(Json.parseToJsonElement("""{"item":{"name":"hpot0","q":9},"action":"set"}"""), posts()[0])
    }
}
