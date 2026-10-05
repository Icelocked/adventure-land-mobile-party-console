package com.partyconsole.companion.ui.components

import com.partyconsole.companion.ui.DomainInterest
import com.partyconsole.companion.data.Domain
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.domain.abbreviatedGold
import com.partyconsole.companion.domain.alDataListing
import com.partyconsole.companion.domain.deconstructionRewards
import com.partyconsole.companion.domain.levelPriceHistory
import com.partyconsole.companion.domain.pontyPrice
import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.model.DeconstructionCatalogEntry
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.ItemMeta
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.itemdetail.npcSaleValue
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.roundToLong

private val Orange = Color(0xFFF97316)
private val Amber = Color(0xFFF59E0B)
private val Cyan = Color(0xFF06B6D4)
private val Emerald = Color(0xFF10B981)
private val Violet = Color(0xFFA78BFA)
private val Slate = Color(0xFF94A3B8)

data class StandListingDraft(val price: Long, val quantity: Int, val markAll: Boolean)

/** The stand listing form, inline: buy-from-NPC and current market count, the
 *  price with its 13 presets (Market low −5 % disabled below the NPC price),
 *  quantity for stacks, "Mark all for stand", the automatic variant, the
 *  16-slot guard for a new listing, and an inline error. [onSubmit] returns
 *  an error message, or null on success. */
