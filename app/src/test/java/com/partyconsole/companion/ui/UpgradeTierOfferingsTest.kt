package com.partyconsole.companion.ui

import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.itempanel.ItemActionPanel
import com.partyconsole.companion.ui.itempanel.ItemActionTarget
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Console 1.4 offering shown on each upgrade tier and the rule dialog's
 *  wording (web/e2e/console14-merchant-market.spec.ts Upgrade offering
 *  preview; v1.4.0 dashboard/features/party/upgrade-actions.tsx
 *  destinationOffering).
 *
 *  Failure modes:
 *  - A tier row shows no offering, the wrong rule's offering, or marks a
 *    required rule as optional.
 *  - The rule dialog still says offerings apply only to automatic upgrades.
 */
@OptIn(ExperimentalMaterial3Api::class)
@RunWith(RobolectricTestRunner::class)
class UpgradeTierOfferingsTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun json(text: String): JsonElement = Json.parseToJsonElement(text)

    private fun setUp(bow: String, merchyItem: String, stock: Int) {
        val catalog = console.sections.getValue("catalog")["merchantCatalog"]!!.jsonObject
        val items = (catalog["allItems"] as JsonArray).filter { (it as JsonObject)["id"] != JsonPrimitive("bow") } + json(bow)
        console.override("catalog", mapOf("merchantCatalog" to JsonObject(catalog + ("allItems" to JsonArray(items)))))
        val inventory = console.sections.getValue("inventory")["characters"]!!.jsonObject
        val patched = inventory + ("Merchy" to JsonObject(inventory.getValue("Merchy").jsonObject + ("items" to json("""[null,{"slot":1,"item":$merchyItem}]"""))))
        console.override("inventory", mapOf("characters" to JsonObject(patched)))
        console.override("core", mapOf("upgradeOfferingStock" to json("""{"offeringp":$stock}""")))
    }

    private fun open(item: Item, slot: Int) {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent {
            ItemActionPanel(ItemActionTarget.InventorySlot(item, slot), "Merchy", isMerchant = true, roster = emptyMap(), viewModel = viewModel,
                sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), onDismiss = {})
        }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.merchantCatalog != null && viewModel.characterDetails.value.isNotEmpty() && viewModel.dynamicState.value.upgradeOfferingStock.isNotEmpty() }
        compose.waitForIdle()
    }

    @Test
    fun tierRowsShowTheOfferingRuleCoveringTheirLastStep() {
        setUp(
            bow = """{"id":"bow","name":"Bow","upgradeable":true,"maxLevel":10,"meta":{"definition":{"name":"Bow"},"upgradeable":true,"maxLevel":10}}""",
            merchyItem = """{"name":"bow","level":1}""",
            stock = 1,
        )
        console.override("core", mapOf("upgradeOfferingStock" to json("""{"offeringp":1}"""), "upgradeOfferingRules" to json(
            """[{"id":"rule-0","name":"bow","floor":0,"ceiling":2,"offering":"offering","required":false},{"id":"rule-1","name":"bow","floor":3,"ceiling":5,"offering":"offeringx","required":true}]""",
        )))
        open(Item(name = "bow", level = 1), 1)
        compose.onNodeWithText("Mark for upgrade").performScrollTo().performClick()
        // Ryan's v1.4.0 has no /party-api/prim-stack route.
        compose.onNodeWithText("Prim stack…").assertDoesNotExist()
        // +1 -> +2's last step is +1, inside rule-0 [0, 2).
        compose.onNode(hasText("+1 → +2")).assert(hasContentDescription("+1 → +2: Primordial Essence (optional)")).assert(hasText("("))
        // +2 -> +3 is uncovered.
        compose.onNode(hasText("+1 → +3")).assert(!hasContentDescription("Primordial", substring = true))
        compose.onNode(hasText("+1 → +4")).assert(hasContentDescription("+3 → +4: Primordial X (required)")).assert(!hasText("("))
    }

    @Test
    fun theRuleDialogSaysOfferingsApplyToManualAndAutomaticUpgrades() {
        setUp(
            bow = """{"id":"bow","name":"Bow","upgradeable":true,"maxLevel":10,"meta":{"definition":{"name":"Bow"},"upgradeable":true,"maxLevel":10}}""",
            merchyItem = """{"name":"bow","level":1}""",
            stock = 1,
        )
        open(Item(name = "bow", level = 1), 1)
        compose.onNodeWithText("Auto mark for upgrade").performScrollTo().performClick()
        compose.onNodeWithText("Add upgrade rule").performScrollTo().performClick()
        compose.onNodeWithText("Use an offering during manual and automatic upgrades within this level range.").performScrollTo().assertExists()
    }
}
