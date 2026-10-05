package com.partyconsole.companion.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.domain.abbreviatedGold
import com.partyconsole.companion.domain.exactLevelPrice
import com.partyconsole.companion.domain.pontyPrice
import com.partyconsole.companion.domain.suggestedItemValue
import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.model.InventoryEntry
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.ItemMeta
import com.partyconsole.companion.model.MerchantBuyItem
import com.partyconsole.companion.model.StandBid
import com.partyconsole.companion.model.StandPriceHistory
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.network.CommandResult
import com.partyconsole.companion.network.PartyApiClient
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.itemdetail.npcSaleValue
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.max
import kotlin.math.roundToLong

/** WTB preference explanations, as worded on the dashboard. */
const val STAND_BUY_EXPLANATION =
    "Uses a merchant stand slot to advertise this buy order to other players. Automatic shopping continues whether this is enabled or disabled."
const val HIGHER_LEVEL_EXPLANATION =
    "Also buy higher-level items at or below your price. Disable for exact-level purchases, such as crafting ingredients."
const val AUTO_STAND_EXPLANATION =
    "Automatically uses an empty stand slot for a highest priority buy order. A new sell listing takes this slot when needed; your stand-slot preference stays unchecked."

/** A small "i" that toggles its explanation (a hover popover on desktop). */
@Composable
fun InfoToggle(label: String, text: String) {
    var open by remember { mutableStateOf(false) }
    Column {
        IconButton(onClick = { open = !open }, modifier = Modifier.size(28.dp).semantics { contentDescription = "Information: $label" }) {
            Icon(Icons.Outlined.Info, contentDescription = null, tint = Color(0xFFC4B5FD), modifier = Modifier.size(14.dp))
        }
        if (open) {
            Text(text, style = MaterialTheme.typography.labelSmall, modifier = Modifier.border(1.dp, Color(0xFF7C3AED), RoundedCornerShape(4.dp)).padding(8.dp))
        }
    }
}

@Composable
fun WtbPreference(label: String, description: String, checked: Boolean, onChange: (Boolean) -> Unit, enabled: Boolean = true) {
    Row(verticalAlignment = Alignment.Top) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable(enabled = enabled) { onChange(!checked) }) {
            Checkbox(checked = checked, onCheckedChange = onChange, enabled = enabled, modifier = Modifier.semantics { contentDescription = label })
            Text(label, style = MaterialTheme.typography.bodySmall)
        }
        InfoToggle(label, description)
    }
}

/** 0-100, blank = routine priority. */
fun priorityInput(text: String): String {
    val digits = text.filter(Char::isDigit)
    return if (digits.isEmpty()) "" else minOf(100, digits.take(4).toInt()).toString()
}

@Composable
fun StandPriceButton(label: String, value: Double?, tone: Color, modifier: Modifier = Modifier, enabled: Boolean = true, onClick: () -> Unit) {
    val usable = if (value != null && value.isFinite() && value > 0) value else 0.0
    OutlinedButton(
        enabled = enabled,
        onClick = onClick,
        border = BorderStroke(1.dp, tone.copy(alpha = if (enabled) 0.7f else 0.3f)),
        modifier = modifier.heightIn(min = 56.dp),
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(label, color = tone, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelMedium)
            Text(if (usable > 0) "${abbreviatedGold(max(1L, usable.roundToLong()))} gold" else "Unavailable", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall)
        }
    }
}

private data class Occupant(val id: String, val itemId: String, val kind: String, val price: Long, val quantity: Int)

/** A failure with `occupants` asks which stand entry to bounce, then retries
 *  with replaceStandEntry. */
class WtbReplacement internal constructor(internal val viewModel: PartyViewModel) {
    internal var pending by mutableStateOf<Pair<List<JsonObject>, Pair<suspend (String?) -> ApiResult<CommandResult>, (() -> Unit)?>>?>(null)
    var error by mutableStateOf("")
        internal set

    suspend fun save(action: suspend (String?) -> ApiResult<CommandResult>, onDone: (() -> Unit)? = null): Boolean {
        error = ""
        return when (val result = action(null)) {
            is ApiResult.Success -> {
                viewModel.refreshDynamicStateNow()
                onDone?.invoke()
                true
            }
            is ApiResult.Failure -> {
                val occupants = result.body?.get("occupants") as? JsonArray
                if (occupants != null) pending = occupants.mapNotNull { it as? JsonObject } to (action to onDone)
                else error = result.message.ifEmpty { "Could not save WTB" }
                false
            }
        }
    }
}

@Composable
fun rememberWtbReplacement(viewModel: PartyViewModel): WtbReplacement = remember(viewModel) { WtbReplacement(viewModel) }

