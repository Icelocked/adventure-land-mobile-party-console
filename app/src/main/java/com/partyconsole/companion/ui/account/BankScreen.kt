package com.partyconsole.companion.ui.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.BankSortRequest
import com.partyconsole.companion.model.BankVault
import com.partyconsole.companion.model.CharacterState
import com.partyconsole.companion.model.InventoryEntry
import com.partyconsole.companion.model.RosterMember
import com.partyconsole.companion.model.sameMarkedItem
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.components.NpcSaleSheet
import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import com.partyconsole.companion.ui.itemicon.displayName
import com.partyconsole.companion.ui.itemicon.rememberCatalogLookup
import kotlinx.coroutines.launch

/** Shared bank vault browse (bank-sheet.tsx) grouped by pack, with the two
 *  actions that were missing before: withdraw to a character, and sell
 *  directly to an NPC without withdrawing first. Tap a row to expand its
 *  action strip - keeps the list scannable instead of a permanent row of
 *  buttons on every entry. */
@Composable
fun BankScreen(viewModel: PartyViewModel, onBack: () -> Unit) {
    com.partyconsole.companion.ui.DomainInterest(viewModel, com.partyconsole.companion.data.Domain.BANK)
    val state by viewModel.dynamicState.collectAsState()
    val roster by viewModel.roster.collectAsState()
    val characters by viewModel.characters.collectAsState()
    val catalogFor = rememberCatalogLookup(state.merchantCatalog)
    var expandedKey by remember { mutableStateOf<String?>(null) }
    val bank = state.bank
    val topScope = rememberCoroutineScope()

    AccountScreenScaffold(
        "Bank" + (bank?.let { " · ${"%,d".format(it.gold)}g" } ?: ""),
        onBack,
        onRefresh = { topScope.launch { viewModel.refreshDynamicStateNow() } },
    ) {
        GoldBreakdown(bankGold = bank?.gold ?: 0L, characters = characters)
        if (state.bankSortMode == "request") {
            BankSortToggle(pending = state.bankSortRequest, viewModel = viewModel)
        }
        LockedVaultsSection(bankVaults = state.bankVaults, unlockedPacks = bank?.packs?.keys ?: emptySet(), viewModel = viewModel)
        if (bank == null || bank.packs.isEmpty()) {
            EmptyState("No bank data yet.")
        } else {
            LazyColumn(contentPadding = PaddingValues(12.dp)) {
                for ((packName, entries) in bank.packs) {
                    val filled = entries.filterNotNull()
                    if (filled.isEmpty()) continue
                    item {
                        Text(
                            packName,
                            style = MaterialTheme.typography.titleSmall,
                            modifier = Modifier.padding(top = 8.dp, bottom = 4.dp),
                        )
                    }
                    items(filled, key = { "$packName:${it.slot}" }) { entry ->
                        val key = "$packName:${entry.slot}"
                        BankRow(
                            entry = entry,
                            pack = packName,
                            catalogFor = catalogFor,
                            expanded = expandedKey == key,
                            onToggle = { expandedKey = if (expandedKey == key) null else key },
                            roster = roster,
                            viewModel = viewModel,
                        )
                    }
                }
            }
        }
    }
}

/** The full gold picture in one place: the shared bank vault plus every
 *  connected character's carried amount, and the grand total - the "read
 *  data as if sitting in front of the computer" gold overview, distinct
 *  from just the title bar's single combined number. */
@Composable
private fun GoldBreakdown(bankGold: Long, characters: Map<String, CharacterState>) {
    val total = bankGold + characters.values.sumOf { it.vitals?.gold ?: 0L }
    Card(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Bank vault", style = MaterialTheme.typography.bodyMedium)
                Text("${"%,d".format(bankGold)}g", style = MaterialTheme.typography.bodyMedium)
            }
            for ((name, state) in characters) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(name, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("${"%,d".format(state.vitals?.gold ?: 0L)}g", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Row(modifier = Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Total", style = MaterialTheme.typography.titleSmall)
                Text("${"%,d".format(total)}g", style = MaterialTheme.typography.titleSmall)
            }
        }
    }
}

/** bank-sort-control.tsx's one-shot "Sort on next visit" toggle, distinct from the standing
 *  automatic/on-request mode radio already ported into Collection settings - only shown while
 *  that mode is "request". */
