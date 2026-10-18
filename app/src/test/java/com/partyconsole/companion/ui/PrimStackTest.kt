package com.partyconsole.companion.ui

import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.ryanV140
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
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Console 1.4 prim stacking, the preview's grace and the offering shown on
 *  each upgrade tier (web/e2e/console14-wtb-prim-keep.spec.ts Prim stack,
 *  console14-merchant-market.spec.ts Upgrade offering preview).
 *
 *  Failure modes:
 *  - Prim stack is offered for an equipped or non-merchant item, or with no
 *    Primlings; the coordinator only stacks merchant inventory items.
 *  - The stat method is offered for an item with no applied stat, or names
 *    the wrong scroll count for the item's grade.
 *  - The default target isn't two above the item's level (capped at 15).
 *  - The post leaves out the item or slot, or sends the target as text.
 *  - The dialog stays open after the job is queued.
 *  - The preview's grace never shows, so there is no way to see a stack's effect.
 *  - A tier row shows no offering, the wrong rule's offering, or marks a
 *    required rule as optional.
 *  - The rule dialog still says offerings apply only to automatic upgrades.
 */
@OptIn(ExperimentalMaterial3Api::class)
@RunWith(RobolectricTestRunner::class)
class PrimStackTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun posts(path: String) = console.requests.filter { it.method == "POST" && it.path == "/party-api/$path" }.map { Json.parseToJsonElement(it.body).jsonObject }
    private fun json(text: String): JsonElement = Json.parseToJsonElement(text)
    private val inDialog = hasAnyAncestor(hasContentDescription("Prim stack"))

    private fun setUp(bow: String, merchyItem: String, stock: Int, folla: String? = null) {
        val catalog = console.sections.getValue("catalog")["merchantCatalog"]!!.jsonObject
        val items = (catalog["allItems"] as JsonArray).filter { (it as JsonObject)["id"] != JsonPrimitive("bow") } + json(bow) +
            json("""{"id":"dexscroll","name":"Scroll of Dexterity","meta":{"definition":{"name":"Scroll of Dexterity"}}}""")
        console.override("catalog", mapOf("merchantCatalog" to JsonObject(catalog + ("allItems" to JsonArray(items)))))
        val inventory = console.sections.getValue("inventory")["characters"]!!.jsonObject
        var patched = inventory + ("Merchy" to JsonObject(inventory.getValue("Merchy").jsonObject + ("items" to json("""[null,{"slot":1,"item":$merchyItem}]"""))))
        if (folla != null) patched = patched + ("Folla" to JsonObject(inventory.getValue("Folla").jsonObject + ("items" to json("""[{"slot":0,"item":$folla}]"""))))
        console.override("inventory", mapOf("characters" to JsonObject(patched)))
        console.override("core", mapOf("upgradeOfferingStock" to json("""{"offeringp":$stock}""")))
    }

    private fun open(item: Item, slot: Int, character: String = "Merchy", isMerchant: Boolean = true): () -> Boolean {
        var dismissed = false
        val viewModel = PartyViewModel(console.settings)
        compose.setContent {
            ItemActionPanel(ItemActionTarget.InventorySlot(item, slot), character, isMerchant = isMerchant, roster = emptyMap(), viewModel = viewModel,
                sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), onDismiss = { dismissed = true })
        }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.merchantCatalog != null && viewModel.characterDetails.value.isNotEmpty() && viewModel.dynamicState.value.upgradeOfferingStock.isNotEmpty() }
        compose.waitForIdle()
        return { dismissed }
    }

    @Test
    fun primStackPostsTargetAndMethodAndThePreviewShowsGrace() {
        setUp(
            bow = """{"id":"bow","name":"Bow","upgradeable":true,"maxLevel":12,"meta":{"definition":{"name":"Bow","stat":1,"grades":[7,10,12,13]},"upgradeable":true,"maxLevel":12}}""",
            merchyItem = """{"name":"bow","level":9,"stat_type":"dex"}""",
            stock = 3,
        )
        console.routes["upgrade-preview"] = { _ -> 200 to """{"status":"complete","result":{"options":{"none":{"preview":{"chance":0.4,"grace":2.5},"observedAt":1700000000000}}}}""" }
        val dismissed = open(Item(name = "bow", level = 9, statType = "dex"), 1)
        compose.onNodeWithText("Mark for upgrade").performScrollTo().performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Grace 2.5") and hasAnyAncestor(hasContentDescription("Upgrade chances"))).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Prim stack…").performScrollTo().performClick()
        compose.onNode(hasContentDescription("Target grace") and inDialog).assertTextContains("11")
        compose.onNode(hasText("3 Primlings in merchant inventory and storage.", substring = true) and inDialog).assertExists()
        // Level 9 against grades [7, 10, 12, 13] is grade 1: ten scrolls per stack.
        compose.onNode(hasContentDescription("Primling + 10 × Scroll of Dexterity (+1 grace each, keeps DEX)")).performScrollTo().performClick()
        compose.onNode(hasContentDescription("Target grace") and inDialog).performScrollTo().performClick()
        compose.onNode(hasText("7.5")).performClick()
        compose.onNode(hasText("Stack grace") and inDialog).performScrollTo().performClick()
        eventually { posts("prim-stack").isNotEmpty() }
        assertEquals(json("""{"character":"Merchy","slot":1,"item":{"name":"bow","level":9,"stat_type":"dex"},"target":7.5,"method":"stat"}"""), posts("prim-stack")[0])
        compose.waitUntil(5_000) { compose.onAllNodes(hasContentDescription("Prim stack")).fetchSemanticsNodes().isEmpty() }
        assertEquals(false, dismissed())
    }

    @Test
    fun primStackNeedsAMerchantItemAndAPrimlingAndAStatForTheStatMethod() {
        setUp(
            bow = """{"id":"bow","name":"Bow","upgradeable":true,"maxLevel":12,"meta":{"definition":{"name":"Bow"},"upgradeable":true,"maxLevel":12,"buyable":true}}""",
            merchyItem = """{"name":"bow","level":2}""",
            stock = 1,
        )
        open(Item(name = "bow", level = 2), 1)
        compose.onNodeWithText("Mark for upgrade").performScrollTo().performClick()
        compose.onNodeWithText("Prim stack…").performScrollTo().performClick()
        compose.onNode(hasContentDescription("Target grace") and inDialog).assertTextContains("4")
        compose.onNode(hasContentDescription("Primling + stat scroll (needs an item with an applied stat)")).assertIsNotEnabled()
        compose.onNode(hasText("1 Primling in merchant inventory and storage.", substring = true) and inDialog).assertExists()
        compose.onNode(hasText("Stack grace") and inDialog).performScrollTo().performClick()
        eventually { posts("prim-stack").isNotEmpty() }
        assertEquals(json("""{"character":"Merchy","slot":1,"item":{"name":"bow","level":2},"target":4,"method":"offering"}"""), posts("prim-stack")[0])
    }

    @Test
    fun primStackIsDisabledOnAnotherCharactersItem() {
        setUp(
            bow = """{"id":"bow","name":"Bow","upgradeable":true,"maxLevel":12,"meta":{"definition":{"name":"Bow"},"upgradeable":true,"maxLevel":12}}""",
            merchyItem = """{"name":"bow","level":2}""",
            stock = 1,
            folla = """{"name":"bow","level":2}""",
        )
        open(Item(name = "bow", level = 2), 0, character = "Folla", isMerchant = false)
        compose.onNodeWithText("Mark for upgrade").performScrollTo().performClick()
        compose.onNodeWithText("Prim stack…").performScrollTo().assertIsNotEnabled()
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

    @Test
    fun ryanV140OffersNoPrimStackAndNoGrace() {
        console.ryanV140()
        setUp(
            bow = """{"id":"bow","name":"Bow","upgradeable":true,"maxLevel":12,"meta":{"definition":{"name":"Bow","stat":1,"grades":[7,10,12,13]},"upgradeable":true,"maxLevel":12}}""",
            merchyItem = """{"name":"bow","level":9,"stat_type":"dex"}""",
            stock = 3,
        )
        console.routes["upgrade-preview"] = { _ -> 200 to """{"status":"complete","result":{"options":{"none":{"preview":{"chance":0.4,"grace":2.5},"observedAt":1700000000000}}}}""" }
        open(Item(name = "bow", level = 9, statType = "dex"), 1)
        compose.onNodeWithText("Mark for upgrade").performScrollTo().performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("40.00%") and hasAnyAncestor(hasContentDescription("Upgrade chances"))).fetchSemanticsNodes().isNotEmpty() }
        compose.onNode(hasText("Grace", substring = true) and hasAnyAncestor(hasContentDescription("Upgrade chances"))).assertDoesNotExist()
        compose.onNodeWithText("Prim stack…").assertDoesNotExist()
    }
}
