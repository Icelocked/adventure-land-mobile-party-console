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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.model.MarketListing
import com.partyconsole.companion.model.StandSearchListing
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.itemicon.displayName
import com.partyconsole.companion.ui.itemicon.rememberCatalogLookup
import kotlinx.coroutines.launch

/** Public market browse (stand-sheet.tsx's "View market" tab) - ALData/
 *  Ponty aggregated listings (buyable) plus a live player-stand search.
 *  Real field sources confirmed against a live GET /party-api/state this
 *  session: `aldata.listings`, `ponty.listings`, `standSearch`. */
@Composable
fun MarketScreen(viewModel: PartyViewModel, onBack: () -> Unit) {
    val state by viewModel.dynamicState.collectAsState()
    val scope = rememberCoroutineScope()
    var searchTerm by remember { mutableStateOf("") }
    val catalogFor = rememberCatalogLookup(state.merchantCatalog)
    val listings = (state.aldata?.listings.orEmpty()) + (state.ponty?.listings.orEmpty())

    AccountScreenScaffold("Market", onBack, onRefresh = { scope.launch { viewModel.refreshDynamicStateNow() } }) {
        Row(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
            OutlinedTextField(
                value = searchTerm,
                onValueChange = { searchTerm = it },
                label = { Text("Search a live player stand for an item id") },
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
            Button(
                modifier = Modifier.padding(start = 8.dp),
                onClick = { scope.launch { viewModel.api.standSearch(searchTerm.trim()) } },
            ) { Text("Search") }
        }
        val search = state.standSearch
        if (search.listings.isNotEmpty()) {
            Text(
                "Live stand results for ${search.itemId}",
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.padding(start = 12.dp, end = 12.dp, top = 4.dp),
            )
            LazyColumn(contentPadding = PaddingValues(12.dp)) {
                items(search.listings) { StandSearchRow(it, catalogFor, viewModel) }
            }
        } else if (search.status == "searching") {
            Text("Searching nearby stands...", modifier = Modifier.padding(12.dp))
        }

        Text("Market (ALData / Ponty)", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(start = 12.dp, end = 12.dp, top = 8.dp))
        if (listings.isEmpty()) {
            EmptyState("No market listings loaded yet.")
        } else {
            LazyColumn(contentPadding = PaddingValues(12.dp)) {
                items(listings) { MarketRow(it, catalogFor, viewModel) }
            }
        }
    }
}

@Composable
private fun MarketRow(listing: MarketListing, catalogFor: (String) -> CatalogItem?, viewModel: PartyViewModel) {
    val scope = rememberCoroutineScope()
    var quantity by remember { mutableStateOf(listing.quantity.toString()) }
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    "${displayName(listing.item.name, catalogFor)}${listing.item.level?.let { " +$it" } ?: ""}" +
                        (listing.seller?.let { " ($it)" } ?: listing.source?.let { " [$it]" } ?: ""),
                    style = MaterialTheme.typography.titleSmall,
                )
                Text("${listing.unitPrice ?: listing.price}g × ${listing.quantity}", style = MaterialTheme.typography.labelSmall)
            }
            if (listing.key != null) {
                Row(modifier = Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = quantity,
                        onValueChange = { new -> if (new.all { it.isDigit() }) quantity = new },
                        label = { Text("Qty") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    Button(onClick = {
                        val qty = quantity.toIntOrNull() ?: 1
                        scope.launch {
                            if (listing.source == "ponty") {
                                viewModel.api.buyPonty(listing.key, qty, listing.unitPrice ?: listing.price)
                            } else {
                                viewModel.api.buyAlData(listing.key, qty)
                            }
                            viewModel.refreshDynamicStateNow()
                        }
                    }) { Text("Buy") }
                }
            }
        }
    }
}

@Composable
private fun StandSearchRow(listing: StandSearchListing, catalogFor: (String) -> CatalogItem?, viewModel: PartyViewModel) {
    val scope = rememberCoroutineScope()
    var quantity by remember { mutableStateOf(listing.quantity.toString()) }
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("${displayName(listing.item.name, catalogFor)}${listing.item.level?.let { " +$it" } ?: ""} (${listing.seller})", style = MaterialTheme.typography.titleSmall)
                Text("${listing.price}g × ${listing.quantity}", style = MaterialTheme.typography.labelSmall)
            }
            Row(modifier = Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = quantity,
                    onValueChange = { new -> if (new.all { it.isDigit() }) quantity = new },
                    label = { Text("Qty") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                Button(onClick = {
                    val qty = quantity.toIntOrNull() ?: 1
                    scope.launch {
                        viewModel.api.buyFromStand(listing, qty)
                        viewModel.refreshDynamicStateNow()
                    }
                }) { Text("Buy") }
            }
        }
    }
}
