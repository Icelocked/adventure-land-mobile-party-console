package com.partyconsole.companion.ui.account

import android.content.Context
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.StandBid
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.network.CommandResult
import com.partyconsole.companion.network.PartyApiClient
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.characterdetail.sections.ConfigLoadingNote
import com.partyconsole.companion.ui.components.AUTO_STAND_EXPLANATION
import com.partyconsole.companion.ui.components.HIGHER_LEVEL_EXPLANATION
import com.partyconsole.companion.ui.components.STAND_BUY_EXPLANATION
import com.partyconsole.companion.ui.components.WtbDialog
import com.partyconsole.companion.ui.components.WtbPreference
import com.partyconsole.companion.ui.components.WtbReplacementDialog
import com.partyconsole.companion.ui.components.rememberWtbReplacement
import com.partyconsole.companion.ui.itemdetail.ItemDetailBrowser
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import com.partyconsole.companion.ui.itemicon.rememberCatalogLookup
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

private const val ACTIVE_OPEN_KEY = "adventure-land-active-wtb-open"
private val VioletText = Color(0xFFC4B5FD)
private val VioletBorder = Color(0xFF4C1D95)

/** stand-sheet.tsx "Active WTB orders" (the PWA's WtbScreen.tsx): filter
 *  with visible/total, each order's inspect, inline quantity/price/priority
 *  (single-field edits with the bid revision), Use stand / Accept higher
 *  levels, the Auto badge and native-stand problem, and a two-step cancel;
 *  "New WTB order" picks an item for the WTB dialog. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun WtbScreen(viewModel: PartyViewModel, onBack: () -> Unit) {
    val state by viewModel.dynamicState.collectAsState()
    val configLoaded by viewModel.stateLoaded.collectAsState()
    val api = viewModel.api
    val scope = rememberCoroutineScope()
    val catalogFor = rememberCatalogLookup(state.merchantCatalog)
    val replacement = rememberWtbReplacement(viewModel)
    val prefs = LocalContext.current.getSharedPreferences("ui", Context.MODE_PRIVATE)
    var picking by remember { mutableStateOf(false) }
    var dialog by remember { mutableStateOf<Item?>(null) }
    var inspecting by remember { mutableStateOf<Item?>(null) }
    var filter by remember { mutableStateOf("") }
    var open by remember { mutableStateOf(runCatching { prefs.getString(ACTIVE_OPEN_KEY, null) != "false" }.getOrDefault(true)) }
    var savingBid by remember { mutableStateOf<String?>(null) }
    var confirmCancel by remember { mutableStateOf<String?>(null) }
    var bidError by remember { mutableStateOf("") }

    val catalog = state.merchantCatalog?.allItems.orEmpty()
    val bids = state.standBids
    val nativeOffers = state.nativeStand?.offers?.values.orEmpty()
    val visibleBids = bids.entries.filter { (itemId, _) -> "${catalogFor(itemId)?.name.orEmpty()} $itemId".lowercase().contains(filter.trim().lowercase()) }

    suspend fun send(itemId: String, action: suspend () -> ApiResult<CommandResult>): String? {
        savingBid = itemId
        bidError = ""
        val result = action()
        savingBid = null
        if (result is ApiResult.Failure) {
            bidError = result.message
            return result.message
        }
        viewModel.refreshDynamicStateNow()
        return null
    }
    fun priorityOf(bid: StandBid): JsonElement? = bid.priorityOverride?.let { JsonPrimitive(it) }
    fun cancelBid(itemId: String, bid: StandBid) {
        if (savingBid != null) return
        bidError = ""
        if (confirmCancel != itemId) { confirmCancel = itemId; return }
        scope.launch {
            if (send(itemId) { api.saveBid(itemId, bid.price, bid.quantity, bid.minimumQuality ?: 0, true) } == null) confirmCancel = null
        }
    }

    AccountScreenScaffold("WTB orders", onBack, onRefresh = { scope.launch { viewModel.refreshDynamicStateNow() } }) {
        Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(12.dp).border(1.dp, Color(0xB34C1D95), RoundedCornerShape(6.dp)).padding(12.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = {
                    open = !open
                    runCatching { prefs.edit().putString(ACTIVE_OPEN_KEY, open.toString()).apply() }
                }) {
                    Icon(if (open) Icons.Filled.KeyboardArrowDown else Icons.Filled.KeyboardArrowRight, contentDescription = null, tint = Color(0xFFA78BFA), modifier = Modifier.size(16.dp))
                    Text("ACTIVE WTB ORDERS (${bids.size})", color = Color(0xFFA78BFA), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall)
                }
                OutlinedButton(enabled = configLoaded, onClick = { picking = true }) { Text("New WTB order") }
            }
            ConfigLoadingNote(configLoaded)
            if (bidError.isNotEmpty()) Text(bidError, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp))
            WtbReplacementDialog(replacement, catalogFor)
            if (open) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
                    OutlinedTextField(filter, { filter = it }, placeholder = { Text("Filter WTB orders by item name...") }, singleLine = true, modifier = Modifier.weight(1f).semantics { contentDescription = "Filter WTB orders" })
                    Text("${visibleBids.size} / ${bids.size}", color = Color(0xFFA78BFA), style = MaterialTheme.typography.labelSmall)
                    if (filter.isNotEmpty()) OutlinedButton(onClick = { filter = "" }) { Text("Clear") }
                }
                if (visibleBids.isEmpty()) {
                    Text(if (bids.isNotEmpty()) "No WTB orders match this filter." else "No active orders.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
                }
                for ((itemId, bid) in visibleBids) {
                    val item = catalogFor(itemId)
                    val name = item?.name ?: itemId
                    val autoLive = nativeOffers.any { it.itemId == itemId && it.auto && it.phase == "live" }
                    val problem = state.nativeStand?.problems?.get(itemId) ?: nativeOffers.find { it.itemId == itemId }?.problem
                    val leveled = item?.upgradeable == true || item?.compoundable == true
                    FlowRow(
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp).border(1.dp, VioletBorder, RoundedCornerShape(4.dp)).padding(8.dp).semantics { contentDescription = "WTB $name" },
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth().clickable { inspecting = Item(name = itemId, level = bid.minimumQuality ?: 0) }.semantics { contentDescription = "Inspect $name" },
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            SpriteIcon(item?.sprite, size = 32.dp)
                            Text(name + if (leveled) " · +${bid.minimumQuality ?: 0} minimum" else "", style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(start = 8.dp), maxLines = 1)
                        }
                        ActiveWtbFields(
                            name, bid, savingBid != null,
                            onEditPrice = { dialog = Item(name = itemId, level = bid.minimumQuality ?: 0) },
                            onSave = { field, value ->
                                send(itemId) {
                                    api.saveBid(
                                        itemId,
                                        if (field == "price") value!!.toLong() else bid.price,
                                        if (field == "quantity") value!! else bid.quantity,
                                        bid.minimumQuality ?: 0,
                                        false,
                                        if (field == "priority") value?.let { JsonPrimitive(it) } ?: JsonNull else priorityOf(bid),
                                        PartyApiClient.WtbOptions(
                                            editField = if (field == "priority") "priorityOverride" else field,
                                            value = value?.let { JsonPrimitive(it) } ?: JsonNull,
                                            bidRevision = bid.revision ?: 0,
                                        ),
                                    )
                                }
                            },
                        )
                        WtbPreference("Use stand", STAND_BUY_EXPLANATION, bid.useStandSlot == true, { useStandSlot ->
                            scope.launch {
                                replacement.save({ replaceStandEntry ->
                                    api.saveBid(itemId, bid.price, bid.quantity, bid.minimumQuality ?: 0, false, priorityOf(bid), PartyApiClient.WtbOptions(useStandSlot = useStandSlot, replaceStandEntry = replaceStandEntry, preferencesOnly = true))
                                })
                            }
                        })
                        if (autoLive) {
                            Text("Auto", color = Color(0xFF22D3EE), style = MaterialTheme.typography.labelSmall, modifier = Modifier.align(Alignment.CenterVertically).border(1.dp, Color(0xFF0891B2), RoundedCornerShape(4.dp)).padding(horizontal = 8.dp).semantics { contentDescription = AUTO_STAND_EXPLANATION })
                        }
                        if (leveled || problem != null) {
                            Column(modifier = Modifier.fillMaxWidth()) {
                                if (leveled) {
                                    WtbPreference("Accept higher levels", HIGHER_LEVEL_EXPLANATION, bid.acceptHigherLevels != false, { acceptHigherLevels ->
                                        scope.launch {
                                            replacement.save({ _ ->
                                                api.saveBid(itemId, bid.price, bid.quantity, bid.minimumQuality ?: 0, false, priorityOf(bid), PartyApiClient.WtbOptions(acceptHigherLevels = acceptHigherLevels, preferencesOnly = true))
                                            })
                                        }
                                    })
                                }
                                problem?.let { Text(it, color = Color(0xFFF59E0B), style = MaterialTheme.typography.labelSmall) }
                            }
                        }
                        OutlinedButton(enabled = savingBid == null, onClick = { cancelBid(itemId, bid) }) {
                            Text(
                                when {
                                    savingBid == itemId -> "Saving…"
                                    confirmCancel == itemId -> "Really cancel?"
                                    else -> "Cancel"
                                },
                                color = Color(0xFFF43F5E),
                            )
                        }
                    }
                }
            }
        }
    }

    if (picking) {
        ItemPicker(catalog, onCancel = { picking = false }, onPick = { id ->
            picking = false
            dialog = Item(name = id, level = state.standBids[id]?.minimumQuality ?: 0)
        })
    }
    dialog?.let { item ->
        WtbDialog(viewModel, item, catalogFor(item.name)?.meta, catalogFor, state.merchantCatalog?.buyable.orEmpty(), state.standPriceHistory[item.name], state.standBids[item.name], onClose = { dialog = null })
    }
    inspecting?.let { item ->
        ModalBottomSheet(onDismissRequest = { inspecting = null }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
            Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp)) {
                ItemDetailBrowser(rootItemId = item.name, rootLevel = item.level ?: 0, catalog = state.merchantCatalog, monsters = state.bestiaryCatalog, viewModel = viewModel)
            }
        }
    }
}

private val FIELD_LABELS = mapOf("quantity" to "Quantity", "price" to "Price", "priority" to "Priority")

/** active-wtb-fields.tsx: ×qty / price / "P n" buttons; quantity and
 *  priority edit inline (Done or focus loss saves), price opens the WTB
 *  dialog. [onSave] returns an error message, or null. */
