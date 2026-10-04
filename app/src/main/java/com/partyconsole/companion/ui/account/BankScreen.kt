package com.partyconsole.companion.ui.account

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.data.Domain
import com.partyconsole.companion.domain.abbreviatedGold
import com.partyconsole.companion.domain.automaticCommerceRuleKey
import com.partyconsole.companion.model.BankVault
import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.model.InventoryEntry
import com.partyconsole.companion.model.sameMarkedItem
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.DomainInterest
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.components.MluckClover
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import com.partyconsole.companion.ui.itemicon.displayName
import com.partyconsole.companion.ui.itemicon.rememberCatalogLookup
import com.partyconsole.companion.ui.itempanel.BankItemPanel
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

private val Amber = Color(0xFFF59E0B)
private val Emerald = Color(0xFF10B981)
private val Fuchsia = Color(0xFFE879F9)

/** Shared bank browse (the PWA's BankScreen.tsx, bank-sheet.tsx's action
 *  set): gold breakdown, sort-on-next-visit, additional storage, search,
 *  collapsible packs with free counts, per-item marks, and the bankbois.
 *  Tap an item for its options (BankItemPanel). */
@Composable
fun BankScreen(viewModel: PartyViewModel, onBack: () -> Unit) {
    DomainInterest(viewModel, Domain.BANK)
    val state by viewModel.dynamicState.collectAsState()
    val characters by viewModel.characters.collectAsState()
    val scope = rememberCoroutineScope()
    val catalogFor = rememberCatalogLookup(state.merchantCatalog)
    var opened by remember { mutableStateOf<Pair<String, InventoryEntry>?>(null) }
    var search by remember { mutableStateOf("") }
    var collapsed by remember { mutableStateOf(setOf<String>()) }
    val query = search.trim().lowercase()
    // bank-sheet.tsx matchesSearch: item id or name; non-matches are dimmed.
    fun matches(entry: InventoryEntry) = query.isEmpty() || listOf(entry.item.name, catalogFor(entry.item.name)?.name).any { it.orEmpty().lowercase().contains(query) }
    val bank = state.bank

    AccountScreenScaffold("Bank${bank?.let { " · ${"%,d".format(it.gold)}g" } ?: ""}", onBack, onRefresh = { scope.launch { viewModel.refreshDynamicStateNow() } }) {
        LazyColumn(modifier = Modifier.fillMaxSize()) {
            item {
                // Gold breakdown
                Card(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        val bankGold = bank?.gold ?: 0L
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text("Bank vault"); Text("${"%,d".format(bankGold)}g") }
                        for ((name, character) in characters) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(name, style = MaterialTheme.typography.labelSmall)
                                Text("${"%,d".format(character.vitals?.gold ?: 0)}g", style = MaterialTheme.typography.labelSmall)
                            }
                        }
                        HorizontalDivider(modifier = Modifier.padding(vertical = 6.dp))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Total", fontWeight = FontWeight.Medium)
                            Text("${"%,d".format(bankGold + characters.values.sumOf { it.vitals?.gold ?: 0 })}g", fontWeight = FontWeight.Medium)
                        }
                    }
                }
            }
            if (state.bankSortMode == "request") item { BankSortToggle(viewModel) }
            item { AdditionalStorageSection(viewModel) }
            item {
                OutlinedTextField(value = search, onValueChange = { search = it }, label = { Text("Search by item name or ID…") }, singleLine = true, modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp))
            }
            if (bank == null || bank.packs.isEmpty()) {
                item { EmptyState("No snapshot yet. Send a character to the bank once to load it.") }
            } else {
                for ((packName, entries) in bank.packs) {
                    val filled = entries.filterNotNull()
                    // items1's last 7 slots are reserved and never usable (bank-sheet.tsx usableItems).
                    val usable = if (packName == "items1") entries.take(35) else entries
                    val free = usable.size - usable.count { it != null }
                    val expanded = packName !in collapsed
                    item(key = "pack-$packName") {
                        val freeColor = when {
                            free < 5 -> MaterialTheme.colorScheme.error
                            free <= 10 -> Amber
                            else -> MaterialTheme.colorScheme.onSurfaceVariant
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth().clickable { collapsed = if (expanded) collapsed + packName else collapsed - packName }.padding(horizontal = 12.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(packName, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                            Text("${filled.size}/${entries.size} · $free free", color = freeColor, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall)
                            Text(if (expanded) " ▾" else " ▸")
                        }
                    }
                    if (expanded) {
                        if (filled.isEmpty()) item { Text("Empty.", style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = 16.dp)) }
                        items(filled, key = { "$packName:${it.slot}" }) { entry ->
                            BankRow(viewModel, entry, packName, catalogFor, dimmed = !matches(entry)) { opened = packName to entry }
                        }
                    }
                }
            }
            bankbois(viewModel, catalogFor, ::matches) { pack, entry -> opened = pack to entry }
        }
    }
    opened?.let { (pack, entry) -> BankItemPanel(viewModel, pack, entry) { opened = null } }
}

