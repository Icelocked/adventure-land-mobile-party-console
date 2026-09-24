package com.partyconsole.companion.ui.itempanel

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
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
import com.partyconsole.companion.model.RosterMember
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.itemdetail.ItemDetailBrowser
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive

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
    var error by remember(target) { mutableStateOf<String?>(null) }
    var expanded by remember(target) { mutableStateOf<String?>(null) } // which inline form is open, if any

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

            when (target) {
                is ItemActionTarget.InventorySlot -> InventoryActions(
                    target, characterName, isMerchant, roster, expanded,
                    onExpand = { expanded = it }, run = ::run, viewModel = viewModel,
                )
                is ItemActionTarget.EquipmentSlot -> EquipmentActions(
                    target, characterName, isMerchant, expanded,
                    onExpand = { expanded = it }, run = ::run, viewModel = viewModel,
                )
            }
        }
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
private fun TapRow(label: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
    ) {
        TextButton(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
            Text(label, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun InventoryActions(
    target: ItemActionTarget.InventorySlot,
    characterName: String,
    isMerchant: Boolean,
    roster: Map<String, RosterMember>,
    expanded: String?,
    onExpand: (String?) -> Unit,
    run: (suspend () -> ApiResult<*>) -> Unit,
    viewModel: PartyViewModel,
) {
    val item = target.item
    val slot = target.slot
    Column {
        TapRow("Equip") { run { viewModel.api.itemCommand("equip", characterName, item) } }
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
                StandForm(item, slot, viewModel, run)
            }
            TapRow("Auto-stand this item") { onExpand(if (expanded == "autostand") null else "autostand") }
            if (expanded == "autostand") {
                AutoStandForm(characterName, item, viewModel, run)
            }
        }
        TapRow("Mark for NPC Sale") {
            run { viewModel.api.markForNpcSale(characterName, item, slot) }
        }
        TapRow("Auto-sell to NPC") {
            run { viewModel.api.autoNpcSale(characterName, item) }
        }
        TapRow("Mark for Deconstruction") {
            run { viewModel.api.markForDeconstruction(characterName, item, slot) }
        }
        TapRow("Auto-deconstruct") {
            run { viewModel.api.autoDeconstruct(characterName, item) }
        }
        TapRow("Mark for Upgrade") {
            run { viewModel.api.itemCommand("upgrade-mark", characterName, item, JsonPrimitive(slot), mapOf("tiers" to JsonPrimitive(1))) }
        }
        TapRow("Auto-mark for Upgrade") {
            run { viewModel.api.itemCommand("auto-upgrade-mark", characterName, item, JsonPrimitive(slot), mapOf("tiers" to JsonPrimitive(1))) }
        }
        TapRow("Mark for Compound") {
            run { viewModel.api.itemCommand("compound-mark", characterName, item, JsonPrimitive(slot)) }
        }
        TapRow("Auto-mark for Compound") { onExpand(if (expanded == "autocompound") null else "autocompound") }
        if (expanded == "autocompound") {
            AutoCompoundForm(characterName, item, viewModel, run)
        }
        TapRow("Stat scroll mark") { onExpand(if (expanded == "statscroll") null else "statscroll") }
        if (expanded == "statscroll") {
            StatScrollForm(characterName, item, slot, viewModel, run)
        }
        val others = roster.keys.filter { it != characterName }
        if (others.isNotEmpty()) {
            TapRow("Give to...") { onExpand(if (expanded == "give") null else "give") }
            if (expanded == "give") {
                for (other in others) {
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
        TapRow("Clear marks") {
            run { viewModel.api.itemCommand("clear-item-marks", characterName, item, JsonPrimitive(slot)) }
        }
    }
}

@Composable
private fun EquipmentActions(
    target: ItemActionTarget.EquipmentSlot,
    characterName: String,
    isMerchant: Boolean,
    expanded: String?,
    onExpand: (String?) -> Unit,
    run: (suspend () -> ApiResult<*>) -> Unit,
    viewModel: PartyViewModel,
) {
    val item = target.item
    Column {
        TapRow("Unequip") {
            run {
                viewModel.api.itemCommand(
                    "unequip", characterName, item, JsonPrimitive(target.slotName),
                )
            }
        }
        TapRow("Mark for Upgrade") {
            run {
                viewModel.api.itemCommand(
                    "upgrade-mark", characterName, item, null,
                    mapOf("equipped" to JsonPrimitive(true), "tiers" to JsonPrimitive(1)),
                )
            }
        }
        TapRow("Auto-mark for Upgrade") {
            run {
                viewModel.api.itemCommand(
                    "auto-upgrade-mark", characterName, item, null,
                    mapOf("equipped" to JsonPrimitive(true), "tiers" to JsonPrimitive(1)),
                )
            }
        }
        if (isMerchant) {
            TapRow("Buy copy") { run { viewModel.api.itemCommand("buy-copy", characterName, item) } }
        }
        TapRow("Clear marks") {
            run { viewModel.api.itemCommand("clear-item-marks", characterName, item, null, mapOf("equipped" to JsonPrimitive(true))) }
        }
    }
}

/** All 22 server-accepted stat_type values (runtime/coordinator/inventory/
 *  stat-scroll-commands.ts's `supported` set) - str/int/dex/vit need no
 *  scroll-quantity check, the rest require owning the matching scroll
 *  item. Primary four shown first since they're the common case. */
private val PRIMARY_STAT_TYPES = listOf("str", "int", "dex", "vit")
private val OTHER_STAT_TYPES = listOf(
    "for", "evasion", "reflection", "gold", "luck", "xp", "armor", "resistance",
    "speed", "lifesteal", "manasteal", "rpiercing", "apiercing", "crit", "dreturn",
    "frequency", "mp_cost", "output",
)

@Composable
private fun StatScrollForm(
    characterName: String,
    item: com.partyconsole.companion.model.Item,
    slot: Int,
    viewModel: PartyViewModel,
    run: (suspend () -> ApiResult<*>) -> Unit,
) {
    var showMore by remember { mutableStateOf(false) }
    fun mark(stat: String) {
        run {
            viewModel.api.itemCommand(
                "stat-scroll-mark", characterName, item, JsonPrimitive(slot),
                mapOf("statType" to JsonPrimitive(stat)),
            )
        }
    }
    Column(modifier = Modifier.padding(start = 16.dp, bottom = 8.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            for (stat in PRIMARY_STAT_TYPES) {
                FilterChip(selected = false, onClick = { mark(stat) }, label = { Text(stat) })
            }
            TextButton(onClick = { showMore = !showMore }) { Text(if (showMore) "less" else "more") }
        }
        if (showMore) {
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(top = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                for (stat in OTHER_STAT_TYPES) {
                    FilterChip(selected = false, onClick = { mark(stat) }, label = { Text(stat) })
                }
            }
        }
    }
}

/** auto-compound-mark needs targetTier (1-7, the tier to compound UP TO)
 *  and quantity (how many finished copies to maintain) rather than a
 *  slot - it's a standing rule for the item type, not one instance. */
@Composable
private fun AutoCompoundForm(
    characterName: String,
    item: com.partyconsole.companion.model.Item,
    viewModel: PartyViewModel,
    run: (suspend () -> ApiResult<*>) -> Unit,
) {
    var targetTier by remember { mutableStateOf("1") }
    var quantity by remember { mutableStateOf("1") }
    Row(
        modifier = Modifier.fillMaxWidth().padding(start = 16.dp, bottom = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedTextField(
            value = targetTier,
            onValueChange = { new -> if (new.all { it.isDigit() }) targetTier = new },
            label = { Text("Target tier (1-7)") },
            singleLine = true,
            modifier = Modifier.weight(1f),
        )
        OutlinedTextField(
            value = quantity,
            onValueChange = { new -> if (new.all { it.isDigit() }) quantity = new },
            label = { Text("Quantity") },
            singleLine = true,
            modifier = Modifier.weight(1f),
        )
        Button(onClick = {
            run {
                viewModel.api.itemCommand(
                    "auto-compound-mark", characterName, item, null,
                    mapOf(
                        "targetTier" to JsonPrimitive(targetTier.toIntOrNull()?.coerceIn(1, 7) ?: 1),
                        "quantity" to JsonPrimitive(quantity.toIntOrNull() ?: 1),
                    ),
                )
            }
        }) { Text("Set") }
    }
}

@Composable
private fun AutoStandForm(
    characterName: String,
    item: com.partyconsole.companion.model.Item,
    viewModel: PartyViewModel,
    run: (suspend () -> ApiResult<*>) -> Unit,
) {
    var price by remember { mutableStateOf(item.price?.toString() ?: "") }
    Row(
        modifier = Modifier.fillMaxWidth().padding(start = 16.dp, bottom = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedTextField(
            value = price,
            onValueChange = { new -> if (new.all { it.isDigit() }) price = new },
            label = { Text("Price") },
            singleLine = true,
            modifier = Modifier.weight(1f),
        )
        Button(onClick = {
            run { viewModel.api.autoStand(characterName, item, price.toLongOrNull() ?: 0L) }
        }) { Text("Set") }
    }
}

@Composable
private fun StandForm(
    item: com.partyconsole.companion.model.Item,
    slot: Int,
    viewModel: PartyViewModel,
    run: (suspend () -> ApiResult<*>) -> Unit,
) {
    var price by remember { mutableStateOf(item.price?.toString() ?: "") }
    Row(
        modifier = Modifier.fillMaxWidth().padding(start = 16.dp, bottom = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedTextField(
            value = price,
            onValueChange = { new -> if (new.all { it.isDigit() }) price = new },
            label = { Text("Price") },
            singleLine = true,
            modifier = Modifier.weight(1f),
        )
        Button(onClick = {
            run { viewModel.api.markForStand(item, slot, price = price.toLongOrNull() ?: 0L) }
        }) {
            Text("List")
        }
    }
}
