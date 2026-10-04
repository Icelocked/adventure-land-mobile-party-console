package com.partyconsole.companion.ui.account

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.domain.AlDataListing
import com.partyconsole.companion.domain.PontyGroup
import com.partyconsole.companion.domain.alDataBuyOrder
import com.partyconsole.companion.domain.alDataListing
import com.partyconsole.companion.domain.alDataPublicTrade
import com.partyconsole.companion.domain.blacklistRecord
import com.partyconsole.companion.domain.dealValuesByItem
import com.partyconsole.companion.domain.filterAlData
import com.partyconsole.companion.domain.filterBuyOrders
import com.partyconsole.companion.domain.groupAlData
import com.partyconsole.companion.domain.groupPonty
import com.partyconsole.companion.domain.ownedCounts
import com.partyconsole.companion.domain.ownedKey
import com.partyconsole.companion.domain.ownedSource
import com.partyconsole.companion.domain.pontyListing
import com.partyconsole.companion.domain.priceComparison
import com.partyconsole.companion.domain.BlacklistRecord
import com.partyconsole.companion.model.InventoryEntry
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.network.CommandResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.components.StandListingForm
import com.partyconsole.companion.ui.components.WtbDialog
import com.partyconsole.companion.ui.components.rememberClock
import com.partyconsole.companion.ui.itemdetail.ItemDetailBrowser
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import com.partyconsole.companion.ui.itemicon.rememberCatalogLookup
import kotlinx.coroutines.launch
import kotlin.math.max

private val Emerald = Color(0xFF34D399)
private val Rose = Color(0xFFFB7185)
private val Amber = Color(0xFFF59E0B)
private val Violet = Color(0xFFA78BFA)
private val Fuchsia = Color(0xFFE879F9)

private fun ageLabel(age: Long) = if (age < 3600) "${age}s" else "${age / 3600}h"
private fun gold(value: Long) = "%,d".format(value)

private data class ListingDraft(val key: String, val entry: InventoryEntry, val bankPack: String?, val price: Long, val quantity: Int)

/** Inline Yes/Cancel confirmation (the dashboard's confirm dialogs). */
@Composable
private fun Confirm(title: String, text: String, busy: Boolean, error: String?, onYes: () -> Unit, onCancel: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().border(1.dp, Color(0x990E7490), RoundedCornerShape(6.dp)).padding(10.dp).semantics { contentDescription = title }) {
        Text(title, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
        Text(text, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp)) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.align(Alignment.End).padding(top = 8.dp)) {
            OutlinedButton(enabled = !busy, onClick = onCancel) { Text("Cancel") }
            Button(enabled = !busy, onClick = onYes) { Text(if (busy) "Queuing…" else "Yes") }
        }
    }
}

