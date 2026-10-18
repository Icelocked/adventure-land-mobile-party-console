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
import com.partyconsole.companion.ui.itempanel.COMPARISON_ROW_COLORS
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

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
 *  - app/docs/cards.md 20 to 24: the stat tiles become one game box per side,
 *    labels lose their palette colors, or a notice on one side pushes that
 *    side's stat box out of line with the other on a wide sheet.
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
        // Both stat boxes draw a frame after the data loads; slow CI runners show the gap.
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Attack: ", substring = true)).fetchSemanticsNodes().size >= 2 }
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
        compose.onNode(hasText("Attack: 250.0") and current).assertExists()
        compose.onNode(hasText("Attack: 302.5 (+52.5 · +21.0%)") and proposed).assertExists()

        val include = compose.onNode(hasContentDescription("include offhand weapon in comparison"))
        include.performScrollTo().assertIsOn()
        compose.onNode(hasText("Dagger +0", substring = true) and current).assertExists()
        include.performClick()
        include.assertIsOff()
        // Without the dagger the current side keeps only the blade's 20 attack.
        compose.onNode(hasText("Attack: 197.5") and current).assertExists()
        compose.onNode(hasText("Attack: 302.5 (+105.0 · +53.2%)") and proposed).assertExists()
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
        compose.onNode(hasText("DEX: 107 (+7 · +7.0%)") and proposed).assertExists()
        val sets = hasAnyAncestor(hasContentDescription("Set changes"))
        compose.onNode(hasText("Ring Pair: 1/2 → ", substring = true) and sets).performScrollTo().assertExists()
        compose.onNode(hasText("1 pieces: DEX +3 · LOST", substring = true) and sets).assertExists()
        compose.onNode(hasText("2 pieces: DEX +10 · GAINED", substring = true) and sets).assertExists()
    }

    private fun twoHandedSwap() {
        val oneHand = """{"classes":[{"id":"warrior","name":"Warrior","hands":1}],"hands":[1]}"""
        setUp(
            """[{"id":"blade","name":"Blade","upgradeable":true,"meta":{"definition":{"type":"weapon","name":"Blade","attack":20},"upgradeable":true,"maxLevel":12,"usage":$oneHand,"properties":{"attack":20}}},
                {"id":"dagger","name":"Dagger","upgradeable":true,"meta":{"definition":{"type":"weapon","name":"Dagger","attack":15},"upgradeable":true,"maxLevel":12,"usage":$oneHand,"properties":{"attack":15}}},
                {"id":"bigaxe","name":"Big Axe","upgradeable":true,"meta":{"definition":{"type":"weapon","name":"Big Axe","attack":50},"upgradeable":true,"maxLevel":12,"usage":{"classes":[{"id":"warrior","name":"Warrior","hands":2}],"hands":[2]},"properties":{"attack":50}}}]""",
            """{"mainhand":{"item":{"name":"blade","level":0}},"offhand":{"item":{"name":"dagger","level":0}}}""",
            """{"primaryStat":"str","str":50,"attack":250}""",
        )
        show(Item(name = "bigaxe", level = 0))
    }

    @Test
    fun eachSideIsOneGameBoxWithEveryRowInPaletteColors() {
        twoHandedSwap()
        val rows = listOf(
            "HP", "MP", "Attack", "Attack speed", "Range", "Run speed", "Armor", "Resistance", "STR", "INT", "DEX", "VIT", "Fortitude", "Luck", "Gold", "XP",
            "Evasion", "Reflection", "Lifesteal", "Manasteal", "Armor piercing", "Resistance piercing", "Critical hit", "Damage return", "MP cost reduction", "Output",
        )
        for (box in listOf("Equipped stats", "Proposed stats")) {
            for (label in rows) compose.onNode(hasText("$label: ", substring = true) and hasAnyAncestor(hasContentDescription(box))).assertExists()
        }
        // The equipped side shows no change text.
        compose.onNode(hasText("Attack: 250.0") and hasAnyAncestor(hasContentDescription("Equipped stats"))).assertExists()
        assertEquals("#FF2E46", COMPARISON_ROW_COLORS["max_hp"])
        assertEquals("#3E6EED", COMPARISON_ROW_COLORS["int"])
        assertEquals("#C8323E", COMPARISON_ROW_COLORS["lifesteal"])
        assertEquals(26, COMPARISON_ROW_COLORS.size)
        // Both level sliders stay.
        compose.onNode(hasContentDescription("Currently equipped preview level")).assertExists()
        compose.onNode(hasContentDescription("With this item preview level")).assertExists()
        com.partyconsole.companion.testing.cardShot("comparison-card-phone")
    }

    @Test
    @Config(qualifiers = "w900dp-h1400dp")
    fun wideSheetKeepsTheStatBoxesAligned() {
        twoHandedSwap()
        compose.waitForIdle()
        fun top(matcher: androidx.compose.ui.test.SemanticsMatcher) = compose.onNode(matcher).fetchSemanticsNode().boundsInRoot.top
        fun left(matcher: androidx.compose.ui.test.SemanticsMatcher) = compose.onNode(matcher).fetchSemanticsNode().boundsInRoot.left
        val equipped = hasContentDescription("Equipped stats")
        val proposedBox = hasContentDescription("Proposed stats")
        // The offhand checkbox sits on the left only and the two-handed note on the right only.
        compose.onNode(hasContentDescription("include offhand weapon in comparison") and current).assertExists()
        compose.onNode(hasText("Two-handed weapon · unequips Dagger") and proposed).assertExists()
        assertTrue("the panels sit side by side", left(hasContentDescription("With this item")) > left(hasContentDescription("Currently equipped")) + 100f)
        assertEquals(top(equipped), top(proposedBox), 1f)
        for (label in listOf("HP: ", "Attack: ", "Armor: ", "Output: ")) {
            assertEquals(label, top(hasText(label, substring = true) and hasAnyAncestor(equipped)), top(hasText(label, substring = true) and hasAnyAncestor(proposedBox)), 1f)
        }
        com.partyconsole.companion.testing.cardShot("comparison-card-wide")
    }
}