/** bank-sort-control.tsx's one-shot "Sort on next visit" toggle - only shown
 *  while the standing mode is "request". */
@Composable
private fun BankSortToggle(viewModel: PartyViewModel) {
    val state by viewModel.dynamicState.collectAsState()
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val pending = state.bankSortRequest
    val statusLabel = when (pending?.status) {
        null -> ""
        "sorting" -> "Sorting"
        "retry" -> "Retry pending${pending.message?.let { ": $it" } ?: ""}"
        else -> "Queued"
    }
    Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                val label = "Sort on next visit · ${if (pending != null) "On" else "Off"}"
                val onClick: () -> Unit = {
                    scope.launch {
                        busy = true
                        error = null
                        when (val result = viewModel.api.requestBankSort(pending == null)) {
                            is ApiResult.Failure -> error = result.message.ifBlank { "Could not update bank sorting" }
                            is ApiResult.Success -> viewModel.refreshDynamicStateNow()
                        }
                        busy = false
                    }
                }
                if (pending != null) Button(enabled = !busy, onClick = onClick) { Text(label) } else OutlinedButton(enabled = !busy, onClick = onClick) { Text(label) }
                if (statusLabel.isNotEmpty()) Text(statusLabel, style = MaterialTheme.typography.labelSmall)
            }
            Text(
                "Sorts all accessible bank floors after banking work. Compatible stacks are always combined, even when sorting is off. Does not send the merchant to the bank. If already banking, waits for the following visit.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

private val FLOOR_NAMES = mapOf("bank" to "Main bank", "bank_b" to "Bank basement", "bank_u" to "Bank underground")

/** bank-sheet.tsx "Additional bank storage": each floor, whether it's
 *  accessible (or which key unlocks it, and how many are owned), and the
 *  purchasable vaults on accessible floors - every unlock confirmed first
 *  and sent through the configured merchant. */
@Composable
private fun AdditionalStorageSection(viewModel: PartyViewModel) {
    val state by viewModel.dynamicState.collectAsState()
    val characters by viewModel.characters.collectAsState()
    val scope = rememberCoroutineScope()
    val merchant = state.merchantCharacter
    val vaults = state.bankVaults
    val bank = state.bank
    var unlocking by remember { mutableStateOf<Pair<BankVault, String>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    if (vaults.isEmpty()) return
    val unlocked = bank?.packs?.keys.orEmpty()
    // bank-sheet.tsx keyQuantity: the merchant's inventory plus every bank pack.
    fun keyQuantity(key: String): Int {
        var quantity = merchant?.let { characters[it]?.inventory?.items }.orEmpty().sumOf { if (it?.item?.name == key) it.item.q ?: 1 else 0 }
        for (entries in bank?.packs?.values.orEmpty()) for (entry in entries) if (entry?.item?.name == key) quantity += entry.item.q ?: 1
        return quantity
    }
    fun floorAccessible(floor: String) = floor == "bank" || vaults.any { it.floor == floor && it.gold == 0L && it.pack in unlocked }

    Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Additional bank storage", style = MaterialTheme.typography.titleSmall)
            for (floor in vaults.map { it.floor }.distinct()) {
                val accessible = floorAccessible(floor)
                val floorVaults = vaults.filter { it.floor == floor }
                val key = floorVaults.firstNotNullOfOrNull { it.key }
                val ownedKeys = key?.let { keyQuantity(it.id) } ?: 0
                val locked = floorVaults.filter { it.pack !in unlocked && it.gold > 0 }
                Column(modifier = Modifier.fillMaxWidth().border(BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), RoundedCornerShape(6.dp)).padding(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(FLOOR_NAMES[floor] ?: floor, style = MaterialTheme.typography.bodyMedium)
                            Text(
                                if (accessible) "ACCESSIBLE" else "LOCKED${key?.let { " · REQUIRES ${(it.name ?: it.id).uppercase()}" } ?: ""}",
                                color = if (accessible) Emerald else MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.labelSmall,
                            )
                        }
                        if (!accessible && key != null) {
                            OutlinedButton(enabled = ownedKeys > 0 && merchant != null, onClick = { unlocking = floorVaults.first() to "key" }) {
                                Column {
                                    Text("Unlock with ${key.name ?: key.id}")
                                    Text("Owned: $ownedKeys", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall)
                                }
                            }
                        }
                    }
                    when {
                        accessible && locked.isNotEmpty() -> for (row in locked.chunked(2)) {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
                                for (vault in row) {
                                    OutlinedButton(enabled = merchant != null, onClick = { unlocking = vault to "gold" }, modifier = Modifier.weight(1f)) {
                                        Column {
                                            Text("Unlock ${vault.pack}")
                                            Text("${abbreviatedGold(vault.gold)} gold", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall)
                                        }
                                    }
                                }
                                if (row.size == 1) Box(modifier = Modifier.weight(1f))
                            }
                        }
                        accessible -> Text("No purchasable locked vaults detected on this floor.", style = MaterialTheme.typography.labelSmall)
                        else -> Text("Vault purchases remain disabled until floor access is unlocked.", style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
            unlocking?.let { (vault, kind) ->
                Column(
                    modifier = Modifier.fillMaxWidth().border(BorderStroke(1.dp, Amber.copy(alpha = 0.5f)), RoundedCornerShape(6.dp)).padding(10.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(if (kind == "key") "Unlock bank floor?" else "Unlock bank vault?", style = MaterialTheme.typography.titleSmall)
                    Text(
                        if (kind == "key") "${merchant ?: "The merchant"} will retrieve and consume ${vault.key?.name ?: "the required key"} to unlock ${FLOOR_NAMES[vault.floor] ?: vault.floor}."
                        else "${merchant ?: "The merchant"} will spend ${"%,d".format(vault.gold)} gold to permanently unlock ${vault.pack}.",
                        style = MaterialTheme.typography.labelSmall,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End), modifier = Modifier.fillMaxWidth()) {
                        OutlinedButton(onClick = { unlocking = null }) { Text("Cancel") }
                        Button(onClick = {
                            unlocking = null
                            scope.launch {
                                error = null
                                (viewModel.api.unlockBankVault(vault.pack, kind) as? ApiResult.Failure)?.let { error = it.message }
                                viewModel.refreshDynamicStateNow()
                            }
                        }) { Text("Confirm unlock") }
                    }
                }
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall) }
        }
    }
}

