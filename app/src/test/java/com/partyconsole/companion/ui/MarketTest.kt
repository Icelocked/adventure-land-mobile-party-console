package com.partyconsole.companion.ui

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.assertIsNotEnabled
import com.partyconsole.companion.domain.alDataListing
import com.partyconsole.companion.domain.groupAlData
import com.partyconsole.companion.domain.groupPonty
import com.partyconsole.companion.domain.pontyListing
import com.partyconsole.companion.domain.priceComparison
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.account.MarketScreen
import com.partyconsole.companion.ui.account.MarketplaceSettingsScreen
import com.partyconsole.companion.ui.account.StandScreen
import com.partyconsole.companion.ui.account.WtbScreen
import com.partyconsole.companion.ui.components.WtbDialog
import com.partyconsole.companion.ui.itemicon.rememberCatalogLookup
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import kotlinx.serialization.json.Json
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

/** market.spec.ts / wtb.spec.ts / marketplace-settings.spec.ts on the native screens. */
@RunWith(RobolectricTestRunner::class)
class MarketTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun posts(path: String) = console.requests.filter { it.method == "POST" && it.path == "/party-api/$path" }.map { Json.parseToJsonElement(it.body).jsonObject }
    private fun JsonObject.text(key: String) = (this[key] as? JsonPrimitive)?.content
    private val fresh get() = System.currentTimeMillis() + 600_000

    private fun listing(key: String, extra: String = "") = Json.parseToJsonElement(
        """{"key":"$key","source":"aldata","seller":"Seller1","serverRegion":"US","serverIdentifier":"I","map":"main","seenAt":$fresh,"item":{"name":"bow","level":0},"price":200,"quantity":3$extra}""",
    ).jsonObject

    @Test
    fun marketHelpersGroupAndCompareLikeTheDashboard() {
        val grouped = groupAlData(listOf(alDataListing(listing("a")), alDataListing(listing("b")), alDataListing(listing("c", ""","seller":"Seller2""""))))
        assertEquals(2, grouped.size)
        assertEquals(6, grouped[0].quantity)
        assertEquals("a|b", grouped[0].key)
        assertEquals("deal · 60% off", priceComparison(40.0, 100.0).comparison)
        assertEquals("400% above", priceComparison(5000.0, 1000.0).comparison)
        assertTrue(priceComparison(5000.0, 1000.0).badDeal)

        val now = System.currentTimeMillis()
        val ponty = listOf(
            """{"key":"p-1","groupKey":"g","item":{"name":"ironore"},"unitPrice":100,"quantity":3,"serverRegion":"US","serverIdentifier":"I","seenAt":$now}""",
            """{"key":"p-2","groupKey":"g","item":{"name":"ironore"},"unitPrice":110,"quantity":2,"serverRegion":"EU","serverIdentifier":"I","seenAt":$now}""",
            """{"key":"p-3","item":{"name":"wcoat"},"unitPrice":900,"quantity":1,"serverRegion":"US","serverIdentifier":"I","seenAt":1}""",
        ).map { pontyListing(Json.parseToJsonElement(it).jsonObject) }
        val groups = groupPonty(ponty, "", now) { null }
        val ore = groups.first { it.item.name == "ironore" }
        assertEquals(5, ore.quantity)
        assertEquals(110L, ore.unitPrice)
        assertEquals(2, ore.minimumLot)
        assertEquals(listOf("p-1", "p-2"), ore.keys)
        assertEquals(2, ore.realms.size)
        assertTrue(groups.first { it.item.name == "wcoat" }.stale)
    }

    private fun showMarket(): PartyViewModel {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { MarketScreen(viewModel, onBack = {}, onOpenWtb = {}, onOpenSettings = {}, onOpenSetup = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.aldata?.merchantsUpdatedAt != null }
        compose.waitForIdle()
        return viewModel
    }

    @Test
    fun groupedBuyIsConfirmedThenSplitAcrossTheListingsAsReceived() {
        console.override("market", mapOf("aldata" to Json.parseToJsonElement("""{"auth":"NO","merchantsUpdatedAt":1,"listings":[${listing("a")},${listing("b")}]}""")))
        showMarket()
        compose.onNodeWithText("ALData publishing is not configured").assertExists()
        compose.onNodeWithText("Live WTS (2)").assertExists()
        compose.onNodeWithContentDescription("WTS Bow +0 from Seller1").assertExists()
        compose.onNodeWithText("All").performScrollTo().performClick()
        compose.onNodeWithText("Buy").performScrollTo().performClick()
        compose.onNodeWithText("Really buy 6 Bow for 1,200g?").assertExists()
        assertEquals(0, posts("merchant/aldata-order").size)
        compose.onNodeWithText("Yes").performScrollTo().performClick()
        eventually { posts("merchant/aldata-order").size == 2 }
        val bodies = posts("merchant/aldata-order")
        assertEquals(listOf("a" to "3", "b" to "3"), bodies.map { (it["listing"] as JsonObject).text("key") to it.text("buyQuantity") })
        // use-party-console.tsx buyALDataListing: the listing as received.
        assertEquals("Seller1", (bodies[0]["listing"] as JsonObject).text("seller"))
    }

    @Test
    fun ownedWtbOffersSellAfterConfirming() {
        val order = """{"key":"o1","source":"aldata","buyer":"Buyer1","serverRegion":"EU","serverIdentifier":"II","map":"main","seenAt":$fresh,"item":{"name":"wcoat","level":0},"price":2500,"quantity":2}"""
        console.override("market", mapOf("aldata" to Json.parseToJsonElement("""{"auth":"CORRECT","merchantsUpdatedAt":1,"listings":[],"buyOrders":[$order]}""")))
        val viewModel = showMarket()
        eventually { viewModel.characters.value["Merchy"]?.inventory != null }
        compose.onNodeWithText("Live WTB (1)").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("You have 1").assertExists()
        compose.onNodeWithText("Sell").performScrollTo().performClick()
        compose.onNodeWithText("Yes").performScrollTo().performClick()
        eventually { posts("merchant/aldata-sale").isNotEmpty() }
        val body = posts("merchant/aldata-sale")[0]
        assertEquals("o1", (body["order"] as JsonObject).text("key"))
        assertEquals("1", body.text("sellQuantity"))
    }

    @Test
    fun marketplaceSettingsAddsAManualBlockAndClearsAllInTwoSteps() {
        console.override("config", mapOf("merchantBlacklist" to Json.parseToJsonElement("""{"Banned||":{"seller":"Banned","reason":"manual","until":-1,"failures":0}}""")))
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { MarketplaceSettingsScreen(viewModel, onBack = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.merchantBlacklist.isNotEmpty() }
        compose.waitForIdle()
        compose.onNodeWithText("Banned").assertExists()
        compose.onNodeWithText("all regions all servers · manual · 0 strikes · blocked forever").assertExists()
        compose.onNodeWithContentDescription("Merchant name").performTextReplacement("Scammer")
        compose.onNodeWithText("Add").performClick()
        eventually { posts("merchant/blacklist").size == 1 }
        posts("merchant/blacklist")[0].let {
            assertEquals("add", it.text("action"))
            assertEquals("Scammer", it.text("seller"))
            assertEquals("60", it.text("minutes"))
        }
        compose.onNodeWithText("Clear all").performScrollTo().performClick()
        assertEquals(1, posts("merchant/blacklist").size)
        compose.onNodeWithText("Really clear all?").performClick()
        eventually { posts("merchant/blacklist").size == 2 }
        assertEquals("clear", posts("merchant/blacklist")[1].text("action"))
    }

    @Test
    fun aFullStandAsksWhichEntryToReplaceThenRetries() {
        console.failOnce["merchant/bid"] = 409 to """{"ok":false,"error":"Stand full","occupants":[{"id":"l1","itemId":"wcoat","kind":"sale","price":9000,"quantity":1}]}"""
        val viewModel = PartyViewModel(console.settings)
        compose.setContent {
            val state by viewModel.dynamicState.collectAsState()
            val catalogFor = rememberCatalogLookup(state.merchantCatalog)
            WtbDialog(viewModel, Item(name = "bow", level = 0), catalogFor("bow")?.meta, catalogFor, emptyList(), null, null, onClose = {})
        }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.merchantCatalog != null }
        compose.waitForIdle()
        compose.onNodeWithText("Maximum price").performTextReplacement("500")
        compose.onNodeWithText("Use stand").performScrollTo().performClick()
        compose.onNodeWithText("Place WTB").performScrollTo().performClick()
        eventually { posts("merchant/bid").size == 1 }
        compose.waitForIdle()
        compose.onNodeWithText("Make room for a buy order").assertExists()
        compose.onNodeWithText("Selling").assertExists()
        compose.onNodeWithText("wcoat").performClick()
        compose.onNodeWithText("Replace listing").performScrollTo().performClick()
        eventually { posts("merchant/bid").size == 2 }
        posts("merchant/bid")[1].let {
            assertEquals("l1", it.text("replaceStandEntry"))
            assertEquals("true", it.text("useStandSlot"))
            assertEquals("500", it.text("price"))
            assertEquals("false", it.text("clear"))
        }
    }

    @Test
    fun wtbListEditsOneFieldWithTheBidRevisionAndTogglesPreferencesOnly() {
        console.override("config", mapOf(
            "standBids" to Json.parseToJsonElement("""{"ringsj":{"price":500,"quantity":10,"minimumQuality":0,"revision":3},"bow":{"price":9000,"quantity":1,"minimumQuality":4,"revision":1}}"""),
            "nativeStand" to Json.parseToJsonElement("""{"offers":{"a":{"itemId":"bow","auto":true,"phase":"live","slot":"trade1"}},"problems":{"bow":"Not enough gold for this order"}}"""),
        ))
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { WtbScreen(viewModel, onBack = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.standBids.size == 2 && viewModel.dynamicState.value.merchantCatalog != null }
        compose.waitForIdle()
        compose.onNodeWithText("Bow · +4 minimum").assertExists()
        compose.onNodeWithText("Not enough gold for this order").assertExists()

        compose.onNodeWithContentDescription("Filter WTB orders").performTextReplacement("ring")
        compose.onNodeWithText("1 / 2").assertExists()
        compose.onNodeWithText("Bow · +4 minimum").assertDoesNotExist()
        compose.onNodeWithText("Clear").performClick()

        compose.onNodeWithContentDescription("Edit quantity for Ring of Strength").performClick()
        compose.onNodeWithContentDescription("Quantity for Ring of Strength").performTextReplacement("25")
        compose.onNodeWithContentDescription("Quantity for Ring of Strength").performImeAction()
        eventually { posts("merchant/bid").isNotEmpty() }
        posts("merchant/bid")[0].let {
            assertEquals("ringsj", it.text("itemId"))
            assertEquals("500", it.text("price"))
            assertEquals("25", it.text("quantity"))
            assertEquals("false", it.text("clear"))
            assertEquals("quantity", it.text("editField"))
            assertEquals("25", it.text("value"))
            assertEquals("3", it.text("bidRevision"))
        }

        // The quantity save must settle first: edits are ignored while one is in flight.
        compose.waitUntil(5_000) { compose.onAllNodesWithContentDescription("Quantity for Ring of Strength").fetchSemanticsNodes().isEmpty() }
        compose.onNodeWithContentDescription("Edit priority for Ring of Strength").performClick()
        compose.onNodeWithContentDescription("Priority for Ring of Strength").performTextReplacement("150")
        compose.onNodeWithContentDescription("Priority for Ring of Strength").performImeAction()
        compose.onNodeWithText("Priority must be 0–100 or blank.").assertExists()
        // The inline edit's Cancel (the orders' own Cancel buttons follow it).
        compose.onAllNodesWithText("Cancel")[0].performClick()
        compose.onNodeWithContentDescription("Priority for Ring of Strength").assertDoesNotExist()

        compose.onNode(hasContentDescription("Accept higher levels") and hasAnyAncestor(hasContentDescription("WTB Bow"))).performScrollTo().performClick()
        eventually { posts("merchant/bid").size == 2 }
        posts("merchant/bid")[1].let {
            assertEquals("bow", it.text("itemId"))
            assertEquals("false", it.text("acceptHigherLevels"))
            assertEquals("true", it.text("preferencesOnly"))
        }
    }

    @Test
    fun inspectStandShowsTheBuyOrderAndSavesItsPriority() {
        val inventory = console.sections.getValue("inventory")["characters"]!!.jsonObject
        val merchy = inventory.getValue("Merchy").jsonObject
        console.override("inventory", mapOf("characters" to JsonObject(inventory + ("Merchy" to JsonObject(merchy + ("slots" to Json.parseToJsonElement("""{"trade3":{"item":{"name":"bow","level":3,"price":7000,"q":5,"b":true}}}""")))))))
        console.override("config", mapOf(
            "standBids" to Json.parseToJsonElement("""{"bow":{"price":7000,"quantity":3,"minimumQuality":3,"revision":2,"priorityOverride":40}}"""),
            "standListings" to Json.parseToJsonElement("[]"),
        ))
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { StandScreen(viewModel, onBack = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.characters.value["Merchy"]?.inventory?.slots?.get("trade3") != null && viewModel.dynamicState.value.standBids.containsKey("bow") }
        compose.waitForIdle()
        compose.onNodeWithText("Buy orders · 1/16 slots").performScrollTo().assertExists()
        compose.onNodeWithText("3 wanted").assertExists()
        compose.onNodeWithText("Native batch: 5").assertExists()
        compose.onNodeWithContentDescription("Priority override").performTextReplacement("70")
        compose.onNodeWithContentDescription("Priority override").performImeAction()
        eventually { posts("merchant/bid").isNotEmpty() }
        posts("merchant/bid")[0].let {
            assertEquals("bow", it.text("itemId"))
            assertEquals("70", it.text("priorityOverride"))
            assertEquals("priorityOverride", it.text("editField"))
            assertEquals("70", it.text("value"))
            assertEquals("2", it.text("bidRevision"))
        }
    }
}
