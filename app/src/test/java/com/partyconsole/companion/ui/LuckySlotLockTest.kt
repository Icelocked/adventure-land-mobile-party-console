package com.partyconsole.companion.ui

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.characterdetail.CharacterDetailScreen
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Console 1.4 lucky slot position locks and sequential discovery
 *  (web/e2e/console14-merchant-market.spec.ts) on the native character screen.
 *
 *  Failure modes:
 *  - The next test slot follows the 1.3 least-sampled rule instead of the
 *    cursor one square past the last roll.
 *  - Lock or Unlock posts without the row's slot or the merchant, or with
 *    the wrong action.
 *  - Other rows stay lockable while a lock exists.
 *  - A lock doesn't outrank a verified slot, or the inventory square keeps
 *    the old label.
 *  - After an unlock, discovery restarts somewhere other than the square
 *    after the lock.
 *  - A refused unlock hides the server's message or drops the lock.
 *  - Ruled-out squares are neither counted nor skipped.
 */
@RunWith(RobolectricTestRunner::class)
class LuckySlotLockTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun posts(path: String) = console.requests.filter { it.method == "POST" && it.path == "/party-api/$path" }.map { Json.parseToJsonElement(it.body).jsonObject }
    private fun json(text: String): JsonElement = Json.parseToJsonElement(text)
    private val scroller = SemanticsMatcher.keyIsDefined(SemanticsProperties.VerticalScrollAxisRange)
    private fun lock(slot: Int) = compose.onNodeWithContentDescription("Lock lucky slot position · slot $slot")
    private fun unlock(slot: Int) = compose.onNodeWithContentDescription("Unlock lucky slot position · slot $slot")

    private fun show(core: Map<String, JsonElement> = emptyMap()) {
        console.override("core", mapOf("luckySlotTracking" to json("{}")) + core)
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { CharacterDetailScreen(viewModel, "Merchy", onBack = {}, onSwitchCharacter = {}, onNavigate = {}, onOpenMerchantCommerce = {}, onOpenRoutines = {}, onOpenHuntSettings = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.characters.value["Merchy"]?.inventory != null }
        compose.waitForIdle()
    }

    private fun scrollTo(text: String) = compose.onAllNodes(scroller)[0].performScrollToNode(hasText(text, substring = true))

    private fun openData() {
        scrollTo("Show lucky slot data")
        compose.onNodeWithText("Show lucky slot data").performClick()
        compose.waitForIdle()
    }

    @Test
    fun theNextSlotFollowsTheCursorInsteadOfTheLeastSampledSlot() {
        // One roll in slot 7: console 1.3 would test slot 0 next, 1.4 tests slot 8.
        show(mapOf("luckySlotTracking" to json("""{"Merchy":{"stream-1":{"version":1,"cursor":{"slot":8,"at":1000,"rolls":1},"slots":{"7":{"totalRolls":1,"sumRolls":0.9999,"rollsAbove96_3":1,"perfectRolls":0}}}}}""")))
        compose.onNodeWithContentDescription("Next upgrade will test for lucky upgrade, slot 8. Open lucky slot options").assertExists()
        scrollTo("Next upgrade will test for lucky upgrade · slot")
        compose.onNodeWithText("Next upgrade will test for lucky upgrade · slot 8 (inventory position 9).").assertExists()
    }

    @Test
    fun lockAndUnlockPostMerchantConfigAndUnlockResumesAtTheNextSquare() {
        show()
        openData()
        lock(3).performScrollTo().performClick()
        eventually { posts("merchant/config").isNotEmpty() }
        assertEquals(json("""{"character":"Merchy","slot":3,"action":"lock-lucky-slot"}"""), posts("merchant/config")[0])
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Locked slot: 3. Rolls continue to accumulate in this position.")).fetchSemanticsNodes().isNotEmpty() }
        lock(4).assertIsNotEnabled()
        compose.onNode(hasText("Locked") and hasAnyAncestor(hasContentDescription("Slot 3"))).assertExists()

        unlock(3).performScrollTo().performClick()
        eventually { posts("merchant/config").size == 2 }
        // connected-inventory.tsx sends the row's slot on unlock too.
        assertEquals(json("""{"character":"Merchy","slot":3,"action":"unlock-lucky-slot"}"""), posts("merchant/config")[1])
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Next upgrade will test for lucky upgrade · slot 4 (inventory position 5).")).fetchSemanticsNodes().isNotEmpty() }
        lock(4).assertIsEnabled()
    }

    @Test
    fun aLockedPositionLabelsTheSquareAndOutranksAVerifiedSlot() {
        show(mapOf("luckyUpgradeSlots" to json("""{"Merchy":5}"""), "luckySlotLocks" to json("""{"Merchy":2}""")))
        compose.onNodeWithContentDescription("Locked lucky upgrade position, slot 2. Open lucky slot options").assertExists()
        scrollTo("Locked slot: 2.")
        compose.onNodeWithText("Locked slot: 2. Rolls continue to accumulate in this position.").assertExists()
    }

    @Test
    fun aRefusedUnlockLeavesTheLockInPlace() {
        show(mapOf("luckySlotLocks" to json("""{"Merchy":2}""")))
        console.failOnce["merchant/config"] = 409 to """{"error":"lucky slot is not locked"}"""
        openData()
        unlock(2).performScrollTo().performClick()
        eventually { posts("merchant/config").isNotEmpty() }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("lucky slot is not locked")).fetchSemanticsNodes().isNotEmpty() }
        unlock(2).assertExists()
    }

    @Test
    fun ruledOutSlotsAreCountedMarkedAndSkipped() {
        val slots = (0 until 42).joinToString(",") { slot -> """"$slot":{"totalRolls":100,"sumRolls":${if (slot == 0) 60 else 50},"rollsAbove96_3":${if (slot == 0) 20 else 3},"perfectRolls":0}""" }
        show(mapOf("luckySlotTracking" to json("""{"Merchy":{"e2e-elimination":{"version":1,"slots":{$slots}}}}""")))
        openData()
        compose.onNodeWithText("1/42 slots ruled out.").assertExists()
        compose.onNode(hasText("Ruled out") and hasAnyAncestor(hasContentDescription("Slot 0"))).performScrollTo().assertExists()
        compose.onNode(hasText("Next upgrade will test for lucky upgrade · slot 1 (inventory position 2).") and hasAnyAncestor(SemanticsMatcher.keyIsDefined(SemanticsProperties.IsDialog))).assertExists()
    }
}
