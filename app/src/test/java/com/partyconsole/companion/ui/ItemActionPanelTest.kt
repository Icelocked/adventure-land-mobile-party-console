package com.partyconsole.companion.ui

import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.itempanel.ItemActionPanel
import com.partyconsole.companion.ui.itempanel.ItemActionTarget
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** item-menu.spec.ts on the native options panel. */
@OptIn(ExperimentalMaterial3Api::class)
@RunWith(RobolectricTestRunner::class)
class ItemActionPanelTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    @Before fun catalog() {
        fun entry(id: String, type: String) = Json.parseToJsonElement(
            """{"id":"$id","name":"$id","meta":{"definition":{"name":"$id","type":"$type","g":1000},"compoundable":${type == "ring"},"maxLevel":7}}""",
        )
        val catalog = console.sections.getValue("catalog")["merchantCatalog"]!!.jsonObject
        console.override("catalog", mapOf("merchantCatalog" to JsonObject(catalog + ("allItems" to JsonArray(listOf(entry("ringsj", "ring"), entry("elixirdex0", "elixir"), entry("ironore", "material")))))))
        // A bankboi is a storage worker, never a delivery target.
        console.override("bank", mapOf("bankbois" to Json.parseToJsonElement("""[{"name":"Rangy","state":"idle"}]""")))
    }

    private fun posts(path: String) = console.requests.filter { it.method == "POST" && it.path == "/party-api/$path" }.map { Json.parseToJsonElement(it.body).jsonObject }

    private fun open(target: ItemActionTarget, character: String = "Leada"): PartyViewModel {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent {
            ItemActionPanel(target, character, isMerchant = false, roster = emptyMap(), viewModel = viewModel,
                sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), onDismiss = {})
        }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.merchantCatalog != null && viewModel.characterDetails.value.isNotEmpty() }
        compose.waitForIdle()
        return viewModel
    }

    @Test
    fun equipmentGetsEquipAndCompareWithARingSlotPickerAndItemDetailsIsAnOption() {
        open(ItemActionTarget.InventorySlot(Item(name = "ringsj", level = 1), 0))
        compose.onNodeWithText("Item details").assertExists()
        compose.onNodeWithText("Equip").assertExists()
        compose.onNodeWithText("Use").assertDoesNotExist()
        compose.onNodeWithText("Compare with equipped").performScrollTo().performClick()
        compose.onNodeWithText("Ring 1").assertExists()
        compose.onNodeWithText("Ring 2").assertExists()
    }

    @Test
    fun elixirsAreUsedNotEquipped() {
        open(ItemActionTarget.InventorySlot(Item(name = "elixirdex0"), 1))
        compose.onNodeWithText("Use elixir").assertExists()
        compose.onNodeWithText("Equip").assertDoesNotExist()
        compose.onNodeWithText("Compare with equipped").assertDoesNotExist()
    }

    @Test
    fun deliverListsOnlineMembersButNotItselfOrBankboisAndMarkForBankPosts() {
        val viewModel = open(ItemActionTarget.InventorySlot(Item(name = "ironore", q = 3), 2))
        eventually { viewModel.dynamicState.value.bankbois.isNotEmpty() }
        compose.waitForIdle()
        compose.onNodeWithText("Clear all marks").assertDoesNotExist()
        compose.onNodeWithText("Deliver to…").performScrollTo().performClick()
        compose.onNodeWithText("Merchy").assertExists()
        compose.onNodeWithText("Folla").assertExists()
        compose.onNodeWithText("Rangy").assertDoesNotExist()
        compose.onNodeWithText("Leada").assertDoesNotExist()

        compose.onNodeWithText("Mark for bank").performScrollTo().performClick()
        eventually { posts("command").isNotEmpty() }
        val body = posts("command")[0]
        assertEquals("mark", (body["type"] as JsonPrimitive).content)
        assertEquals("Leada", (body["character"] as JsonPrimitive).content)
        assertEquals(2, (body["slot"] as JsonPrimitive).content.toInt())
    }

    @Test
    fun anExistingBankMarkDisablesMarkForBankAndShowsClearAllMarks() {
        console.override("inventory", mapOf("marked" to Json.parseToJsonElement("""{"Leada":[{"slot":2,"item":{"name":"ironore","q":3}}]}""")))
        console.override("config", mapOf("marked" to Json.parseToJsonElement("""{"Leada":[{"slot":2,"item":{"name":"ironore","q":3}}]}""")))
        val viewModel = open(ItemActionTarget.InventorySlot(Item(name = "ironore", q = 3), 2))
        eventually { viewModel.dynamicState.value.marked["Leada"].orEmpty().isNotEmpty() }
        compose.waitForIdle()
        compose.onNodeWithText("Mark for bank").assertIsNotEnabled()
        compose.onNodeWithText("Clear all marks").performScrollTo().assertExists()
    }

    @Test
    fun equippedItemsUnequipButTheElixirSlotOnlyShowsItsEffect() {
        open(ItemActionTarget.EquipmentSlot(Item(name = "ringsj", level = 3), "ring1"))
        compose.onNodeWithText("Unequip").assertExists()
        compose.onNodeWithText("Clear all marks").assertDoesNotExist()
        compose.onNodeWithText("Unequip").performClick()
        eventually { posts("command").isNotEmpty() }
        assertEquals("unequip", (posts("command")[0]["type"] as JsonPrimitive).content)
        assertEquals("ring1", (posts("command")[0]["slot"] as JsonPrimitive).content)
    }
}
