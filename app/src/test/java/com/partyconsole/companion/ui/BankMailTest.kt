package com.partyconsole.companion.ui

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import com.partyconsole.companion.model.InventoryEntry
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.account.MailScreen
import com.partyconsole.companion.ui.itempanel.BankItemPanel
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

/** bank.spec.ts / mail compose behaviour on the native screens. */
@RunWith(RobolectricTestRunner::class)
class BankMailTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun posts(path: String) = console.requests.filter { it.method == "POST" && it.path == "/party-api/$path" }.map { Json.parseToJsonElement(it.body).jsonObject }

    @Test
    fun withdrawGoesThroughTheMerchantAndAsksBeforeDroppingAnAutoBankMark() {
        console.failOnce["command"] = 409 to """{"ok":false,"error":"Item is automatically marked for bank","code":"auto_bank_confirmation_required"}"""
        val viewModel = PartyViewModel(console.settings)
        val entry = InventoryEntry(slot = 0, item = Item(name = "bow", level = 5))
        var closed = false
        compose.setContent { BankItemPanel(viewModel, "items0", entry) { closed = true } }
        eventually { viewModel.stateLoaded.value }
        compose.waitForIdle()

        compose.onNodeWithText("Mark for withdrawal").performClick()
        eventually { posts("command").size == 1 }
        compose.waitForIdle()
        compose.onNodeWithText("Remove automatic bank mark?").assertExists()
        val first = posts("command")[0]
        assertEquals("Merchy", (first["character"] as JsonPrimitive).content)
        assertEquals("false", (first["removeAutoBankMark"] as JsonPrimitive).content)

        compose.onNodeWithText("Confirm").performScrollTo().performClick()
        eventually { posts("command").size == 2 && closed }
        assertEquals("true", (posts("command")[1]["removeAutoBankMark"] as JsonPrimitive).content)
    }

    @Test
    fun mailSendsAfterTheSecondTapWithItsAttachment() {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { MailScreen(viewModel, onBack = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.bank != null }
        compose.waitForIdle()

        compose.onNodeWithText("Write message").performClick()
        compose.onNodeWithText("Character name").performTextReplacement("Friend")
        compose.onNodeWithText("Subject").performTextReplacement("Gift")
        compose.onNodeWithText("Bow +5").performScrollTo().performClick()
        compose.onNodeWithText("Send mail").performScrollTo().performClick()
        assertEquals(0, posts("merchant/send-mail").size)
        compose.onNodeWithText("Really send mail?").performScrollTo().performClick()
        eventually { posts("merchant/send-mail").size == 1 }
        val body = posts("merchant/send-mail")[0]
        assertEquals("Friend", (body["recipient"] as JsonPrimitive).content)
        assertEquals(JsonPrimitive("items0"), (body["source"] as JsonObject)["pack"])
        assertEquals(JsonPrimitive(0), (body["source"] as JsonObject)["slot"])
    }
}
