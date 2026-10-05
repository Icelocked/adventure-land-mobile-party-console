package com.partyconsole.companion.ui.itempanel

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
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
import com.partyconsole.companion.domain.automaticCommerceRuleKey
import com.partyconsole.companion.domain.canDeconstruct
import com.partyconsole.companion.domain.standIsFull
import com.partyconsole.companion.model.InventoryEntry
import com.partyconsole.companion.model.sameMarkedItem
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.network.CommandResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.components.AutoNpcSaleConfirmation
import com.partyconsole.companion.ui.components.DeconstructionConfirmation
import com.partyconsole.companion.ui.components.NpcSaleSheet
import com.partyconsole.companion.ui.components.StandListingForm
import com.partyconsole.companion.ui.itemdetail.ItemDetailBrowser
import com.partyconsole.companion.ui.itemdetail.itemMaximumLevel
import com.partyconsole.companion.ui.itemicon.rememberCatalogLookup
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.Json

/** The options list for one bank item, in the dashboard's order and all
 *  acting through the configured merchant: Item details, withdrawal (one /
 *  all), stand (mark / unmark, auto), upgrade (mark via withdrawal / auto),
 *  deconstruction (mark / auto), NPC sale (sell / auto), Clear all marks. */
@Composable
fun BankItemPanel(viewModel: PartyViewModel, pack: String, entry: InventoryEntry, onClose: () -> Unit) {
    val state by viewModel.dynamicState.collectAsState()
    val scope = rememberCoroutineScope()
    val catalogFor = rememberCatalogLookup(state.merchantCatalog)
    val merchant = state.merchantCharacter
    val item = entry.item
    val meta = catalogFor(item.name)?.meta
    val level = item.level ?: 0
    var expanded by remember(entry) { mutableStateOf<String?>(null) }
    var showingDetails by remember(entry) { mutableStateOf(false) }
    var error by remember(entry) { mutableStateOf<String?>(null) }
    fun toggle(key: String) { expanded = if (expanded == key) null else key }

    // The same identity checks the bank tile badges use.
    val withdrawMarked = merchant != null && state.withdrawals[merchant].orEmpty().any { it.pack == pack && it.slot == entry.slot && sameMarkedItem(it.item, item) }
    val standListing = state.standListings.find { it.bankPack == pack && it.bankSlot == entry.slot && sameMarkedItem(it.item, item) }
    val standFull = standIsFull(state.standListings, state.standBids)
    val canUpgrade = merchant != null && item.l == null && item.b != true && meta?.upgradeable == true && itemMaximumLevel(meta) > level

    suspend fun confirmWith(action: suspend () -> ApiResult<CommandResult>): String? =
        when (val result = action()) {
            is ApiResult.Failure -> result.message
            is ApiResult.Success -> {
                viewModel.refreshDynamicStateNow()
                onClose()
                null
            }
        }
    fun run(action: suspend () -> ApiResult<CommandResult>) {
        scope.launch {
            error = null
            confirmWith(action)?.let { error = it }
        }
    }

    // In-flight guard (withdraw is a server toggle) and the "Remove automatic
    // bank mark?" consent on auto_bank_confirmation_required.
    var withdrawing by remember { mutableStateOf(false) }
    var confirmingWithdraw by remember(entry) { mutableStateOf<Pair<Boolean, Int?>?>(null) }
    var confirmError by remember(entry) { mutableStateOf<String?>(null) }
    fun withdraw(markAll: Boolean, upgradeTiers: Int? = null, confirmed: Boolean = false) {
        // Other withdrawals wait while a confirmation is pending.
        if (withdrawing || merchant == null || (confirmingWithdraw != null && !confirmed)) return
        withdrawing = true
        scope.launch {
            try {
                when (val result = viewModel.api.withdrawFromBank(merchant, item, pack, entry.slot, markAll, confirmed, upgradeTiers)) {
                    is ApiResult.Failure -> when {
                        !confirmed && result.code == "auto_bank_confirmation_required" -> {
                            error = null
                            confirmError = null
                            confirmingWithdraw = markAll to upgradeTiers
                        }
                        // A failed confirmed retry keeps the prompt open with its error.
                        confirmed -> confirmError = result.message
                        else -> error = result.message
                    }
                    is ApiResult.Success -> {
                        confirmingWithdraw = null
                        viewModel.refreshDynamicStateNow()
                        onClose()
                    }
                }
            } finally {
                withdrawing = false
            }
        }
    }

    ModalBottomSheet(onDismissRequest = onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp)) {
            Text("Bank · $pack · slot ${entry.slot}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                item.statType?.let { Text(it) }
                item.q?.takeIf { it > 1 }?.let { Text("x$it") }
                item.p?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

            TapRow("Item details") { showingDetails = true }

            if (merchant != null) {
                TapRow(if (withdrawMarked) "Unmark withdrawal" else "Mark for withdrawal", enabled = confirmingWithdraw == null) { withdraw(false) }
                TapRow("Mark all for withdrawal", enabled = confirmingWithdraw == null) { withdraw(true) }
            } else {
                Text("No merchant is configured.", style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(vertical = 8.dp))
            }
            confirmingWithdraw?.let { (markAll, tiers) ->
                Column(modifier = Modifier.padding(vertical = 6.dp, horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Remove automatic bank mark?", style = MaterialTheme.typography.titleSmall)
                    Text("This item is automatically marked for bank. Allow withdrawal and remove mark?", style = MaterialTheme.typography.labelSmall)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(enabled = !withdrawing, onClick = { withdraw(markAll, tiers, confirmed = true) }) { Text(if (withdrawing) "Withdrawing…" else "Confirm") }
                        OutlinedButton(enabled = !withdrawing, onClick = { confirmingWithdraw = null; confirmError = null }) { Text("Cancel") }
                    }
                    confirmError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                }
            }

            if (standListing != null) {
                TapRow("Unmark for stand") { run { viewModel.api.removeStandListing(standListing) } }
            } else {
                TapRow("Mark for stand", enabled = !standFull) { toggle("stand") }
            }
            if (expanded == "stand") {
                StandListingForm(
                    viewModel, item, meta,
                    existingId = standListing?.id, existingPrice = standListing?.price, existingQuantity = standListing?.quantity,
                    onCancel = { expanded = null },
                    onSubmit = { draft -> confirmWith { viewModel.api.markForStand(item, entry.slot, bankPack = pack, price = draft.price, quantity = draft.quantity, markAll = draft.markAll, id = standListing?.id) } },
                )
            }
            if (merchant != null && item.l == null) TapRow("Auto mark for stand…") { toggle("autostand") }
            if (expanded == "autostand") {
                val rule = state.autoStandMarks[automaticCommerceRuleKey(item)]
                StandListingForm(
                    viewModel, item, meta, existingPrice = rule?.price, auto = true,
                    onCancel = { expanded = null },
                    onSubmit = { draft -> confirmWith { viewModel.api.autoStand(item, draft.price) } },
                )
            }

            if (canUpgrade) {
                TapRow("Mark for upgrade") { toggle("upgrade") }
                // bank "Mark for upgrade" withdraws the item to the merchant to upgrade it.
                if (expanded == "upgrade") {
                    UpgradeTierPicker(meta, level) { tiers -> withdraw(false, tiers) }
                    // The bank has no offering provider, so these stay disabled.
                    com.partyconsole.companion.ui.components.OfferingRows(viewModel, merchant!!, item, meta, enabled = false)
                }
                TapRow("Auto mark for upgrade") { toggle("autoupgrade") }
                if (expanded == "autoupgrade") {
                    UpgradeTierPicker(meta, level) { tiers ->
                        run { viewModel.api.itemCommand("auto-upgrade-mark", merchant!!, item, JsonPrimitive(-1), mapOf("tiers" to JsonPrimitive(tiers))) }
                    }
                    com.partyconsole.companion.ui.components.AddUpgradeRule(viewModel, merchant!!, item, meta, enabled = false)
                }
            }

            if (merchant != null && canDeconstruct(item, state.deconstructionCatalog)) {
                TapRow("Mark for deconstruction") { toggle("decon") }
                if (expanded == "decon") {
                    DeconstructionConfirmation(item, auto = false, catalog = state.deconstructionCatalog, catalogFor = catalogFor, onCancel = { expanded = null },
                        onConfirm = { confirmWith { viewModel.api.markBankItemForDeconstruction(item, pack, entry.slot, false) } })
                }
                TapRow("Auto mark for deconstruction") { toggle("autodecon") }
                if (expanded == "autodecon") {
                    DeconstructionConfirmation(item, auto = true, catalog = state.deconstructionCatalog, catalogFor = catalogFor, onCancel = { expanded = null },
                        onConfirm = { confirmWith { viewModel.api.autoDeconstruct(merchant, item) } })
                }
            }

            TapRow("Sell to NPC…") { toggle("npcsale") }
            if (expanded == "npcsale") {
                NpcSaleSheet(
                    item = item, meta = meta, location = "Bank · $pack · slot ${entry.slot}", available = item.q ?: 1,
                    onCancel = { expanded = null },
                    onConfirm = { quantity, acknowledged -> confirmWith { viewModel.api.sellBankItemToNpc(item, pack, entry.slot, quantity, acknowledged) } },
                )
            }
            // The rule is created for the merchant.
            if (merchant != null && item.l == null) TapRow("Auto sell to NPC…") { toggle("autonpc") }
            if (merchant != null && expanded == "autonpc") {
                val name = (meta?.definition?.get("name") as? JsonPrimitive)?.content ?: catalogFor(item.name)?.name ?: item.name
                AutoNpcSaleConfirmation(item, meta, name, merchant, onCancel = { expanded = null }, onConfirm = { confirmWith { viewModel.api.autoNpcSale(merchant, item) } })
            }

            if (merchant != null) {
                TapRow("Clear all marks") {
                    run {
                        viewModel.api.post(
                            "command",
                            JsonObject(
                                mapOf(
                                    "character" to JsonPrimitive(merchant),
                                    "type" to JsonPrimitive("clear-item-marks"),
                                    "pack" to JsonPrimitive(pack),
                                    "slot" to JsonPrimitive(entry.slot),
                                    "item" to Json.encodeToJsonElement(com.partyconsole.companion.model.Item.serializer(), item),
                                ),
                            ),
                        )
                    }
                }
            }
        }
    }

    if (showingDetails) {
        ModalBottomSheet(onDismissRequest = { showingDetails = false }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
            Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp)) {
                ItemDetailBrowser(
                    rootItemId = item.name,
                    rootLevel = level,
                    catalog = state.merchantCatalog,
                    monsters = state.bestiaryCatalog,
                    rootStatType = item.statType,
                    rootGift = item.gift == true,
                    rootExpires = item.expires,
                    context = com.partyconsole.companion.ui.itemdetail.ItemDetailContext("Bank · $pack", entry.slot),
                    onAddStand = if (merchant != null) ({ showingDetails = false; expanded = "stand" }) else null,
                    viewModel = viewModel,
                )
            }
        }
    }
}
