package com.partyconsole.companion.ui

import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.account.SettingsScreen
import com.partyconsole.companion.ui.connection.PairingScreen
import com.partyconsole.companion.ui.connection.PairingViewModel
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Console 1.4 access-code pairing (web/e2e/access-code-pairing.spec.ts):
 *  the pairing screen takes a code, and Settings issues one with
 *  "Pair another browser".
 *
 *  Failure modes:
 *  - A blank code reaches the server instead of asking for one.
 *  - The code is normalized in the app; the console expects it as typed
 *    (trimmed) and ignores case, spaces and dashes itself.
 *  - A refused or expired code shows a generic message instead of the
 *    server's, or pairs anyway.
 *  - The invitation hides the code, its countdown, the setup address or the
 *    one-use link.
 *  - The code keeps showing after another browser uses it, after a newer
 *    invitation replaces it, or after it expires.
 *  - A refused invitation hides the server's message.
 *  - "Pair another browser" shows while pairing isn't required.
 */
@RunWith(RobolectricTestRunner::class)
class AccessCodePairingTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun showGate(): () -> Boolean {
        console.setupPaired = false
        var paired = false
        val viewModel = PairingViewModel(console.settings)
        compose.setContent { PairingScreen(viewModel, onPaired = { paired = true }) }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Pair this device")).fetchSemanticsNodes().isNotEmpty() }
        return { paired }
    }

    @Test
    fun anAccessCodePairsThisDeviceAndAWrongOneShowsTheServerError() {
        console.accessCode = Triple("K7MQ-2PXA", System.currentTimeMillis() + 600_000, 0)
        val paired = showGate()
        val code = compose.onNodeWithContentDescription("Access code")
        compose.onNodeWithText("Pair with access code").performClick()
        compose.onNodeWithText("Enter the access code shown on a paired browser").assertExists()
        assertTrue(console.pairRequests.isEmpty())

        code.performTextReplacement("WRNG-CODE")
        compose.onNodeWithText("Pair with access code").performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Access code is invalid or expired")).fetchSemanticsNodes().isNotEmpty() }
        assertEquals(listOf(Json.parseToJsonElement("""{"code":"WRNG-CODE"}""")), console.pairRequests.toList())

        // Typed in lower case without the dash: sent as typed, matched by the server.
        code.performTextReplacement("  k7mq 2pxa ")
        code.performImeAction()
        eventually { console.pairRequests.size == 2 }
        compose.waitUntil(5_000) { org.robolectric.shadows.ShadowLooper.idleMainLooper(); paired() }
        assertEquals(Json.parseToJsonElement("""{"code":"k7mq 2pxa"}"""), console.pairRequests.last())
        assertNull(console.accessCode)
    }

    @Test
    fun anExpiredAccessCodeIsRefused() {
        console.accessCode = Triple("K7MQ-2PXA", System.currentTimeMillis() - 1, 0)
        val paired = showGate()
        compose.onNodeWithContentDescription("Access code").performTextReplacement("K7MQ-2PXA")
        compose.onNodeWithText("Pair with access code").performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Access code is invalid or expired")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Pair with access code").assertExists()
        assertTrue(!paired())
    }

    private fun showSettings(): PartyViewModel {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { SettingsScreen(viewModel, onBack = {}) }
        eventually { viewModel.stateLoaded.value }
        compose.waitForIdle()
        return viewModel
    }

    private val inInvitation = hasAnyAncestor(hasContentDescription("Pairing invitation"))

    @Test
    fun pairAnotherBrowserShowsTheCodeCountdownAddressAndLinkUntilAnotherBrowserUsesIt() {
        val viewModel = showSettings()
        compose.onNodeWithText("Pair another browser").performScrollTo().performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("K7MQ-2PXA") and inInvitation).fetchSemanticsNodes().isNotEmpty() }
        assertEquals(1, console.requests.count { it.method == "POST" && it.path == "/setup/invite" })
        assertEquals("{}", console.requests.first { it.method == "POST" && it.path == "/setup/invite" }.body)
        val countdown = compose.onNode(hasText("(expires in", substring = true) and inInvitation).fetchSemanticsNode().config[androidx.compose.ui.semantics.SemanticsProperties.Text].joinToString()
        assertTrue(countdown, Regex("""\(expires in (10:00|9:5\d)\)""").containsMatchIn(countdown))
        val setup = viewModel.api.baseUrl.trimEnd('/') + "/setup"
        compose.onNode(hasText(setup, substring = true) and inInvitation).assertExists()
        compose.onNode(hasText("Use a pairing link instead") and inInvitation).performScrollTo().performClick()
        compose.onNode(hasText("$setup#${"c0ffee".repeat(10)}c0de") and inInvitation).assertExists()

        // Another browser pairs with it: /setup/state's accessCodeExpiresAt turns null.
        console.accessCode = null
        compose.mainClock.advanceTimeBy(3_500)
        compose.waitUntil(8_000) {
            compose.mainClock.advanceTimeBy(1_000)
            compose.onAllNodes(hasText("The access code was used or replaced. Choose Pair another browser for a new one.")).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNode(hasContentDescription("Pairing invitation")).assertDoesNotExist()
    }

    @Test
    fun theCodeEndsWhenItExpiresAndARefusedInviteShowsItsError() {
        console.accessCodeTtlMs = 2_000
        showSettings()
        compose.onNodeWithText("Pair another browser").performScrollTo().performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("K7MQ-2PXA") and inInvitation).fetchSemanticsNodes().isNotEmpty() }
        // The countdown runs on the wall clock; let the code lapse before the next tick.
        Thread.sleep(2_200)
        compose.waitUntil(8_000) {
            compose.mainClock.advanceTimeBy(1_000)
            compose.onAllNodes(hasText("The access code expired. Choose Pair another browser for a new one.")).fetchSemanticsNodes().isNotEmpty()
        }

        // A device whose pairing lapsed is refused by the server.
        console.setupPaired = false
        compose.onNodeWithText("Pair another browser").performScrollTo().performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Pair this browser before changing setup")).fetchSemanticsNodes().isNotEmpty() }
    }

    @Test
    fun pairAnotherBrowserIsOnlyOfferedWhilePairingIsRequired() {
        console.requirePairing = false
        showSettings()
        compose.onNodeWithContentDescription("Require secure pairing").performScrollTo()
        compose.waitForIdle()
        compose.onNodeWithText("Pair another browser").assertDoesNotExist()
    }
}
