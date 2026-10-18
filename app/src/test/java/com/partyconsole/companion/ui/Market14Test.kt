package com.partyconsole.companion.ui

import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.key
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.ryanV140
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.account.MarketScreen
import com.partyconsole.companion.ui.account.MarketplaceSettingsScreen
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Console 1.4 market preferences and stale checks
 *  (web/e2e/console14-merchant-market.spec.ts: Market ignored items, ALData
 *  Check for stale listings) on the native market screens.
 *
 *  Failure modes:
 *  - The ignore post leaves out the level, so +0 and missing levels save
 *    as different identities.
 *  - An ignored item still shows on another tab, or a refused ignore hides
 *    the listing anyway and hides the server's message.
 *  - The settings list starts expanded, removes the wrong identity, or
 *    "Clear all" posts without the forced level 0.
 *  - "Hide stale listings" is shared by every tab, or forgets its value
 *    when the market opens again.
 *  - A stale listing offers no Check, or Check posts without check: true
 *    and the server refuses it as stale.
 *  - Check buys or sells a quantity other than the whole listing (WTS) or
 *    everything the merchant owns up to the order (WTB).
 *  - A refused Check closes the confirmation and hides the server's message.
 */
@RunWith(RobolectricTestRunner::class)
class Market14Test {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun posts(path: String) = console.requests.filter { it.method == "POST" && it.path == "/party-api/$path" }.map { Json.parseToJsonElement(it.body).jsonObject }
    private fun json(text: String): JsonElement = Json.parseToJsonElement(text)
    private val fresh get() = System.currentTimeMillis() + 600_000
    private fun listing(key: String, extra: String = "") =
        """{"key":"$key","source":"aldata","seller":"Seller1","serverRegion":"US","serverIdentifier":"I","map":"main","seenAt":$fresh,"item":{"name":"ironore","level":0},"price":40,"quantity":3$extra}"""
    private val coat = ""","seller":"Seller2","item":{"name":"wcoat","level":0},"price":900,"quantity":1"""
    private fun group(name: String) = hasContentDescription(name)

    @Before fun catalog() {
        val catalog = console.sections.getValue("catalog")["merchantCatalog"]!!.jsonObject
        val items = (catalog["allItems"] as JsonArray) + json("""{"id":"ironore","name":"Iron Ore","meta":{"definition":{"name":"Iron Ore","g":100}}}""") +
            json("""{"id":"wcoat","name":"Wolf Coat","meta":{"definition":{"name":"Wolf Coat","g":1000}}}""")
        console.override("catalog", mapOf("merchantCatalog" to JsonObject(catalog + ("allItems" to JsonArray(items)))))
    }

    private fun aldata(listings: String = "", buyOrders: String = "") =
        console.override("market", mapOf("aldata" to json("""{"auth":"CORRECT","merchantsUpdatedAt":1,"listings":[$listings],"buyOrders":[$buyOrders]}""")))

    private var screen by mutableIntStateOf(0)