/** bank-sheet.tsx "Bankbois": overflow storage workers - create one (the
 *  first reserves 7 slots of bank pane 1, so it asks), each one's state,
 *  load and error, its items (the same options as a bank item, on pack
 *  bankboi:NAME), and a two-step delete once it's empty. */
private fun LazyListScope.bankbois(viewModel: PartyViewModel, catalogFor: (String) -> CatalogItem?, matches: (InventoryEntry) -> Boolean, onOpen: (String, InventoryEntry) -> Unit) {
    item(key = "bankbois") { BankboisHeader(viewModel) }
    item(key = "bankbois-list") {
        val state by viewModel.dynamicState.collectAsState()
        val scope = rememberCoroutineScope()
        var deleting by remember { mutableStateOf<String?>(null) }
        var deleteError by remember { mutableStateOf<String?>(null) }
        Column(modifier = Modifier.padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            deleteError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall) }
            if (state.bankbois.isEmpty()) {
                Text("No bankbois yet. Reserved overflow cargo will wait safely until one is created.", style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(vertical = 8.dp))
            }
            for (bankboi in state.bankbois) {
                val occupied = bankboi.items.count { it != null }
                val empty = occupied == 0 && bankboi.slots.isEmpty() && (bankboi.gold ?: 0L) == 0L
                val pack = "bankboi:${bankboi.name}"
                Column(modifier = Modifier.fillMaxWidth().border(BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), RoundedCornerShape(6.dp)).padding(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(bankboi.name, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodyMedium)
                        Text(
                            (bankboi.transaction?.let { "${it.mode} · ${it.phase}" } ?: bankboi.state).uppercase(),
                            fontFamily = FontFamily.Monospace,
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.weight(1f).padding(start = 8.dp),
                        )
                        Text("$occupied/42", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall)
                        val confirming = deleting == bankboi.name
                        OutlinedButton(
                            enabled = empty,
                            colors = if (confirming) ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error) else ButtonDefaults.outlinedButtonColors(),
                            onClick = {
                                if (!confirming) {
                                    deleting = bankboi.name
                                } else {
                                    scope.launch {
                                        deleteError = null
                                        val response = viewModel.api.deleteBankboi(bankboi.name)
                                        deleting = null
                                        if (response is ApiResult.Failure) deleteError = response.message else viewModel.refreshDynamicStateNow()
                                    }
                                }
                            },
                            modifier = Modifier.padding(start = 8.dp),
                        ) { Text(if (confirming) "Really? ×" else "Delete") }
                    }
                    bankboi.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall) }
                    for (entry in bankboi.items.filterNotNull()) BankRow(viewModel, entry, pack, catalogFor, dimmed = !matches(entry)) { onOpen(pack, entry) }
                }
            }
        }
    }
}

