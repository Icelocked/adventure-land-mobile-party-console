package com.partyconsole.companion.ui.account

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.partyconsole.companion.domain.standBuyRows
import com.partyconsole.companion.domain.standMerchant
import com.partyconsole.companion.domain.standOccupancy
import com.partyconsole.companion.domain.standSaleRows
import com.partyconsole.companion.model.InventoryEntry
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.StandBid
import com.partyconsole.companion.model.StandListing
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.network.CommandResult
import com.partyconsole.companion.network.PartyApiClient
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.components.AUTO_STAND_EXPLANATION
import com.partyconsole.companion.ui.components.ItemTile
import com.partyconsole.companion.ui.components.MluckClover
import com.partyconsole.companion.ui.components.STAND_BUY_EXPLANATION
import com.partyconsole.companion.ui.components.StandListingForm
import com.partyconsole.companion.ui.components.SuggestedPriceDetails
import com.partyconsole.companion.ui.components.WtbDialog
import com.partyconsole.companion.ui.components.WtbPreference
import com.partyconsole.companion.ui.components.WtbReplacementDialog
import com.partyconsole.companion.ui.components.priorityInput
import com.partyconsole.companion.ui.components.rememberWtbReplacement
import com.partyconsole.companion.ui.components.statBadgeColors
import com.partyconsole.companion.ui.itemdetail.ItemDetailBrowser
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import com.partyconsole.companion.ui.itemicon.rememberCatalogLookup
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

private val Amber = Color(0xFFF59E0B)
private val Violet = Color(0xFFA78BFA)
private val Rose = Color(0xFFF43F5E)

