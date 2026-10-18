package com.partyconsole.companion.ui

import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.ryanV140
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.account.WtbScreen
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Console 1.4 unconfirmed WTB purchases (web/e2e/console14-wtb-prim-keep.spec.ts,
 *  wtb-unconfirmed-purchase.tsx) on the native WTB screen.
 *
 *  Failure modes:
 *  - A purchase whose merchant job ended unconfirmed stays invisible, so
 *    the paused WTB looks stuck for no reason.
 *  - The notice shows on the wrong item's order.
 *  - The answer posts without `action`, the purchase id or a boolean
 *    `bought`, so the server can't settle it.
 *  - A refused answer hides the server's message, or the notice lingers
 *    after the purchase is settled.
 */
@RunWith(RobolectricTestRunner::class)
class WtbUnconfirmedPurchaseTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun posts(path: String) = console.requests.filter { it.method == "POST" && it.path == "/party-api/$path" }.map { Json.parseToJsonElement(it.body).jsonObject }
    private val notice = hasContentDescription("Unconfirmed purchase of Health Potion")

    private fun show(id: String): PartyViewModel {
        console.override("config", mapOf(
            "standBids" to Json.parseToJsonElement("""{"hpot0":{"price":500,"quantity":10,"minimumQuality":0,"revision":1},"bow":{"price":9000,"quantity":1,"minimumQuality":0,"revision":1}}"""),
            "nativeStand" to Json.parseToJsonElement("""{"offers":{},"problems":{},"purchases":{"$id":{"item":{"name":"hpot0","price":480},"quantity":4,"jobId":"native-buy-7"}}}"""),
        ))
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { WtbScreen(viewModel, onBack = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.standBids.size == 2 && viewModel.dynamicState.value.merchantCatalog != null }
        compose.waitForIdle()
        return viewModel
    }

    @Test
    fun thePausedOrderSaysWhatHappenedAndResolvesThroughNativeStand() {
        val id = "native-buy-7:Seller:hpot0"
        show(id)
        compose.onNode(hasText("Purchase outcome unconfirmed: 4 × Health Potion at 480 from Seller. The merchant job ended before reporting it, so this WTB is paused.") and hasAnyAncestor(notice)).performScrollTo().assertExists()
        compose.onNode(hasContentDescription("Unconfirmed purchase of Bow")).assertDoesNotExist()
        compose.onNode(hasText("It was bought") and hasAnyAncestor(notice)).performScrollTo().performClick()
        eventually { posts("merchant/native-stand").isNotEmpty() }
        assertEquals(Json.parseToJsonElement("""{"action":"resolve-purchase","id":"$id","bought":true}"""), posts("merchant/native-stand")[0])
        compose.waitUntil(5_000) { compose.onAllNodes(notice).fetchSemanticsNodes().isEmpty() }
    }

    @Test
    fun itWasntBoughtSendsFalseAndARefusalStaysVisible() {
        val id = "native-buy-8:Seller:hpot0"
        console.failOnce["merchant/native-stand"] = 409 to """{"error":"That purchase is still in progress"}"""
        show(id)
        compose.onNode(hasText("It wasn't bought") and hasAnyAncestor(notice)).performScrollTo().performClick()
        eventually { posts("merchant/native-stand").isNotEmpty() }
        assertEquals(Json.parseToJsonElement("""{"action":"resolve-purchase","id":"$id","bought":false}"""), posts("merchant/native-stand")[0])
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("That purchase is still in progress") and hasAnyAncestor(notice)).fetchSemanticsNodes().isNotEmpty() }
    }

    @Test
    fun ryanV140ShowsNoResolveControl() {
        console.ryanV140()
        show("native-buy-7:Seller:hpot0")
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Health Potion", substring = true)).fetchSemanticsNodes().isNotEmpty() }
        compose.onNode(notice).assertDoesNotExist()
    }
}
