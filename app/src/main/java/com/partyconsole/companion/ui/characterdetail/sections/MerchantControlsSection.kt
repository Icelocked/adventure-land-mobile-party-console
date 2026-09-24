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
 *  Force stand, Mining/Fishing, Send to party, Donate, Join giveaway, and
 *  Clear job queue - the rest of the merchant character's card that
 *  wasn't just the job queue widget (MerchantQueueSection). Only ever
 *  rendered for the merchant character. */
@Composable
fun MerchantControlsSection(
    forceStand: Boolean,
    gatheringModes: List<String>,
    viewModel: PartyViewModel,
    onOpenCommerce: (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
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
            FilterChip(selected = forceStand, onClick = { run { viewModel.api.setForceStand(!forceStand) } }, label = { Text("Force stand · ${if (forceStand) "On" else "Off"}") })
            FilterChip(
                selected = gatheringModes.contains("mining"),
                onClick = { run { viewModel.api.setGathering("mining", !gatheringModes.contains("mining")) } },
                label = { Text("Mining · ${if (gatheringModes.contains("mining")) "On" else "Off"}") },
            )
        }
        FilterChip(
            selected = gatheringModes.contains("fishing"),
            onClick = { run { viewModel.api.setGathering("fishing", !gatheringModes.contains("fishing")) } },
            label = { Text("Fishing · ${if (gatheringModes.contains("fishing")) "On" else "Off"}") },
        )

        Column {
            TextButton(onClick = { run { viewModel.api.sendMerchantToParty() } }) { Text("Send to party") }

            TextButton(onClick = { toggle("donate") }) { Text("Donate gold") }
            if (expanded == "donate") {
                DonateForm(onDonate = { amount -> run { viewModel.api.donateGold(amount) } })
            }

            TextButton(onClick = { toggle("giveaway") }) { Text("Join giveaway") }
            if (expanded == "giveaway") {
                GiveawayForm(onJoin = { realm, seller -> run { viewModel.api.joinGiveaway(seller, realm) } })
            }

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
