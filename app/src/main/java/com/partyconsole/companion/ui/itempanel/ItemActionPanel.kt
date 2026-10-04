package com.partyconsole.companion.ui.itempanel

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SheetState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.ItemMeta
import com.partyconsole.companion.model.MerchantBuyItem
import com.partyconsole.companion.model.RosterMember
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.components.NpcSaleSheet
import com.partyconsole.companion.ui.itemdetail.ItemDetailBrowser
import com.partyconsole.companion.ui.itemdetail.STAT_SCROLLS
import com.partyconsole.companion.ui.itemdetail.compoundPassCost
import com.partyconsole.companion.ui.itemdetail.isEquipment
import com.partyconsole.companion.ui.itemdetail.itemMaximumLevel
import com.partyconsole.companion.ui.itemdetail.primaryStatScrollCost
import com.partyconsole.companion.ui.itemdetail.statScrollQuantity
import com.partyconsole.companion.ui.itemdetail.upgradeScrollCost
import com.partyconsole.companion.ui.itemicon.rememberCatalogLookup
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull

/** The bottom-docked item panel replacing left-click-details/right-click-
 *  menu (see the mobile-redesign plan): item details are the first thing
 *  shown, mutating actions follow as a single tap-only list below them -
 *  one panel, one interaction model, instead of two desktop-only ones. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ItemActionPanel(
    target: ItemActionTarget,
    characterName: String,
    isMerchant: Boolean,
    roster: Map<String, RosterMember>,
    viewModel: PartyViewModel,
    sheetState: SheetState,
    onDismiss: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val dynamicState by viewModel.dynamicState.collectAsState()
    val characters by viewModel.characters.collectAsState()
    var error by remember(target) { mutableStateOf<String?>(null) }
    var expanded by remember(target) { mutableStateOf<String?>(null) } // which inline form is open, if any
    var comparing by remember(target) { mutableStateOf(false) }

    fun run(action: suspend () -> ApiResult<*>) {
        scope.launch {
            when (val result = action()) {
                is ApiResult.Failure -> error = result.message
                is ApiResult.Success -> {
                    viewModel.refreshDynamicStateNow()
                    onDismiss()
                }
            }
        }
    }

    val catalogFor = rememberCatalogLookup(dynamicState.merchantCatalog)
    val meta = catalogFor(target.item.name)?.meta

    // stat-scroll-mark needs to know which secondary-stat scrolls are
    // actually held (use-party-console.tsx's statScrollInventory) - summed
    // across the merchant character's own inventory plus the shared bank,
    // since that's who/where a stat-scroll-mark command actually draws from.
    val statScrollInventory = remember(characters, dynamicState.bank, dynamicState.merchantCharacter) {
        val quantities = mutableMapOf<String, Int>()
        fun add(entryItem: Item?) {
            if (entryItem != null && STAT_SCROLLS.any { it.scroll == entryItem.name }) {
                quantities[entryItem.name] = (quantities[entryItem.name] ?: 0) + maxOf(1, entryItem.q ?: 1)
            }
        }
        val merchant = dynamicState.merchantCharacter?.let { characters[it] }
        merchant?.inventory?.items?.forEach { add(it?.item) }
        dynamicState.bank?.packs?.values?.forEach { pack -> pack.forEach { add(it?.item) } }
        quantities
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).verticalScroll(rememberScrollState()),
        ) {
            InstanceInfoRow(target, characterName)
            ItemDetailBrowser(
                rootItemId = target.item.name,
                rootLevel = target.item.level ?: 0,
                rootStatType = target.item.statType,
                rootGift = target.item.gift == true,
                rootExpires = target.item.expires,
                catalog = dynamicState.merchantCatalog,
                monsters = dynamicState.bestiaryCatalog,
            )
            error?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

            val onCompare: (() -> Unit)? = if (isEquipment(meta?.definition)) fun() { comparing = true } else null
            when (target) {
                is ItemActionTarget.InventorySlot -> InventoryActions(
                    target, meta, characterName, isMerchant, roster,
                    buyable = dynamicState.merchantCatalog?.buyable ?: emptyList(),
                    statScrollInventory = statScrollInventory,
                    expanded = expanded, onExpand = { expanded = it }, run = ::run, viewModel = viewModel,
                    onCompare = onCompare,
                )
                is ItemActionTarget.EquipmentSlot -> EquipmentActions(
                    target, meta, characterName, isMerchant, expanded,
                    onExpand = { expanded = it }, run = ::run, viewModel = viewModel,
                )
            }
        }
    }

    if (comparing) {
        GearComparisonSheet(
            item = target.item,
            meta = meta,
            characterCtype = roster[characterName]?.ctype ?: "",
            equippedSlots = characters[characterName]?.inventory?.slots ?: emptyMap(),
            catalogFor = catalogFor,
            onClose = { comparing = false },
        )
    }
}

/** The live-instance facts that don't belong in ItemDetailBrowser (a pure
 *  catalog-data view reused for read-only browsing too): which slot this
 *  exact item occupies, its stack quantity, and its shiny "p" variant. */