/** The replacement prompt and the last save error. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WtbReplacementDialog(replacement: WtbReplacement, catalogFor: (String) -> CatalogItem?) {
    val scope = rememberCoroutineScope()
    val pending = replacement.pending
    if (pending == null) {
        if (replacement.error.isNotEmpty()) Text(replacement.error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        return
    }
    var selected by remember(pending) { mutableStateOf("") }
    var saving by remember(pending) { mutableStateOf(false) }
    var error by remember(pending) { mutableStateOf("") }
    val occupants = pending.first.map {
        fun s(key: String) = (it[key] as? JsonPrimitive)?.content.orEmpty()
        Occupant(s("id"), s("itemId"), s("kind"), s("price").toDoubleOrNull()?.toLong() ?: 0, s("quantity").toDoubleOrNull()?.toInt() ?: 0)
    }
    ModalBottomSheet(onDismissRequest = { if (!saving) replacement.pending = null }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Make room for a buy order", style = MaterialTheme.typography.titleSmall)
            Text("All stand slots are full. Which item would you like to remove to make room for the buy order?", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            for (entry in occupants) {
                val item = catalogFor(entry.itemId)
                val active = selected == entry.id
                Row(
                    modifier = Modifier.fillMaxWidth().border(1.dp, if (active) Color(0xFFA78BFA) else MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(8.dp))
                        .clickable(enabled = !saving) { selected = entry.id }.padding(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(selected = active, onClick = { selected = entry.id }, enabled = !saving)
                    SpriteIcon(item?.sprite, size = 40.dp)
                    Column(modifier = Modifier.weight(1f).padding(start = 8.dp)) {
                        Text(item?.name ?: entry.itemId, fontWeight = FontWeight.Medium, maxLines = 1)
                        Text("${"%,d".format(entry.quantity)} at ${"%,d".format(entry.price)}g each", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text(
                        if (entry.kind == "sale") "Selling" else "Buying",
                        color = if (entry.kind == "sale") Color(0xFFF59E0B) else Color(0xFFA78BFA),
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
            }
            Text("The selected sale will be paused, or the selected buy order will keep shopping automatically without using a stand slot.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (error.isNotEmpty()) Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.align(Alignment.End)) {
                OutlinedButton(enabled = !saving, onClick = { replacement.pending = null }) { Text("Cancel") }
                Button(enabled = selected.isNotEmpty() && !saving, onClick = {
                    scope.launch {
                        saving = true
                        val result = pending.second.first(selected)
                        saving = false
                        if (result is ApiResult.Failure) { error = result.message.ifEmpty { "Could not replace listing" }; return@launch }
                        val done = pending.second.second
                        replacement.pending = null
                        replacement.viewModel.refreshDynamicStateNow()
                        done?.invoke()
                    }
                }) { Text("Replace listing") }
            }
        }
    }
}

private val Amber = Color(0xFFF59E0B)
private val Emerald = Color(0xFF10B981)
private val Cyan = Color(0xFF06B6D4)
private val Violet = Color(0xFFA78BFA)
private val Slate = Color(0xFF94A3B8)

/** The WTB order form: price (15 presets at the exact level, existing price
 *  only when its level matches), quantity, +level, priority, Use stand and
 *  Accept higher levels, and the stand-replacement retry. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WtbDialog(
    viewModel: PartyViewModel,
    item: Item,
    meta: ItemMeta?,
    catalogFor: (String) -> CatalogItem?,
    buyable: List<MerchantBuyItem>,
    history: StandPriceHistory?,
    existing: StandBid?,
    onClose: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var price by remember { mutableStateOf(if (existing != null && (existing.minimumQuality ?: 0) == (item.level ?: 0)) existing.price.toString() else "") }
    var quantity by remember { mutableStateOf(existing?.quantity?.toString() ?: "1") }
    var level by remember { mutableStateOf((item.level ?: 0).toString()) }
    var saving by remember { mutableStateOf(false) }
    var useStandSlot by remember { mutableStateOf(existing?.useStandSlot == true) }
    var acceptHigherLevels by remember { mutableStateOf(existing?.acceptHigherLevels != false) }
    var priorityOverride by remember { mutableStateOf(existing?.priorityOverride?.toString() ?: "") }
    val replacement = rememberWtbReplacement(viewModel)
    val leveled = meta?.upgradeable == true || meta?.compoundable == true
    val previewItem = item.copy(level = max(0, level.toIntOrNull() ?: 0))
    val previewLevel = previewItem.level ?: 0
    val valuation = suggestedItemValue(InventoryEntry(slot = -1, item = previewItem, meta = meta), buyable)
    val defaultPrice = max(1.0, (meta?.definition?.get("g") as? JsonPrimitive)?.content?.toDoubleOrNull()?.takeIf { it != 0.0 } ?: valuation.defaultPrice)
    val npcPrice = max(1.0, npcSaleValue(previewLevel, previewItem.gift == true, previewItem.expires, meta).toDouble())
    val pontyValue = max(1.0, pontyPrice(previewItem, meta).toDouble())
    val marketLow = exactLevelPrice(history?.marketLow, history?.marketLowLevel, previewLevel)
    val lowest = exactLevelPrice(history?.lowest, history?.lowestLevel, previewLevel)
    val recent = exactLevelPrice(history?.recent, history?.recentLevel, previewLevel)
    val highestWtb = exactLevelPrice(history?.highestPublicWTB, history?.highestPublicWTBLevel, previewLevel)
    val marketReference = marketLow ?: lowest
    val input = price.toDoubleOrNull()?.takeIf { it != 0.0 }
    val buttons = listOf(
        Triple("Farm price", valuation.suggested, Amber),
        Triple("NPC sale +10%", npcPrice * 1.1, Emerald),
        Triple("Ponty price", pontyValue, Violet),
        Triple("Base value −10%", defaultPrice * 0.9, Emerald),
        Triple("Base value (+0)", defaultPrice, Emerald),
        Triple("Base value +10%", defaultPrice * 1.1, Emerald),
        Triple("Market low −5%", marketReference?.let { it * 0.95 }, Cyan),
        Triple("Market price", marketLow, Cyan),
        Triple("Highest WTB price", highestWtb, Violet),
        Triple("Lowest seen", lowest, Cyan),
        Triple("Recent +5%", recent?.let { it * 1.05 }, Violet),
        Triple("Recent price", recent, Violet),
        Triple("Recent −5%", recent?.let { it * 0.95 }, Violet),
        Triple("Input +5%", input?.let { it * 1.05 }, Slate),
        Triple("Input −5%", input?.let { it * 0.95 }, Slate),
    )
    val name = (meta?.definition?.get("name") as? JsonPrimitive)?.content ?: catalogFor(item.name)?.name ?: item.name

    ModalBottomSheet(onDismissRequest = onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                SpriteIcon(catalogFor(item.name)?.sprite, size = 32.dp)
                Text("Add to WTB · $name" + if (leveled || previewLevel != 0) " +$previewLevel" else "", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(start = 8.dp))
            }
            Text("Automatic shopping buys matching items at no more than your bid. Native stand orders advertise the selected exact level.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(price, { price = it.filter(Char::isDigit) }, label = { Text("Maximum price") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.weight(1f))
                OutlinedTextField(quantity, { quantity = it.filter(Char::isDigit) }, label = { Text("Quantity") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.weight(1f))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(level, { level = it.filter(Char::isDigit) }, enabled = leveled, label = { Text("Selected +level") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.weight(1f))
                OutlinedTextField(priorityOverride, { priorityOverride = priorityInput(it) }, label = { Text("Priority override") }, placeholder = { Text("Default") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.weight(1f))
            }
            WtbPreference("Use stand", STAND_BUY_EXPLANATION, useStandSlot, { useStandSlot = it })
            if (leveled) WtbPreference("Accept higher levels", HIGHER_LEVEL_EXPLANATION, acceptHigherLevels, { acceptHigherLevels = it })
            Text("Priority: 0–100, higher first. Leave blank to use the routine priority.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            for (row in buttons.chunked(2)) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    for ((label, value, tone) in row) {
                        StandPriceButton(label, value, tone, Modifier.weight(1f), enabled = value != null && value > 0) {
                            if (value != null && value > 0) price = max(1L, value.roundToLong()).toString()
                        }
                    }
                    if (row.size == 1) Box(modifier = Modifier.weight(1f))
                }
            }
            Text(
                "Farm price: estimated gold you would earn while farming enough monsters to obtain one of this item, based on its drop rate and those monsters' gold rewards.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            WtbReplacementDialog(replacement, catalogFor)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.align(Alignment.End)) {
                OutlinedButton(onClick = onClose) { Text("Cancel") }
                Button(
                    enabled = !saving && (price.toLongOrNull() ?: 0) > 0 && (quantity.toIntOrNull() ?: 0) > 0,
                    onClick = {
                        scope.launch {
                            saving = true
                            replacement.save({ replaceStandEntry ->
                                viewModel.api.saveBid(
                                    item.name, price.toLong(), quantity.toInt(), max(0, level.toIntOrNull() ?: 0), false,
                                    priorityOverride.toIntOrNull()?.let { JsonPrimitive(it) } ?: JsonNull,
                                    PartyApiClient.WtbOptions(useStandSlot = useStandSlot, acceptHigherLevels = acceptHigherLevels, replaceStandEntry = replaceStandEntry),
                                )
                            }, onClose)
                            saving = false
                        }
                    },
                ) { Text(if (saving) "Saving…" else "Place WTB") }
            }
        }
    }
}