@Composable
private fun BankboisHeader(viewModel: PartyViewModel) {
    val state by viewModel.dynamicState.collectAsState()
    val scope = rememberCoroutineScope()
    val prefix = state.bankboiPrefix.trim()
    var busy by remember { mutableStateOf(false) }
    var confirmFirst by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<Pair<Boolean, String>?>(null) }
    fun create() {
        if (busy) return
        busy = true
        result = null
        scope.launch {
            when (val response = viewModel.api.createBankboi()) {
                is ApiResult.Failure -> result = false to response.message.ifBlank { "Bankboi creation failed" }
                is ApiResult.Success -> {
                    confirmFirst = false
                    val name = ((response.value.data?.get("bankboi") as? JsonObject)?.get("name") as? JsonPrimitive)?.content ?: "bankboi"
                    result = true to "$name created · provisioning queued"
                    viewModel.refreshDynamicStateNow()
                }
            }
            busy = false
        }
    }
    Column(modifier = Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Bankbois", style = MaterialTheme.typography.titleSmall)
                Text("Transparent overflow storage · ${state.bankboiQueue.size} staged or waiting", style = MaterialTheme.typography.labelSmall)
            }
            Button(enabled = !busy && prefix.isNotEmpty(), onClick = { if (state.bankbois.isNotEmpty()) create() else confirmFirst = true }) { Text(if (busy) "Creating…" else "Create bankboi") }
        }
        if (prefix.isEmpty()) Text("Set bankboi name in settings first", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        if (confirmFirst) {
            Column(modifier = Modifier.fillMaxWidth().border(BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), RoundedCornerShape(6.dp)).padding(10.dp)) {
                Text("Create first BankBoi?", style = MaterialTheme.typography.titleSmall)
                Text("This will reserve 7 slots from bank pane 1 for BankBoi logistics.", style = MaterialTheme.typography.labelSmall)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End), modifier = Modifier.fillMaxWidth()) {
                    OutlinedButton(enabled = !busy, onClick = { confirmFirst = false }) { Text("Cancel") }
                    Button(enabled = !busy, onClick = { create() }) { Text(if (busy) "Creating…" else "Create BankBoi") }
                }
            }
        }
        result?.let { (ok, message) ->
            Text((if (ok) "Success: " else "Failed: ") + message, color = if (ok) Emerald else MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall)
        }
    }
}

