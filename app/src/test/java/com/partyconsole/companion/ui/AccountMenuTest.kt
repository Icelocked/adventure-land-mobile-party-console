package com.partyconsole.companion.ui

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.characterlist.CharacterListScreen
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** navigation.spec.ts: the account menu is reachable from home, in the
 *  dashboard's order, with the stand count. */
@RunWith(RobolectricTestRunner::class)
class AccountMenuTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    @Test
    fun homeOpensTheAccountMenuAndNavigates() {
        val viewModel = PartyViewModel(console.settings)
        var navigated: String? = null
        compose.setContent { CharacterListScreen(viewModel, onSelectCharacter = {}, onNavigate = { navigated = it }) }
        eventually { viewModel.stateLoaded.value }

        compose.onNodeWithContentDescription("Account menu").performClick()
        // Let the sheet finish opening before tapping inside it.
        compose.mainClock.advanceTimeBy(2_000)
        compose.waitForIdle()
        for (label in listOf("Mail", "Catalog", "Bestiary", "Skills", "View Market", "Inspect Bank", "Merchant routines", "WTB orders", "Logs", "Settings")) {
            compose.onNodeWithText(label).assertExists()
        }
        // The fixture merchant has a sale in trade1 (stand closed, so live listings count too).
        compose.onNodeWithText("Inspect stand · 1/16").assertExists()
        compose.onNodeWithText("Inspect Bank").performScrollTo().performClick()
        compose.waitForIdle()
        assertEquals("account/bank", navigated)
    }
}
