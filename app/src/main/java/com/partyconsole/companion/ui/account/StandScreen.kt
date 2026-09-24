package com.partyconsole.companion.ui.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.model.StandListing
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
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("${displayName(listing.item.name, catalogFor)}${listing.item.level?.let { " +$it" } ?: ""}", style = MaterialTheme.typography.titleSmall)
            Text("${listing.price}g × ${listing.quantity}", style = MaterialTheme.typography.labelSmall)
            if (listing.slot != null) {
                TextButton(onClick = {
                    scope.launch {
                        viewModel.api.markForStand(listing.item, listing.slot, price = listing.price, remove = true)
                        viewModel.refreshDynamicStateNow()
                    }
                }) { Text("Remove") }
            }
        }
    }
}
