package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import kotlinx.coroutines.launch

/** Ports merchant-card-controls.tsx's Buy/Craft/Exchange navigation,
 *  Force stand, Mining/Fishing, Send to party, Donate, Join giveaway,
 *  Clear job queue, Clear stale orders, Clear activity history, and the
 *  Merchant collection settings (bank-sort mode, collect thresholds) -
 *  the rest of the merchant character's card that wasn't just the job
 *  queue widget (MerchantQueueSection) or Routines (its own screen, too
 *  big for an inline form). Only ever rendered for the merchant
 *  character. */
@Composable
fun MerchantControlsSection(
    forceStand: Boolean,
    gatheringModes: List<String>,
    threshold: Long,
    itemCollectionThreshold: Int,
    bankSortMode: String?,
    viewModel: PartyViewModel,
    onOpenCommerce: (String) -> Unit,
    onOpenRoutines: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    // Force stand and gathering are toggles read from the server; until it
    // has answered they'd flip a value we haven't seen.
    val loaded by viewModel.stateLoaded.collectAsState()
    var expanded by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmingClear by remember { mutableStateOf(false) }
    fun toggle(key: String) { expanded = if (expanded == key) null else key }
    fun run(action: suspend () -> ApiResult<*>) {
        scope.launch {
            error = null
            when (val result = action()) {
                is ApiResult.Failure -> error = result.message
                is ApiResult.Success -> {
                    viewModel.refreshDynamicStateNow()
                    expanded = null
                }
            }
        }
    }

    SectionCard(title = "Merchant controls") {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Button(onClick = { onOpenCommerce("buy") }) { Text("Buy") }
            Button(onClick = { onOpenCommerce("craft") }) { Text("Craft") }
            Button(onClick = { onOpenCommerce("exchange") }) { Text("Exchange") }
        }

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(selected = forceStand, enabled = loaded, onClick = { run { viewModel.api.setForceStand(!forceStand) } }, label = { Text("Force stand · ${if (forceStand) "On" else "Off"}") })
            FilterChip(
                selected = gatheringModes.contains("mining"),
                enabled = loaded,
                onClick = { run { viewModel.api.setGathering("mining", !gatheringModes.contains("mining")) } },
                label = { Text("Mining · ${if (gatheringModes.contains("mining")) "On" else "Off"}") },
            )
        }
        FilterChip(
            selected = gatheringModes.contains("fishing"),
            enabled = loaded,
            onClick = { run { viewModel.api.setGathering("fishing", !gatheringModes.contains("fishing")) } },
            label = { Text("Fishing · ${if (gatheringModes.contains("fishing")) "On" else "Off"}") },
        )

        ConfigLoadingNote(loaded)
        Column {
            TextButton(onClick = onOpenRoutines) { Text("Routines") }
            TextButton(onClick = { run { viewModel.api.sendMerchantToParty() } }) { Text("Send to party") }

            TextButton(onClick = { toggle("donate") }) { Text("Donate gold") }
            if (expanded == "donate") {
                DonateForm(onDonate = { amount -> run { viewModel.api.donateGold(amount) } })
            }

            TextButton(onClick = { toggle("giveaway") }) { Text("Join giveaway") }
            if (expanded == "giveaway") {
                GiveawayForm(onJoin = { realm, seller -> run { viewModel.api.joinGiveaway(seller, realm) } })
            }

            TextButton(onClick = { toggle("settings") }) { Text("Collection settings") }
            if (expanded == "settings") {
                CollectionSettingsForm(
                    loaded = loaded,
                    threshold = threshold,
                    itemCollectionThreshold = itemCollectionThreshold,
                    bankSortMode = bankSortMode,
                    onSetBankSortMode = { mode -> run { viewModel.api.setBankSortMode(mode) } },
                    onSetThresholds = { t, i -> run { viewModel.api.setThresholds(t, i) } },
                )
            }

            TextButton(onClick = { run { viewModel.api.clearStaleOrders() } }) { Text("Clear stale orders") }
            TextButton(onClick = { run { viewModel.api.clearMerchantActivity() } }) { Text("Clear activity history") }

            if (confirmingClear) {
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Text("Really clear the entire job queue?", color = MaterialTheme.colorScheme.error, modifier = Modifier.weight(1f))
                    Button(onClick = { confirmingClear = false; run { viewModel.api.clearMerchantQueue() } }) { Text("Clear") }
                    TextButton(onClick = { confirmingClear = false }) { Text("Cancel") }
                }
            } else {
                TextButton(onClick = { confirmingClear = true }) { Text("Clear job queue", color = MaterialTheme.colorScheme.error) }
            }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    }
}

