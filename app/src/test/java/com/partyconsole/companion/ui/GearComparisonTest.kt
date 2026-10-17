package com.partyconsole.companion.ui

import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.itempanel.GearComparisonSheet
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Console 1.4 gear comparison (web/e2e/gear-comparison.spec.ts,
 *  gear-comparison-dialog.tsx) on the native comparison sheet.
 *
 *  Failure modes:
 *  - A two-handed main hand keeps the offhand in the projection, so its
 *    attack counts twice.
 *  - The offhand choice shows for a one-handed swap, or dropping the
 *    offhand leaves its attack (or its set share) on the current side.
 *  - Set bonuses add up cumulatively; Adventure Land's G.sets[count] is the
 *    whole bonus at that piece count.
 *  - The set summary marks a tier GAINED or LOST on the wrong count.
 */
@RunWith(RobolectricTestRunner::class)
class GearComparisonTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun json(text: String): JsonElement = Json.parseToJsonElement(text)
    private val current = hasAnyAncestor(hasContentDescription("Currently equipped"))
    private val proposed = hasAnyAncestor(hasContentDescription("With this item"))

    private fun setUp(entries: String, slots: String, diagnostics: String) {
        val catalog = console.sections.getValue("catalog")["merchantCatalog"]!!.jsonObject
        console.override("catalog", mapOf("merchantCatalog" to JsonObject(catalog + ("allItems" to JsonArray((catalog["allItems"] as JsonArray) + (json(entries) as JsonArray))))))
        val inventory = console.sections.getValue("inventory")["characters"]!!.jsonObject
        console.override("inventory", mapOf("characters" to JsonObject(inventory + ("Leada" to JsonObject(inventory.getValue("Leada").jsonObject + ("slots" to json(slots)))))))
        val details = console.sections.getValue("core")["characterDetails"]!!.jsonObject
        console.override("core", mapOf("characterDetails" to JsonObject(details + ("Leada" to JsonObject(details.getValue("Leada").jsonObject + json(diagnostics).jsonObject)))))
    }

    private fun show(item: Item, slot: String? = null) {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { GearComparisonSheet(item, null, "Leada", viewModel, slot = slot, onClose = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.merchantCatalog != null && viewModel.characters.value["Leada"]?.inventory != null && viewModel.characterDetails.value["Leada"]?.primaryStat != null }
        compose.waitForIdle()
    }

    @Test
    fun aTwoHandedWeaponDropsTheOffhandAndTheCurrentSideCanLeaveItOut() {
        val oneHand = """{"classes":[{"id":"warrior","name":"Warrior","hands":1}],"hands":[1]}"""
        setUp(
            """[{"id":"blade","name":"Blade","upgradeable":true,"meta":{"definition":{"type":"weapon","name":"Blade","attack":20},"upgradeable":true,"maxLevel":12,"usage":$oneHand,"properties":{"attack":20}}},
                {"id":"dagger","name":"Dagger","upgradeable":true,"meta":{"definition":{"type":"weapon","name":"Dagger","attack":15},"upgradeable":true,"maxLevel":12,"usage":$oneHand,"properties":{"attack":15}}},
                {"id":"bigaxe","name":"Big Axe","upgradeable":true,"meta":{"definition":{"type":"weapon","name":"Big Axe","attack":50},"upgradeable":true,"maxLevel":12,"usage":{"classes":[{"id":"warrior","name":"Warrior","hands":2}],"hands":[2]},"properties":{"attack":50}}}]""",
            """{"mainhand":{"item":{"name":"blade","level":0}},"offhand":{"item":{"name":"dagger","level":0}}}""",
            """{"primaryStat":"str","str":50,"attack":250}""",
        )
        show(Item(name = "bigaxe", level = 0))
        compose.onNode(hasText("Two-handed weapon · unequips Dagger") and proposed).assertExists()
        // gear-comparison-dialog.tsx project(): weapon attack 35 -> 50 scaled by 1 + STR/20.
        compose.onNode(hasText("250.0") and current).assertExists()
        compose.onNode(hasText("302.5 (+52.5 · +21.0%)") and proposed).assertExists()

        val include = compose.onNode(hasContentDescription("include offhand weapon in comparison"))
        include.performScrollTo().assertIsOn()
        compose.onNode(hasText("Dagger +0", substring = true) and current).assertExists()
        include.performClick()
        include.assertIsOff()
        // Without the dagger the current side keeps only the blade's 20 attack.
        compose.onNode(hasText("197.5") and current).assertExists()
        compose.onNode(hasText("302.5 (+105.0 · +53.2%)") and proposed).assertExists()
    }

    @Test
    fun setBonusesApplyAtTheExactPieceCountNotCumulatively() {
        val set = """{"id":"pair","name":"Ring Pair","items":[{"id":"ringa","name":"Ring A"},{"id":"ringb","name":"Ring B"}],"bonuses":[{"pieces":1,"stats":{"dex":3}},{"pieces":2,"stats":{"dex":10}}]}"""
        setUp(
            """[{"id":"ringa","name":"Ring A","compoundable":true,"meta":{"definition":{"type":"ring","name":"Ring A"},"compoundable":true,"maxLevel":7,"world":{"set":$set}}},
                {"id":"ringb","name":"Ring B","compoundable":true,"meta":{"definition":{"type":"ring","name":"Ring B"},"compoundable":true,"maxLevel":7,"world":{"set":$set}}}]""",
            """{"ring1":{"item":{"name":"ringa","level":0}}}""",
            """{"primaryStat":"dex","dex":100,"ctype":"ranger"}""",
        )
        show(Item(name = "ringb", level = 0), slot = "ring2")
        // G.sets[2] replaces G.sets[1]: DEX goes up by 10 - 3, not by 10.
        compose.onNode(hasText("107 (+7 · +7.0%)") and proposed).assertExists()
        val sets = hasAnyAncestor(hasContentDescription("Set changes"))
        compose.onNode(hasText("Ring Pair: 1/2 → ", substring = true) and sets).performScrollTo().assertExists()
        compose.onNode(hasText("1 pieces: DEX +3 · LOST", substring = true) and sets).assertExists()
        compose.onNode(hasText("2 pieces: DEX +10 · GAINED", substring = true) and sets).assertExists()
    }
}
