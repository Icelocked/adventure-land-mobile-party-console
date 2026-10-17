package com.partyconsole.companion.ui

import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.account.StandScreen
import com.partyconsole.companion.ui.characterdetail.CharacterDetailScreen
import com.partyconsole.companion.ui.itempanel.ItemActionPanel
import com.partyconsole.companion.ui.itempanel.ItemActionTarget
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Console 1.4 exchanges for every party member, the "Auto NPC" tile label,
 *  the dropped "Buy another level 0" and the stand's level labels
 *  (web/e2e/console14-merchant-market.spec.ts One-off Exchange,
 *  item-write-paths.spec.ts, bank-item-banners.spec.ts).
 *
 *  Failure modes:
 *  - Exchange and Auto exchange stay merchant-only, though console 1.4 runs
 *    them for any party member once a merchant is configured.
 *  - Exchange posts without the whole item or the bag slot, so the server
 *    can't check the stack.
 *  - A refused Exchange closes the options and hides the server's message.
 *  - An item already under an auto exchange rule offers the rule again, or
 *    a party member's tile hides the rule's banner.
 *  - Exchanges are offered with no merchant configured.
 *  - A per-player automatic NPC sale reads "NPC sale" like a manual mark.
 *  - "Buy another level 0" is still offered (console 1.4 dropped it).
 *  - A stand buy order shows "+0" on an item that has no levels.
 */