@Composable
fun StandListingForm(
    viewModel: PartyViewModel,
    item: Item,
    meta: ItemMeta?,
    existingId: String? = null,
    existingPrice: Long? = null,
    existingQuantity: Int? = null,
    auto: Boolean = false,
    onSubmit: suspend (StandListingDraft) -> String?,
    onCancel: (() -> Unit)? = null,
) {
    DomainInterest(viewModel, Domain.MARKET)
    val state by viewModel.dynamicState.collectAsState()
    val scope = rememberCoroutineScope()
    // The item's value (definition.g), at least 1.
    val defaultPrice = maxOf(1L, (meta?.definition?.get("g") as? JsonPrimitive)?.content?.toDoubleOrNull()?.toLong() ?: 1L)
    var price by remember(item) { mutableStateOf((existingPrice?.takeIf { it > 0 } ?: defaultPrice).toString()) }
    var quantity by remember(item) { mutableStateOf((existingQuantity?.takeIf { it > 0 } ?: item.q ?: 1).toString()) }
    var markAll by remember(item) { mutableStateOf(false) }
    var error by remember(item) { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val level = item.level ?: 0
    val observed = levelPriceHistory(state.standPriceHistory[item.name], level)
    val marketReference = observed.marketLow ?: observed.lowest ?: 0.0
    val npcSale = npcSaleValue(level, item.gift == true, item.expires, meta).toDouble()
    val ponty = pontyPrice(item, meta).toDouble()
    val freshAfter = System.currentTimeMillis() - 120_000
    val marketCount = state.aldata?.listings.orEmpty().map(::alDataListing)
        .filter { it.seenAt >= freshAfter && it.serverIdentifier != "PVP" && it.item.name == item.name && (it.item.level ?: 0) == level && it.item.p == item.p }
        .sumOf { maxOf(1, it.quantity) }
    val full = existingId == null && !auto && state.standListings.size >= 16
    fun apply(value: Double) { price = maxOf(1L, value.roundToLong()).toString() }
    val input = price.toDoubleOrNull() ?: 0.0
    val presets = listOf(
        Triple("NPC sale +10%", npcSale * 1.1, false) to Emerald,
        Triple("Ponty sells for", ponty, false) to Violet,
        Triple("Default −10%", defaultPrice * 0.9, false) to Emerald,
        Triple("Default", defaultPrice.toDouble(), false) to Emerald,
        Triple("Default +10%", defaultPrice * 1.1, false) to Emerald,
        Triple("Market low −5%", marketReference * 0.95, marketReference == 0.0 || marketReference * 0.95 < defaultPrice) to Cyan,
        Triple("Market price", observed.marketLow ?: 0.0, observed.marketLow == null) to Cyan,
        Triple("Highest WTB price", observed.highestPublicWTB ?: 0.0, observed.highestPublicWTB == null) to Violet,
        Triple("Recent +5%", (observed.recent ?: 0.0) * 1.05, observed.recent == null) to Violet,
        Triple("Recent price", observed.recent ?: 0.0, observed.recent == null) to Violet,
        Triple("Recent −5%", (observed.recent ?: 0.0) * 0.95, observed.recent == null) to Violet,
        Triple("Input −5%", input * 0.95, input == 0.0) to Slate,
        Triple("Input +5%", input * 1.05, input == 0.0) to Slate,
    )

    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp).border(BorderStroke(1.dp, Amber.copy(alpha = 0.5f)), RoundedCornerShape(6.dp)).padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(if (auto) "Automatic merchant stand listing" else "Merchant stand listing", style = MaterialTheme.typography.titleSmall)
        Text(
            if (auto) "Set one fixed price. Every future matching item is marked for the stand at this price." else "Set the sale price and quantity. The merchant lists it when idle.",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text("Buy from NPC: ${if (level == 0 && meta?.buyable == true) "${abbreviatedGold(defaultPrice)} gold" else "unavailable"}", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall)
        Text("Current number on market: ${"%,d".format(marketCount)}", color = Cyan, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall)
        OutlinedTextField(value = price, onValueChange = { price = it.filter(Char::isDigit) }, label = { Text("Stand price") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        for (row in presets.chunked(2)) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for ((preset, tone) in row) {
                    val (label, value, disabled) = preset
                    val usable = if (value.isFinite() && value > 0) value else 0.0
                    OutlinedButton(
                        enabled = !disabled,
                        onClick = { if (usable > 0) apply(usable) },
                        border = BorderStroke(1.dp, tone.copy(alpha = if (disabled) 0.3f else 0.7f)),
                        modifier = Modifier.weight(1f).heightIn(min = 56.dp),
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(label, color = tone, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelMedium)
                            Text(if (usable > 0) "${abbreviatedGold(maxOf(1L, usable.roundToLong()))} gold" else "Unavailable", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
                if (row.size == 1) Box(modifier = Modifier.weight(1f))
            }
        }
        Text(
            "Market low uses the current fresh low, falling back to the lowest observed price. It is disabled when a 5% undercut would fall below the buy-from-NPC price.",
            fontFamily = FontFamily.Monospace,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (!auto && (item.q ?: 1) > 1) {
            OutlinedTextField(value = quantity, onValueChange = { quantity = it.filter(Char::isDigit) }, label = { Text("Stand quantity") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        }
        if (!auto) {
            Row(verticalAlignment = Alignment.Top) {
                Checkbox(checked = markAll, onCheckedChange = { markAll = it })
                Column(modifier = Modifier.padding(top = 12.dp)) {
                    Text("Mark all for stand", style = MaterialTheme.typography.bodySmall)
                    Text("List every identical copy held by the merchant or stored in the bank at this price.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            onCancel?.let { OutlinedButton(enabled = !busy, onClick = it) { Text("Cancel") } }
            Button(enabled = !busy && !full, onClick = {
                scope.launch {
                    busy = true
                    error = null
                    error = onSubmit(StandListingDraft(price.toLongOrNull() ?: 0L, quantity.toIntOrNull() ?: 0, markAll))
                    busy = false
                }
            }) { Text(if (auto) "Save auto mark" else "Mark for stand") }
        }
    }
}

/** Deconstruction confirmation, inline: the rewards per item (each row a
 *  separate roll), cost per item, and a confirm that only sends once the
 *  reward data exists. */
@Composable
fun DeconstructionConfirmation(
    item: Item,
    auto: Boolean,
    all: Boolean = false,
    catalog: Map<String, DeconstructionCatalogEntry>,
    catalogFor: (String) -> CatalogItem?,
    onConfirm: suspend () -> String?,
    onCancel: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val rewards = deconstructionRewards(item, catalog)
    val title = if (auto) "Enable auto deconstruction?" else if (all) "Mark all for deconstruction?" else "Mark for deconstruction?"
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp).border(BorderStroke(1.dp, Orange.copy(alpha = 0.6f)), RoundedCornerShape(6.dp)).padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(title, style = MaterialTheme.typography.titleSmall)
        Text(
            if (auto) "The merchant will deconstruct matching items at this level, stat type, and special property until you remove the rule."
            else "The merchant will deconstruct ${if (all) "all eligible bank copies of" else "${item.q ?: 1} ×"} ${catalogFor(item.name)?.name ?: item.name}${item.level?.takeIf { it > 0 }?.let { " +$it" } ?: ""}. This consumes the original items.",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text("Possible rewards per item", color = Orange, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall)
        rewards?.forEach { reward ->
            val definition = catalogFor(reward.name)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(modifier = Modifier.size(40.dp), contentAlignment = Alignment.Center) {
                    if (definition?.sprite != null) SpriteIcon(definition.sprite, size = 40.dp) else Icon(Icons.Filled.Inventory2, contentDescription = null)
                }
                Text("${reward.quantity} × ${definition?.name ?: reward.name}${if (reward.level > 0) " +${reward.level}" else ""}", style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                Text("${"%.4f".format(reward.chance * 100).trimEnd('0').trimEnd('.')}%", color = Orange, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall)
            }
        }
        if (rewards == null) Text("Reward data is unavailable. Refresh after the coordinator updates.", color = Amber, style = MaterialTheme.typography.bodySmall)
        if ((rewards?.size ?: 0) > 1) Text("Each reward row is a separate roll. Percentages are per item deconstructed.", style = MaterialTheme.typography.labelSmall)
        catalog[item.name]?.cost?.let { Text("Cost per item: ${"%,d".format(it)}g", color = Amber, style = MaterialTheme.typography.bodySmall) }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                enabled = !busy && rewards != null,
                colors = ButtonDefaults.buttonColors(containerColor = Orange),
                onClick = {
                    scope.launch {
                        busy = true
                        error = null
                        error = onConfirm()
                        busy = false
                    }
                },
            ) { Text(if (busy) "Saving…" else if (auto) "Enable auto deconstruction" else if (all) "Mark all for deconstruction" else "Mark for deconstruction") }
            OutlinedButton(enabled = !busy, onClick = onCancel) { Text("Cancel") }
        }
    }
}

/** "Automatically sell to NPC?": what the rule matches, its scope, and the
 *  proceeds per sale. */
@Composable
fun AutoNpcSaleConfirmation(item: Item, meta: ItemMeta?, name: String, character: String?, onConfirm: suspend () -> String?, onCancel: () -> Unit) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp).border(BorderStroke(1.dp, Orange.copy(alpha = 0.6f)), RoundedCornerShape(6.dp)).padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text("Automatically sell to NPC?", style = MaterialTheme.typography.titleSmall)
        Text(
            (if (character != null) "Matching items on $character will be collected and sold by the merchant. This" else "Every future matching item received by the merchant will be queued for NPC sale. This") +
                " remains active until you clear the rule.",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Column(modifier = Modifier.fillMaxWidth().border(BorderStroke(1.dp, Orange.copy(alpha = 0.3f)), RoundedCornerShape(4.dp)).padding(8.dp)) {
            Text("$name${item.level?.takeIf { it > 0 }?.let { " +$it" } ?: ""}", fontWeight = FontWeight.SemiBold)
            Text("You will receive ${"%,d".format(npcSaleValue(item.level ?: 0, item.gift == true, item.expires, meta))}g per sale.", color = Amber, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall)
            Text("The rule matches this exact +level, stat type, and special property.", style = MaterialTheme.typography.labelSmall)
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(enabled = !busy, colors = ButtonDefaults.buttonColors(containerColor = Orange), onClick = {
                scope.launch {
                    busy = true
                    error = null
                    error = onConfirm()
                    busy = false
                }
            }) { Text("Enable auto sale", color = Color.Black) }
            OutlinedButton(enabled = !busy, onClick = onCancel) { Text("Cancel") }
        }
    }
}

/** Marks an item duplicated by Merchant's Luck. */
@Composable
fun MluckClover(item: Item?, modifier: Modifier = Modifier) {
    if (item?.m == null || (item.m as? JsonPrimitive)?.content == "false") return
    Box(
        modifier = modifier.size(18.dp).background(Color(0xF2052E16), CircleShape).border(1.dp, Color(0xFF6EE7B7), CircleShape),
        contentAlignment = Alignment.Center,
    ) { Text("☘", color = Color(0xFF6EE7B7), style = MaterialTheme.typography.labelSmall) }
}