@Composable
private fun DonateForm(onDonate: (Long) -> Unit) {
    var amount by remember { mutableStateOf("") }
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = androidx.compose.ui.Alignment.Bottom) {
        OutlinedTextField(
            value = amount,
            onValueChange = { new -> if (new.all { it.isDigit() }) amount = new },
            label = { Text("Gold amount") },
            singleLine = true,
            modifier = Modifier.weight(1f),
        )
        Button(onClick = { amount.toLongOrNull()?.let(onDonate) }, enabled = amount.toLongOrNull() != null) { Text("Donate") }
    }
}

/** merchant-collection-settings.tsx: both thresholds seed from the server
 *  (and follow it while untouched), are validated rather than coerced, and
 *  only Apply when changed. */
@Composable
private fun CollectionSettingsForm(
    loaded: Boolean,
    threshold: Long,
    itemCollectionThreshold: Int,
    bankSortMode: String?,
    onSetBankSortMode: (String) -> Unit,
    onSetThresholds: (Long?, Int?) -> Unit,
) {
    var thresholdInput by remember { mutableStateOf(threshold.toString()) }
    var slotsInput by remember { mutableStateOf(itemCollectionThreshold.toString()) }
    var goldDirty by remember { mutableStateOf(false) }
    var slotsDirty by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(threshold, goldDirty) { if (!goldDirty) thresholdInput = threshold.toString() }
    LaunchedEffect(itemCollectionThreshold, slotsDirty) { if (!slotsDirty) slotsInput = itemCollectionThreshold.toString() }
    Column {
        Text("Bank sort", style = MaterialTheme.typography.labelSmall)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(selected = (bankSortMode ?: "automatic") == "automatic", enabled = loaded, onClick = { onSetBankSortMode("automatic") }, label = { Text("Sort every visit") })
            FilterChip(selected = bankSortMode == "request", enabled = loaded, onClick = { onSetBankSortMode("request") }, label = { Text("Request sorting") })
        }
        Text("Send the merchant when any active character carries more than this amount.", style = MaterialTheme.typography.labelSmall)
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = androidx.compose.ui.Alignment.Bottom) {
            OutlinedTextField(
                value = thresholdInput,
                onValueChange = { new -> if (new.all { it.isDigit() }) { thresholdInput = new; goldDirty = true } },
                label = { Text("Collect above (gold)") },
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
            Button(enabled = loaded && goldDirty, onClick = {
                val n = thresholdInput.toLongOrNull()
                if (n == null || n < 0) {
                    error = "Enter a non-negative whole number"
                } else {
                    error = null
                    goldDirty = false
                    onSetThresholds(n, null)
                }
            }) { Text("Apply") }
        }
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = androidx.compose.ui.Alignment.Bottom) {
            OutlinedTextField(
                value = slotsInput,
                onValueChange = { new -> if (new.all { it.isDigit() }) { slotsInput = new; slotsDirty = true } },
                label = { Text("Marked slots required (1-42)") },
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
            Button(enabled = loaded && slotsDirty, onClick = {
                val value = slotsInput.toIntOrNull()
                if (value == null || value < 1 || value > 42) {
                    error = "Use an item-slot threshold from 1 to 42"
                } else {
                    error = null
                    slotsDirty = false
                    onSetThresholds(null, value)
                }
            }) { Text("Apply") }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    }
}

@Composable
private fun GiveawayForm(onJoin: (String, String) -> Unit) {
    var realm by remember { mutableStateOf("") }
    var seller by remember { mutableStateOf("") }
    Column {
        OutlinedTextField(value = realm, onValueChange = { realm = it }, label = { Text("Server realm (e.g. US I)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(value = seller, onValueChange = { seller = it }, label = { Text("Merchant name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Button(onClick = { onJoin(realm.trim(), seller.trim()) }, enabled = realm.isNotBlank() && seller.isNotBlank()) { Text("Join") }
    }
}