@Composable
private fun InstanceInfoRow(target: ItemActionTarget, characterName: String) {
    val item = target.item
    Column(modifier = Modifier.padding(top = 8.dp, bottom = 4.dp)) {
        val slotLabel = when (target) {
            is ItemActionTarget.InventorySlot -> "slot ${target.slot}"
            is ItemActionTarget.EquipmentSlot -> target.slotName
        }
        Text(
            "$characterName · $slotLabel",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            item.statType?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
            item.q?.let { if (it > 1) Text("x$it", style = MaterialTheme.typography.bodyMedium) }
            item.p?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.tertiary) }
        }
    }
}

@Composable
internal fun TapRow(label: String, enabled: Boolean = true, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
    ) {
        TextButton(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
            Text(label, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun InventoryActions(
    target: ItemActionTarget.InventorySlot,
    meta: ItemMeta?,
    characterName: String,
    isMerchant: Boolean,
    roster: Map<String, RosterMember>,
    buyable: List<MerchantBuyItem>,
    statScrollInventory: Map<String, Int>,
    expanded: String?,
    onExpand: (String?) -> Unit,
    run: (suspend () -> ApiResult<*>) -> Unit,
    viewModel: PartyViewModel,
    onCompare: (() -> Unit)? = null,
) {
    val dynamicState by viewModel.dynamicState.collectAsState()
    val loaded by viewModel.stateLoaded.collectAsState()
    val item = target.item
    val slot = target.slot
    val level = item.level ?: 0
    // inventory-panel.tsx only offers upgrade/compound actions when the
    // account has a configured merchant (upgrading always routes through
    // them), independent of which character's item this is.
    val hasMerchant = dynamicState.merchantCharacter != null
    val canUpgrade = hasMerchant && meta?.upgradeable == true && itemMaximumLevel(meta) > level
    val canCompound = hasMerchant && meta?.compoundable == true
    // automatic-item-actions.tsx: the server's validTier caps auto-compound at +7.
    val canAutoCompound = canCompound && level < minOf(7, itemMaximumLevel(meta))
    val canStatScroll = isMerchant && (meta?.definition?.get("stat") != null)
    // "Buy another level 0" (upgrade-actions.tsx) only for non-merchant holders - the merchant buys
    // directly via the commerce screen instead.
    val canBuyAnother = !isMerchant && meta?.buyable == true
    // exchangeable/autoExchangeMarked (inventory-panel.tsx) - NPC exchange only runs off the merchant's own inventory.
    val exchangeable = isMerchant && ((meta?.definition?.get("e") as? JsonPrimitive)?.doubleOrNull ?: 0.0) > 0
    val autoExchangeMarked = isMerchant && dynamicState.autoExchanges.containsKey("${item.name}@$level")
    val canEquipOnDelivery = isMerchant && isEquipment(meta?.definition)
    Column {
        TapRow("Equip") { run { viewModel.api.itemCommand("equip", characterName, item) } }
        onCompare?.let { compare -> TapRow("Compare with equipped") { compare() } }
        TapRow("Use item") { run { viewModel.api.itemCommand("use-item", characterName, item, JsonPrimitive(slot)) } }
        TapRow("Mark for Bank") { run { viewModel.api.itemCommand("mark", characterName, item, JsonPrimitive(slot)) } }
        TapRow("Auto-mark for Bank") {
            run { viewModel.api.itemCommand("auto-item-mark", characterName, item, extra = mapOf("mode" to JsonPrimitive("bank"))) }
        }
        TapRow("Mark for Merchant") {
            run { viewModel.api.itemCommand("merchant-mark", characterName, item, JsonPrimitive(slot)) }
        }
        TapRow("Auto-mark for Merchant") {
            run { viewModel.api.itemCommand("auto-item-mark", characterName, item, extra = mapOf("mode" to JsonPrimitive("merchant"))) }
        }
        if (isMerchant) {
            TapRow("Mark for Stand") { onExpand(if (expanded == "stand") null else "stand") }
            if (expanded == "stand") {
                val existing = dynamicState.standListings.find { it.bankPack == null && it.slot == slot && com.partyconsole.companion.model.sameMarkedItem(it.item, item) }
                StandForm(item, slot, meta, existing, viewModel, run)
            }
            TapRow("Auto-stand this item") { onExpand(if (expanded == "autostand") null else "autostand") }
            if (expanded == "autostand") {
                val existingRule = dynamicState.autoStandMarks.values.find { it.item.name == item.name && (it.item.level ?: 0) == level }
                AutoStandForm(characterName, item, meta, existingRule?.price, viewModel, run)
            }
        }
        TapRow("Mark for NPC Sale") { onExpand(if (expanded == "npc") null else "npc") }
        if (expanded == "npc") {
            NpcSaleSheet(
                item = item,
                meta = meta,
                location = if (isMerchant) "From the merchant's inventory" else "From $characterName's inventory",
                available = maxOf(1, item.q ?: 1),
                onConfirm = { quantity, acknowledged ->
                    when (val result = viewModel.api.markForNpcSale(characterName, item, slot, isMerchant, quantity, acknowledged)) {
                        is ApiResult.Failure -> result.message.ifBlank { "NPC sale failed" }
                        is ApiResult.Success -> {
                            viewModel.refreshDynamicStateNow()
                            onExpand(null)
                            null
                        }
                    }
                },
                onCancel = { onExpand(null) },
            )
        }
        TapRow("Auto-sell to NPC") {
            // connected-inventory.tsx: the configured merchant's rule is the
            // account-wide one, so `character` is left out for it.
            run { viewModel.api.autoNpcSale(if (isMerchant) null else characterName, item) }
        }
        TapRow("Mark for Deconstruction") {
            run { viewModel.api.markForDeconstruction(characterName, item, slot) }
        }
        TapRow("Auto-deconstruct") {
            run { viewModel.api.autoDeconstruct(characterName, item) }
        }
        if (canUpgrade) {
            TapRow("Mark for Upgrade") { onExpand(if (expanded == "upgrade") null else "upgrade") }
            if (expanded == "upgrade") {
                UpgradeTierPicker(meta, level) { tiers ->
                    run { viewModel.api.itemCommand("upgrade-mark", characterName, item, JsonPrimitive(slot), mapOf("tiers" to JsonPrimitive(tiers))) }
                }
            }
            TapRow("Auto-mark for Upgrade") { onExpand(if (expanded == "autoupgrade") null else "autoupgrade") }
            if (expanded == "autoupgrade") {
                UpgradeTierPicker(meta, level) { tiers ->
                    run { viewModel.api.itemCommand("auto-upgrade-mark", characterName, item, JsonPrimitive(slot), mapOf("tiers" to JsonPrimitive(tiers))) }
                }
            }
        }
        if (canCompound) {
            TapRow("Mark for Compound") {
                run { viewModel.api.itemCommand("compound-mark", characterName, item, JsonPrimitive(slot)) }
            }
            if (canAutoCompound) TapRow("Auto-mark for Compound") { onExpand(if (expanded == "autocompound") null else "autocompound") }
            if (canAutoCompound && expanded == "autocompound") {
                CompoundTierPicker(meta, level, buyable) { targetTier ->
                    run { viewModel.api.itemCommand("auto-compound-mark", characterName, item, null, mapOf("targetTier" to JsonPrimitive(targetTier))) }
                }
            }
        }
        if (canStatScroll) {
            val label = item.statType?.let { "Change stat scroll · ${it.uppercase()}" } ?: "Add stat scroll"
            TapRow(label) { onExpand(if (expanded == "statscroll") null else "statscroll") }
            if (expanded == "statscroll") {
                StatScrollPicker(meta, item, statScrollInventory) { statType ->
                    run {
                        viewModel.api.itemCommand(
                            "stat-scroll-mark", characterName, item, JsonPrimitive(slot),
                            mapOf("statType" to JsonPrimitive(statType)),
                        )
                    }
                }
            }
        }
        if (canBuyAnother) {
            TapRow("Buy another level 0") { run { viewModel.api.itemCommand("buy-copy", characterName, item) } }
        }
        if (exchangeable) {
            // The server toggles auto-exchange, so an already-marked item (or
            // one whose marks haven't loaded) must never send it again.
            TapRow(if (autoExchangeMarked) "Auto exchange · already marked" else "Auto exchange") {
                if (loaded && !autoExchangeMarked) {
                    run { viewModel.api.itemCommand("auto-exchange", characterName, item, JsonPrimitive(slot)) }
                }
            }
        }
        val others = roster.keys.filter { it != characterName }
        if (others.isNotEmpty()) {
            TapRow("Give to...") { onExpand(if (expanded == "give") null else "give") }
            if (expanded == "give") {
                for (other in others) {
                    if (canEquipOnDelivery) {
                        Text(
                            "→ $other",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(start = 16.dp, top = 4.dp),
                        )
                        TapRow("  Don't equip") {
                            run {
                                viewModel.api.itemCommand(
                                    "give", characterName, item, JsonPrimitive(slot),
                                    mapOf("target" to JsonPrimitive(other), "equipOnDelivery" to JsonPrimitive(false)),
                                )
                            }
                        }
                        TapRow("  Equip") {
                            run {
                                viewModel.api.itemCommand(
                                    "give", characterName, item, JsonPrimitive(slot),
                                    mapOf("target" to JsonPrimitive(other), "equipOnDelivery" to JsonPrimitive(true)),
                                )
                            }
                        }
                    } else {
                        TapRow("  → $other") {
                            run {
                                viewModel.api.itemCommand(
                                    "give", characterName, item, JsonPrimitive(slot),
                                    mapOf("target" to JsonPrimitive(other)),
                                )
                            }
                        }
                    }
                }
            }
        }
        TapRow("Clear marks") {
            run { viewModel.api.itemCommand("clear-item-marks", characterName, item, JsonPrimitive(slot)) }
        }
    }
}

@Composable
private fun EquipmentActions(
    target: ItemActionTarget.EquipmentSlot,
    meta: ItemMeta?,
    characterName: String,
    isMerchant: Boolean,
    expanded: String?,
    onExpand: (String?) -> Unit,
    run: (suspend () -> ApiResult<*>) -> Unit,
    viewModel: PartyViewModel,
) {
    val item = target.item
    val level = item.level ?: 0
    val canUpgrade = meta?.upgradeable == true && itemMaximumLevel(meta) > level
    // Equipped-item commands need the real equip-slot name (e.g. "chest")
    // as `slot`, with `equipped: true` as an ADDITIONAL flag - the server's
    // markRequest() validator (runtime/coordinator/inventory/upgrade-
    // commands.ts) requires a string slot matching /^[a-z0-9_]+$/ whenever
    // equipped is true; a missing/null slot fails validation with a plain
    // "invalid command" 400, confirmed against the live server this
    // session (every equipped-item upgrade/clear-marks call was silently
    // failing before this fix).
    val slotArg = JsonPrimitive(target.slotName)
    Column {
        // equipment.tsx: trade1..N are the merchant's stand slots, not gear.
        if (target.slotName != "elixir" && !target.slotName.startsWith("trade")) {
            TapRow("Unequip") {
                run { viewModel.api.itemCommand("unequip", characterName, item, slotArg) }
            }
        }
        if (canUpgrade) {
            TapRow("Mark for Upgrade") { onExpand(if (expanded == "upgrade") null else "upgrade") }
            if (expanded == "upgrade") {
                UpgradeTierPicker(meta, level) { tiers ->
                    run {
                        viewModel.api.itemCommand(
                            "upgrade-mark", characterName, item, slotArg,
                            mapOf("equipped" to JsonPrimitive(true), "tiers" to JsonPrimitive(tiers)),
                        )
                    }
                }
            }
            TapRow("Auto-mark for Upgrade") { onExpand(if (expanded == "autoupgrade") null else "autoupgrade") }
            if (expanded == "autoupgrade") {
                UpgradeTierPicker(meta, level) { tiers ->
                    run {
                        viewModel.api.itemCommand(
                            "auto-upgrade-mark", characterName, item, slotArg,
                            mapOf("equipped" to JsonPrimitive(true), "tiers" to JsonPrimitive(tiers)),
                        )
                    }
                }
            }
        }
        if (isMerchant) {
            TapRow("Buy copy") { run { viewModel.api.itemCommand("buy-copy", characterName, item) } }
        }
        TapRow("Clear marks") {
            run { viewModel.api.itemCommand("clear-item-marks", characterName, item, slotArg, mapOf("equipped" to JsonPrimitive(true))) }
        }
    }
}

/** upgrade-actions.tsx's tier submenu ported as an inline expandable list
 *  (this panel's tap-only pattern has no context-menu submenu equivalent)
 *  - one row per achievable target tier, "+N → +N+tiers" with the scroll
 *  gold cost, instead of silently always marking a single tier. */
@Composable
internal fun UpgradeTierPicker(meta: ItemMeta?, level: Int, onPick: (Int) -> Unit) {
    val max = maxOf(0, itemMaximumLevel(meta) - level)
    if (max <= 0) return
    Column(modifier = Modifier.padding(start = 16.dp)) {
        for (tiers in 1..max) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                TextButton(onClick = { onPick(tiers) }, modifier = Modifier.weight(1f)) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("+$level → +${level + tiers}")
                        Text(
                            "${"%,d".format(upgradeScrollCost(meta, level, tiers))}g",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

/** The compound equivalent of UpgradeTierPicker - inventory-panel.tsx's
 *  "Auto compound" submenu, one row per tier up to itemMaximumLevel (7 for
 *  compoundables) with the real compound-scroll cost (compoundPassCost),
 *  not a free-form number input the way this used to work. */
@Composable
private fun CompoundTierPicker(meta: ItemMeta?, level: Int, buyable: List<MerchantBuyItem>, onPick: (Int) -> Unit) {
    val max = maxOf(0, minOf(7, itemMaximumLevel(meta)) - level)
    if (max <= 0) return
    val grades = meta?.definition?.get("grades")?.let { element ->
        (element as? JsonArray)?.mapNotNull {
            (it as? JsonPrimitive)?.content?.toDoubleOrNull()?.toInt()
        }
    }
    Column(modifier = Modifier.padding(start = 16.dp)) {
        for (tier in (level + 1)..(level + max)) {
            val cost = compoundPassCost(grades, tier, buyable)
            TextButton(onClick = { onPick(tier) }, modifier = Modifier.fillMaxWidth()) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("+$tier")
                    Text(
                        cost?.let { "${"%,d".format(it.gold)}g" } ?: "Price unavailable",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

/** stat-scroll-mark's option list, ported with the same purchasable-vs-
 *  owned split as inventory-panel.tsx: str/int/dex/vit are always shown
 *  (bought outright for gold), every other stat only shows up once you
 *  already own enough of its scroll - not as an always-visible chip with
 *  no indication of cost or whether you can actually do it. */
@Composable
private fun StatScrollPicker(meta: ItemMeta?, item: Item, statScrollInventory: Map<String, Int>, onPick: (String) -> Unit) {
    val level = item.level ?: 0
    val required = statScrollQuantity(meta, level)
    val cost = primaryStatScrollCost(meta, level)
    val choices = STAT_SCROLLS.filter { it.purchasable || (statScrollInventory[it.scroll] ?: 0) >= required }
    Column(modifier = Modifier.padding(start = 16.dp)) {
        for (choice in choices) {
            val owned = statScrollInventory[choice.scroll] ?: 0
            val current = item.statType == choice.stat
            TextButton(onClick = { if (!current) onPick(choice.stat) }, enabled = !current, modifier = Modifier.fillMaxWidth()) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(choice.label + if (current) " · current" else "")
                    Text(
                        if (choice.purchasable) "${"%,d".format(cost)}g · $required scroll${if (required == 1) "" else "s"}" else "$owned/$required owned",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

/** connected-inventory.tsx's default stand price: the existing price, else
 *  the item's catalog value (never below 1 - the server rejects 0). */
private fun defaultStandPrice(existing: Long?, meta: ItemMeta?): String {
    if (existing != null && existing > 0) return existing.toString()
    val value = (meta?.definition?.get("g") as? JsonPrimitive)?.doubleOrNull?.toLong() ?: 0L
    return maxOf(1L, value).toString()
}

@Composable
private fun AutoStandForm(
    characterName: String,
    item: com.partyconsole.companion.model.Item,
    meta: ItemMeta?,
    existingPrice: Long?,
    viewModel: PartyViewModel,
    run: (suspend () -> ApiResult<*>) -> Unit,
) {
    var price by remember { mutableStateOf(defaultStandPrice(existingPrice, meta)) }
    var error by remember { mutableStateOf<String?>(null) }
    Column(modifier = Modifier.fillMaxWidth().padding(start = 16.dp, bottom = 8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = price,
                onValueChange = { new -> if (new.all { it.isDigit() }) price = new },
                label = { Text("Price") },
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
            Button(onClick = {
                val value = price.toLongOrNull()
                if (value == null || value < 1) {
                    error = "Enter a price of at least 1 gold."
                    return@Button
                }
                run { viewModel.api.autoStand(item, value) }
            }) { Text("Set") }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    }
}

/** connected-inventory.tsx's stand listing: price defaults to the existing
 *  listing or the catalog value, quantity to the existing listing or the
 *  whole stack (the server overwrites an existing listing's quantity). */
@Composable
private fun StandForm(
    item: com.partyconsole.companion.model.Item,
    slot: Int,
    meta: ItemMeta?,
    existing: com.partyconsole.companion.model.StandListing?,
    viewModel: PartyViewModel,
    run: (suspend () -> ApiResult<*>) -> Unit,
) {
    val stack = maxOf(1, item.q ?: 1)
    var price by remember { mutableStateOf(defaultStandPrice(existing?.price, meta)) }
    var quantity by remember { mutableStateOf((existing?.quantity?.takeIf { it > 0 } ?: stack).toString()) }
    var error by remember { mutableStateOf<String?>(null) }
    Column(modifier = Modifier.fillMaxWidth().padding(start = 16.dp, bottom = 8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = price,
                onValueChange = { new -> if (new.all { it.isDigit() }) price = new },
                label = { Text("Price") },
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
            if (stack > 1) {
                OutlinedTextField(
                    value = quantity,
                    onValueChange = { new -> if (new.all { it.isDigit() }) quantity = new },
                    label = { Text("Quantity") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
            }
            Button(onClick = {
                val value = price.toLongOrNull()
                val count = if (stack > 1) quantity.toIntOrNull() else 1
                when {
                    value == null || value < 1 -> error = "Enter a price of at least 1 gold."
                    count == null || count < 1 || count > stack -> error = "Enter a quantity from 1 to $stack."
                    else -> run { viewModel.api.markForStand(item, slot, price = value, quantity = count, id = existing?.id) }
                }
            }) {
                Text("List")
            }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    }
}