@Composable
private fun ActiveWtbFields(name: String, bid: StandBid, disabled: Boolean, onEditPrice: () -> Unit, onSave: suspend (String, Int?) -> String?) {
    val scope = rememberCoroutineScope()
    var editing by remember { mutableStateOf<String?>(null) }
    var draft by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var focused by remember { mutableStateOf(false) }
    fun edit(field: String) {
        if (saving) return
        editing = field
        error = ""
        draft = (if (field == "priority") bid.priorityOverride else if (field == "quantity") bid.quantity else bid.price)?.toString().orEmpty()
    }
    fun save() {
        val field = editing ?: return
        if (saving) return
        val value = if (field == "priority" && draft.isEmpty()) null else draft.toIntOrNull()
        if (value == null && !(field == "priority" && draft.isEmpty()) || value != null && (value < (if (field == "priority") 0 else 1) || (field == "priority" && value > 100))) {
            error = if (field == "priority") "Priority must be 0–100 or blank." else "${FIELD_LABELS[field]} must be a positive whole number."
            return
        }
        saving = true
        error = ""
        scope.launch {
            val failure = onSave(field, value)
            if (failure != null) error = failure else editing = null
            saving = false
        }
    }
    Column {
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
            for (field in listOf("quantity", "price", "priority")) {
                if (editing == field) {
                    OutlinedTextField(
                        value = draft,
                        onValueChange = { draft = it.filter(Char::isDigit) },
                        enabled = !disabled && !saving,
                        singleLine = true,
                        placeholder = if (field == "priority") ({ Text("Default") }) else null,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { save() }),
                        textStyle = MaterialTheme.typography.labelSmall.copy(fontFamily = FontFamily.Monospace),
                        modifier = Modifier.width(96.dp)
                            .onFocusChanged { state -> if (focused && !state.isFocused) save(); focused = state.isFocused }
                            .semantics { contentDescription = "${FIELD_LABELS[field]} for $name" },
                    )
                } else {
                    OutlinedButton(
                        enabled = !disabled && !saving,
                        onClick = { if (field == "price") onEditPrice() else edit(field) },
                        contentPadding = PaddingValues(horizontal = 8.dp),
                        modifier = Modifier.semantics { contentDescription = "Edit ${FIELD_LABELS[field]!!.lowercase()} for $name" },
                    ) {
                        Text(
                            when (field) {
                                "quantity" -> "×${"%,d".format(bid.quantity)}"
                                "price" -> "${"%,d".format(bid.price)}g"
                                else -> "P ${bid.priorityOverride ?: "Default"}"
                            },
                            color = VioletText,
                            fontFamily = FontFamily.Monospace,
                            style = MaterialTheme.typography.labelSmall,
                        )
                    }
                }
            }
            if (editing != null) TextButton(onClick = { editing = null; error = "" }) { Text("Cancel", style = MaterialTheme.typography.labelSmall) }
        }
        if (error.isNotEmpty()) Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ItemPicker(catalog: List<CatalogItem>, onCancel: () -> Unit, onPick: (String) -> Unit) {
    var search by remember { mutableStateOf("") }
    val filtered = catalog.filter { it.name.lowercase().contains(search.lowercase()) }.take(100)
    ModalBottomSheet(onDismissRequest = onCancel, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Choose an item", style = MaterialTheme.typography.titleSmall)
                TextButton(onClick = onCancel) { Text("Close") }
            }
            OutlinedTextField(search, { search = it }, placeholder = { Text("Search items...") }, singleLine = true, modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp))
            for (item in filtered) {
                Row(modifier = Modifier.fillMaxWidth().clickable { onPick(item.id) }.padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    SpriteIcon(item.sprite, size = 28.dp)
                    Text(item.name, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(start = 10.dp))
                }
            }
        }
    }
}
