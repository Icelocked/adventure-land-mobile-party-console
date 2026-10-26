package com.partyconsole.companion.ui

import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.hasAnyAncestor
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
import com.partyconsole.companion.testing.field
import com.partyconsole.companion.ui.account.MarketScreen
import com.partyconsole.companion.ui.characterdetail.sections.MerchantControlsSection
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** The fork's Watch list and the market filter (web/e2e/npc-shop.spec.ts and
 *  market-filter.spec.ts).
 *
 *  Failure modes:
 *  - The Watch list shows on a console without the fork shop.
 *  - The per-level prices or the total drift from npc-price.ts.
 *  - Add watch posts more or less than the PWA's body; Stop and Resume post the wrong id.
 *  - A Ponty row's Watch opens an empty form instead of the row's item and level.
 *  - The filter bar ignores a bound or the server choice.
 */
@RunWith(RobolectricTestRunner::class)
class WatchListTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun posts() = console.requests.filter { it.method == "POST" && it.path.startsWith("/party-api/npc-shop/") }
        .map { it.path.removePrefix("/party-api/") to Json.parseToJsonElement(it.body).jsonObject }
    private fun waitForText(text: String) = compose.waitUntil(5_000) { compose.onAllNodes(hasText(text, substring = true)).fetchSemanticsNodes().isNotEmpty() }
    private fun shop() {
        console.override("market", mapOf("npcShop" to Json.parseToJsonElement(
            """{"orders":[],"settings":{"goldReserve":0,"ronDonation":false,"ronVisitMinutes":10},"ron":null,"merchantRealm":"USIII","spendable":1250000}""",
        )))
        val catalog = console.sections.getValue("catalog")
        val merchant = catalog.getValue("merchantCatalog").jsonObject
        val extra = Json.parseToJsonElement(
            """[{"id":"wbook0","name":"Book of Wizardry","upgradeable":true,"meta":{"definition":{"g":1000,"upgrade":{}}}},
                {"id":"scroll0","name":"Upgrade Scroll","meta":{"definition":{"g":1000}}},
                {"id":"stramulet","name":"Amulet of Strength","compoundable":true,"meta":{"definition":{"g":5000,"compound":{},"tier":2}}},
                {"id":"coat","name":"Coat","upgradeable":true,"meta":{"definition":{"g":1000,"upgrade":{},"tier":1}}}]""",
        ).jsonArray
        console.override("catalog", mapOf("merchantCatalog" to JsonObject(merchant + ("allItems" to JsonArray(merchant.getValue("allItems").jsonArray + extra)))))
    }

    private fun merchantControls(): PartyViewModel {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { MerchantControlsSection(viewModel, onOpenCommerce = {}, onOpenRoutines = {}) }
        // The paused main looper holds the poll loop's delay until its clock moves on.
        eventually(20_000) {
            org.robolectric.shadows.ShadowLooper.idleMainLooper(500, java.util.concurrent.TimeUnit.MILLISECONDS)
            viewModel.stateLoaded.value && viewModel.dynamicState.value.merchantCatalog != null && viewModel.dynamicState.value.stateKeys.contains("ponty")
        }
        compose.waitForIdle()
        return viewModel
    }

    @Test
    fun theWatchListIsHiddenOnAConsoleWithoutTheForkShop() {
        merchantControls()
        waitForText("Exchange")
        compose.onNodeWithText("Watch list").assertDoesNotExist()
    }

    @Test
    fun aWatchShowsPricesPerLevelAndTotalsThenStopAndResume() {
        shop()
        val viewModel = merchantControls()
        eventually { viewModel.dynamicState.value.npcShop != null }
        waitForText("Watch list")
        compose.onNodeWithText("Watch list").assertIsEnabled().performClick()
        waitForText("Spendable 1,250,000g")
        compose.onNodeWithContentDescription("Watch item").performTextReplacement("Book of Wizardry")
        compose.onNodeWithContentDescription("Highest level").performTextReplacement("1")
        waitForText("+0 · Ponty 1,200g · Ron 2,400g")
        waitForText("+1 · Ponty 2,200g · Ron 4,400g")
        compose.onNodeWithContentDescription("Quantity").performTextReplacement("300")
        waitForText("Estimated total 360,000 to 660,000g")
        compose.onNodeWithContentDescription("Until I stop").performClick()
        waitForText("1,200 to 2,200g per copy")
        compose.onNodeWithContentDescription("Spend cap").performTextReplacement("50000")
        compose.onNodeWithText("Add watch").performScrollTo().assertIsEnabled().performClick()
        eventually { posts().size == 1 }
        assertEquals(
            "npc-shop/orders" to Json.parseToJsonElement("""{"npc":"ponty","kind":"watch","item":"wbook0","levelMin":0,"levelMax":1,"quantity":null,"spendCap":50000}"""),
            posts()[0],
        )
        waitForText("Book of Wizardry +0 to +1 · Ponty · watch · cap 50,000g")
        waitForText("0 (until stopped) bought · 0g spent · active")

        compose.onNodeWithContentDescription("Stop Book of Wizardry watch").performScrollTo().assertIsEnabled().performClick()
        eventually { posts().size == 2 }
        val id = (console.field("npcShop")!!.jsonObject.getValue("orders").jsonArray[0].jsonObject.getValue("id")).jsonPrimitive.content
        assertEquals("npc-shop/stop" to Json.parseToJsonElement("""{"id":"$id"}"""), posts()[1])
        waitForText("0 (until stopped) bought · 0g spent · paused")
        compose.onNodeWithContentDescription("Resume Book of Wizardry watch").performScrollTo().assertIsEnabled().performClick()
        eventually { posts().size == 3 }
        assertEquals("npc-shop/resume", posts()[2].first)
        waitForText("0 (until stopped) bought · 0g spent · active")

        compose.onNodeWithContentDescription("Gold reserve").performTextReplacement("5000")
        compose.onNodeWithText("Save reserve").assertIsEnabled().performClick()
        eventually { posts().size == 4 }
        assertEquals("npc-shop/settings" to Json.parseToJsonElement("""{"goldReserve":5000}"""), posts()[3])
    }

    @Test
    fun aPontyRowWatchOpensTheWatchListPrefilledAndTheFilterNarrowsTheRows() {
        shop()
        val now = System.currentTimeMillis()
        fun ponty(rid: String, name: String, level: Int, unitPrice: Int, firstSeenAt: Long, region: String = "US", identifier: String = "III") =
            """{"key":"$region:$identifier:$rid","rid":"$rid","item":{"name":"$name","level":$level},"serverRegion":"$region","serverIdentifier":"$identifier","quantity":1,"unitPrice":$unitPrice,"price":$unitPrice,"seenAt":$now,"groupKey":"$name@$level@$unitPrice@$region","firstSeenAt":$firstSeenAt}"""
        console.override("market", mapOf("ponty" to Json.parseToJsonElement(
            """{"listings":[${ponty("a", "coat", 0, 1200, now - 60_000)},${ponty("b", "stramulet", 1, 9000, now - 10_000)},${ponty("d", "coat", 3, 1200, now, "EU", "I")}]}""",
        )))
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { MarketScreen(viewModel, onBack = {}, onOpenWtb = {}, onOpenSettings = {}, onOpenSetup = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.npcShop != null && viewModel.dynamicState.value.merchantCatalog != null }
        compose.waitForIdle()
        compose.onNode(hasText("Ponty (3)")).performScrollTo().performClick()
        val pontyRow = androidx.compose.ui.test.SemanticsMatcher("a Ponty row") { node ->
            node.config.getOrNull(androidx.compose.ui.semantics.SemanticsProperties.ContentDescription).orEmpty().any { it.startsWith("Ponty ") && !it.startsWith("Ponty quantity") }
        }
        val rows = { compose.onAllNodes(pontyRow).fetchSemanticsNodes().size }
        compose.waitUntil(5_000) { rows() == 3 }
        compose.onNodeWithContentDescription("Server: All servers").performScrollTo().performClick()
        compose.onNodeWithText("EU I").performClick()
        compose.waitUntil(5_000) { rows() == 1 }
        compose.onNodeWithText("Clear filter").performScrollTo().performClick()
        compose.waitUntil(5_000) { rows() == 3 }
        compose.onNodeWithContentDescription("Minimum level").performTextReplacement("1")
        compose.waitUntil(5_000) { rows() == 2 }
        compose.onNodeWithText("Clear filter").performScrollTo().performClick()

        compose.onNodeWithContentDescription("Watch Amulet of Strength").performScrollTo().performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(hasContentDescription("Watch list")).fetchSemanticsNodes().isNotEmpty() }
        val inSheet = hasAnyAncestor(hasContentDescription("Watch list"))
        compose.onNode(hasContentDescription("Watch item") and inSheet).assert(hasText("Amulet of Strength"))
        compose.onNode(hasContentDescription("Lowest level") and inSheet).assert(hasText("1"))
        compose.onNode(hasContentDescription("Highest level") and inSheet).assert(hasText("1"))
    }
}