/** bank-sheet.tsx tile markers, as a list row: every pending mark at once
 *  (withdrawal border + Withdraw / Stand / NPC / Deconstruct labels), the
 *  stat-scroll badge, Auto stand, and RESERVED on items1's last seven slots. */
@Composable
private fun BankRow(viewModel: PartyViewModel, entry: InventoryEntry, pack: String, catalogFor: (String) -> CatalogItem?, dimmed: Boolean, onOpen: () -> Unit) {
    val state by viewModel.dynamicState.collectAsState()
    val merchant = state.merchantCharacter
    val item = entry.item
    val withdrawMarked = merchant != null && state.withdrawals[merchant].orEmpty().any { it.pack == pack && it.slot == entry.slot && sameMarkedItem(it.item, item) }
    val standMarked = state.standListings.any { it.bankPack == pack && it.bankSlot == entry.slot && sameMarkedItem(it.item, item) }
    val npcMarked = state.npcSaleMarks.any { it.pack == pack && it.slot == entry.slot && sameMarkedItem(it.item, item) }
    val deconstructionMarked = state.deconstructionMarks.any { it.state != "complete" && it.storage?.pack == pack && it.storage.slot == entry.slot && sameMarkedItem(it.item, item) }
    val reserved = pack == "items1" && entry.slot >= 35
    val autoStand = state.autoStandMarks[automaticCommerceRuleKey(item)]
    val marks = listOfNotNull(
        "WITHDRAW".takeIf { withdrawMarked },
        "STAND".takeIf { standMarked && autoStand == null },
        "NPC".takeIf { npcMarked },
        "DECONSTRUCT".takeIf { deconstructionMarked },
    )
    val border = when {
        withdrawMarked -> Color(0xFFFBBF24)
        reserved -> Color(0xFF86198F)
        else -> MaterialTheme.colorScheme.outlineVariant
    }
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 2.dp).alpha(if (dimmed) 0.25f else 1f)
            .border(BorderStroke(1.dp, border), RoundedCornerShape(6.dp)).clickable(onClick = onOpen).padding(8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box {
            SpriteIcon(catalogFor(item.name)?.sprite, size = 36.dp)
            MluckClover(item, modifier = Modifier.align(Alignment.CenterEnd))
        }
        Row(modifier = Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
            Text(
                displayName(item.name, catalogFor) + (item.level?.takeIf { it > 0 }?.let { " +$it" } ?: "") + (item.q?.takeIf { it > 1 }?.let { " x$it" } ?: ""),
                style = MaterialTheme.typography.bodyMedium,
            )
            item.statType?.let { Text(" ${it.uppercase()}", color = MaterialTheme.colorScheme.primary, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall) }
        }
        if (reserved) Text("RESERVED", color = Fuchsia, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelSmall)
        if (autoStand != null) Text("Auto stand", color = Color(0xFFFDE68A), style = MaterialTheme.typography.labelSmall)
        for (label in marks) Text(label, color = Amber, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Medium)
    }
}
