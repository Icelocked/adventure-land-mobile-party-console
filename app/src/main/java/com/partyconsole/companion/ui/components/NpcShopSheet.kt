package com.partyconsole.companion.ui.components

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.data.Domain
import com.partyconsole.companion.domain.NpcShopOrder
import com.partyconsole.companion.domain.NpcShopView
import com.partyconsole.companion.domain.estimateTotal
import com.partyconsole.companion.domain.jsNumberField
import com.partyconsole.companion.domain.filterMarket
import com.partyconsole.companion.domain.levelPrices
import com.partyconsole.companion.domain.localTime
import com.partyconsole.companion.domain.marketRowFor
import com.partyconsole.companion.domain.npcGold
import com.partyconsole.companion.domain.npcShopOrderBody
import com.partyconsole.companion.domain.orderProgress
import com.partyconsole.companion.domain.orderSummary
import com.partyconsole.companion.domain.priceDefinitions
import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.network.CommandResult
import com.partyconsole.companion.ui.DomainInterest
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

private val Fuchsia = Color(0xFFE879F9)

/** A watch to start from a Ponty row or Ron's stock. [npc] is "ponty" or "ron". */
data class WatchPrefill(val npc: String, val item: String, val level: Int)

private typealias Send = suspend (suspend () -> ApiResult<CommandResult>) -> Boolean

/** The "Watch list" button and its sheet, from the console fork's
 *  npc-shop-dialog.tsx (topic15/ponty-ron-buys). Watches buy from Ponty or
 *  Ron on the merchant's realm while merchant plus bank gold stays above
 *  the reserve. PWA: NpcShopSheet.tsx. */
