package com.partyconsole.companion.ui.characterdetail

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Refresh
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.ui.PartyViewModel
import kotlinx.coroutines.launch
import com.partyconsole.companion.ui.characterdetail.sections.AutoMarksSection
import com.partyconsole.companion.ui.characterdetail.sections.EquipmentSection
import com.partyconsole.companion.ui.characterdetail.sections.GoldTargetSection
import com.partyconsole.companion.ui.characterdetail.sections.InventorySection
import com.partyconsole.companion.ui.characterdetail.sections.LeaderFollowerSection
import com.partyconsole.companion.ui.characterdetail.sections.MerchantQueueSection
import com.partyconsole.companion.ui.characterdetail.sections.RestockSection
import com.partyconsole.companion.ui.characterdetail.sections.TravelSection
import com.partyconsole.companion.ui.characterdetail.sections.VitalsHeader
import com.partyconsole.companion.ui.itemicon.rememberCatalogLookup
import com.partyconsole.companion.ui.itempanel.ItemActionPanel
import com.partyconsole.companion.ui.itempanel.ItemActionTarget

/** Character focus screen: a sticky vitals header (VitalsHeader - never
 *  scrolls out of view) over a scrollable body of section cards. Replaces
 *  the old 3-tab layout per the mobile-redesign plan - "lock the basic
 *  character information at the top... then as you scroll down you get
 *  into all the features". Item taps (equipment/inventory) are wired to
 *  the bottom item-action panel (ui/itempanel/ItemActionPanel.kt). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CharacterDetailScreen(
    viewModel: PartyViewModel,
    characterName: String,
    onBack: () -> Unit,
    onSwitchCharacter: (String) -> Unit,
    onOpenMenu: () -> Unit,
) {
    val characters by viewModel.characters.collectAsState()
    val dynamicState by viewModel.dynamicState.collectAsState()
    val roster by viewModel.roster.collectAsState()
    val state = characters[characterName]
    var actionTarget by remember { mutableStateOf<ItemActionTarget?>(null) }
    val sheetState = rememberModalBottomSheetState()
    val catalogFor = rememberCatalogLookup(dynamicState.merchantCatalog)
    val scope = rememberCoroutineScope()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(characterName) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { scope.launch { viewModel.refreshDynamicStateNow() } }) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Refresh")
                    }
                    IconButton(onClick = onOpenMenu) {
                        Icon(Icons.Filled.Menu, contentDescription = "Menu")
                    }
                },
            )
        },
    ) { padding ->
        val vitals = state?.vitals
        if (vitals == null) {
            Text(
                "This character isn't reporting in right now.",
                modifier = Modifier.padding(padding).padding(24.dp),
            )
            return@Scaffold
        }

        val accountGold = (dynamicState.bank?.gold ?: 0L) + characters.values.sumOf { it.vitals?.gold ?: 0L }

        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            CharacterSwitcherRow(characters, characterName, onSwitchCharacter)
            VitalsHeader(name = characterName, vitals = vitals, accountGold = accountGold)
            Column(
                modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 24.dp),
            ) {
                LeaderFollowerSection(characterName, dynamicState, viewModel)
                TravelSection(
                    characterName = characterName,
                    isMerchant = vitals.ctype == "merchant",
                    isLeader = dynamicState.leader == characterName,
                    travelPlaces = dynamicState.travelPlaces,
                    viewModel = viewModel,
                )
                if (vitals.ctype == "merchant") {
                    MerchantQueueSection(dynamicState.merchantCurrent, dynamicState.merchantQueue, viewModel)
                }
                EquipmentSection(
                    slots = state.inventory?.slots.orEmpty(),
                    catalogFor = catalogFor,
                    onSlotTap = { slotName, entry ->
                        entry?.let { actionTarget = ItemActionTarget.EquipmentSlot(it.item, slotName) }
                    },
                )
                InventorySection(
                    items = state.inventory?.items.orEmpty(),
                    merchantMarks = dynamicState.merchantMarked[characterName].orEmpty(),
                    bankMarks = dynamicState.marked[characterName].orEmpty(),
                    catalogFor = catalogFor,
                    onItemTap = { index, entry ->
                        entry?.let { actionTarget = ItemActionTarget.InventorySlot(it.item, index) }
                    },
                )
                RestockSection(
                    characterName,
                    dynamicState.restockPolicies[characterName] ?: com.partyconsole.companion.model.RestockPolicy(),
                    viewModel,
                )
                GoldTargetSection(characterName, dynamicState.goldTargets[characterName] ?: 0L, viewModel)
                AutoMarksSection(characterName, vitals.ctype == "merchant", dynamicState, viewModel, catalogFor)
            }
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
