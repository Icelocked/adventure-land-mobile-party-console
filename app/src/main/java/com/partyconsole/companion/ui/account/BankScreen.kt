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
import com.partyconsole.companion.ui.PartyViewModel
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
            Button(onClick = { scope.launch { viewModel.api.requestBankSort(pending == null) } }) {
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
                TextButton(onClick = {
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
    var pickingWithdraw by remember(expanded) { mutableStateOf(false) }
    var pickingStand by remember(expanded) { mutableStateOf(false) }
    var standPrice by remember(expanded) { mutableStateOf("") }

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
                if (pickingStand) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        OutlinedTextField(
                            value = standPrice,
                            onValueChange = { new -> if (new.all { it.isDigit() }) standPrice = new },
                            label = { Text("Price") },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                        Button(onClick = {
                            scope.launch {
                                viewModel.api.markForStand(entry.item, entry.slot, bankPack = pack, price = standPrice.toLongOrNull() ?: 0L)
                                pickingStand = false
                            }
                        }) { Text("List") }
                    }
                } else if (!pickingWithdraw) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 4.dp)) {
                        TextButton(onClick = { pickingWithdraw = true }) { Text("Withdraw to...") }
                        TextButton(onClick = { pickingStand = true }) { Text("Mark for stand") }
                        TextButton(onClick = {
                            scope.launch { viewModel.api.sellBankItemToNpc(entry.item, pack, entry.slot) }
                        }) { Text("Sell to NPC") }
                        TextButton(onClick = {
                            scope.launch { viewModel.api.markBankItemForDeconstruction(entry.item, pack, entry.slot) }
                        }) { Text("Deconstruct") }
                    }
                } else {
                    Column(modifier = Modifier.padding(top = 4.dp)) {
                        for (name in roster.keys) {
                            TextButton(onClick = {
                                scope.launch {
                                    viewModel.api.withdrawFromBank(name, entry.item, pack, entry.slot)
                                    pickingWithdraw = false
                                }
                            }) { Text("  → $name") }
                        }
                    }
                }
            }
        }
    }
}