@Composable
fun NpcShopButton(viewModel: PartyViewModel) {
    val state by viewModel.dynamicState.collectAsState()
    var open by remember { mutableStateOf(false) }
    OutlinedButton(enabled = state.merchantCharacter != null, onClick = { open = true }) {
        Icon(Icons.Filled.Visibility, contentDescription = null, modifier = Modifier.size(14.dp).padding(end = 2.dp))
        Text("Watch list")
    }
    if (open) WatchListSheet(viewModel, null) { open = false }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun WatchListSheet(viewModel: PartyViewModel, prefill: WatchPrefill?, onClose: () -> Unit) {
    // The sheet polls the market section at its fast cadence while open.
    DomainInterest(viewModel, Domain.MARKET)
    val state by viewModel.dynamicState.collectAsState()
    val scope = rememberCoroutineScope()
    var current by remember { mutableStateOf(prefill) }
    var tab by remember { mutableStateOf("watches") }
    var error by remember { mutableStateOf<String?>(null) }
    var pending by remember { mutableStateOf(false) }
    var reserve by remember { mutableStateOf<String?>(null) }
    val shop = state.npcShop
    val items = state.merchantCatalog?.allItems.orEmpty()
    val catalog = remember(items) { items.associateBy { it.id } }
    val send: Send = { action ->
        error = null
        pending = true
        val result = action()
        pending = false
        if (result is ApiResult.Failure) error = result.message.ifBlank { "Request failed" }
        result is ApiResult.Success
    }
    ModalBottomSheet(onDismissRequest = onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp).semantics { contentDescription = "Watch list" },
        ) {
            Text("Watch list", style = MaterialTheme.typography.titleMedium)
            Text(
                "Watches buy from Ponty or Ron on the merchant's realm" + (shop?.merchantRealm?.let { " ($it)" } ?: "") + " as copies appear.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                for ((id, label) in listOf("watches" to "Watches", "ron" to "Ron")) FilterChip(selected = tab == id, onClick = { tab = id }, label = { Text(label) })
                OutlinedTextField(
                    value = reserve ?: (shop?.settings?.goldReserve ?: 0).toString(),
                    onValueChange = { reserve = it },
                    label = { Text("Gold reserve") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.width(160.dp).semantics { contentDescription = "Gold reserve" },
                )
                OutlinedButton(enabled = reserve != null && !pending, onClick = {
                    scope.launch {
                        val body = mapOf("goldReserve" to jsNumberField(reserve.orEmpty()))
                        if (send { viewModel.api.saveNpcShopSettings(body) }) reserve = null
                    }
                }) { Text("Save reserve") }
                Text("Spendable ${npcGold(shop?.spendable ?: 0)}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.align(Alignment.CenterVertically))
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            if (tab == "watches") {
                key(current) { Watches(viewModel, shop, items, catalog, current, send, pending) }
            } else {
                RonStock(viewModel, shop, catalog, send, pending) { next ->
                    current = next
                    tab = "watches"
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Watches(viewModel: PartyViewModel, shop: NpcShopView?, items: List<CatalogItem>, catalog: Map<String, CatalogItem>, prefill: WatchPrefill?, send: Send, pending: Boolean) {
    val scope = rememberCoroutineScope()
    var npc by remember { mutableStateOf(prefill?.npc ?: "ponty") }
    var name by remember { mutableStateOf(prefill?.let { catalog[it.item]?.name?.ifEmpty { null } ?: it.item }.orEmpty()) }
    var levelMin by remember { mutableStateOf((prefill?.level ?: 0).toString()) }
    var levelMax by remember { mutableStateOf((prefill?.level ?: 0).toString()) }
    var quantity by remember { mutableStateOf("1") }
    var untilStop by remember { mutableStateOf(false) }
    var cap by remember { mutableStateOf("") }
    val defs = remember(items) { priceDefinitions(items) }
    val typed = name.trim().lowercase()
    val item = items.find { it.name.lowercase() == typed || it.id == typed }
    val low = maxOf(0, levelMin.trim().toDoubleOrNull()?.toInt() ?: 0)
    val high = maxOf(low, levelMax.trim().toDoubleOrNull()?.toInt() ?: 0)
    val ponty = item?.let { levelPrices(defs, it.id, low, high, "ponty") }.orEmpty()
    val ron = item?.let { levelPrices(defs, it.id, low, high, "ron") }.orEmpty()
    val prices = if (npc == "ponty") ponty else ron
    val total = estimateTotal(prices, if (untilStop) null else quantity.trim().toDoubleOrNull()?.toInt() ?: 0)
    val units = prices.map { it.unitPrice }
    fun span(from: Long, to: Long) = if (from == to) npcGold(from) else "${"%,d".format(from)} to ${npcGold(to)}"
    val orders = shop?.orders.orEmpty().reversed()
    // The PWA's datalist: catalog names that contain the typed text.
    val suggestions = if (typed.isEmpty() || item != null) emptyList() else items.filter { it.name.lowercase().contains(typed) || it.id.contains(typed) }.take(6)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(
            verticalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(4.dp)).padding(8.dp).semantics { contentDescription = "New watch" },
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Shop", style = MaterialTheme.typography.labelSmall)
                for ((id, label) in listOf("ponty" to "Ponty", "ron" to "Ron")) FilterChip(selected = npc == id, onClick = { npc = id }, label = { Text(label) })
            }
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                placeholder = { Text("Item") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Watch item" },
            )
            for (entry in suggestions) Text(entry.name, style = MaterialTheme.typography.bodySmall, modifier = Modifier.clickable { name = entry.name }.padding(vertical = 2.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                NumberField("Lowest level", levelMin, 88) { levelMin = it }
                Text("to", style = MaterialTheme.typography.bodySmall)
                NumberField("Highest level", levelMax, 88) { levelMax = it }
            }
            ponty.forEachIndexed { index, entry ->
                Text("+${entry.level} · Ponty ${npcGold(entry.unitPrice)} · Ron ${npcGold(ron.getOrNull(index)?.unitPrice ?: 0)}", color = Fuchsia, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                NumberField("Quantity", quantity, 96, enabled = !untilStop) { quantity = it }
                Checkbox(checked = untilStop, onCheckedChange = { untilStop = it }, modifier = Modifier.semantics { contentDescription = "Until I stop" })
                Text("Until I stop", style = MaterialTheme.typography.bodySmall)
            }
            OutlinedTextField(
                value = cap,
                onValueChange = { cap = it },
                placeholder = { Text("Spend cap (optional)") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Spend cap" },
            )
            if (item != null && units.isNotEmpty()) {
                Text(total?.let { "Estimated total ${span(it.first, it.second)}" } ?: "${span(units.min(), units.max())} per copy", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            OutlinedButton(enabled = item != null && !pending, onClick = {
                val chosen = item ?: return@OutlinedButton
                val count = if (untilStop) JsonNull else jsNumberField(quantity)
                val spendCap = if (cap.trim().isEmpty()) JsonNull else jsNumberField(cap)
                scope.launch { send { viewModel.api.createNpcShopOrder(npcShopOrderBody(npc, "watch", chosen.id, low, high, count, spendCap)) } }
            }) { Text("Add watch") }
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.semantics { contentDescription = "Watches" }) {
            for (order in orders) OrderRow(viewModel, order, catalog, send, pending)
            if (orders.isEmpty()) Text("No watches yet.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun OrderRow(viewModel: PartyViewModel, order: NpcShopOrder, catalog: Map<String, CatalogItem>, send: Send, pending: Boolean) {
    val scope = rememberCoroutineScope()
    val entry = catalog[order.item]
    val name = entry?.name?.ifEmpty { null } ?: order.item
    val label = "$name ${if (order.kind == "watch") "watch" else "order"}"
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(4.dp)).padding(8.dp),
    ) {
        SpriteIcon(entry?.sprite, size = 32.dp)
        Column(modifier = Modifier.weight(1f)) {
            Text(orderSummary(order, name), style = MaterialTheme.typography.bodySmall, maxLines = 1)
            Text(orderProgress(order), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (order.status == "active") {
            OutlinedButton(enabled = !pending, onClick = { scope.launch { send { viewModel.api.stopNpcShopOrder(order.id) } } }, modifier = Modifier.semantics { contentDescription = "Stop $label" }) { Text("Stop") }
        }
        if (order.status == "paused") {
            OutlinedButton(enabled = !pending, onClick = { scope.launch { send { viewModel.api.resumeNpcShopOrder(order.id) } } }, modifier = Modifier.semantics { contentDescription = "Resume $label" }) { Text("Resume") }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RonStock(viewModel: PartyViewModel, shop: NpcShopView?, catalog: Map<String, CatalogItem>, send: Send, pending: Boolean, onWatch: (WatchPrefill) -> Unit) {
    val scope = rememberCoroutineScope()
    val (filter, setFilter) = rememberStoredMarketFilter("ron")
    // The checkbox shows the chosen consent until the market poll returns the saved value.
    var donation by remember { mutableStateOf<Boolean?>(null) }
    val counts = remember { mutableStateMapOf<String, String>() }
    val ron = shop?.ron
    val saved = shop?.settings?.ronDonation == true
    var minutes by remember { mutableStateOf((shop?.settings?.ronVisitMinutes ?: 10).toString()) }
    var minutesFocused by remember { mutableStateOf(false) }
    val offers = filterMarket(ron?.listings.orEmpty(), filter) { offer -> marketRowFor(catalog[offer.item.name], offer.item.name, offer.item.level, offer.unitPrice.toDouble(), offer.firstSeenAt?.toDouble()) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(
            verticalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(4.dp)).padding(8.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = if (donation != null && donation != saved) donation!! else saved,
                    onCheckedChange = { checked ->
                        donation = checked
                        scope.launch { send { viewModel.api.saveNpcShopSettings(mapOf("ronDonation" to JsonPrimitive(checked))) } }
                    },
                    modifier = Modifier.semantics { contentDescription = "Allow Ron's donation" },
                )
                Text("Allow a 1,000,000 gold donation when Ron asks for one (once per login)", style = MaterialTheme.typography.bodySmall)
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Visit every", style = MaterialTheme.typography.bodySmall, modifier = Modifier.align(Alignment.CenterVertically))
                // Saved when the field loses focus, like the PWA's onBlur.
                OutlinedTextField(
                    value = minutes,
                    onValueChange = { minutes = it },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.width(88.dp).semantics { contentDescription = "Ron visit minutes" }.onFocusChanged { focus ->
                        if (minutesFocused && !focus.isFocused) {
                            val body = mapOf("ronVisitMinutes" to jsNumberField(minutes))
                            scope.launch { send { viewModel.api.saveNpcShopSettings(body) } }
                        }
                        minutesFocused = focus.isFocused
                    },
                )
                Text("minutes while a Ron watch is active", style = MaterialTheme.typography.bodySmall, modifier = Modifier.align(Alignment.CenterVertically))
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                OutlinedButton(enabled = !pending, onClick = { scope.launch { send { viewModel.api.visitRon() } } }) { Text("Check Ron now") }
                Text(
                    (ron?.updatedAt?.takeIf { it != 0L }?.let { "Visited ${localTime(it)}" } ?: "Not visited since the console started") + (ron?.error?.takeIf { it.isNotEmpty() }?.let { " · $it" } ?: ""),
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.align(Alignment.CenterVertically),
                )
            }
        }
        MarketFilterBar(filter, setFilter)
        for (offer in offers) {
            val entry = catalog[offer.item.name]
            val level = offer.item.level ?: 0
            val name = (entry?.name?.ifEmpty { null } ?: offer.item.name) + if (level != 0) " +$level" else ""
            val count = counts[offer.rid] ?: offer.quantity.toString()
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(4.dp)).padding(8.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    SpriteIcon(entry?.sprite, size = 36.dp)
                    Column(modifier = Modifier.padding(start = 8.dp)) {
                        Text(name, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                        Text("${offer.quantity} available · ${npcGold(offer.unitPrice)} each", color = Fuchsia, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall)
                        offer.firstSeenAt?.takeIf { it != 0L }?.let { Text("First seen ${localTime(it)}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                }
                NumberField("Quantity for $name", count, 72) { counts[offer.rid] = it }
                OutlinedButton(
                    enabled = !pending,
                    onClick = { scope.launch { send { viewModel.api.createNpcShopOrder(npcShopOrderBody("ron", "now", offer.item.name, level, level, jsNumberField(count), JsonNull)) } } },
                    modifier = Modifier.semantics { contentDescription = "Buy $count now $name" },
                ) { Text("Buy $count now") }
                OutlinedButton(onClick = { onWatch(WatchPrefill("ron", offer.item.name, level)) }, modifier = Modifier.semantics { contentDescription = "Watch $name" }) { Text("Watch") }
            }
        }
        if (offers.isEmpty()) {
            Text(if (ron?.updatedAt != null && ron.updatedAt != 0L) "Nothing in Ron's last-visit stock matches." else "Check Ron to read his stock.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun NumberField(label: String, value: String, width: Int, enabled: Boolean = true, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        enabled = enabled,
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        textStyle = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
        modifier = Modifier.width(width.dp).semantics { contentDescription = label },
    )
}
