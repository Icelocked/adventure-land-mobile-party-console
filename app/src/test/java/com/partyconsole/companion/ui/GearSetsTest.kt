package com.partyconsole.companion.ui

import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.testing.field
import com.partyconsole.companion.ui.characterdetail.CharacterDetailScreen
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Console 1.4 gear sets (web/e2e/combat-party.spec.ts) on the native
 *  character screen. The "Equip" action is a Fonze-only control and is not
 *  ported.
 *
 *  Failure modes:
 *  - Save or Clear posts without `character`, `set` or `action`, or with a
 *    set id the server doesn't know.
 *  - "Gear sets (n)" counts the server-only gold set or a cleared set.
 *  - Completeness counts one bag copy for two slots, or matches a piece by
 *    name alone when level, `p` or stat type differ.
 *  - A 409 (no fresh equipment report) hides the server's message.
 *  - Merchant-class characters get gear sets.
 *  - An Equip button appears (Fonze-only, excluded from the port).
 *  - A reserved bag slot shows an automatic rule's banner instead of its
 *    hold, or the hold hides a manual mark.
 *  - Gear swapped out for a set reads as a set member, or a set member at
 *    another level reads as held by that set.
 */
@RunWith(RobolectricTestRunner::class)
class GearSetsTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun posts(path: String) = console.requests.filter { it.method == "POST" && it.path == "/party-api/$path" }.map { Json.parseToJsonElement(it.body).jsonObject }
    private fun json(text: String): JsonElement = Json.parseToJsonElement(text)
    private fun inSet(label: String) = hasAnyAncestor(hasContentDescription("$label gear set"))

    private fun character(name: String, items: String? = null, slots: String? = null, vitals: String? = null) {
        val inventory = console.sections.getValue("inventory")["characters"]!!.jsonObject
        val mine = inventory.getValue(name).jsonObject
        val patched = JsonObject(mine + listOfNotNull(items?.let { "items" to json(it) }, slots?.let { "slots" to json(it) }))
        console.override("inventory", mapOf("characters" to JsonObject(inventory + (name to patched))))
        if (vitals != null) {
            val fast = console.sections.getValue("fast")["characters"]!!.jsonObject
            console.override("fast", mapOf("characters" to JsonObject(fast + (name to JsonObject(fast.getValue(name).jsonObject + json(vitals).jsonObject)))))
        }
    }

    private fun show(name: String): PartyViewModel {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent {
            CharacterDetailScreen(viewModel, name, onBack = {}, onSwitchCharacter = {}, onNavigate = {}, onOpenMerchantCommerce = {}, onOpenRoutines = {}, onOpenHuntSettings = {})
        }
        eventually { viewModel.stateLoaded.value && viewModel.characters.value[name]?.inventory != null && viewModel.characters.value[name]?.vitals?.ctype?.isNotEmpty() == true }
        compose.waitForIdle()
        return viewModel
    }

    private fun scrollTo(text: String): SemanticsNodeInteraction {
        compose.onAllNodes(androidx.compose.ui.test.SemanticsMatcher.keyIsDefined(androidx.compose.ui.semantics.SemanticsProperties.VerticalScrollAxisRange))[0].performScrollToNode(hasText(text))
        return compose.onNode(hasText(text))
    }

    @Test
    fun savingCapturesTheWornGearCountsPiecesClearsAndShowsA409() {
        show("Leada")
        scrollTo("Gear sets (0) ▾").performClick()
        compose.onNode(hasText("Worn by the designated tank right before a kill") and inSet("Luck")).assertExists()
        compose.onNode(hasText("Not saved") and inSet("Luck")).assertExists()
        scrollTo("Save current gear as Luck").performClick()
        eventually { posts("gear-sets").isNotEmpty() }
        assertEquals(json("""{"character":"Leada","set":"luck","action":"save"}"""), posts("gear-sets")[0])
        assertEquals(json("""{"mainhand":{"name":"blade","level":8}}"""), console.field("gearSets")!!.jsonObject["Leada"]!!.jsonObject["luck"]!!.jsonObject["slots"])
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("1/1 pieces available (1 worn, 0 in bag)") and inSet("Luck")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Gear sets (1) ▾").assertExists()

        compose.onNode(hasText("Clear") and inSet("Luck")).performClick()
        eventually { posts("gear-sets").size == 2 }
        assertEquals(json("""{"character":"Leada","set":"luck","action":"clear"}"""), posts("gear-sets")[1])
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Not saved") and inSet("Luck")).fetchSemanticsNodes().isNotEmpty() }

        // gear-sets.ts refuses a save without an equipment report from the last 10s.
        console.staleEquipment += "Leada"
        scrollTo("Save current gear as Tank").performClick()
        eventually { posts("gear-sets").size == 3 }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("no fresh equipment report for Leada")).fetchSemanticsNodes().isNotEmpty() }
        assertNull(console.field("gearSets")!!.jsonObject["Leada"]!!.jsonObject["tank"])
    }

    @Test
    fun completenessCountsWornBagAndMissingPiecesWithEachBagCopyOnce() {
        character("Folla", items = """[{"slot":0,"item":{"name":"gloves","level":4}},{"slot":1,"item":{"name":"ringsj","level":2}},null]""", slots = """{"helmet":{"item":{"name":"helmet","level":5}}}""")
        console.override("config", mapOf("gearSets" to json(
            """{"Folla":{"tank":{"slots":{"helmet":{"name":"helmet","level":5},"gloves":{"name":"gloves","level":4},"shoes":{"name":"shoes","level":6},"ring1":{"name":"ringsj","level":2},"ring2":{"name":"ringsj","level":2},"earring1":{"name":"helmet","level":4}},"savedAt":1},"gold":{"slots":{"mainhand":{"name":"blade"}},"savedAt":1}}}""",
        )))
        show("Folla")
        // The server-only gold set is not counted.
        scrollTo("Gear sets (1) ▾").performClick()
        compose.onNode(hasText("3/6 pieces available (1 worn, 2 in bag) · missing shoes, ring2, earring1") and inSet("Tank")).assertExists()
        // Equip is a Fonze-only control.
        compose.onNode(hasText("Equip Tank")).assertDoesNotExist()
        compose.onNode(hasText("Equip wears", substring = true)).assertDoesNotExist()
    }

    @Test
    fun merchantsHaveNoGearSets() {
        show("Merchy")
        scrollTo("Formation")
        compose.onNode(hasText("Gear sets", substring = true)).assertDoesNotExist()
    }

    @Test
    fun reservedBagSlotsReadAsTheirSetOverAutomaticRulesButYieldToManualMarks() {
        character(
            "Leada",
            items = """[{"slot":0,"item":{"name":"ringsj","level":3}},{"slot":1,"item":{"name":"coat","level":2}},{"slot":2,"item":{"name":"ringsj","level":1}},{"slot":3,"item":{"name":"bow","level":4}}]""",
            vitals = """{"reservedInventory":[{"slot":0,"item":{"name":"ringsj","level":3}},{"slot":1,"item":{"name":"coat","level":2}},{"slot":2,"item":{"name":"ringsj","level":1}},{"slot":3,"item":{"name":"bow","level":4}}]}""",
        )
        console.override("config", mapOf(
            "gearSets" to json("""{"Leada":{"luck":{"slots":{"ring1":{"name":"ringsj","level":3}},"savedAt":1},"tank":{"slots":{"mainhand":{"name":"bow","level":4}},"savedAt":1}}}"""),
            // An automatic bank rule on the ring is exempt while the set holds it.
            "autoItemMarks" to json("""{"Leada":{"ringsj@+3":"bank","ringsj@+1":"bank"}}"""),
            // A manual bank mark still beats the hold.
            "marked" to json("""{"Leada":[{"slot":3,"item":{"name":"bow","level":4}}]}"""),
        ))
        val viewModel = show("Leada")
        eventually { viewModel.characters.value["Leada"]?.inventory?.items?.size == 4 }
        compose.waitForIdle()
        scrollTo("▾ Inventory")
        val tiles = compose.onAllNodes(hasContentDescription("Ring of Strength"))
        compose.waitUntil(5_000) { tiles.fetchSemanticsNodes().size == 2 }
        tiles[0].assert(hasText("Luck set"))
        // A reserved ring at another level is gear swapped out, not a set member.
        tiles[1].assert(hasText("Swapped-out gear"))
        compose.onNodeWithContentDescription("coat").assert(hasText("Swapped-out gear"))
        compose.onNodeWithContentDescription("Bow").assert(hasText("Bank"))
    }
}