/** stand-sheet.tsx's market (the PWA's MarketScreen.tsx): ALData/Ponty
 *  status, Live WTS / Live WTB / Classifieds / Ponty tabs with counts, one
 *  search, the WTS filters (deals, bad deals, affordable with bank gold,
 *  blacklisted), grouped listings with deal colouring and stale dimming,
 *  confirmed buys split across grouped listings, "Make WTB" for stale rows,
 *  selling into live WTB offers (or "List" at the WTB price when stale),
 *  classifieds' Add to WTB / Add to stand, and Ponty's grouped lots. Every
 *  row inspects its item. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun MarketScreen(viewModel: PartyViewModel, onBack: () -> Unit, onOpenWtb: () -> Unit, onOpenSettings: () -> Unit, onOpenSetup: () -> Unit) {
    val state by viewModel.dynamicState.collectAsState()
    val characters by viewModel.characters.collectAsState()
    val diagnostics by viewModel.characterDetails.collectAsState()
    val api = viewModel.api
    val scope = rememberCoroutineScope()
    val catalogFor = rememberCatalogLookup(state.merchantCatalog)
    val now = rememberClock()
    var tab by remember { mutableStateOf("wts") }
    var query by remember { mutableStateOf("") }
    var showDealsOnly by remember { mutableStateOf(false) }
    var hideBadDeals by remember { mutableStateOf(false) }
    var hideUnaffordable by remember { mutableStateOf(false) }
    var hideBlacklisted by remember { mutableStateOf(true) }
    var hideUnowned by remember { mutableStateOf(false) }
    val quantities = remember { mutableStateMapOf<String, String>() }
    var confirming by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf<String?>(null) }
    var rowError by remember { mutableStateOf<Pair<String, String>?>(null) }
    var inspecting by remember { mutableStateOf<Item?>(null) }
    var wtbItem by remember { mutableStateOf<Item?>(null) }
    var listing by remember { mutableStateOf<ListingDraft?>(null) }

    val merchantName = state.merchantCharacter
    val merchantItems = merchantName?.let { characters[it]?.inventory?.items }.orEmpty()
    val bankPacks = state.bank?.packs.orEmpty()
    val catalog = state.merchantCatalog?.allItems.orEmpty()
    val nameFor = { id: String -> catalogFor(id)?.name }
    val aldata = state.aldata
    val ponty = state.ponty
    val allAlData = remember(aldata?.listings) { aldata?.listings.orEmpty().map(::alDataListing) }
    val allBuyOrders = remember(aldata?.buyOrders, merchantName) { aldata?.buyOrders.orEmpty().map(::alDataBuyOrder).filter { it.buyer != merchantName } }
    val blacklist = state.merchantBlacklist.mapValues { BlacklistRecord(it.value.reason, it.value.until) }
    val bankGold = state.bank?.gold ?: state.bankGold ?: 0L
    val values = remember(catalog, state.merchantCatalog?.buyable) { dealValuesByItem(catalog, state.merchantCatalog?.buyable.orEmpty()) }
    fun listingValue(entry: AlDataListing) = values[entry.item.name]?.takeIf { it != 0.0 } ?: 1.0
    val grouped = remember(allAlData) { groupAlData(allAlData) }
    val wts = filterAlData(grouped, query, now, nameFor).filter { entry ->
        (!showDealsOnly || entry.price < listingValue(entry) * 0.5) &&
            (!hideBadDeals || entry.price <= listingValue(entry) * 2) &&
            (!hideUnaffordable || entry.price <= bankGold) &&
            (!hideBlacklisted || blacklistRecord(blacklist, state.autoBlacklistMerchants, now, entry.seller, entry.serverRegion, entry.serverIdentifier) == null)
    }
    val owned = ownedCounts(merchantItems, bankPacks)
    val buyOrders = filterBuyOrders(allBuyOrders, query, now, hideUnowned, owned, nameFor)
    val bankWtb = buyOrders.filter { owned.containsKey(ownedKey(it.item)) }
    val ownOwner = merchantName?.let { diagnostics[it]?.owner }?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content ?: it.toString() }.orEmpty()
    val publicTrades = aldata?.trades.orEmpty().map(::alDataPublicTrade).filter { it.owner != ownOwner }.flatMap { owner -> owner.listings.map { owner to it } }
    val classifieds = publicTrades.filter { (owner, entry) ->
        "${nameFor(entry.name).orEmpty()} ${entry.name} ${owner.label.orEmpty()} ${owner.characters.joinToString(" ")}".lowercase().contains(query.trim().lowercase())
    }
    val pontyRows = groupPonty(ponty?.listings.orEmpty().map(::pontyListing), query, now, nameFor)

    fun run(key: String, action: suspend () -> String?) = scope.launch {
        busy = key
        rowError = null
        val message = action()
        busy = null
        if (message != null) { rowError = key to message; return@launch }
        confirming = null
        viewModel.refreshDynamicStateNow()
    }
    fun ApiResult<CommandResult>.message() = (this as? ApiResult.Failure)?.message
    // stand-sheet.tsx purchase confirmation: split the quantity across the grouped listings.
    suspend fun buyGrouped(entry: AlDataListing, quantity: Int): String? {
        var remaining = quantity
        for (physical in entry.groupedListings ?: listOf(entry)) {
            if (remaining <= 0) break
            val purchasing = minOf(remaining, max(1, physical.quantity))
            api.buyAlData(physical.raw, purchasing).message()?.let { return it }
            remaining -= purchasing
        }
        return if (remaining > 0) "Only ${quantity - remaining} of $quantity listings could be queued" else null
    }
    fun listFor(key: String, item: Item, price: Long, quantity: Int) {
        val source = ownedSource(item, merchantItems, bankPacks) ?: return
        listing = ListingDraft(key, source.entry, source.bankPack, price, max(1, minOf(quantity, source.entry.item.q ?: 1)))
    }
    @Composable
    fun ListingForm(key: String) {
        val draft = listing?.takeIf { it.key == key } ?: return
        val existing = state.standListings.find { it.bankPack == draft.bankPack && it.slot == draft.entry.slot && it.item.name == draft.entry.item.name }
        StandListingForm(
            viewModel, draft.entry.item, catalogFor(draft.entry.item.name)?.meta,
            existingId = existing?.id, existingPrice = draft.price, existingQuantity = draft.quantity,
            onCancel = { listing = null },
            onSubmit = { submitted ->
                when (val result = api.markForStand(draft.entry.item, draft.entry.slot, bankPack = draft.bankPack, price = submitted.price, quantity = submitted.quantity, markAll = submitted.markAll, id = existing?.id)) {
                    is ApiResult.Failure -> result.message
                    is ApiResult.Success -> { listing = null; viewModel.refreshDynamicStateNow(); null }
                }
            },
        )
    }
    fun itemLabel(item: Item): String {
        val entry = catalogFor(item.name)
        return (entry?.name ?: item.name) + if (entry != null && (entry.upgradeable || entry.compoundable)) " +${item.level ?: 0}" else ""
    }
    @Composable
    fun Check(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(4.dp)).clickable { onChange(!checked) }.padding(end = 8.dp),
        ) {
            Checkbox(checked = checked, onCheckedChange = onChange, modifier = Modifier.semantics { contentDescription = label })
            Text(label, style = MaterialTheme.typography.labelSmall)
        }
    }
    @Composable
    fun ItemButton(item: Item, title: String, detail: @Composable () -> Unit, modifier: Modifier = Modifier) {
        Row(modifier = modifier.clickable { inspecting = item }, verticalAlignment = Alignment.CenterVertically) {
            SpriteIcon(catalogFor(item.name)?.sprite, size = 40.dp)
            Column(modifier = Modifier.padding(start = 12.dp)) {
                Text(title, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                detail()
            }
        }
    }
    @Composable
    fun QuantityField(key: String, label: String, default: String = "1", width: Int = 72) {
        OutlinedTextField(
            value = quantities[key] ?: default,
            onValueChange = { quantities[key] = it.filter(Char::isDigit) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            textStyle = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
            modifier = Modifier.width(width.dp).semantics { contentDescription = label },
        )
    }

    AccountScreenScaffold("Market", onBack, onRefresh = { scope.launch { viewModel.refreshDynamicStateNow() } }) {
        Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Browse live offers and player-published classifieds. Public browsing requires no ALData key.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onOpenSettings) { Text("Marketplace settings") }
                OutlinedButton(onClick = onOpenWtb) { Text("Manage WTB orders" + if (state.standBids.isNotEmpty()) " (${state.standBids.size})" else "") }
            }
            val marketError = aldata?.error ?: ponty?.error
            if (aldata?.auth != "CORRECT" || marketError != null || aldata?.merchantsUpdatedAt == null) {
                Column(modifier = Modifier.fillMaxWidth().border(1.dp, Color(0xFF475569), RoundedCornerShape(4.dp)).padding(12.dp)) {
                    if (marketError != null) Text("Market data unavailable: $marketError. Cached offers may be stale. Retry when ALData is available.", color = Amber, style = MaterialTheme.typography.bodySmall)
                    else if (aldata?.merchantsUpdatedAt == null) Text("Loading market data from ALData…", style = MaterialTheme.typography.bodySmall)
                    if (aldata?.auth != "CORRECT") {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(top = 4.dp)) {
                            Text("ALData publishing is not configured", color = Color(0xFFF87171), style = MaterialTheme.typography.bodySmall)
                            OutlinedButton(onClick = onOpenSetup) { Text("Go to setup") }
                        }
                    }
                }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for ((id, label) in listOf(
                    "wts" to "Live WTS (${allAlData.size})",
                    "wtb" to "Live WTB (${allBuyOrders.size})",
                    "classifieds" to "Classifieds (${publicTrades.size})",
                    "ponty" to "Ponty (${ponty?.listings?.size ?: 0})",
                )) FilterChip(selected = tab == id, onClick = { tab = id }, label = { Text(label) })
            }
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text("Search item, seller, server, or map…") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Search market" },
            )
            if (tab == "wts") {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Check("Show deals only", showDealsOnly) { showDealsOnly = it }
                    Check("Hide bad deals", hideBadDeals) { hideBadDeals = it }
                    Check("Hide unaffordable", hideUnaffordable) { hideUnaffordable = it }
                    Check("Hide blacklisted merchants", hideBlacklisted) { hideBlacklisted = it }
                }
            }
            if (tab == "wtb") Check("Hide unowned", hideUnowned) { hideUnowned = it }

            when (tab) {
                "wts" -> if (wts.isEmpty()) {
                    Text(
                        when {
                            showDealsOnly -> "No listings are currently below 50% of their suggested price."
                            hideBadDeals -> "No matching listings remain after hiding prices over 100% above suggested."
                            hideUnaffordable -> "No matching listings are affordable with ${gold(bankGold)} bank gold."
                            else -> "No matching live WTS listings."
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else for (entry in wts) {
                    val item = catalogFor(entry.item.name)
                    val key = entry.key
                    val stackable = ((item?.meta?.definition?.get("s") as? kotlinx.serialization.json.JsonPrimitive)?.content?.toDoubleOrNull() ?: 1.0) > 1
                    val multiple = entry.quantity > 1
                    val age = max(0L, (now - entry.seenAt) / 1000)
                    val fresh = age <= 120 && entry.serverIdentifier != "PVP"
                    val suggested = listingValue(entry)
                    val (deal, badDeal, comparison) = priceComparison(entry.price.toDouble(), suggested)
                    val quantity = (quantities[key] ?: "1").toIntOrNull() ?: 0
                    FlowRow(
                        modifier = Modifier.fillMaxWidth().alpha(if (fresh) 1f else 0.65f).border(1.dp, Color(0xFF083344), RoundedCornerShape(4.dp)).padding(8.dp)
                            .semantics { contentDescription = "WTS ${itemLabel(entry.item)} from ${entry.seller}" },
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        ItemButton(entry.item, itemLabel(entry.item), {
                            Text(
                                "${entry.seller} · ${entry.serverRegion} ${entry.serverIdentifier} · ${entry.map} · seen ${ageLabel(age)} ago" +
                                    if (multiple) " · ${entry.quantity} available" + if (stackable) "" else " · not stackable" else "",
                                fontFamily = FontFamily.Monospace,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }, Modifier.fillMaxWidth())
                        Text(
                            "${gold(entry.price)}g ${comparison.uppercase()}",
                            fontFamily = FontFamily.Monospace,
                            fontWeight = if (deal || badDeal) FontWeight.SemiBold else FontWeight.Normal,
                            color = if (deal) Emerald else if (badDeal) Rose else Amber,
                            style = MaterialTheme.typography.labelMedium,
                            modifier = Modifier.align(Alignment.CenterVertically).semantics { contentDescription = "Suggested price: ${gold(suggested.toLong())}g · $comparison" },
                        )
                        if (fresh) {
                            if (multiple) {
                                QuantityField(key, "Quantity of ${entry.item.name}")
                                OutlinedButton(enabled = busy != key, onClick = { quantities[key] = entry.quantity.toString() }) { Text("All") }
                            }
                            Button(enabled = busy != key, onClick = {
                                if (quantity < 1 || quantity > entry.quantity) return@Button
                                rowError = null
                                confirming = key
                            }) { Text(if (busy == key) "Queuing…" else "Buy") }
                        } else {
                            OutlinedButton(onClick = { wtbItem = Item(name = entry.item.name, level = entry.item.level ?: 0) }) { Text("Make WTB") }
                        }
                        if (confirming == key) {
                            Confirm(
                                "Confirm marketplace purchase",
                                "Really buy ${"%,d".format(quantity)} ${nameFor(entry.item.name) ?: entry.item.name} for ${gold(quantity * entry.price)}g?",
                                busy == key,
                                rowError?.takeIf { it.first == key }?.second,
                                onYes = { run(key) { buyGrouped(entry, quantity) } },
                                onCancel = { confirming = null },
                            )
                        }
                    }
                }

                "wtb" -> {
                    Text(
                        "${bankWtb.size} offer${if (bankWtb.size == 1) "" else "s"} match exact items currently held by ${merchantName ?: "the merchant"} or recorded in the bank.",
                        color = Emerald,
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.fillMaxWidth().border(1.dp, Color(0xFF064E3B), RoundedCornerShape(4.dp)).padding(8.dp),
                    )
                    if (buyOrders.isEmpty()) Text("No matching live WTB offers.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    for (order in buyOrders) {
                        val item = catalogFor(order.item.name)
                        val key = order.key
                        val have = owned[ownedKey(order.item)] ?: 0
                        val source = ownedSource(order.item, merchantItems, bankPacks)
                        val age = max(0L, (now - order.seenAt) / 1000)
                        val fresh = age <= 120 && order.serverIdentifier != "PVP"
                        val maximum = minOf(have, order.quantity)
                        val quantity = (quantities[key] ?: "1").toIntOrNull() ?: 0
                        val title = (item?.name ?: order.item.name) + if (item?.meta?.upgradeable == true || item?.meta?.compoundable == true) " +${order.item.level ?: 0}" else ""
                        FlowRow(
                            modifier = Modifier.fillMaxWidth().alpha(if (fresh) 1f else 0.6f).border(1.dp, if (have > 0) Color(0xFF064E3B) else Color(0xFF2E1065), RoundedCornerShape(4.dp)).padding(8.dp)
                                .semantics { contentDescription = "WTB ${itemLabel(order.item)} from ${order.buyer}" },
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            ItemButton(order.item, title, {
                                Text("${order.buyer} · ${order.serverRegion} ${order.serverIdentifier} · seen ${ageLabel(age)} ago · wants ${order.quantity}", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }, Modifier.fillMaxWidth())
                            Text("WTB ${gold(order.price)}g", color = Violet, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelMedium, modifier = Modifier.align(Alignment.CenterVertically))
                            Text("You have $have", color = if (have > 0) Emerald else MaterialTheme.colorScheme.onSurfaceVariant, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, modifier = Modifier.align(Alignment.CenterVertically))
                            if (fresh && maximum > 0) {
                                QuantityField(key, "Quantity of ${order.item.name} to sell")
                                OutlinedButton(onClick = { quantities[key] = maximum.toString() }) { Text("All") }
                                Button(enabled = busy != key, onClick = {
                                    if (quantity < 1 || quantity > maximum) return@Button
                                    rowError = null
                                    confirming = key
                                }) { Text("Sell") }
                            } else if (!fresh && source != null) {
                                OutlinedButton(onClick = { listFor(key, order.item, order.price, maximum) }) { Text("List") }
                            } else {
                                Text(if (!fresh) "STALE · NO MATCH OWNED" else "NO MATCH OWNED", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.align(Alignment.CenterVertically))
                            }
                            if (confirming == key) {
                                Confirm(
                                    "Confirm marketplace sale",
                                    "Really sell ${"%,d".format(quantity)} ${nameFor(order.item.name) ?: order.item.name} to ${order.buyer} for ${gold(quantity * order.price)}g?",
                                    busy == key,
                                    rowError?.takeIf { it.first == key }?.second,
                                    onYes = { run(key) { api.sellAlData(order.raw, quantity).message() } },
                                    onCancel = { confirming = null },
                                )
                            }
                            ListingForm(key)
                        }
                    }
                }

                "classifieds" -> if (classifieds.isEmpty()) {
                    Text("No published trade intentions from other owners. These classifieds are separate from live stand slots.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else classifieds.forEachIndexed { index, (owner, entry) ->
                    val item = catalogFor(entry.name)
                    val requested = Item(name = entry.name, level = entry.level, p = entry.p)
                    val source = ownedSource(requested, merchantItems, bankPacks)
                    val key = "${owner.owner}-${entry.name}-$index"
                    FlowRow(
                        modifier = Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(4.dp)).padding(8.dp).semantics { contentDescription = "Classified ${entry.name}" },
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        ItemButton(requested, (item?.name ?: entry.name) + if (entry.level != 0) " +${entry.level}" else "", {
                            Text("${owner.label ?: owner.characters.firstOrNull() ?: owner.owner} · ${entry.note ?: "Published intention"}", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }, Modifier.fillMaxWidth())
                        entry.wts?.price?.takeIf { it > 0 }?.let { Text("WTS ${gold(it)}g", color = Emerald, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelMedium, modifier = Modifier.align(Alignment.CenterVertically)) }
                        entry.wtb?.price?.takeIf { it > 0 }?.let { Text("WTB ${gold(it)}g", color = Violet, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelMedium, modifier = Modifier.align(Alignment.CenterVertically)) }
                        if ((entry.wts?.price ?: 0) > 0) OutlinedButton(onClick = { wtbItem = Item(name = entry.name, level = entry.level) }) { Text("Add to WTB") }
                        val wtbPrice = entry.wtb?.price ?: 0
                        if (wtbPrice > 0 && source != null) {
                            OutlinedButton(enabled = state.standListings.size < 16, onClick = { listFor(key, requested, wtbPrice, entry.wtb?.quantity ?: 1) }) { Text("Add to stand") }
                        }
                        ListingForm(key)
                    }
                }

                "ponty" -> {
                    ponty?.error?.let { Text("Last refresh failed: $it", style = MaterialTheme.typography.bodySmall, modifier = Modifier.fillMaxWidth().border(1.dp, Color(0xFF701A75), RoundedCornerShape(4.dp)).padding(8.dp)) }
                    if (pontyRows.isEmpty()) Text("Ponty currently has no matching items.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    for (group in pontyRows) PontyRow(group, viewModel, catalogFor, now, quantities, busy, confirming, rowError, merchantName,
                        onInspect = { inspecting = it },
                        onConfirm = { rowError = null; confirming = group.key },
                        onCancel = { confirming = null },
                        onBuy = { requested -> run(group.key) { api.buyPonty(group.keys, requested, group.unitPrice).message() } },
                    )
                }
            }
        }
    }

    inspecting?.let { item ->
        ModalBottomSheet(onDismissRequest = { inspecting = null }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
            Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp)) {
                ItemDetailBrowser(rootItemId = item.name, rootLevel = item.level ?: 0, rootStatType = item.statType, catalog = state.merchantCatalog, monsters = state.bestiaryCatalog, viewModel = viewModel)
            }
        }
    }
    wtbItem?.let { item ->
        WtbDialog(viewModel, item, catalogFor(item.name)?.meta, catalogFor, state.merchantCatalog?.buyable.orEmpty(), state.standPriceHistory[item.name], state.standBids[item.name], onClose = { wtbItem = null })
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PontyRow(
    group: PontyGroup,
    viewModel: PartyViewModel,
    catalogFor: (String) -> com.partyconsole.companion.model.CatalogItem?,
    now: Long,
    quantities: MutableMap<String, String>,
    busy: String?,
    confirming: String?,
    rowError: Pair<String, String>?,
    merchantName: String?,
    onInspect: (Item) -> Unit,
    onConfirm: () -> Unit,
    onCancel: () -> Unit,
    onBuy: (Int) -> Unit,
) {
    val state by viewModel.dynamicState.collectAsState()
    val item = catalogFor(group.item.name)
    val level = group.item.level ?: 0
    val requested = (quantities[group.key] ?: group.minimumLot.toString()).toIntOrNull() ?: 0
    val realmLabel = if (group.realms.size > 1) "Mixed realms" else group.realms.firstOrNull().orEmpty()
    val bid = state.standBids[group.item.name]
    val satisfiesBid = bid != null && group.unitPrice <= bid.price &&
        (if (bid.acceptHigherLevels == false) level == (bid.minimumQuality ?: 0) else level >= (bid.minimumQuality ?: 0))
    val name = item?.name ?: group.item.name
    FlowRow(
        modifier = Modifier.fillMaxWidth().border(1.dp, Color(0xFF701A75), RoundedCornerShape(4.dp)).padding(8.dp).semantics { contentDescription = "Ponty $name" },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(modifier = Modifier.fillMaxWidth().clickable { onInspect(group.item) }, verticalAlignment = Alignment.CenterVertically) {
            SpriteIcon(item?.sprite, size = 40.dp)
            Column(modifier = Modifier.padding(start = 12.dp)) {
                Text(name + if (item != null && (item.upgradeable || item.compoundable)) " +$level" else "", style = MaterialTheme.typography.bodySmall, maxLines = 1)
                Text("$realmLabel · ${group.quantity} available · ${gold(group.unitPrice)}g each", color = Fuchsia, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall)
                Text(
                    "Observed " + (group.seenAt?.takeIf { it > 0 }?.let { "${max(0L, (now - it) / 1000)}s ago" } ?: "at an unknown time") + if (group.stale) " · stale" else " · fresh",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        if (satisfiesBid) Text("MATCHES WTB", color = Violet, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, modifier = Modifier.align(Alignment.CenterVertically).border(1.dp, Color(0xFF7C3AED), RoundedCornerShape(4.dp)).padding(horizontal = 6.dp, vertical = 2.dp))
        OutlinedTextField(
            value = quantities[group.key] ?: group.minimumLot.toString(),
            onValueChange = { quantities[group.key] = it.filter(Char::isDigit) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.width(96.dp).semantics { contentDescription = "Ponty quantity for $name" },
        )
        Text("Up to ${gold(group.unitPrice * requested)}g", color = Fuchsia, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, modifier = Modifier.align(Alignment.CenterVertically))
        Button(
            enabled = busy != group.key && !group.stale && requested in 1..group.quantity,
            onClick = onConfirm,
            contentPadding = PaddingValues(horizontal = 16.dp),
        ) { Text(if (busy == group.key) "Queuing…" else "Buy") }
        if (confirming == group.key) {
            Confirm(
                "Confirm Ponty purchase",
                "Buy ${"%,d".format(requested)} $name for up to ${gold(requested * group.unitPrice)}g? $realmLabel. One purchase job will be queued per realm. ${merchantName ?: "The merchant"} will travel as needed and verify each listing. Any matching WTB quantity will be decremented.",
                busy == group.key,
                rowError?.takeIf { it.first == group.key }?.second,
                onYes = { onBuy(requested) },
                onCancel = onCancel,
            )
        }
    }
}
