package com.partyconsole.companion.ui.characterdetail

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.characterdetail.sections.EquipmentSection
import com.partyconsole.companion.ui.itemicon.rememberCatalogLookup
import com.partyconsole.companion.ui.itempanel.ItemActionPanel
import com.partyconsole.companion.ui.itempanel.ItemActionTarget

/** Dedicated full-screen equipment view (reachable from the character
 *  hamburger menu) - same grid + item-action panel as the detail screen's
 *  inline section, just on its own screen. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EquipmentScreen(viewModel: PartyViewModel, characterName: String, onBack: () -> Unit) {
    val characters by viewModel.characters.collectAsState()
    val roster by viewModel.roster.collectAsState()
    val dynamicState by viewModel.dynamicState.collectAsState()
    val state = characters[characterName]
    var actionTarget by remember { mutableStateOf<ItemActionTarget?>(null) }
    val sheetState = rememberModalBottomSheetState()
    val catalogFor = rememberCatalogLookup(dynamicState.merchantCatalog)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("$characterName · Equipment") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        val vitals = state?.vitals
        if (vitals == null) {
            Text("This character isn't reporting in right now.", modifier = Modifier.padding(padding).padding(24.dp))
            return@Scaffold
        }
        Column(modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())) {
            EquipmentSection(
                slots = state.inventory?.slots.orEmpty(),
                catalogFor = catalogFor,
                onSlotTap = { slotName, entry ->
                    entry?.let { actionTarget = ItemActionTarget.EquipmentSlot(it.item, slotName) }
                },
            )
        }
        actionTarget?.let { target ->
            ItemActionPanel(
                target = target,
                characterName = characterName,
                isMerchant = vitals.ctype == "merchant",
                roster = roster,
                viewModel = viewModel,
                sheetState = sheetState,
                onDismiss = { actionTarget = null },
            )
        }
    }
}
