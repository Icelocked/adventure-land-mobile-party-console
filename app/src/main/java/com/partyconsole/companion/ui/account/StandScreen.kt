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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.model.StandListing
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.itemicon.displayName
import com.partyconsole.companion.ui.itemicon.rememberCatalogLookup
import kotlinx.coroutines.launch

/** The merchant's own 16 stand slots (stand-sheet.tsx's "Inspect stand"
 *  tab) - listing a new item happens from the item action panel on the
 *  merchant's own Inventory screen (Mark for Stand); this screen shows
 *  what's live and can remove a listing. */
@Composable
fun StandScreen(viewModel: PartyViewModel, onBack: () -> Unit) {
    val state by viewModel.dynamicState.collectAsState()
    val catalogFor = rememberCatalogLookup(state.merchantCatalog)
    val topScope = rememberCoroutineScope()
    AccountScreenScaffold(
        "Inspect Stand · ${state.standListings.size}/16",
        onBack,
        onRefresh = { topScope.launch { viewModel.refreshDynamicStateNow() } },
    ) {
        if (state.standListings.isEmpty()) {
            EmptyState("Nothing listed on the stand.")
        } else {
            LazyColumn(contentPadding = PaddingValues(12.dp)) {
                items(state.standListings, key = { it.id ?: it.hashCode().toString() }) { StandRow(it, catalogFor, viewModel) }
            }
        }
    }
}

@Composable
private fun StandRow(listing: StandListing, catalogFor: (String) -> CatalogItem?, viewModel: PartyViewModel) {
    val scope = rememberCoroutineScope()
    var editing by remember(listing.id) { mutableStateOf(false) }
    var confirmingRemove by remember(listing.id) { mutableStateOf(false) }
    var busy by remember(listing.id) { mutableStateOf(false) }
    var price by remember(listing.id) { mutableStateOf(listing.price.toString()) }
    var error by remember(listing.id) { mutableStateOf<String?>(null) }

    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("${displayName(listing.item.name, catalogFor)}${listing.item.level?.let { " +$it" } ?: ""}", style = MaterialTheme.typography.titleSmall)
                Text("${listing.price}g × ${listing.quantity}", style = MaterialTheme.typography.labelSmall)
            }
            if (listing.slot != null) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(top = 4.dp)) {
                    TextButton(enabled = !busy, onClick = { editing = !editing; error = null }) { Text(if (editing) "Cancel" else "Edit price") }
                    // use-party-console.tsx removeStandListing: the whole listing
                    // (id and bank source included) with remove, after a second tap.
                    TextButton(enabled = !busy, onClick = {
                        if (!confirmingRemove) {
                            confirmingRemove = true
                            return@TextButton
                        }
                        scope.launch {
                            busy = true
                            error = null
                            val result = viewModel.api.markForStand(
                                listing.item, listing.slot,
                                bankPack = listing.bankPack,
                                price = listing.price,
                                quantity = listing.quantity,
                                remove = true,
                                id = listing.id,
                            )
                            if (result is ApiResult.Failure) error = result.message
                            confirmingRemove = false
                            busy = false
                            viewModel.refreshDynamicStateNow()
                        }
                    }) { Text(if (busy && confirmingRemove) "Removing…" else if (confirmingRemove) "Really remove?" else "Remove", color = MaterialTheme.colorScheme.error) }
                }
                if (editing) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        OutlinedTextField(
                            value = price,
                            onValueChange = { new -> if (new.all { it.isDigit() }) price = new },
                            label = { Text("Price") },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                        Button(enabled = !busy, onClick = {
                            val value = price.toLongOrNull()
                            if (value == null || value < 1) {
                                error = "Enter a price of at least 1 gold."
                                return@Button
                            }
                            scope.launch {
                                busy = true
                                error = null
                                // Same listing (id, bank source) with the new price.
                                val result = viewModel.api.markForStand(
                                    listing.item, listing.slot,
                                    bankPack = listing.bankPack,
                                    price = value,
                                    quantity = listing.quantity,
                                    id = listing.id,
                                )
                                if (result is ApiResult.Failure) error = result.message else editing = false
                                busy = false
                                viewModel.refreshDynamicStateNow()
                            }
                        }) { Text("Save") }
                    }
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            }
        }
    }
}