    private fun showMarket(): PartyViewModel {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { key(screen) { MarketScreen(viewModel, onBack = {}, onOpenWtb = {}, onOpenSettings = {}, onOpenSetup = {}) } }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.aldata?.merchantsUpdatedAt != null && viewModel.dynamicState.value.merchantCatalog != null }
        compose.waitForIdle()
        return viewModel
    }

    @Test
    fun ignoringAListingPostsItsIdentityAndHidesIt() {
        aldata(listing("a") + "," + listing("c", coat))
        showMarket()
        compose.onNodeWithContentDescription("Ignore listings of Iron Ore").performScrollTo().performClick()
        eventually { posts("market/ignored-items").isNotEmpty() }
        // stand-sheet.tsx updateIgnored spreads the listing item and forces level.
        assertEquals(json("""{"action":"add","name":"ironore","level":0}"""), posts("market/ignored-items")[0])
        compose.waitUntil(5_000) { compose.onAllNodes(group("WTS Iron Ore from Seller1")).fetchSemanticsNodes().isEmpty() }
        compose.onNode(group("WTS Wolf Coat from Seller2")).assertExists()
    }

    @Test
    fun aRefusedIgnoreShowsItsErrorAndKeepsTheListing() {
        aldata(listing("a"))
        console.failOnce["market/ignored-items"] = 400 to """{"error":"The ignored-item list is full; remove an entry first"}"""
        showMarket()
        compose.onNodeWithContentDescription("Ignore listings of Iron Ore").performScrollTo().performClick()
        eventually { posts("market/ignored-items").isNotEmpty() }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("The ignored-item list is full; remove an entry first")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNode(group("WTS Iron Ore from Seller1")).assertExists()
    }

    @Test
    fun theSettingsListIsCollapsedRemovesEntriesAndClearsWithLevelZero() {
        console.override("config", mapOf("marketIgnoredItems" to json("""[{"name":"ironore","level":0}]""")))
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { MarketplaceSettingsScreen(viewModel, onBack = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.merchantCatalog != null }
        compose.waitForIdle()
        val section = hasAnyAncestor(hasContentDescription("Ignored items") and SemanticsMatcher.keyNotDefined(SemanticsProperties.Role))
        compose.onNode(hasText("(1)", substring = true) and section).assertExists()
        // Collapsed by default, like market-preferences.tsx.
        compose.onNode(hasText("Iron Ore") and section).assertDoesNotExist()
        compose.onNode(hasContentDescription("Ignored items") and SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button)).performClick()
        compose.onNodeWithContentDescription("Remove Iron Ore from ignored items").performClick()
        eventually { posts("market/ignored-items").isNotEmpty() }
        assertEquals(json("""{"action":"remove","name":"ironore","level":0}"""), posts("market/ignored-items")[0])
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("No ignored items.")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithContentDescription("Clear all ignored items").assertIsNotEnabled()

        console.override("config", mapOf("marketIgnoredItems" to json("""[{"name":"wcoat","level":2},{"name":"ironore","level":0}]""")))
        compose.onNodeWithContentDescription("Refresh").performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Wolf Coat +2")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNode(hasText("(2)", substring = true) and section).assertExists()
        compose.onNodeWithContentDescription("Clear all ignored items").performClick()
        eventually { posts("market/ignored-items").size == 2 }
        assertEquals(json("""{"action":"clear","level":0}"""), posts("market/ignored-items")[1])
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("(0)", substring = true) and section).fetchSemanticsNodes().isNotEmpty() }
    }

    @Test
    fun ignoredItemsStayHiddenOnEveryTabAndHideStaleIsPerTabAndRemembered() {
        console.override("config", mapOf("marketIgnoredItems" to json("""[{"name":"ironore","level":0}]""")))
        aldata(
            listing("a") + "," + listing("c", "$coat,\"seenAt\":1"),
            """{"key":"w1","buyer":"Buyer1","serverRegion":"US","serverIdentifier":"I","map":"main","seenAt":$fresh,"price":30,"quantity":5,"item":{"name":"ironore","level":0}},
               {"key":"w2","buyer":"Buyer2","serverRegion":"US","serverIdentifier":"I","map":"main","seenAt":1,"price":900,"quantity":1,"item":{"name":"wcoat","level":0}}""",
        )
        showMarket()
        compose.onNode(group("WTS Iron Ore from Seller1")).assertDoesNotExist()
        compose.onNode(group("WTS Wolf Coat from Seller2")).performScrollTo().assertExists()
        val hideStale = compose.onNodeWithContentDescription("Hide stale listings")
        hideStale.performScrollTo().performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(group("WTS Wolf Coat from Seller2")).fetchSemanticsNodes().isEmpty() }

        // Opening the market again keeps the tab's choice.
        screen++
        compose.waitForIdle()
        compose.onNodeWithContentDescription("Hide stale listings").assertIsOn()
        compose.onNode(group("WTS Wolf Coat from Seller2")).assertDoesNotExist()

        compose.onNode(hasText("Live WTB", substring = true)).performClick()
        compose.waitForIdle()
        compose.onNodeWithContentDescription("Hide stale listings").assertIsOff()
        compose.onNode(group("WTB Iron Ore from Buyer1")).assertDoesNotExist()
        compose.onNode(group("WTB Wolf Coat from Buyer2")).performScrollTo().assertExists()
    }

    @Test
    fun aStaleWtsListingOffersCheckWhichBuysWithCheckTrue() {
        aldata(listing("c", "$coat,\"price\":5000,\"seenAt\":1"))
        showMarket()
        val row = hasAnyAncestor(group("WTS Wolf Coat from Seller2"))
        compose.onNode(hasText("Buy") and row).assertDoesNotExist()
        compose.onNode(hasText("Make WTB") and row).assertExists()
        compose.onNode(hasText("Check") and row).performScrollTo().performClick()
        compose.onNode(hasText("Send the merchant to check whether Seller2's listing for Wolf Coat is still live, and buy up to 1 for 5,000g each if so? If the listing is gone, this fails safely and reports back in merchant activity.")).assertExists()
        compose.onNode(hasText("Yes") and hasAnyAncestor(group("Check stale listing"))).performScrollTo().performClick()
        eventually { posts("merchant/aldata-order").isNotEmpty() }
        val body = posts("merchant/aldata-order")[0]
        assertEquals(JsonPrimitive("c"), (body["listing"] as JsonObject)["key"])
        assertEquals(JsonPrimitive(1), body["buyQuantity"])
        assertEquals(JsonPrimitive(true), body["check"])
        compose.waitUntil(5_000) { compose.onAllNodes(group("Check stale listing")).fetchSemanticsNodes().isEmpty() }
    }

    @Test
    fun aRefusedCheckKeepsTheConfirmationOpenWithItsError() {
        aldata(listing("c", "$coat,\"price\":5000,\"seenAt\":1"))
        console.failOnce["merchant/aldata-order"] = 409 to """{"error":"ALData listing is no longer in the market snapshot"}"""
        showMarket()
        compose.onNode(hasText("Check") and hasAnyAncestor(group("WTS Wolf Coat from Seller2"))).performScrollTo().performClick()
        compose.onNode(hasText("Yes") and hasAnyAncestor(group("Check stale listing"))).performScrollTo().performClick()
        eventually { posts("merchant/aldata-order").isNotEmpty() }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("ALData listing is no longer in the market snapshot") and hasAnyAncestor(group("Check stale listing"))).fetchSemanticsNodes().isNotEmpty() }
    }

    @Test
    fun aStaleWtbOfferForAnOwnedItemOffersCheckAndListAndCheckSellsWithCheckTrue() {
        aldata(buyOrders = """{"key":"w1","buyer":"Buyer1","serverRegion":"US","serverIdentifier":"I","map":"main","seenAt":1,"price":900,"quantity":2,"item":{"name":"wcoat","level":0}}""")
        val viewModel = showMarket()
        eventually { viewModel.characters.value["Merchy"]?.inventory != null }
        compose.onNode(hasText("Live WTB", substring = true)).performClick()
        compose.waitForIdle()
        val row = hasAnyAncestor(group("WTB Wolf Coat from Buyer1"))
        compose.onNode(hasText("Sell") and row).assertDoesNotExist()
        compose.onNode(hasText("List") and row).performScrollTo().assertExists()
        compose.onNode(hasText("Check") and row).performClick()
        compose.onNode(hasText("Send the merchant to check whether Buyer1's WTB listing for Wolf Coat is still live, and sell up to 1 for 900g each if so?", substring = true)).assertExists()
        compose.onNode(hasText("Yes") and hasAnyAncestor(group("Check stale WTB listing"))).performScrollTo().performClick()
        eventually { posts("merchant/aldata-sale").isNotEmpty() }
        val body = posts("merchant/aldata-sale")[0]
        assertEquals(JsonPrimitive("w1"), (body["order"] as JsonObject)["key"])
        assertEquals(JsonPrimitive(1), body["sellQuantity"])
        assertEquals(JsonPrimitive(true), body["check"])
    }

    @Test
    fun ryanV140OffersNoCheckAndSortsWtbOffersFreshFirst() {
        console.ryanV140()
        aldata(
            listing("c", "$coat,\"price\":5000,\"seenAt\":1"),
            buyOrders = """{"key":"w1","buyer":"Buyer1","serverRegion":"US","serverIdentifier":"I","map":"main","seenAt":1,"price":900,"quantity":2,"item":{"name":"wcoat","level":0}},
                {"key":"w2","buyer":"Buyer1","serverRegion":"US","serverIdentifier":"I","map":"main","seenAt":$fresh,"price":900,"quantity":2,"item":{"name":"ironore","level":0}}""",
        )
        showMarket()
        val row = hasAnyAncestor(group("WTS Wolf Coat from Seller2"))
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Make WTB") and row).fetchSemanticsNodes().isNotEmpty() }
        compose.onNode(hasText("Check") and row).assertDoesNotExist()
        compose.onNode(hasText("Live WTB", substring = true)).performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(group("WTB Wolf Coat from Buyer1")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNode(hasText("Check") and hasAnyAncestor(group("WTB Wolf Coat from Buyer1"))).assertDoesNotExist()
        // The fresh offer for an unowned item stays ahead of the stale owned one.
        val offers = compose.onAllNodes(hasContentDescription("WTB ", substring = true)).fetchSemanticsNodes().map { it.config[androidx.compose.ui.semantics.SemanticsProperties.ContentDescription].first() }
        assertEquals(listOf("WTB Iron Ore from Buyer1", "WTB Wolf Coat from Buyer1"), offers.filter { it.startsWith("WTB ") && " from " in it })
    }
}
