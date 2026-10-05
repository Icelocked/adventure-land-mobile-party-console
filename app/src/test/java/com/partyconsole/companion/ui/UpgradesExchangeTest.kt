package com.partyconsole.companion.ui

import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasAnySibling
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isPopup
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.account.MerchantCommerceScreen
import com.partyconsole.companion.ui.characterdetail.sections.LuckySlotSection
import com.partyconsole.companion.ui.itempanel.ItemActionPanel
import com.partyconsole.companion.ui.itempanel.ItemActionTarget
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** offerings.spec.ts / merchant-commerce / exchange.spec.ts on the native screens. */
@OptIn(ExperimentalMaterial3Api::class)
@RunWith(RobolectricTestRunner::class)
class UpgradesExchangeTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun posts(path: String) = console.requests.filter { it.method == "POST" && it.path == "/party-api/$path" }.map { Json.parseToJsonElement(it.body).jsonObject }
    private fun JsonObject.text(key: String) = (this[key] as? JsonPrimitive)?.content

    private fun panel(item: Item, slot: Int): PartyViewModel {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent {
            ItemActionPanel(ItemActionTarget.InventorySlot(item, slot), "Merchy", isMerchant = true, roster = emptyMap(), viewModel = viewModel,
                sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), onDismiss = {})
        }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.merchantCatalog != null }
        compose.waitForIdle()
        return viewModel
    }

    @Test
    fun upgradeWithAnOfferingConfirmsAOneTierMarkAndShowsTheServerPreview() {
        console.override("config", mapOf("upgradeOfferingStock" to Json.parseToJsonElement("""{"offeringp":2}""")))
        val viewModel = panel(Item(name = "bow", level = 3), 2)
        eventually { viewModel.dynamicState.value.upgradeOfferingStock.isNotEmpty() }
        compose.waitForIdle()
        compose.onNodeWithText("Mark for upgrade").performScrollTo().performClick()
        compose.onNodeWithText("Upgrade with Primordial Essence").performScrollTo().assertIsNotEnabled()
        compose.onNodeWithContentDescription("Upgrade chances").performScrollTo().assertExists()
        compose.onNodeWithText("Next attempt: +3 → +4").assertExists()
        eventually { posts("upgrade-preview").isNotEmpty() }
        compose.onNodeWithText("Upgrade with Primling").performScrollTo().performClick()
        compose.onNodeWithText("Use Primling to upgrade Bow from +3 to +4?").performScrollTo().assertExists()
        compose.onNodeWithText("Confirm").performScrollTo().performClick()
        eventually { posts("command").any { it.text("type") == "upgrade-mark" } }
        posts("command").first { it.text("type") == "upgrade-mark" }.let {
            assertEquals("offeringp", it.text("offering"))
            assertEquals("1", it.text("tiers"))
            assertEquals("2", it.text("slot"))
            assertEquals("Merchy", it.text("character"))
        }
    }

    @Test
    fun addUpgradeRuleRejectsAnOverlapAndSavesTheRule() {
        // The core section carries the rules too (and polls every 2 s): override both.
        val rules = Json.parseToJsonElement("""[{"id":"r1","name":"bow","floor":0,"ceiling":2,"offering":"offering","required":true}]""")
        console.override("config", mapOf("upgradeOfferingRules" to rules))
        console.override("core", mapOf("upgradeOfferingRules" to rules))
        val viewModel = panel(Item(name = "bow", level = 1), 2)
        eventually { viewModel.dynamicState.value.upgradeOfferingRules.isNotEmpty() }
        compose.waitForIdle()
        compose.onNodeWithText("Auto mark for upgrade").performScrollTo().performClick()
        compose.onNodeWithText("Add upgrade rule").performScrollTo().performClick()
        compose.onNodeWithText("There is already a rule that covers +0 to +2.").performScrollTo().assertExists()
        compose.onNodeWithContentDescription("Starting level").performScrollTo().performClick()
        compose.onNode(hasText("+2") and hasAnyAncestor(isPopup())).performClick()
        compose.onNodeWithContentDescription("Ending level").performClick()
        compose.onNode(hasText("+5") and hasAnyAncestor(isPopup())).performClick()
        compose.onNodeWithText("Only if item is available").performScrollTo().performClick()
        compose.onNodeWithText("Confirm").performScrollTo().performClick()
        eventually { posts("command").any { it.text("type") == "upgrade-offering-rule" } }
        val rule = posts("command").first { it.text("type") == "upgrade-offering-rule" }["rule"] as JsonObject
        assertEquals("2", rule.text("floor"))
        assertEquals("5", rule.text("ceiling"))
        assertEquals("false", rule.text("required"))
        assertEquals("offeringp", rule.text("offering"))
    }

    @Test
    fun luckySlotShowsTheNextTestSlotAndItsEvidenceTable() {
        val streams = mapOf(
            "s-1" to com.partyconsole.companion.model.LuckySlotTracking(
                version = 1,
                slots = mapOf("0" to com.partyconsole.companion.model.SlotRollStatistics(totalRolls = 4, sumRolls = 2.0, rollsAbove96_3 = 1, perfectRolls = 0)),
            ),
        )
        compose.setContent {
            var open by remember { mutableStateOf(false) }
            LuckySlotSection("Merchy", streams, verified = null, open = open, onOpenChange = { open = it }, localLucky = null)
        }
        compose.onNodeWithText("Next upgrade will test for lucky upgrade · slot 1 (inventory position 2).").assertExists()
        compose.onNodeWithText("Show lucky slot data").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("4 recorded upgrade rolls · 1/42 slots sampled.").assertExists()
        compose.onNodeWithContentDescription("Slot 0").assertExists()
    }

    private fun commerce(mode: String): PartyViewModel {
        val catalog = console.sections.getValue("catalog")["merchantCatalog"]!!.jsonObject
        console.override("catalog", mapOf("merchantCatalog" to JsonObject(catalog + mapOf(
            "buyable" to Json.parseToJsonElement("""[{"id":"bow","name":"Bow","cost":600,"seller":"basics","upgradeable":true,"upgradeGrade":0,"grades":[9,10,11,12],"upgradeChances":[1,0.9999999,0.98,0.95,0.7,0.6,0.4,0.25,0.15,0.07,0.024,0.14,0.11],"scrollCosts":[1000,40000,1600000,64000000]},{"id":"hpot0","name":"Health Potion","cost":20,"seller":"basics"}]"""),
            "craftable" to Json.parseToJsonElement("""[{"id":"wcoat","name":"Wolf Coat","cost":500,"materials":[{"id":"cscroll0","name":"Compound Scroll","quantity":3},{"id":"gem0","name":"Green Gem","quantity":1}]}]"""),
            "exchangeable" to Json.parseToJsonElement("""[{"key":"token-a","id":"monstertoken","name":"Bow reward","required":2,"reward":"bow-0","rewardQuantity":1,"currencyName":"Monster Token"},{"key":"box","id":"gem0","name":"Green Gem","required":1,"results":[{"kind":"item","id":"hpot0","name":"Health Potion","quantity":5,"chance":0.5},{"kind":"gold","id":"gold","name":"Gold","quantity":100,"chance":0.5}]}]"""),
        ))))
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { MerchantCommerceScreen(viewModel, mode, onBack = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.merchantCatalog?.buyable?.isNotEmpty() == true && viewModel.characters.value["Merchy"]?.inventory != null }
        compose.waitForIdle()
        return viewModel
    }

    @Test
    fun theCartStaysPinnedSoAnItemAddedFarDownShowsAtOnce() {
        // Failure mode: the cart sits after the whole catalog, so confirming an
        // addition means scrolling to the bottom and back.
        val catalog = console.sections.getValue("catalog")["merchantCatalog"]!!.jsonObject
        val many = (0 until 40).joinToString(",") { """{"id":"item$it","name":"Item ${it.toString().padStart(2, '0')}","cost":${10 + it},"seller":"basics"}""" }
        console.override("catalog", mapOf("merchantCatalog" to JsonObject(catalog + mapOf("buyable" to Json.parseToJsonElement("[$many]")))))
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { MerchantCommerceScreen(viewModel, "buy", onBack = {}) }
        eventually { viewModel.dynamicState.value.merchantCatalog?.buyable?.size == 40 }
        compose.waitForIdle()
        compose.onAllNodes(hasText("Add"))[35].performScrollTo().performClick()
        compose.waitForIdle()
        val inCart = hasAnyAncestor(hasContentDescription("Cart"))
        compose.onNode(hasContentDescription("Item 35 quantity") and inCart).assertIsDisplayed()
        compose.onNode(hasText("CART (1)") and inCart).assertIsDisplayed()
        compose.onNode(hasText("Gold: 45g") and inCart).assertIsDisplayed()
        compose.onNodeWithText("Buy all").assertIsDisplayed()
        // The header folds the cart away.
        compose.onNodeWithContentDescription("Fold Cart").performClick()
        compose.onNode(hasContentDescription("Item 35 quantity")).assertDoesNotExist()
    }

    @Test
    fun theCraftCartKeepsTheAddedRecipeInViewAndSummarisesIngredients() {
        // Failure mode: the cart scrolled to its bottom (the ingredient
        // totals), pushing the recipe just added out of view.
        val catalog = console.sections.getValue("catalog")["merchantCatalog"]!!.jsonObject
        val mats = listOf("ironore", "goldore", "leather", "spidersilk", "batwing", "frog", "seashell", "gemfragment")
        val buyable = mats.joinToString(",") { """{"id":"$it","name":"$it","cost":50,"seller":"basics"}""" }
        val recipes = (0 until 12).joinToString(",") { i ->
            val materials = (0..2).joinToString(",") { k -> """{"id":"${mats[(i + k) % 8]}","name":"${mats[(i + k) % 8]}","quantity":${2 + k}}""" }
            """{"id":"r$i","name":"Recipe ${i.toString().padStart(2, '0')}","cost":100,"materials":[$materials]}"""
        }
        console.override("catalog", mapOf("merchantCatalog" to JsonObject(catalog + mapOf(
            "buyable" to Json.parseToJsonElement("[$buyable]"),
            "craftable" to Json.parseToJsonElement("[$recipes]"),
        ))))
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { MerchantCommerceScreen(viewModel, "craft", onBack = {}) }
        eventually { viewModel.dynamicState.value.merchantCatalog?.craftable?.size == 12 }
        compose.waitForIdle()
        val inCart = hasAnyAncestor(hasContentDescription("Craft list"))
        for (i in listOf(0, 3, 6, 9)) {
            compose.onAllNodes(hasText("Add") and hasClickAction())[i].performScrollTo().performClick()
            compose.waitForIdle()
            compose.onNode(hasContentDescription("Recipe ${i.toString().padStart(2, '0')} quantity") and inCart).assertIsDisplayed()
        }
        compose.onNode(hasText("Ingredients: 8", substring = true) and inCart).assertIsDisplayed()
        compose.onNode(hasText("INGREDIENT TOTALS") and inCart).assertDoesNotExist()
        compose.onNode(hasText("Show") and inCart).performClick()
        compose.onNode(hasText("INGREDIENT TOTALS") and inCart).assertExists()
    }

    @Test
    fun buyingAnUpgradedTargetSendsTheNinetyPercentBudget() {
        commerce("buy")
        compose.onNodeWithText("Gold: 0g").assertIsDisplayed()
        compose.onNodeWithContentDescription("Inspect Bow").assertExists()
        compose.onNodeWithText("600g").assertExists()
        compose.onAllNodesAdd(0)
        compose.onNodeWithContentDescription("Bow target level").performScrollTo().performTextReplacement("+2")
        compose.onNodeWithText("Gold (est)", substring = true).assertIsDisplayed()
        compose.onNodeWithText("Buy all").performClick()
        eventually { posts("merchant/order").isNotEmpty() }
        val line = (posts("merchant/order")[0]["buys"] as JsonArray)[0] as JsonObject
        assertEquals("bow", line.text("id"))
        assertEquals("2", line.text("level"))
        assertTrue((line.text("budget")?.toDouble() ?: 0.0) >= 600.0)
        assertTrue((line.text("maxAttempts")?.toLong() ?: 0) >= 1)
    }

    @Test
    fun craftNeedsEveryMaterialAvailableOrBuyable() {
        commerce("craft")
        // Merchy holds 5 compound scrolls; the Green Gem can't be bought or found.
        compose.onNodeWithText("Complete recipe").performClick()
        compose.onNodeWithText("0 owned · missing").assertExists()
        compose.onNodeWithText("Add").assertIsNotEnabled()
    }

    @Test
    fun exchangeChoicesGroupUnderTheirCurrencyAndQueueTheChosenReward() {
        console.override("inventory", mapOf("characters" to Json.parseToJsonElement("""{"Merchy":{"items":[{"slot":0,"item":{"name":"monstertoken","q":4}},{"slot":1,"item":{"name":"gem0","q":1}}],"slots":{}}}""")))
        commerce("exchange")
        compose.onNodeWithText("Monster Token").assertExists()
        compose.onNodeWithText("Choose").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("CHOOSE A REWARD").assertExists()
        compose.onNode(hasText("Add") and hasAnyAncestor(hasContentDescription("Exchange details"))).performClick()
        compose.onNodeWithContentDescription("Close exchange details").performClick()
        compose.onNodeWithText("Exchange all").performClick()
        eventually { posts("merchant/exchange-order").isNotEmpty() }
        val line = (posts("merchant/exchange-order")[0]["exchanges"] as JsonArray)[0] as JsonObject
        assertEquals("monstertoken", line.text("id"))
        assertEquals("bow-0", line.text("reward"))
        assertEquals("1", line.text("quantity"))
    }

    @Test
    fun markMultipleStagesBoxRewardsAndSavesThemOnDone() {
        commerce("exchange")
        compose.onNodeWithContentDescription("Exchange rules for Green Gem").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("POTENTIAL RESULTS").assertExists()
        // Gold is a passive reward: it never takes a rule.
        compose.onNodeWithText("Mark multiple").performClick()
        compose.onNodeWithContentDescription("Bank").performClick()
        compose.onNodeWithContentDescription("Exchange reward: hpot0 +0").performClick()
        compose.onNodeWithText("1 pending changes. Done saves; closing discards.").assertExists()
        assertEquals(0, posts("command").size)
        compose.onNodeWithText("Done").performClick()
        eventually { posts("command").isNotEmpty() }
        posts("command")[0].let {
            assertEquals("auto-item-mark", it.text("type"))
            assertEquals("bank", it.text("mode"))
            assertEquals("hpot0", (it["item"] as JsonObject).text("name"))
        }
    }

    private fun androidx.compose.ui.test.junit4.ComposeContentTestRule.onAllNodesAdd(index: Int) =
        onAllNodes(androidx.compose.ui.test.hasText("Add") and androidx.compose.ui.test.hasClickAction())[index].performClick()
}