/** stand-sheet.tsx "Inspect stand" (the PWA's StandScreen.tsx): items for
 *  sale reconciled against the live trade slots (Live / Paused, read-only
 *  unmanaged rows, a separate "Queued sales for stand"), each with its
 *  price (opens the stand form) and a two-step Remove; then the buy orders
 *  on the stand (N wanted, price via the WTB dialog, native batch,
 *  priority, Auto, Use stand, Really cancel?). Tapping a row inspects it;
 *  a long press shows the suggested price. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun StandScreen(viewModel: PartyViewModel, onBack: () -> Unit) {
    val state by viewModel.dynamicState.collectAsState()
    val characters by viewModel.characters.collectAsState()
    val diagnostics by viewModel.characterDetails.collectAsState()
    val api = viewModel.api
    val scope = rememberCoroutineScope()
    val catalogFor = rememberCatalogLookup(state.merchantCatalog)
    val merchant = standMerchant(state, characters, diagnostics)
    val replacement = rememberWtbReplacement(viewModel)
    val listings = state.standListings
    val bids = state.standBids
    val occupancy = standOccupancy(listings, state.nativeStand, merchant)
    val saleRows = standSaleRows(listings, merchant, state.nativeStand)
    val buyRows = standBuyRows(bids, state.nativeStand, merchant, listings)
    var editing by remember { mutableStateOf<String?>(null) }
    var editingBuy by remember { mutableStateOf<Item?>(null) }
    var inspecting by remember { mutableStateOf<Item?>(null) }
    var suggesting by remember { mutableStateOf<Item?>(null) }
    var removeConfirmation by remember { mutableStateOf<String?>(null) }
    var removing by remember { mutableStateOf(false) }
    var confirmBidCancel by remember { mutableStateOf<String?>(null) }
    var savingBid by remember { mutableStateOf<String?>(null) }
    val priorityDrafts = remember { mutableStateMapOf<String, String>() }
    var bidError by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }

    suspend fun send(id: String, action: suspend () -> ApiResult<CommandResult>): Boolean {
        savingBid = id
        bidError = ""
        val result = action()
        savingBid = null
        if (result is ApiResult.Failure) {
            bidError = result.message
            return false
        }
        viewModel.refreshDynamicStateNow()
        return true
    }
    fun removeSale(key: String, listing: StandListing) {
        if (busy) return
        confirmBidCancel = null
        bidError = ""
        if (removeConfirmation != key) { removeConfirmation = key; return }
        busy = true
        removing = true
        scope.launch {
            val result = api.removeStandListing(listing)
            removing = false
            busy = false
            if (result is ApiResult.Failure) { bidError = result.message; return@launch }
            removeConfirmation = null
            viewModel.refreshDynamicStateNow()
        }
    }
    fun cancelBid(id: String, bid: StandBid) {
        if (busy || savingBid != null) return
        removeConfirmation = null
        bidError = ""
        if (confirmBidCancel != id) { confirmBidCancel = id; return }
        busy = true
        scope.launch {
            if (send(id) { api.saveBid(id, bid.price, bid.quantity, bid.minimumQuality ?: 0, true) }) confirmBidCancel = null
            busy = false
        }
    }
    fun saveStandPriority(id: String, bid: StandBid) {
        val draft = priorityDrafts[id] ?: return
        if (busy) return
        val priority = if (draft.isEmpty()) null else draft.toInt()
        if (priority == bid.priorityOverride) return
        busy = true
        scope.launch {
            val value = priority?.let { JsonPrimitive(it) } ?: JsonNull
            if (send(id) { api.saveBid(id, bid.price, bid.quantity, bid.minimumQuality ?: 0, false, value, PartyApiClient.WtbOptions(editField = "priorityOverride", value = value, bidRevision = bid.revision ?: 0)) }) {
                priorityDrafts.remove(id)
            }
            busy = false
        }
    }

    AccountScreenScaffold("Inspect stand · ${occupancy.total}/16", onBack, onRefresh = { scope.launch { viewModel.refreshDynamicStateNow() } }) {
        Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Items for sale · ${occupancy.sales}/16 slots", color = Amber, fontWeight = FontWeight.SemiBold)
                Text(
                    when (merchant?.standOpen) { true -> "Stand open"; false -> "Stand closed"; null -> "Stand status unknown" },
                    color = if (merchant?.standOpen == true) Color(0xFF34D399) else Color(0xFFF87171),
                    fontWeight = FontWeight.SemiBold,
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.align(Alignment.CenterVertically),
                )
            }
            for ((queued, rows) in listOf(false to saleRows.filter { it.occupied }, true to saleRows.filter { !it.occupied })) {
                if (queued && rows.isEmpty()) continue
                Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.semantics { contentDescription = if (queued) "Queued sales for stand" else "Items for sale" }) {
                    if (queued) Text("Queued sales for stand", color = Amber, fontWeight = FontWeight.SemiBold)
                    if (rows.isEmpty()) Text("No sale items are occupying stand slots.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    for (row in rows) {
                        val configured = row.configured
                        val meta = row.liveEntry?.meta ?: catalogFor(configured.item.name)?.meta
                        val item = row.liveEntry?.item ?: configured.item
                        val name = (meta?.definition?.get("name") as? JsonPrimitive)?.content ?: catalogFor(configured.item.name)?.name ?: configured.item.name
                        val level = row.liveEntry?.item?.level ?: configured.item.level ?: 0
                        val statType = row.liveEntry?.item?.statType ?: configured.item.statType
                        FlowRow(
                            modifier = Modifier.fillMaxWidth().border(1.dp, Color(0xFF92400E), RoundedCornerShape(4.dp)).padding(8.dp).semantics { contentDescription = "Sale $name" },
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            ItemTile("Inspect $name", Color(0xB378350F), onTap = { inspecting = configured.item }, onLongPress = { suggesting = item }) {
                                SpriteIcon(meta?.sprite ?: catalogFor(configured.item.name)?.sprite, size = 58.dp)
                                if (level > 0) Text("+$level", color = Color(0xFF6EE7B7), fontSize = 9.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.SemiBold, modifier = Modifier.align(Alignment.TopStart).padding(4.dp).background(Color(0xCC000000), RoundedCornerShape(3.dp)).padding(horizontal = 3.dp))
                                statType?.let {
                                    val (background, text) = statBadgeColors(it)
                                    Text(it.uppercase(), color = text, fontSize = 8.sp, fontFamily = FontFamily.Monospace, modifier = Modifier.align(Alignment.TopEnd).padding(4.dp).background(background, RoundedCornerShape(3.dp)).padding(horizontal = 3.dp))
                                }
                                MluckClover(item, modifier = Modifier.align(Alignment.CenterEnd))
                                Text(
                                    "${maxOf(1, row.liveEntry?.item?.q ?: configured.quantity.takeIf { it > 0 } ?: configured.item.q ?: 1)}",
                                    color = Color(0xFFFDE68A), fontSize = 9.sp, fontFamily = FontFamily.Monospace,
                                    modifier = Modifier.align(Alignment.BottomStart).padding(4.dp).background(Color(0xCC000000), RoundedCornerShape(3.dp)).padding(horizontal = 3.dp),
                                )
                            }
                            Text(
                                name + if (meta != null && (meta.upgradeable || meta.compoundable)) " +${configured.item.level ?: 0}" else "",
                                style = MaterialTheme.typography.bodySmall,
                                maxLines = 1,
                                modifier = Modifier.align(Alignment.CenterVertically),
                            )
                            if (row.status != "Queued") {
                                Text(
                                    row.status.uppercase(),
                                    color = if (row.status == "Live") Color(0xFF34D399) else Color(0xFFFB7185),
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 9.sp,
                                    modifier = Modifier.align(Alignment.CenterVertically).border(1.dp, if (row.status == "Live") Color(0xFF047857) else Color(0xFF9F1239), RoundedCornerShape(3.dp)).padding(horizontal = 6.dp, vertical = 2.dp),
                                )
                            }
                            OutlinedButton(
                                enabled = row.editable,
                                onClick = { editing = if (editing == row.key) null else row.key },
                                modifier = Modifier.semantics { contentDescription = "Edit sale price for ${configured.item.name}" },
                            ) { Text("${"%,d".format(row.liveEntry?.item?.price ?: configured.price)}g", color = Amber, fontFamily = FontFamily.Monospace) }
                            if (row.editable) {
                                OutlinedButton(
                                    enabled = !removing && savingBid == null,
                                    onClick = { removeSale(row.key, configured) },
                                    modifier = Modifier.semantics { contentDescription = "Remove $name from stand" },
                                ) {
                                    Text(
                                        when {
                                            removing && removeConfirmation == row.key -> "Removing…"
                                            removeConfirmation == row.key -> "Really remove?"
                                            else -> "Remove"
                                        },
                                        color = Rose,
                                    )
                                }
                            }
                            if (editing == row.key) {
                                // party-inventory-panels.tsx onStandEdit: same listing (id, bank source), current price and quantity.
                                StandListingForm(
                                    viewModel, configured.item, catalogFor(configured.item.name)?.meta,
                                    existingId = configured.id, existingPrice = configured.price, existingQuantity = configured.quantity,
                                    onCancel = { editing = null },
                                    onSubmit = { draft ->
                                        when (val result = api.markForStand(configured.item, configured.slot, bankPack = configured.bankPack, price = draft.price, quantity = draft.quantity, markAll = draft.markAll, id = configured.id)) {
                                            is ApiResult.Failure -> result.message
                                            is ApiResult.Success -> { editing = null; viewModel.refreshDynamicStateNow(); null }
                                        }
                                    },
                                )
                            }
                        }
                    }
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.semantics { contentDescription = "Buy orders" }) {
                Text("Buy orders · ${occupancy.buys}/16 slots", color = Violet, fontWeight = FontWeight.SemiBold)
                if (bidError.isNotEmpty()) Text(bidError, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                WtbReplacementDialog(replacement, catalogFor)
                for (row in buyRows) {
                    val item = catalogFor(row.id)
                    val name = item?.name ?: row.id
                    val bid = row.bid
                    Box(modifier = Modifier.fillMaxWidth().border(1.dp, Color(0xFF5B21B6), RoundedCornerShape(4.dp)).padding(12.dp).semantics { contentDescription = "Buy order $name" }) {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(modifier = Modifier.clickable { inspecting = Item(name = row.id, level = row.level) }.padding(end = 48.dp), verticalAlignment = Alignment.CenterVertically) {
                                SpriteIcon(item?.sprite ?: item?.meta?.sprite, size = 48.dp)
                                Text("$name +${row.level}", modifier = Modifier.padding(start = 12.dp))
                            }
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                Text("${"%,d".format(bid?.quantity ?: row.quantity)} wanted", style = MaterialTheme.typography.bodySmall)
                                OutlinedButton(
                                    enabled = bid != null,
                                    onClick = { editingBuy = Item(name = row.id, level = row.level) },
                                    modifier = Modifier.semantics { contentDescription = "Edit buy price for $name" },
                                ) { Text("${"%,d".format(row.price)}g", color = Violet, fontFamily = FontFamily.Monospace) }
                            }
                            if (bid != null && row.observed != null && (row.observed.item.q ?: 1) != bid.quantity) {
                                Text("Native batch: ${"%,d".format(row.observed.item.q ?: 1)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            if (bid != null) {
                                var focused by remember(row.id) { mutableStateOf(false) }
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text("Priority", style = MaterialTheme.typography.labelSmall)
                                    OutlinedTextField(
                                        value = priorityDrafts[row.id] ?: bid.priorityOverride?.toString().orEmpty(),
                                        onValueChange = { priorityDrafts[row.id] = priorityInput(it) },
                                        enabled = savingBid == null,
                                        singleLine = true,
                                        placeholder = { Text("Default") },
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                                        keyboardActions = KeyboardActions(onDone = { saveStandPriority(row.id, bid) }),
                                        textStyle = MaterialTheme.typography.labelSmall.copy(fontFamily = FontFamily.Monospace),
                                        modifier = Modifier.width(96.dp)
                                            .onFocusChanged { if (focused && !it.isFocused) saveStandPriority(row.id, bid); focused = it.isFocused }
                                            .semantics { contentDescription = "Priority override" },
                                    )
                                }
                            }
                            if (bid != null) {
                                FlowRow(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    WtbPreference("Use stand", STAND_BUY_EXPLANATION, bid.useStandSlot == true, { useStandSlot ->
                                        scope.launch {
                                            replacement.save({ replaceStandEntry ->
                                                api.saveBid(row.id, bid.price, bid.quantity, bid.minimumQuality ?: 0, false, bid.priorityOverride?.let { JsonPrimitive(it) }, PartyApiClient.WtbOptions(useStandSlot = useStandSlot, replaceStandEntry = replaceStandEntry, preferencesOnly = true))
                                            })
                                        }
                                    }, enabled = savingBid == null)
                                    OutlinedButton(enabled = savingBid == null && !removing, onClick = { cancelBid(row.id, bid) }) {
                                        Text(
                                            when {
                                                savingBid == row.id -> "Saving…"
                                                confirmBidCancel == row.id -> "Really cancel?"
                                                else -> "Cancel"
                                            },
                                            color = Rose,
                                        )
                                    }
                                }
                            }
                        }
                        if (row.offer?.auto == true) {
                            Text("Auto", color = Color(0xFF22D3EE), style = MaterialTheme.typography.labelSmall, modifier = Modifier.align(Alignment.TopEnd).border(1.dp, Color(0xFF0891B2), RoundedCornerShape(4.dp)).padding(horizontal = 8.dp).semantics { contentDescription = AUTO_STAND_EXPLANATION })
                        }
                    }
                }
                if (buyRows.isEmpty()) Text("No stand buy orders.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }

    editingBuy?.let { item ->
        WtbDialog(viewModel, item, catalogFor(item.name)?.meta, catalogFor, state.merchantCatalog?.buyable.orEmpty(), state.standPriceHistory[item.name], bids[item.name], onClose = { editingBuy = null })
    }
    inspecting?.let { item ->
        ModalBottomSheet(onDismissRequest = { inspecting = null }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
            Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp)) {
                ItemDetailBrowser(rootItemId = item.name, rootLevel = item.level ?: 0, rootStatType = item.statType, catalog = state.merchantCatalog, monsters = state.bestiaryCatalog, viewModel = viewModel)
            }
        }
    }
    suggesting?.let { item ->
        ModalBottomSheet(onDismissRequest = { suggesting = null }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
            Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp).semantics { contentDescription = "Suggested price" }) {
                SuggestedPriceDetails(InventoryEntry(slot = -1, item = item, meta = catalogFor(item.name)?.meta), state.merchantCatalog?.buyable.orEmpty(), state.standPriceHistory[item.name])
            }
        }
    }
}
