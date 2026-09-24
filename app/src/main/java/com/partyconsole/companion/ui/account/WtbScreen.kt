package com.partyconsole.companion.ui.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.model.StandBid
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.itemdetail.npcSaleValue
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import kotlinx.coroutines.launch

/** wtborder-dialog.tsx (place/edit) + stand-sheet.tsx's "Manage WTB
 *  orders" list, ported as their own screen - previously entirely missing
 *  from both clients (Market only ever supported buying FROM a stand/
 *  ALData/Ponty, never placing a standing buy order of your own). Price
 *  presets are scoped down to NPC-sale-based only - the dashboard's
 *  Ponty/market-history presets need data (pontyPrice, standPriceHistory)
 *  this app hasn't ported; the actual order placement/editing/
 *  cancellation is fully real, just without every quick-fill shortcut. */
@Composable
fun WtbScreen(viewModel: PartyViewModel, onBack: () -> Unit) {
    val dynamicState by viewModel.dynamicState.collectAsState()
    val scope = rememberCoroutineScope()
    var adding by remember { mutableStateOf(false) }
    var editingId by remember { mutableStateOf<String?>(null) }

    val catalog = dynamicState.merchantCatalog?.allItems ?: emptyList()
    val bids = dynamicState.standBids.entries.toList()
    fun itemFor(id: String): CatalogItem? = catalog.find { it.id == id }

    AccountScreenScaffold("WTB orders", onBack, onRefresh = { scope.launch { viewModel.refreshDynamicStateNow() } }) {
        Column(modifier = Modifier.fillMaxSize()) {
            Button(onClick = { adding = true }, modifier = Modifier.padding(12.dp)) { Text("Add WTB order") }

            if (bids.isEmpty()) {
                EmptyState("No standing buy orders.")
            } else {
                LazyColumn(modifier = Modifier.weight(1f), contentPadding = PaddingValues(12.dp)) {
                    items(bids) { (itemId, bid) ->
                        val catalogItem = itemFor(itemId)
                        Card(modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                androidx.compose.material3.TextButton(onClick = { editingId = itemId }, modifier = Modifier.weight(1f)) {
                                    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                        SpriteIcon(catalogItem?.sprite, size = 32.dp)
                                        Column(modifier = Modifier.weight(1f).padding(start = 8.dp)) {
                                            Text(
                                                (catalogItem?.name ?: itemId) + (bid.minimumQuality?.let { if (it > 0) " +$it" else "" } ?: ""),
                                                style = MaterialTheme.typography.bodyMedium,
                                                maxLines = 1,
                                            )
                                            Text(
                                                "${"%,d".format(bid.price)}g × ${bid.quantity}" + (bid.priorityOverride?.let { " · priority $it" } ?: ""),
                                                style = MaterialTheme.typography.labelSmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (adding) {
        ItemPickerOverlay(catalog = catalog, onCancel = { adding = false }, onPick = { id -> adding = false; editingId = id })
    }
    editingId?.let { id ->
        WtbFormOverlay(
            itemId = id,
            catalogItem = itemFor(id),
            existing = dynamicState.standBids[id],
            viewModel = viewModel,
            onClose = { editingId = null },
        )
    }
}

@Composable
private fun ItemPickerOverlay(catalog: List<CatalogItem>, onCancel: () -> Unit, onPick: (String) -> Unit) {
    var search by remember { mutableStateOf("") }
    val filtered = catalog.filter { it.name.contains(search, ignoreCase = true) }.take(100)

    androidx.compose.ui.window.Dialog(onDismissRequest = onCancel, properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)) {
        androidx.compose.material3.Surface(modifier = Modifier.fillMaxSize()) {
            Column(modifier = Modifier.fillMaxSize().padding(12.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("Choose an item", style = MaterialTheme.typography.titleSmall)
                    androidx.compose.material3.TextButton(onClick = onCancel) { Text("Close") }
                }
                OutlinedTextField(value = search, onValueChange = { search = it }, label = { Text("Search items...") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                LazyColumn(modifier = Modifier.weight(1f), contentPadding = PaddingValues(top = 8.dp)) {
                    items(filtered) { item ->
                        androidx.compose.material3.TextButton(onClick = { onPick(item.id) }, modifier = Modifier.fillMaxWidth()) {
                            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                SpriteIcon(item.sprite, size = 28.dp)
                                Text(item.name, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(start = 8.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun WtbFormOverlay(itemId: String, catalogItem: CatalogItem?, existing: StandBid?, viewModel: PartyViewModel, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    var price by remember { mutableStateOf(existing?.price?.toString() ?: "") }
    var quantity by remember { mutableStateOf(existing?.quantity?.toString() ?: "1") }
    var level by remember { mutableStateOf((existing?.minimumQuality ?: 0).toString()) }
    var priority by remember { mutableStateOf(existing?.priorityOverride?.toString() ?: "") }
    var useStandSlot by remember { mutableStateOf(existing?.useStandSlot == true) }
    var acceptHigherLevels by remember { mutableStateOf(existing?.acceptHigherLevels != false) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val canLevel = catalogItem?.upgradeable == true || catalogItem?.compoundable == true
    val npcPrice = maxOf(1L, npcSaleValue(level.toIntOrNull() ?: 0, false, null, catalogItem?.meta))

    androidx.compose.ui.window.Dialog(onDismissRequest = onClose, properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)) {
        androidx.compose.material3.Surface(modifier = Modifier.fillMaxSize()) {
            Column(modifier = Modifier.fillMaxSize().padding(12.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        SpriteIcon(catalogItem?.sprite, size = 32.dp)
                        Text((catalogItem?.name ?: itemId) + if (canLevel) " +$level" else "", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(start = 8.dp))
                    }
                    androidx.compose.material3.TextButton(onClick = onClose) { Text("Close") }
                }
                Column(modifier = Modifier.weight(1f)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(value = price, onValueChange = { new -> if (new.all { it.isDigit() }) price = new }, label = { Text("Maximum price") }, singleLine = true, modifier = Modifier.weight(1f))
                        OutlinedTextField(value = quantity, onValueChange = { new -> if (new.all { it.isDigit() }) quantity = new }, label = { Text("Quantity") }, singleLine = true, modifier = Modifier.weight(1f))
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = level,
                            onValueChange = { new -> if (new.all { it.isDigit() }) level = new },
                            label = { Text("Selected +level") },
                            enabled = canLevel,
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                        OutlinedTextField(value = priority, onValueChange = { new -> if (new.all { it.isDigit() }) priority = new }, label = { Text("Priority (0-100)") }, singleLine = true, modifier = Modifier.weight(1f))
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = useStandSlot, onCheckedChange = { useStandSlot = it })
                        Text("Use stand (advertise as a native stand order)", style = MaterialTheme.typography.bodySmall)
                    }
                    if (canLevel) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(checked = acceptHigherLevels, onCheckedChange = { acceptHigherLevels = it })
                            Text("Accept higher levels", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        androidx.compose.material3.OutlinedButton(onClick = { price = ((npcPrice * 1.1).toLong()).toString() }) {
                            Text("NPC sale +10% (${"%,d".format((npcPrice * 1.1).toLong())}g)", style = MaterialTheme.typography.labelSmall)
                        }
                    }
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                }
                Button(
                    enabled = !saving && (price.toLongOrNull() ?: 0) > 0 && (quantity.toIntOrNull() ?: 0) > 0,
                    onClick = {
                        scope.launch {
                            saving = true
                            error = null
                            when (
                                val result = viewModel.api.saveBid(
                                    itemId,
                                    price.toLongOrNull() ?: 0,
                                    quantity.toIntOrNull() ?: 1,
                                    maxOf(0, level.toIntOrNull() ?: 0),
                                    priority.toIntOrNull(),
                                    useStandSlot,
                                    acceptHigherLevels,
                                )
                            ) {
                                is ApiResult.Failure -> error = result.message
                                is ApiResult.Success -> {
                                    viewModel.refreshDynamicStateNow()
                                    onClose()
                                }
                            }
                            saving = false
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (saving) "Saving..." else "Place WTB") }
                if (existing != null) {
                    Button(
                        enabled = !saving,
                        onClick = {
                            scope.launch {
                                saving = true
                                when (val result = viewModel.api.cancelBid(itemId)) {
                                    is ApiResult.Failure -> error = result.message
                                    is ApiResult.Success -> {
                                        viewModel.refreshDynamicStateNow()
                                        onClose()
                                    }
                                }
                                saving = false
                            }
                        },
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    ) { Text("Cancel WTB order") }
                }
            }
        }
    }
}
