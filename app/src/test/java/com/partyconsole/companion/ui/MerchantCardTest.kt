package com.partyconsole.companion.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.characterdetail.sections.MerchantControlsSection
import com.partyconsole.companion.ui.characterdetail.sections.MerchantQueueSection
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

/** merchant-card.spec.ts / merchant-queue.spec.ts on the native merchant card. */
@RunWith(RobolectricTestRunner::class)
class MerchantCardTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun posts(path: String) = console.requests.filter { it.method == "POST" && it.path == "/party-api/$path" }.map { Json.parseToJsonElement(it.body).jsonObject }

    private fun show(viewModel: PartyViewModel) {
        compose.setContent {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                MerchantQueueSection(viewModel)
                MerchantControlsSection(viewModel, onOpenCommerce = {}, onOpenRoutines = {})
            }
        }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.merchantQueue.isNotEmpty() }
        compose.waitForIdle()
    }

    @Test
    fun anAutomaticJobsCancelAsksFirstAndFishingCannotBeCancelled() {
        val viewModel = PartyViewModel(console.settings)
        show(viewModel)
        // j1 (automatic exchange) and j2 (Ponty purchase) can be cancelled; j3 (fishing) can't.
        assertEquals(1, compose.onAllNodesWithContentDescription("Cancel job and disable routine").fetchSemanticsNodes().size)
        assertEquals(1, compose.onAllNodesWithContentDescription("Cancel and undo pending intent").fetchSemanticsNodes().size)
        compose.onAllNodesWithContentDescription("Cancel job and disable routine")[0].performClick()
        compose.onNodeWithText("Cancel Automatic exchange?").assertExists()
        assertEquals(0, posts("merchant/job/cancel").size)
        compose.onNodeWithText("Confirm").performClick()
        eventually { posts("merchant/job/cancel").size == 1 }
        assertEquals("j1", (posts("merchant/job/cancel")[0]["id"] as JsonPrimitive).content)
    }

    @Test
    fun sendToPartyPicksAGroupWhenThereIsMoreThanOne() {
        val viewModel = PartyViewModel(console.settings)
        show(viewModel)
        eventually { viewModel.characters.value.size == 4 }
        compose.waitForIdle()
        compose.onNodeWithText("Send to party").performScrollTo().performClick()
        compose.onNodeWithText("Select party group").assertExists()
        compose.onNodeWithText("Leada · Folla").performScrollTo().performClick()
        eventually { posts("bank-party").size == 1 }
        assertEquals("Leada", (posts("bank-party")[0]["group"] as JsonPrimitive).content)
    }

    @Test
    fun merchantSettingsSendTheDashboardBodies() {
        val viewModel = PartyViewModel(console.settings)
        show(viewModel)
        compose.onNodeWithText("Merchant settings").performScrollTo().performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Stand X").performScrollTo().performTextReplacement("120")
        compose.onNodeWithText("Stand Y").performScrollTo().performTextReplacement("-45.5")
        compose.onNodeWithText("Save stand location").performScrollTo().performClick()
        eventually { posts("merchant/stand-location").size == 1 }
        assertEquals(JsonObject(mapOf("map" to JsonPrimitive("main"), "x" to JsonPrimitive(120.0), "y" to JsonPrimitive(-45.5))), posts("merchant/stand-location")[0])

        // The fixture has withdrawals off; ticking it posts only that toggle.
        compose.onNodeWithText("Marked withdrawals create merchant jobs").performScrollTo().performClick()
        eventually { posts("merchant/routine-priorities").isNotEmpty() }
        val body = posts("merchant/routine-priorities")[0]
        assertEquals(JsonObject(emptyMap()), body["priorities"])
        assertEquals(JsonObject(mapOf("withdrawals" to JsonPrimitive(true))), body["enabled"])
    }

    @Test
    fun activityOpensWithItsEntries() {
        val viewModel = PartyViewModel(console.settings)
        show(viewModel)
        eventually { viewModel.dynamicState.value.merchantActivity.isNotEmpty() }
        compose.onNodeWithText("▸ ACTIVITY").performScrollTo().performClick()
        compose.onNodeWithText("Sold 2 × hpot0 at stand (+40 gold)", substring = true).assertExists()
    }
}
