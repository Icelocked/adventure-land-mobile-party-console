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
import com.partyconsole.companion.ui.characterdetail.sections.StatusesSection
import com.partyconsole.companion.ui.characterdetail.sections.MerchantControlsSection
import com.partyconsole.companion.ui.characterdetail.sections.MerchantQueueSection
import com.partyconsole.companion.ui.characterdetail.sections.RestockSection
import com.partyconsole.companion.ui.characterdetail.sections.TravelSection
import com.partyconsole.companion.ui.characterdetail.sections.VitalsHeader
import com.partyconsole.companion.ui.itemicon.rememberCatalogLookup
import com.partyconsole.companion.ui.itempanel.ItemActionPanel
import com.partyconsole.companion.ui.itempanel.ItemActionTarget

/** Character focus screen: a sticky vitals header (never scrolls out of view)
 *  over a scrollable body of section cards. Equipment and inventory taps open
 *  the item-action panel (ui/itempanel/ItemActionPanel.kt). */
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
    val diagnostics by viewModel.characterDetails.collectAsState()
    val now = com.partyconsole.companion.ui.components.rememberClock()
    val state = characters[characterName]
    var actionTarget by remember { mutableStateOf<ItemActionTarget?>(null) }
    val sheetState = rememberModalBottomSheetState()
    val catalogFor = rememberCatalogLookup(dynamicState.merchantCatalog)
    val scope = rememberCoroutineScope()
    var menuOpen by remember { mutableStateOf(false) }
    var luckySlotOpen by remember(characterName) { mutableStateOf(false) }
    var actionOnLucky by remember { mutableStateOf(false) }

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
                    com.partyconsole.companion.ui.components.PartyGold(viewModel)
                    com.partyconsole.companion.ui.components.LatencyBadge(viewModel)
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
            Column(modifier = Modifier.padding(padding)) {
                CharacterSwitcherRow(characters, characterName, onSwitchCharacter)
                Text("This character isn't reporting in right now.", modifier = Modifier.padding(24.dp))
            }
            return@Scaffold
        }

        val accountGold = (dynamicState.bank?.gold ?: 0L) + characters.values.sumOf { it.vitals?.gold ?: 0L }
        // The configured merchant, never the class (bankbois are merchants too).
        val isMerchant = characterName == dynamicState.merchantCharacter
        val farming = dynamicState.farmingContext(characterName)
        val resolvedTargetType = com.partyconsole.companion.ui.map.rememberTargetMonsterType(viewModel, characterName, vitals.targetId)

        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            CharacterSwitcherRow(characters, characterName, onSwitchCharacter)
            VitalsHeader(
                name = characterName,
                vitals = vitals,
                accountGold = accountGold,
                bestiaryCatalog = dynamicState.bestiaryCatalog,
                resolvedTargetType = resolvedTargetType,
                diagnostics = diagnostics[characterName],
                slots = state.inventory?.slots.orEmpty(),
                online = diagnostics[characterName]?.online(now) == true,
            )
            Column(
                modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 24.dp),
            ) {
                // The live map sits under the card header.
                com.partyconsole.companion.ui.characterdetail.sections.MapSection(viewModel, characterName, vitals.map, vitals.x, vitals.y)
                // Statuses sit under HP/MP for every class.
                StatusesSection(characterName, vitals.conditions)
                LeaderFollowerSection(characterName, dynamicState, viewModel, onOpenAnniversary = { onNavigate(Routes.ANNIVERSARY) })
                TravelSection(
                    characterName = characterName,
                    isMerchant = isMerchant,
                    travelPlaces = dynamicState.travelPlaces,
                    viewModel = viewModel,
                )
                // Merchant-class characters can't run hunts - a class capability, not the merchant role.
                if (vitals.ctype != "merchant" || characterName != dynamicState.merchantCharacter) {
                    FarmingSection(
                        characterName = characterName,
                        farmingPolicy = farming.savedMode,
                        effectiveMode = farming.effectiveMode,
                        followingLeader = farming.followingLeader,
                        isLeader = dynamicState.leader == characterName,
                        farmArea = farming.farmArea,
                        monsterFocus = dynamicState.focusFor(characterName),
                        monsterSearchRadius = dynamicState.monsterSearchRadiusByCharacter[characterName] ?: 400,
                        monsterChoices = dynamicState.monsterChoices,
                        bestiaryCatalog = dynamicState.bestiaryCatalog,
                        phoenixRouteOrder = dynamicState.phoenixRouteOrder,
                        position = com.partyconsole.companion.model.MapLocation(vitals.map, vitals.x, vitals.y),
                        target = vitals.targetId,
                        resolvedTargetType = resolvedTargetType,
                        monsterHunt = farming.hunt,
                        characterHunt = dynamicState.characterHunt[characterName],
                        huntBlacklist = farming.blacklist,
                        viewModel = viewModel,
                        onOpenHuntSettings = onOpenHuntSettings,
                        showModes = vitals.ctype != "merchant",
                        showFocus = characterName != dynamicState.merchantCharacter,
                    )
                }
                if (isMerchant) {
                    MerchantQueueSection(viewModel)
                    MerchantControlsSection(viewModel, onOpenMerchantCommerce, onOpenRoutines)
                    com.partyconsole.companion.ui.characterdetail.sections.LuckySlotSection(
                        characterName = characterName,
                        streams = dynamicState.luckySlotTracking[characterName].orEmpty(),
                        verified = dynamicState.luckyUpgradeSlots[characterName],
                        open = luckySlotOpen,
                        onOpenChange = { luckySlotOpen = it },
                        localLucky = vitals.luckySlotTracking,
                    )
                }
                EquipmentSection(
                    slots = state.inventory?.slots.orEmpty(),
                    upgradeMarks = dynamicState.upgrades[characterName].orEmpty().filter { it.equipped },
                    statScrollMarks = dynamicState.statScrolls[characterName].orEmpty(),
                    // By class, not the configured merchant role.
                    isMerchant = vitals.ctype == "merchant",
                    catalogFor = catalogFor,
                    onSlotTap = { slotName, entry -> actionTarget = ItemActionTarget.EquipmentSlot(entry.item, slotName) },
                )
                InventorySection(
                    characterName = characterName,
                    isMerchant = isMerchant,
                    items = state.inventory?.items.orEmpty(),
                    inventorySize = vitals.inventorySize,
                    loaded = state.inventory != null,
                    state = dynamicState,
                    catalogFor = catalogFor,
                    onItemTap = { entry, lucky ->
                        actionTarget = ItemActionTarget.InventorySlot(entry.item, entry.slot)
                        actionOnLucky = lucky
                    },
                    onLuckySlotData = { luckySlotOpen = true },
                    localLucky = vitals.luckySlotTracking,
                )
                RestockSection(
                    characterName,
                    dynamicState.restockPolicies[characterName] ?: com.partyconsole.companion.model.RestockPolicy(),
                    viewModel,
                )
                if (isMerchant) GoldTargetSection(characterName, dynamicState.goldTargets[characterName] ?: 0L, vitals.gold, viewModel)
                if (isMerchant) com.partyconsole.companion.ui.characterdetail.sections.RuleConflictsSection(viewModel)
                AutoMarksSection(characterName, isMerchant, dynamicState, viewModel, catalogFor)
                com.partyconsole.companion.ui.characterdetail.sections.CombatLogSection(characterName, viewModel)
            }
        }

        if (menuOpen) {
            AccountMenuSheet(
                viewModel = viewModel,
                onNavigate = onNavigate,
                onDismiss = { menuOpen = false },
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
                onLuckySlotData = if (actionOnLucky && target is ItemActionTarget.InventorySlot) ({ luckySlotOpen = true }) else null,
            )
        }
    }
}