@Composable
private fun BankSortToggle(pending: BankSortRequest?, viewModel: PartyViewModel) {
    val scope = rememberCoroutineScope()
    val statusLabel = when (pending?.status) {
        "sorting" -> "Sorting"
        "retry" -> "Retry pending" + (pending.message?.let { ": $it" } ?: "")
        null -> ""
        else -> "Queued"
    }
    Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Button(onClick = { scope.launch { viewModel.api.requestBankSort(pending == null); viewModel.refreshDynamicStateNow() } }) {
                Text("Sort on next visit · " + if (pending != null) "On" else "Off")
            }
            if (statusLabel.isNotEmpty()) {
                Text(statusLabel, modifier = Modifier.padding(start = 8.dp), style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

/** bank-unlock.ts's locked-vault list, grouped by floor - the base "bank" floor's
 *  vaults each just cost gold once accessible; a non-base floor (bank_b/bank_u)
 *  needs its own first (0-gold) vault unlocked with an owned key before any other
 *  vault on that floor opens. The server enforces that ordering; this UI just
 *  offers whichever action a locked vault's own fields call for and surfaces the
 *  server's error if it's out of order. */
@Composable
private fun LockedVaultsSection(bankVaults: List<BankVault>, unlockedPacks: Set<String>, viewModel: PartyViewModel) {
    var expandedFloor by remember { mutableStateOf<String?>(null) }
    val locked = bankVaults.filter { it.pack !in unlockedPacks }
    if (locked.isEmpty()) return
    val byFloor = locked.groupBy { it.floor }

    Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text("Locked bank vaults (${locked.size})", style = MaterialTheme.typography.bodyMedium)
            for ((floor, vaults) in byFloor) {
                TextButton(onClick = { expandedFloor = if (expandedFloor == floor) null else floor }) {
                    Text("$floor (${vaults.size})", style = MaterialTheme.typography.labelMedium)
                }
                if (expandedFloor == floor) {
                    Column(modifier = Modifier.padding(start = 12.dp)) {
                        for (vault in vaults) {
                            LockedVaultRow(vault, viewModel)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LockedVaultRow(vault: BankVault, viewModel: PartyViewModel) {
    val scope = rememberCoroutineScope()
    var confirming by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val needsKey = vault.gold == 0L && vault.key != null
    val label = if (needsKey) "Unlock with ${vault.key?.name ?: "key"}" else "Unlock · ${"%,d".format(vault.gold)}g"

    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(vault.pack, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (confirming) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = {
                    confirming = false
                    error = null
                    scope.launch {
                        val result = viewModel.api.unlockBankVault(vault.pack, if (needsKey) "key" else null)
                        if (result is com.partyconsole.companion.network.ApiResult.Failure) error = result.message
                        viewModel.refreshDynamicStateNow()
                    }
                }) { Text("Confirm") }
                TextButton(onClick = { confirming = false }) { Text("Cancel") }
            }
        } else {
            TextButton(onClick = { confirming = true }) { Text(label, style = MaterialTheme.typography.labelSmall) }
        }
    }
    error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall) }
}

@Composable
private fun BankRow(
    entry: InventoryEntry,
    pack: String,
    catalogFor: (String) -> CatalogItem?,
    expanded: Boolean,
    onToggle: () -> Unit,
    roster: Map<String, RosterMember>,
    viewModel: PartyViewModel,
) {
    val scope = rememberCoroutineScope()
    val state by viewModel.dynamicState.collectAsState()
    val merchant = state.merchantCharacter
    val meta = catalogFor(entry.item.name)?.meta
    val stack = maxOf(1, entry.item.q ?: 1)
    // bank-sheet.tsx: the same identity checks the dashboard badges with.
    val withdrawMarked = merchant != null && state.withdrawals[merchant].orEmpty().any { it.pack == pack && it.slot == entry.slot && sameMarkedItem(it.item, entry.item) }
    var mode by remember(expanded) { mutableStateOf<String?>(null) } // "stand" | "npc"
    var error by remember(expanded) { mutableStateOf<String?>(null) }

    // bank-withdrawal.tsx: in-flight guard (withdraw is a server toggle, so
    // a second tap would remove the mark just added) and the "Remove
    // automatic bank mark?" consent on auto_bank_confirmation_required.
    var withdrawing by remember { mutableStateOf(false) }
    var confirmingWithdraw by remember(expanded) { mutableStateOf<Boolean?>(null) } // markAll of the pending request
    fun withdraw(markAll: Boolean, confirmed: Boolean = false) {
        if (withdrawing || merchant == null || (confirmingWithdraw != null && !confirmed)) return
        withdrawing = true
        scope.launch {
            try {
                when (val result = viewModel.api.withdrawFromBank(merchant, entry.item, pack, entry.slot, markAll, confirmed)) {
                    is ApiResult.Failure ->
                        if (!confirmed && result.code == "auto_bank_confirmation_required") {
                            error = null
                            confirmingWithdraw = markAll
                        } else {
                            error = result.message
                        }
                    is ApiResult.Success -> {
                        confirmingWithdraw = null
                        viewModel.refreshDynamicStateNow()
                    }
                }
            } finally {
                withdrawing = false
            }
        }
    }

    Card(onClick = onToggle, modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Column(modifier = Modifier.padding(8.dp)) {
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                SpriteIcon(catalogFor(entry.item.name)?.sprite, size = 36.dp)
                Text(
                    "${displayName(entry.item.name, catalogFor)}${entry.item.level?.let { " +$it" } ?: ""}" +
                        (entry.item.q?.let { if (it > 1) " x$it" else "" } ?: ""),
                    modifier = Modifier.padding(start = 8.dp),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            if (expanded) {
                when (mode) {
                    "stand" -> BankStandForm(entry, pack, meta, state.standListings.find { it.bankPack == pack && it.bankSlot == entry.slot && sameMarkedItem(it.item, entry.item) }, viewModel) { mode = null }
                    "npc" -> NpcSaleSheet(
                        item = entry.item,
                        meta = meta,
                        location = "From the bank ($pack)",
                        available = stack,
                        onConfirm = { quantity, acknowledged ->
                            when (val result = viewModel.api.sellBankItemToNpc(entry.item, pack, entry.slot, quantity, acknowledged)) {
                                is ApiResult.Failure -> result.message.ifBlank { "NPC sale failed" }
                                is ApiResult.Success -> {
                                    viewModel.refreshDynamicStateNow()
                                    mode = null
                                    null
                                }
                            }
                        },
                        onCancel = { mode = null },
                    )
                    else -> Column(modifier = Modifier.padding(top = 4.dp)) {
                        if (merchant == null) {
                            Text("No merchant is configured.", style = MaterialTheme.typography.labelSmall)
                        } else {
                            TextButton(enabled = !withdrawing && confirmingWithdraw == null, onClick = { withdraw(false) }) {
                                Text(if (withdrawMarked) "Unmark withdrawal" else "Mark for withdrawal")
                            }
                            TextButton(enabled = !withdrawing && confirmingWithdraw == null, onClick = { withdraw(true) }) { Text("Mark all for withdrawal") }
                        }
                        confirmingWithdraw?.let { markAll ->
                            Text("Remove automatic bank mark?", style = MaterialTheme.typography.titleSmall)
                            Text(
                                "This item is automatically marked for bank. Allow withdrawal and remove mark?",
                                style = MaterialTheme.typography.labelSmall,
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(enabled = !withdrawing, onClick = { withdraw(markAll, confirmed = true) }) { Text(if (withdrawing) "Withdrawing…" else "Confirm") }
                                TextButton(enabled = !withdrawing, onClick = { confirmingWithdraw = null }) { Text("Cancel") }
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            TextButton(onClick = { mode = "stand" }) { Text("Mark for stand") }
                            TextButton(onClick = { mode = "npc" }) { Text("Sell to NPC") }
                            TextButton(onClick = {
                                scope.launch {
                                    val result = viewModel.api.markBankItemForDeconstruction(entry.item, pack, entry.slot)
                                    if (result is ApiResult.Failure) error = result.message
                                    viewModel.refreshDynamicStateNow()
                                }
                            }) { Text("Deconstruct") }
                        }
                    }
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            }
        }
    }
}

/** The bank row's stand listing (party-management-panels.tsx): price
 *  defaults to the existing listing or the catalog value (never below 1),
 *  quantity to the existing listing or the stack, and "Mark all" lists
 *  every identical copy held by the merchant or stored in the bank. */
@Composable
private fun BankStandForm(
    entry: InventoryEntry,
    pack: String,
    meta: com.partyconsole.companion.model.ItemMeta?,
    existing: com.partyconsole.companion.model.StandListing?,
    viewModel: PartyViewModel,
    onDone: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val stack = maxOf(1, entry.item.q ?: 1)
    val catalogValue = ((meta?.definition?.get("g") as? kotlinx.serialization.json.JsonPrimitive)?.content?.toDoubleOrNull()?.toLong() ?: 0L)
    var price by remember { mutableStateOf((existing?.price?.takeIf { it > 0 } ?: maxOf(1L, catalogValue)).toString()) }
    var quantity by remember { mutableStateOf((existing?.quantity?.takeIf { it > 0 } ?: stack).toString()) }
    var markAll by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    Column(modifier = Modifier.fillMaxWidth().padding(top = 4.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = price,
                onValueChange = { new -> if (new.all { it.isDigit() }) price = new },
                label = { Text("Price") },
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
            if (stack > 1 && !markAll) {
                OutlinedTextField(
                    value = quantity,
                    onValueChange = { new -> if (new.all { it.isDigit() }) quantity = new },
                    label = { Text("Quantity") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
            }
        }
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            androidx.compose.material3.Checkbox(checked = markAll, onCheckedChange = { markAll = it })
            Text("List every identical copy held by the merchant or stored in the bank at this price", style = MaterialTheme.typography.labelSmall)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(enabled = !busy, onClick = {
                val value = price.toLongOrNull()
                val count = if (stack > 1 && !markAll) quantity.toIntOrNull() else stack
                when {
                    value == null || value < 1 -> error = "Enter a price of at least 1 gold."
                    count == null || count < 1 || count > stack -> error = "Enter a quantity from 1 to $stack."
                    else -> scope.launch {
                        busy = true
                        error = null
                        val result = viewModel.api.markForStand(entry.item, entry.slot, bankPack = pack, price = value, quantity = count, markAll = markAll, id = existing?.id)
                        busy = false
                        if (result is ApiResult.Failure) {
                            error = result.message
                        } else {
                            viewModel.refreshDynamicStateNow()
                            onDone()
                        }
                    }
                }
            }) { Text("List") }
            TextButton(enabled = !busy, onClick = onDone) { Text("Cancel") }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    }
}
