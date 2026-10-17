package com.partyconsole.companion.ui

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.account.MerchantCommerceScreen
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

/** Console 1.4 buy estimates (web/e2e/merchant-commerce.spec.ts) on the
 *  native merchant buy screen.
 *
 *  Failure modes:
 *  - The target level goes past the highest level the item's chance table
 *    reaches.
 *  - A line the console can't estimate blocks the order outright, or goes
 *    out without `acknowledgeUnavailable` and a positive `goldCap`, which the
 *    console answers with a 400.
 *  - Buy all is enabled before the maximum gold and the confirmation are
 *    both given, or while estimates are still running.
 *  - The gold total shows a number for a cart with an unavailable line.
 */
@RunWith(RobolectricTestRunner::class)
class MerchantBuyEstimateTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun posts(path: String) = console.requests.filter { it.method == "POST" && it.path == "/party-api/$path" }.map { Json.parseToJsonElement(it.body).jsonObject }

    private fun buyScreen(chances: String) {
        val catalog = console.sections.getValue("catalog")["merchantCatalog"]!!.jsonObject
        console.override("catalog", mapOf("merchantCatalog" to JsonObject(catalog + mapOf(
            "buyable" to Json.parseToJsonElement("""[{"id":"bow","name":"Bow","cost":1000,"seller":"basics","upgradeable":true,"upgradeGrade":0,"grades":[9,10,11,12],"upgradeChances":$chances}]"""),
        ))))
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { MerchantCommerceScreen(viewModel, "buy", onBack = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.merchantCatalog?.buyable?.isNotEmpty() == true && viewModel.characters.value["Merchy"]?.inventory != null }
        compose.waitForIdle()
        compose.onAllNodes(hasText("Add") and hasClickAction())[0].performClick()
    }

    @Test
    fun theTargetLevelStopsAtTheItemsHighestLevel() {
        // Chances end at +4, so +4 is the highest level this item can reach.
        buyScreen("[1,1,1,1,1]")
        val level = compose.onNodeWithContentDescription("Bow target level")
        level.performScrollTo().performTextReplacement("+9")
        compose.onNode(hasContentDescription("Bow target level") and SemanticsMatcher.expectValue(SemanticsProperties.EditableText, androidx.compose.ui.text.AnnotatedString("+4"))).assertExists()
    }

    @Test
    fun aLineTheConsoleCantEstimateNeedsAMaximumGoldAndAConfirmation() {
        // A near-impossible +2 completes too few simulated runs, so the estimate is unavailable.
        buyScreen("[1,1,0.0000001]")
        compose.onNodeWithContentDescription("Bow target level").performScrollTo().performTextReplacement("+2")
        compose.waitUntil(60_000) { compose.onAllNodes(hasText("Gold total unavailable")).fetchSemanticsNodes().isNotEmpty() }
        val buy = compose.onNodeWithText("Buy all")
        buy.assertIsNotEnabled()

        compose.onNodeWithContentDescription("Bow maximum gold").performScrollTo().performTextReplacement("250000")
        buy.assertIsNotEnabled()
        compose.onNode(hasText("The console can't estimate how many operations", substring = true)).performScrollTo().performClick()
        buy.assertIsEnabled().performClick()
        eventually { posts("merchant/order").isNotEmpty() }
        assertEquals(
            Json.parseToJsonElement("""{"id":"bow","quantity":1,"level":2,"goldCap":250000,"acknowledgeUnavailable":true}"""),
            (posts("merchant/order")[0]["buys"] as JsonArray)[0],
        )
    }
}