@OptIn(ExperimentalMaterial3Api::class)
@RunWith(RobolectricTestRunner::class)
class ItemExchangeTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun posts(path: String) = console.requests.filter { it.method == "POST" && it.path == "/party-api/$path" }.map { Json.parseToJsonElement(it.body).jsonObject }
    private fun json(text: String): JsonElement = Json.parseToJsonElement(text)
    private val button = SemanticsMatcher.expectValue(SemanticsProperties.Role, androidx.compose.ui.semantics.Role.Button)

    @Before fun catalog() {
        val catalog = console.sections.getValue("catalog")["merchantCatalog"]!!.jsonObject
        val items = (catalog["allItems"] as JsonArray) + json("""{"id":"gem0","name":"Green Gem","meta":{"definition":{"name":"Green Gem","e":1}}}""") +
            json("""{"id":"elixirluck","name":"Luck Elixir","meta":{"definition":{"name":"Luck Elixir","type":"elixir"},"buyable":true}}""")
        console.override("catalog", mapOf("merchantCatalog" to JsonObject(catalog + ("allItems" to JsonArray(items)))))
        val inventory = console.sections.getValue("inventory")["characters"]!!.jsonObject
        val leada = inventory.getValue("Leada").jsonObject
        console.override("inventory", mapOf("characters" to JsonObject(inventory + ("Leada" to JsonObject(leada + ("items" to json("""[{"slot":0,"item":{"name":"gem0","q":3}},{"slot":1,"item":{"name":"ironore","q":5}},{"slot":2,"item":{"name":"elixirluck"}}]""")))))))
    }

    private fun panel(item: Item, slot: Int, dismissed: () -> Unit = {}): PartyViewModel {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent {
            ItemActionPanel(ItemActionTarget.InventorySlot(item, slot), "Leada", isMerchant = false, roster = emptyMap(), viewModel = viewModel,
                sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), onDismiss = dismissed)
        }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.merchantCatalog != null && viewModel.characterDetails.value.isNotEmpty() }
        compose.waitForIdle()
        return viewModel
    }

    @Test
    fun aPartyMembersExchangeableItemOffersExchangeWhichPostsTheWholeItemAndSlot() {
        var dismissed = false
        panel(Item(name = "gem0", q = 3), 0) { dismissed = true }
        compose.onNode(hasText("Auto exchange") and button).performScrollTo().assertIsEnabled()
        compose.onNode(hasText("Exchange") and button).performScrollTo().performClick()
        eventually { posts("command").isNotEmpty() }
        assertEquals(json("""{"type":"exchange","character":"Leada","item":{"name":"gem0","q":3},"slot":0}"""), posts("command")[0])
        eventually { dismissed }
    }

    @Test
    fun aRefusedExchangeKeepsTheOptionsOpenWithTheError() {
        console.failOnce["command"] = 409 to """{"error":"this item is protected or reserved"}"""
        var dismissed = false
        panel(Item(name = "gem0", q = 3), 0) { dismissed = true }
        compose.onNode(hasText("Exchange") and button).performScrollTo().performClick()
        eventually { posts("command").isNotEmpty() }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("this item is protected or reserved")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNode(hasText("Exchange") and button).assertExists()
        assertTrue(!dismissed)
    }

    @Test
    fun anAutoExchangeRuleMarksTheTileAndDisablesTheRule() {
        console.override("config", mapOf("autoExchanges" to json("""{"gem0@0":{"name":"gem0","level":0}}""")))
        panel(Item(name = "gem0", q = 3), 0)
        compose.onNode(hasText("Auto exchange") and button).performScrollTo().assertIsNotEnabled()
    }

    @Test
    fun withoutAMerchantNoExchangeIsOfferedAndBuyAnotherIsGone() {
        console.override("config", mapOf("merchantCharacter" to JsonNull))
        panel(Item(name = "gem0", q = 3), 0)
        compose.onNodeWithText("Mark for bank").performScrollTo().assertExists()
        compose.onNode(hasText("Exchange") and button).assertDoesNotExist()
        compose.onNode(hasText("Auto exchange") and button).assertDoesNotExist()
    }

    @Test
    fun buyAnotherLevelZeroIsNoLongerOffered() {
        panel(Item(name = "elixirluck"), 2)
        compose.onNodeWithText("Mark for bank").performScrollTo().assertExists()
        compose.onNodeWithText("Buy another level 0").assertDoesNotExist()
    }

    @Test
    fun partyTilesShowAutoExchangeAndAutoNpcForAutomaticRules() {
        val saleKey = """{"name":"ironore","level":0,"p":null,"stat_type":null}"""
        console.override("config", mapOf(
            "autoExchanges" to json("""{"gem0@0":{"name":"gem0","level":0}}"""),
            "autoNpcSales" to JsonObject(mapOf(JsonArray(listOf(JsonPrimitive("Leada"), JsonPrimitive(saleKey))).toString() to json("""{"item":{"name":"ironore","level":0},"character":"Leada"}"""))),
        ))
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { CharacterDetailScreen(viewModel, "Leada", onBack = {}, onSwitchCharacter = {}, onNavigate = {}, onOpenMerchantCommerce = {}, onOpenRoutines = {}, onOpenHuntSettings = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.characters.value["Leada"]?.inventory?.items?.size == 3 && viewModel.dynamicState.value.merchantCatalog != null }
        compose.waitForIdle()
        compose.onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsProperties.VerticalScrollAxisRange))[0].performScrollToNode(hasText("▾ Inventory"))
        compose.onNodeWithContentDescription("Green Gem").assert(hasText("Auto exchange"))
        compose.onNodeWithContentDescription("ironore").assert(hasText("Auto NPC"))
    }

    @Test
    fun standBuyOrdersShowALevelOnlyForItemsThatHaveLevels() {
        val inventory = console.sections.getValue("inventory")["characters"]!!.jsonObject
        val merchy = inventory.getValue("Merchy").jsonObject
        console.override("inventory", mapOf("characters" to JsonObject(inventory + ("Merchy" to JsonObject(merchy + ("slots" to json(
            """{"trade3":{"item":{"name":"hpot0","price":20,"q":50,"b":true}},"trade4":{"item":{"name":"bow","level":3,"price":7000,"q":1,"b":true}}}""",
        )))))))
        console.override("config", mapOf(
            "standBids" to json("""{"hpot0":{"price":20,"quantity":50,"minimumQuality":0,"revision":1},"bow":{"price":7000,"quantity":1,"minimumQuality":3,"revision":1}}"""),
            "standListings" to json("[]"),
        ))
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { StandScreen(viewModel, onBack = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.standBids.size == 2 && viewModel.dynamicState.value.merchantCatalog != null && viewModel.characters.value["Merchy"]?.inventory?.slots?.get("trade4") != null }
        compose.waitForIdle()
        compose.onNode(hasContentDescription("Buy order Health Potion")).performScrollTo()
        compose.onNode(hasText("Health Potion +0")).assertDoesNotExist()
        compose.onNode(hasText("Health Potion") and androidx.compose.ui.test.hasAnyAncestor(hasContentDescription("Buy order Health Potion"))).assertExists()
        compose.onNode(hasText("Bow +3")).assertExists()
    }
}
