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
import com.partyconsole.companion.model.farmingContext
import com.partyconsole.companion.model.focusFor
import com.partyconsole.companion.ui.AccountMenuSheet
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.Routes
import kotlinx.coroutines.launch
import com.partyconsole.companion.ui.characterdetail.sections.AutoMarksSection
import com.partyconsole.companion.ui.characterdetail.sections.EquipmentSection
import com.partyconsole.companion.ui.characterdetail.sections.FarmingSection
import com.partyconsole.companion.ui.characterdetail.sections.GoldTargetSection
import com.partyconsole.companion.ui.characterdetail.sections.InventorySection
import com.partyconsole.companion.ui.characterdetail.sections.LeaderFollowerSection
import com.partyconsole.companion.ui.characterdetail.sections.MerchantControlsSection
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
    onNavigate: (String) -> Unit,
    onOpenMerchantCommerce: (String) -> Unit,
    onOpenRoutines: () -> Unit,
    onOpenHuntSettings: () -> Unit,
) {
    val characters by viewModel.characters.collectAsState()
    val dynamicState by viewModel.dynamicState.collectAsState()
    val roster by viewModel.roster.collectAsState()
    val state = characters[characterName]
    var actionTarget by remember { mutableStateOf<ItemActionTarget?>(null) }
    val sheetState = rememberModalBottomSheetState()
    val catalogFor = rememberCatalogLookup(dynamicState.merchantCatalog)
    val scope = rememberCoroutineScope()
    var menuOpen by remember { mutableStateOf(false) }

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
                    com.partyconsole.companion.ui.components.SessionControls(viewModel, characterName)
                    IconButton(onClick = { scope.launch { viewModel.refreshDynamicStateNow() } }) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Refresh")
                    }
                    IconButton(onClick = { menuOpen = true }) {
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
        // The configured merchant, never the class (bankbois are merchants too).
        val isMerchant = characterName == dynamicState.merchantCharacter
        val farming = dynamicState.farmingContext(characterName)

        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            CharacterSwitcherRow(characters, characterName, onSwitchCharacter)
            VitalsHeader(name = characterName, vitals = vitals, accountGold = accountGold, bestiaryCatalog = dynamicState.bestiaryCatalog)
            Column(
                modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 24.dp),
            ) {
                LeaderFollowerSection(characterName, dynamicState, viewModel)
                TravelSection(
                    characterName = characterName,
                    isMerchant = isMerchant,
                    isLeader = dynamicState.leader == characterName,
                    travelPlaces = dynamicState.travelPlaces,
                    viewModel = viewModel,
                )
                if (vitals.ctype != "merchant") {
                    FarmingSection(
                        characterName = characterName,
                        farmingPolicy = farming.savedMode,
                        followingLeader = farming.followingLeader,
                        monsterFocus = dynamicState.focusFor(characterName),
                        monsterSearchRadius = dynamicState.monsterSearchRadiusByCharacter[characterName] ?: 400,
                        monsterChoices = dynamicState.monsterChoices,
                        bestiaryCatalog = dynamicState.bestiaryCatalog,
                        viewModel = viewModel,
                        onOpenHuntSettings = onOpenHuntSettings,
                    )
                }
                if (isMerchant) {
                    MerchantQueueSection(dynamicState.merchantCurrent, dynamicState.merchantQueue, viewModel)
                    MerchantControlsSection(
                        dynamicState.merchantForceStand, dynamicState.gatheringModes,
                        dynamicState.threshold, dynamicState.itemCollectionThreshold, dynamicState.bankSortMode,
                        viewModel, onOpenMerchantCommerce, onOpenRoutines,
                    )
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
                if (isMerchant) GoldTargetSection(characterName, dynamicState.goldTargets[characterName] ?: 0L, viewModel)
                AutoMarksSection(characterName, isMerchant, dynamicState, viewModel, catalogFor)
            }
        }

        if (menuOpen) {
            AccountMenuSheet(
                viewModel = viewModel,
                onNavigate = onNavigate,
                onDismiss = { menuOpen = false },
                characterItems = listOfNotNull(
                    "Inventory" to Routes.inventory(characterName),
                    "Equipment" to Routes.equipment(characterName),
                    ("Merchant activity" to Routes.activity(characterName)).takeIf { characterName == dynamicState.merchantCharacter },
                    "Upgrade offerings" to Routes.ACCOUNT_OFFERINGS,
                ),
            )
        }

        actionTarget?.let { target ->
            ItemActionPanel(
                target = target,
                characterName = characterName,
                isMerchant = isMerchant,
                roster = roster,
                viewModel = viewModel,
                sheetState = sheetState,
                onDismiss = { actionTarget = null },
            )
        }
    }
}
