package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.partyconsole.companion.model.AutoNpcSaleRule
import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.PartyStateDynamic
import com.partyconsole.companion.model.Sprite
import com.partyconsole.companion.network.ServerSettings
import com.partyconsole.companion.network.TrustMode
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.theme.PartyConsoleTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Regression test for the sprite bug fixed alongside the PWA's identical
 * AutoMarksSection gap: this list used to render only the marked item's
 * text name, dropping the sprite the dashboard's own source always shows.
 *
 * The ViewModel is real but points at a dead loopback address it never
 * actually reaches - AutoMarksSection reads its displayed data from the
 * [PartyStateDynamic] parameter directly, not from the ViewModel's own
 * (network-backed) state, so no live server or emulator network access is
 * needed for this to be a meaningful check.
 */
@RunWith(AndroidJUnit4::class)
class AutoMarksSectionTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun autoNpcSaleEntryShowsNameAndSprite() {
        val viewModel = PartyViewModel(ServerSettings(baseUrl = "http://127.0.0.1:1", trustMode = TrustMode.CLEARTEXT))
        val sprite = Sprite(url = "https://example.invalid/sprite.png", columns = 1, rows = 1, x = 0, y = 0)
        val dynamicState = PartyStateDynamic(
            autoNpcSales = mapOf(
                "wcoat@+0" to AutoNpcSaleRule(item = Item(name = "wcoat"), character = null),
            ),
        )
        val catalog = mapOf("wcoat" to CatalogItem(id = "wcoat", name = "Wolf Coat", sprite = sprite))

        composeTestRule.setContent {
            PartyConsoleTheme {
                AutoMarksSection(
                    characterName = "Merchantina",
                    isMerchant = true,
                    dynamicState = dynamicState,
                    viewModel = viewModel,
                    catalogFor = { id -> catalog[id] },
                )
            }
        }

        composeTestRule.onNodeWithText("Auto NPC sales (1)").performClick()
        composeTestRule.onNodeWithText("Wolf Coat").assertExists()
        composeTestRule.onAllNodesWithTag("auto-mark-sprite").assertCountEquals(1)
    }
}
