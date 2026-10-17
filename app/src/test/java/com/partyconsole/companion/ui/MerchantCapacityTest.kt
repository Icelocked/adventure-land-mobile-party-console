package com.partyconsole.companion.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.characterdetail.sections.MerchantControlsSection
import com.partyconsole.companion.ui.characterdetail.sections.MerchantQueueSection
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Console 1.4 merchant job capacity blocking
 *  (web/e2e/console14-merchant-market.spec.ts Merchant job capacity
 *  blocking) on the native merchant sections.
 *
 *  Failure modes:
 *  - Item pickups from other characters read "queued" while the merchant
 *    has three or fewer empty bag slots, so a full bag looks like a stall.
 *  - Jobs that don't move items (restock) or a bag with room read "blocked".
 *  - A due fishing or mining mode has no row, so a full bag hides why it
 *    doesn't start; or a mode on cooldown is listed.
 *  - A blocked job loses its cancel button, or a gathering row gains one.
 *  - The blocked status hides the slot counts behind it.
 */
@RunWith(RobolectricTestRunner::class)
class MerchantCapacityTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun json(text: String): JsonElement = Json.parseToJsonElement(text)

    private fun merchantBag(occupied: Int) {
        val inventory = console.sections.getValue("inventory")["characters"]!!.jsonObject
        val items = (0 until 42).joinToString(",") { if (it < occupied) """{"slot":$it,"item":{"name":"ironore","q":1}}""" else "null" }
        console.override("inventory", mapOf("characters" to JsonObject(inventory + ("Merchy" to JsonObject(inventory.getValue("Merchy").jsonObject + ("items" to json("[$items]")))))))
        console.override("core", mapOf(
            "merchantQueue" to json("""[{"id":"p1","target":"Folla","reason":"party collection"},{"id":"r1","target":"Folla","reason":"restock"}]"""),
            "merchantCurrent" to json("null"),
            "gatheringModes" to json("""["fishing"]"""),
        ))
    }

    private fun show(): PartyViewModel {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                MerchantQueueSection(viewModel)
                MerchantControlsSection(viewModel, onOpenCommerce = {}, onOpenRoutines = {})
            }
        }
        eventually { viewModel.stateLoaded.value && viewModel.characters.value["Merchy"]?.inventory?.items?.size == 42 }
        compose.waitForIdle()
        return viewModel
    }

    @Test
    fun withThreeOrFewerFreeSlotsPickupsShowBlockedAndDueFishingShowsBlocked() {
        merchantBag(39)
        show()
        compose.onNode(hasText("Item collection · Folla", substring = true)).assertExists()
        compose.onNode(hasText("blocked") and hasContentDescription("Merchant capacity blocked (39/42 slots occupied; three slots reserved)")).assertExists()
        assertEquals(1, compose.onAllNodes(hasText("blocked")).fetchSemanticsNodes().size)
        compose.onNode(hasText("Party restock · Folla", substring = true)).assertExists()
        compose.onNode(hasText("queued")).assertExists()
        compose.onNode(hasText("Fishing · Merchy", substring = true)).assertExists()
        compose.onNode(hasText("BLOCKED")).assertExists()
        // Both queued jobs, the blocked one included, can be cancelled; the fishing row can't.
        val cancels = compose.onAllNodesWithContentDescription("Cancel job and disable routine").fetchSemanticsNodes().size +
            compose.onAllNodesWithContentDescription("Cancel and undo pending intent").fetchSemanticsNodes().size
        assertEquals(2, cancels)
    }

    @Test
    fun withRoomInTheBagEveryJobIsQueuedAndGatheringOnCooldownIsNotListed() {
        merchantBag(30)
        console.override("core", mapOf("gatheringModes" to json("""["fishing","mining"]"""), "gatheringCooldowns" to json("""{"mining":${System.currentTimeMillis() + 600_000}}""")))
        show()
        assertEquals(3, compose.onAllNodes(hasText("queued")).fetchSemanticsNodes().size)
        compose.onNode(hasText("Fishing · Merchy", substring = true)).assertExists()
        compose.onNode(hasText("Mining · Merchy", substring = true)).assertDoesNotExist()
        compose.onNode(hasText("blocked")).assertDoesNotExist()
    }
}
