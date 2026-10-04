package com.partyconsole.companion.ui.itempanel

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetState
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.domain.automaticCommerceRuleKey
import com.partyconsole.companion.domain.canDeconstruct
import com.partyconsole.companion.domain.standIsFull
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.ItemMeta
import com.partyconsole.companion.model.MerchantBuyItem
import com.partyconsole.companion.model.RosterMember
import com.partyconsole.companion.model.markedIn
import com.partyconsole.companion.model.sameMarkedItem
import com.partyconsole.companion.model.InventoryEntry
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.network.CommandResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.characterdetail.sections.slotInt
import com.partyconsole.companion.ui.components.AutoNpcSaleConfirmation
import com.partyconsole.companion.ui.components.DeconstructionConfirmation
import com.partyconsole.companion.ui.components.NpcSaleSheet
import com.partyconsole.companion.ui.components.StandListingForm
import com.partyconsole.companion.ui.itemdetail.ItemDetailBrowser
import com.partyconsole.companion.ui.itemdetail.STAT_SCROLLS
import com.partyconsole.companion.ui.itemdetail.comparisonSlotLabel
import com.partyconsole.companion.ui.itemdetail.comparisonSlotsFor
import com.partyconsole.companion.ui.itemdetail.compoundPassCost
import com.partyconsole.companion.ui.itemdetail.isEquipment
import com.partyconsole.companion.ui.itemdetail.isUsable
import com.partyconsole.companion.ui.itemdetail.itemMaximumLevel
import com.partyconsole.companion.ui.itemdetail.primaryStatScrollCost
import com.partyconsole.companion.ui.itemdetail.statScrollQuantity
import com.partyconsole.companion.ui.itemdetail.upgradeRuleTiers
import com.partyconsole.companion.ui.itemdetail.upgradeScrollCost
import com.partyconsole.companion.ui.itemicon.rememberCatalogLookup
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive

private val Orange = Color(0xFFFB923C)
private val Rose = Color(0xFFFB7185)
private const val CLEAR_MARKS_TITLE = "Clear this item’s manual marks and matching shared automatic rules"

/** The item options panel (the PWA's ItemActionPanel.tsx): tapping an item
 *  opens its options list in the dashboard's order, with its labels and
 *  gating. "Item details" is the first option and opens the full
 *  ItemDetailBrowser in its own sheet - the details pane no longer hosts
 *  the options. */
@Composable
fun ItemActionPanel(
    target: ItemActionTarget,
    characterName: String,
    isMerchant: Boolean,
    roster: Map<String, RosterMember>,
    viewModel: PartyViewModel,
    sheetState: SheetState,
    onDismiss: () -> Unit,
    // lucky-slot-menu.tsx "Show lucky slot data", when this is the merchant's lucky slot.
    onLuckySlotData: (() -> Unit)? = null,
) {
    val scope = rememberCoroutineScope()
    val state by viewModel.dynamicState.collectAsState()
    val characters by viewModel.characters.collectAsState()
    var error by remember(target) { mutableStateOf<String?>(null) }
    var expanded by remember(target) { mutableStateOf<String?>(null) }
    // null: closed; "" : the default slot; else the slot picked in the list.
    var comparing by remember(target) { mutableStateOf<String?>(null) }
    var showingDetails by remember(target) { mutableStateOf(false) }
    val catalogFor = rememberCatalogLookup(state.merchantCatalog)
    val item = target.item
    val meta = catalogFor(item.name)?.meta

    suspend fun finish(result: ApiResult<CommandResult>): String? = when (result) {
        is ApiResult.Failure -> result.message
        is ApiResult.Success -> {
            viewModel.refreshDynamicStateNow()
            onDismiss()
            null
        }
    }
    fun run(action: suspend () -> ApiResult<CommandResult>) {
        scope.launch { finish(action())?.let { error = it } }
    }

    // use-party-console.tsx statScrollInventory: the merchant's bag plus the bank.
    val statScrollInventory = remember(characters, state.bank, state.merchantCharacter) {
        val quantities = mutableMapOf<String, Int>()
        fun add(entryItem: Item?) {
            if (entryItem != null && STAT_SCROLLS.any { it.scroll == entryItem.name }) quantities[entryItem.name] = (quantities[entryItem.name] ?: 0) + maxOf(1, entryItem.q ?: 1)
        }
        state.merchantCharacter?.let { characters[it] }?.inventory?.items?.forEach { add(it?.item) }
        state.bank?.packs?.values?.forEach { pack -> pack.forEach { add(it?.item) } }
        quantities
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).verticalScroll(rememberScrollState())) {
            Text(
                "$characterName · ${when (target) { is ItemActionTarget.InventorySlot -> "slot ${target.slot}"; is ItemActionTarget.EquipmentSlot -> target.slotName }}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                item.statType?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                item.q?.takeIf { it > 1 }?.let { Text("x$it", style = MaterialTheme.typography.bodySmall) }
                item.p?.let { Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall) }
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

            TapRow("Item details") { showingDetails = true }
            onLuckySlotData?.let { show -> TapRow("Show lucky slot data") { onDismiss(); show() } }

            when (target) {
                is ItemActionTarget.InventorySlot -> InventoryActions(
                    viewModel, target, meta, characterName, isMerchant, state.merchantCatalog?.buyable.orEmpty(), statScrollInventory,
                    expanded, { expanded = it }, ::run, ::finish, onCompare = { comparing = it },
                )
                is ItemActionTarget.EquipmentSlot -> EquipmentActions(viewModel, target, meta, characterName, ::run)
            }
        }
    }

    if (showingDetails) {
        ModalBottomSheet(onDismissRequest = { showingDetails = false }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
            Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp)) {
                ItemDetailBrowser(
                    rootItemId = item.name,
                    rootLevel = item.level ?: 0,
                    catalog = state.merchantCatalog,
                    monsters = state.bestiaryCatalog,
                    rootStatType = item.statType,
                    rootGift = item.gift == true,
                    rootExpires = item.expires,
                )
                // connected-inventory.tsx: only the merchant's own inventory is a stand source.
                if (isMerchant && target is ItemActionTarget.InventorySlot) {
                    TextButton(onClick = { showingDetails = false; expanded = "stand" }) { Text("Add to stand") }
                }
            }
        }
    }

    comparing?.let { slot ->
        GearComparisonSheet(item = item, meta = meta, characterName = characterName, viewModel = viewModel, slot = slot.ifEmpty { null }, onClose = { comparing = null })
    }
}

@Composable
internal fun TapRow(label: String, enabled: Boolean = true, color: Color? = null, onClick: () -> Unit) {
    TextButton(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Text(label, modifier = Modifier.fillMaxWidth(), color = if (enabled && color != null) color else Color.Unspecified)
    }
}

/** inventory-panel.tsx's item context menu, in its order and with its labels
 *  and gating, as this app's options list. */
@Composable
private fun InventoryActions(
    viewModel: PartyViewModel,
    target: ItemActionTarget.InventorySlot,
    meta: ItemMeta?,
    characterName: String,
    isMerchant: Boolean,
    buyable: List<MerchantBuyItem>,
    statScrollInventory: Map<String, Int>,
    expanded: String?,
    onExpand: (String?) -> Unit,
    run: (suspend () -> ApiResult<CommandResult>) -> Unit,
    finish: suspend (ApiResult<CommandResult>) -> String?,
    onCompare: (String) -> Unit,
) {
    val state by viewModel.dynamicState.collectAsState()
    val characters by viewModel.characters.collectAsState()
    val diagnostics by viewModel.characterDetails.collectAsState()
    val loaded by viewModel.stateLoaded.collectAsState()
    val catalogFor = rememberCatalogLookup(state.merchantCatalog)
    val api = viewModel.api
    val item = target.item
    val slot = target.slot
    val level = item.level ?: 0
    fun toggle(key: String) = onExpand(if (expanded == key) null else key)
    val merchant = state.merchantCharacter
    val sharedRules = state.merchantRules != null
    val ruleName = if (sharedRules) merchant.toString() else characterName
    val equipment = isEquipment(meta?.definition)
    val itemType = (meta?.definition?.get("type") as? JsonPrimitive)?.content.orEmpty()
    val ownSlots = characters[characterName]?.inventory?.slots.orEmpty()
    fun equippedName(slotName: String) = ownSlots[slotName]?.let { (it.meta?.definition?.get("name") as? JsonPrimitive)?.content ?: catalogFor(it.item.name)?.name ?: it.item.name } ?: "Empty"
    val comparisonSlots = comparisonSlotsFor(meta, characters[characterName]?.vitals?.ctype.orEmpty())
    val entry = InventoryEntry(slot, item)

    // The same per-tile state InventorySection derives for its banner.
    val autoItemMarks = state.autoItemMarks[ruleName].orEmpty()
    val autoRuleKey = "${item.name}@+${maxOf(0, level)}"
    val autoMarkMode = autoItemMarks[autoRuleKey] ?: if (level == 0) autoItemMarks[item.name] else null
    val bankMarked = markedIn(state.marked[characterName].orEmpty(), entry)
    val merchantMarkedItem = markedIn(state.merchantMarked[characterName].orEmpty(), entry)
    val deliveryTarget = if (isMerchant) state.merchantDeliveries.entries.find { (_, list) -> list.any { it.slot == slot && sameMarkedItem(it.item, item) } }?.key else null
    val standListing = if (isMerchant) state.standListings.find { it.bankPack == null && it.slot == slot && sameMarkedItem(it.item, item) } else null
    // inventory-panel.tsx: standIsFull (sales + buy orders reserving a slot).
    val standFull = standIsFull(state.standListings, state.standBids)
    val weaponMarked = isMerchant && state.merchantWeapon?.item?.let { sameMarkedItem(it, item) } == true
    val upgradeMark = if (meta?.upgradeable == true) state.upgrades[characterName].orEmpty().find { !it.equipped && it.slot.slotInt() == slot && sameMarkedItem(it.item, item) } else null
    val autoUpgradeRule = state.autoUpgradeMarks[ruleName]?.get(autoRuleKey)
    val autoUpgradeTiers = upgradeRuleTiers(autoUpgradeRule)
    val statScrollMark = if (isMerchant) state.statScrolls[characterName].orEmpty().find { !it.equipped && it.slot.slotInt() == slot && sameMarkedItem(it.item, item) } else null
    val compoundGroup = state.compounds[characterName].orEmpty().find { group -> group.items.any { it.slot.slotInt() == slot && sameMarkedItem(it.item, item) } }
    val autoCompoundMark = state.autoCompounds[ruleName].orEmpty().find { it.name == item.name }
    val autoExchangeMarked = isMerchant && state.autoExchanges.containsKey("${item.name}@$level")
    val exchangeable = isMerchant && ((meta?.definition?.get("e") as? JsonPrimitive)?.content?.toDoubleOrNull() ?: 0.0) > 0
    val saleKey = automaticCommerceRuleKey(item)
    val autoNpcSaleMarked = state.autoNpcSales.containsKey(if (sharedRules || isMerchant) saleKey else JsonArray(listOf(JsonPrimitive(characterName), JsonPrimitive(saleKey))).toString())
    val npcSale = state.npcSaleMarks.find { (if (isMerchant) it.source == "merchant" else it.source == "character" && it.character == characterName) && it.slot == slot && automaticCommerceRuleKey(it.item) == saleKey }
    val deconstruction = state.deconstructionMarks.find { it.owner == characterName && it.slot == slot && it.state != "complete" && sameMarkedItem(item, it.item) }
    val autoDeconstruct = state.autoDeconstruction[ruleName]?.containsKey(saleKey) == true
    val autoStandMarked = isMerchant && state.autoStandMarks.containsKey(saleKey)
    val deconstructable = canDeconstruct(item, state.deconstructionCatalog)
    val upgradeMax = maxOf(0, itemMaximumLevel(meta) - level)
    val compoundMax = minOf(7, itemMaximumLevel(meta))
    // use-party-console.tsx: online party members other than this one; bankbois are storage workers.
    val bankboiNames = state.bankbois.map { it.name }.toSet()
    val deliveryTargets = diagnostics.filter { (name, detail) -> name != characterName && (detail.seenAt ?: 0) > 0 && name !in bankboiNames }.keys.toList()
    val anyMark = bankMarked || merchantMarkedItem || autoMarkMode != null || upgradeMark != null || autoUpgradeRule != null || statScrollMark != null ||
        compoundGroup != null || autoCompoundMark != null || autoExchangeMarked || weaponMarked || npcSale != null || autoNpcSaleMarked ||
        standListing != null || autoStandMarked || deconstruction != null || autoDeconstruct
    fun command(type: String, itemSlot: Int?, extra: Map<String, JsonElement> = emptyMap()) =
        run { api.itemCommand(type, characterName, item, itemSlot?.let { JsonPrimitive(it) }, extra) }
    fun tiers(n: Int) = "$n tier${if (n == 1) "" else "s"}"

    Column {
        if (equipment) TapRow("Equip") { command("equip", null) }
        if (isUsable(meta?.definition)) TapRow(if (itemType == "elixir") "Use elixir" else "Use") { command("use-item", slot) }
        if (equipment) {
            if (comparisonSlots.size > 1) {
                TapRow("Compare with equipped") { toggle("compare") }
                if (expanded == "compare") {
                    Column(modifier = Modifier.padding(start = 16.dp)) {
                        for (comparisonSlot in comparisonSlots) {
                            Row(modifier = Modifier.fillMaxWidth().clickable { onCompare(comparisonSlot) }.padding(vertical = 8.dp, horizontal = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(comparisonSlotLabel(comparisonSlot), style = MaterialTheme.typography.bodySmall)
                                Text(equippedName(comparisonSlot), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            } else {
                TapRow("Compare with equipped") { onCompare("") }
            }
        }

        TapRow("Deliver to…") { toggle("give") }
        if (expanded == "give") {
            Column(modifier = Modifier.padding(start = 16.dp)) {
                if (deliveryTargets.isEmpty()) Text("No other character is online.", style = MaterialTheme.typography.labelSmall)
                for (other in deliveryTargets) {
                    if (isMerchant && equipment) {
                        Text(other + if (deliveryTarget == other) " ✓" else "", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        TapRow("Don't equip") { command("give", slot, mapOf("target" to JsonPrimitive(other), "equipOnDelivery" to JsonPrimitive(false))) }
                        TapRow("Equip") { command("give", slot, mapOf("target" to JsonPrimitive(other), "equipOnDelivery" to JsonPrimitive(true))) }
                    } else {
                        TapRow(other) { command("give", slot, mapOf("target" to JsonPrimitive(other))) }
                    }
                }
            }
        }

        if (isMerchant && meta?.definition?.get("stat") != null) {
            TapRow(
                when {
                    statScrollMark != null -> "Stat scroll: ${statScrollMark.statType.uppercase()}"
                    item.statType != null -> "Change stat scroll · ${item.statType.uppercase()}"
                    else -> "Add stat scroll"
                },
            ) { toggle("statscroll") }
            if (expanded == "statscroll") StatScrollPicker(meta, item, statScrollInventory) { statType -> command("stat-scroll-mark", slot, mapOf("statType" to JsonPrimitive(statType))) }
        }

        // automatic-item-actions.tsx section="exchange". The server toggles this rule.
        if (merchant != null && exchangeable) TapRow("Auto exchange", enabled = loaded && !autoExchangeMarked) { command("auto-exchange", slot) }

        TapRow("Mark for bank", enabled = !bankMarked) { command("mark", slot) }
        if (merchant != null) TapRow("Auto mark for bank", enabled = autoMarkMode != "bank") { command("auto-item-mark", null, mapOf("mode" to JsonPrimitive("bank"))) }

        if (isMerchant) {
            TapRow(if (standListing != null) "Edit stand listing" else "Mark for stand", enabled = !standFull || standListing != null) { toggle("stand") }
            if (expanded == "stand") {
                StandListingForm(
                    viewModel, item, meta, existingId = standListing?.id, existingPrice = standListing?.price, existingQuantity = standListing?.quantity,
                    onCancel = { onExpand(null) },
                    onSubmit = { draft -> finish(api.markForStand(item, slot, price = draft.price, quantity = draft.quantity, markAll = draft.markAll, id = standListing?.id)) },
                )
            }
            if (merchant != null) {
                TapRow(if (autoStandMarked) "Update auto mark for stand…" else "Auto mark for stand…") { toggle("autostand") }
                if (expanded == "autostand") {
                    StandListingForm(
                        viewModel, item, meta, existingPrice = state.autoStandMarks[saleKey]?.price, auto = true,
                        onCancel = { onExpand(null) },
                        onSubmit = { draft -> finish(api.autoStand(item, draft.price)) },
                    )
                }
            }
        }

        // upgrade-actions.tsx (offerings are U1).
        if (merchant != null && meta?.upgradeable == true && upgradeMax > 0) {
            TapRow("Mark for upgrade" + (upgradeMark?.let { " · ${tiers(it.tiers ?: 1)}" } ?: "")) { toggle("upgrade") }
            if (expanded == "upgrade") UpgradeTierPicker(meta, level) { t -> command("upgrade-mark", slot, mapOf("tiers" to JsonPrimitive(t))) }
            TapRow("Auto mark for upgrade" + (if (autoUpgradeTiers > 0) " · ${tiers(autoUpgradeTiers)}" else "")) { toggle("autoupgrade") }
            if (expanded == "autoupgrade") UpgradeTierPicker(meta, level, current = autoUpgradeTiers) { t -> command("auto-upgrade-mark", slot, mapOf("tiers" to JsonPrimitive(t))) }
        }
        if (merchant != null && !isMerchant && meta?.buyable == true) TapRow("Buy another level 0") { command("buy-copy", null) }

        if (merchant != null && meta?.compoundable == true && compoundGroup == null) TapRow("Mark for compounding") { command("compound-mark", slot) }
        if (merchant != null && meta?.compoundable == true && level < compoundMax) {
            TapRow(autoCompoundMark?.targetTier?.let { "Auto compound to +$it" } ?: "Auto compound") { toggle("autocompound") }
            if (expanded == "autocompound") CompoundTierPicker(meta, level, buyable) { targetTier -> command("auto-compound-mark", null, mapOf("targetTier" to JsonPrimitive(targetTier))) }
        }

        if (!isMerchant) {
            TapRow("Mark for merchant", enabled = !merchantMarkedItem) { command("merchant-mark", slot) }
            TapRow("Auto mark for merchant", enabled = autoMarkMode != "merchant") { command("auto-item-mark", null, mapOf("mode" to JsonPrimitive("merchant"))) }
        }

        if (merchant != null || deconstructable) HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
        if (deconstructable) {
            TapRow("Mark for deconstruction", enabled = deconstruction == null, color = Orange) { toggle("decon") }
            if (expanded == "decon") {
                DeconstructionConfirmation(item, auto = false, catalog = state.deconstructionCatalog, catalogFor = catalogFor, onCancel = { onExpand(null) },
                    onConfirm = { finish(api.markForDeconstruction(characterName, item, slot)) })
            }
            TapRow("Auto mark for deconstruction", enabled = !autoDeconstruct, color = Orange) { toggle("autodecon") }
            if (expanded == "autodecon") {
                DeconstructionConfirmation(item, auto = true, catalog = state.deconstructionCatalog, catalogFor = catalogFor, onCancel = { onExpand(null) },
                    onConfirm = { finish(api.autoDeconstruct(characterName, item)) })
            }
        }

        if (merchant != null) {
            TapRow("Sell to NPC…", color = Rose) { toggle("npcsale") }
            if (expanded == "npcsale") {
                NpcSaleSheet(
                    item = item, meta = meta,
                    location = "${if (isMerchant) "Merchant inventory" else "$characterName inventory - the merchant will collect it"} · slot $slot",
                    available = item.q ?: 1,
                    onCancel = { onExpand(null) },
                    onConfirm = { quantity, acknowledged -> finish(api.markForNpcSale(characterName, item, slot, isMerchant, quantity, acknowledged)) },
                )
            }
            TapRow(if (autoNpcSaleMarked) "Update auto sell to NPC…" else "Auto sell to NPC…", enabled = loaded) { toggle("autonpc") }
            if (expanded == "autonpc") {
                val name = (meta?.definition?.get("name") as? JsonPrimitive)?.content ?: catalogFor(item.name)?.name ?: item.name
                AutoNpcSaleConfirmation(item, meta, name, if (isMerchant) null else characterName, onCancel = { onExpand(null) },
                    onConfirm = { finish(api.autoNpcSale(if (isMerchant) null else characterName, item)) })
            }
        }

        if (anyMark) {
            Text(CLEAR_MARKS_TITLE, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
            TapRow("Clear all marks", color = MaterialTheme.colorScheme.error) { command("clear-item-marks", slot) }
        }
    }
}

/** equip-slot.tsx's menu: Unequip (the elixir only shows its active effect),
 *  upgrade marks, and Clear all marks when anything matches. */
@Composable
private fun EquipmentActions(viewModel: PartyViewModel, target: ItemActionTarget.EquipmentSlot, meta: ItemMeta?, characterName: String, run: (suspend () -> ApiResult<CommandResult>) -> Unit) {
    val state by viewModel.dynamicState.collectAsState()
    val api = viewModel.api
    val item = target.item
    val slotName = target.slotName
    val level = item.level ?: 0
    var expanded by remember(target) { mutableStateOf<String?>(null) }
    fun toggle(key: String) { expanded = if (expanded == key) null else key }
    val upgradeMax = maxOf(0, itemMaximumLevel(meta) - level)
    val merchant = state.merchantCharacter
    val sharedRules = state.merchantRules != null
    val ruleName = if (sharedRules) merchant.toString() else characterName
    val isMerchant = characterName == merchant
    val key = "${item.name}@+${maxOf(0, level)}"
    val autoUpgradeRule = state.autoUpgradeMarks[ruleName]?.get(key)
    val autoTiers = upgradeRuleTiers(autoUpgradeRule)
    val slotArg = JsonPrimitive(slotName)
    val mark = state.upgrades[characterName].orEmpty().find { it.equipped && (it.slot as? JsonPrimitive)?.content == slotName && sameMarkedItem(it.item, item) }
    val statScrollMark = state.statScrolls[characterName].orEmpty().find { (it.slot as? JsonPrimitive)?.content == slotName && sameMarkedItem(it.item, item) }
    // inventory-panel.tsx hasAutomaticMarks.
    val commerceKey = automaticCommerceRuleKey(item)
    val autoItemMarks = state.autoItemMarks[ruleName].orEmpty()
    val hasAutomaticMarks = autoItemMarks[key] != null || (level == 0 && autoItemMarks[item.name] != null) || autoUpgradeRule != null ||
        state.autoCompounds[ruleName].orEmpty().any { it.name == item.name } || state.autoDeconstruction[ruleName]?.containsKey(commerceKey) == true ||
        state.autoNpcSales.containsKey(if (sharedRules || isMerchant) commerceKey else JsonArray(listOf(JsonPrimitive(characterName), JsonPrimitive(commerceKey))).toString()) ||
        (isMerchant && (state.autoStandMarks.containsKey(commerceKey) || state.autoExchanges.containsKey("${item.name}@$level") || state.merchantWeapon?.item?.let { sameMarkedItem(item, it) } == true))
    fun tiers(n: Int) = "$n tier${if (n == 1) "" else "s"}"

    Column {
        // equipment.tsx: trade1..N are the merchant's stand slots, not gear.
        if (slotName != "elixir" && !slotName.startsWith("trade")) TapRow("Unequip") { run { api.itemCommand("unequip", characterName, item, slotArg) } }
        if (slotName == "elixir") TapRow("Active elixir effect", enabled = false) {}
        if (meta?.upgradeable == true && upgradeMax > 0) {
            TapRow("Mark for upgrade" + (mark?.let { " · ${tiers(it.tiers ?: 1)}" } ?: "")) { toggle("upgrade") }
            if (expanded == "upgrade") {
                UpgradeTierPicker(meta, level) { t -> run { api.itemCommand("upgrade-mark", characterName, item, slotArg, mapOf("equipped" to JsonPrimitive(true), "tiers" to JsonPrimitive(t))) } }
            }
            TapRow("Auto mark for upgrade" + (if (autoTiers > 0) " · ${tiers(autoTiers)}" else "")) { toggle("autoupgrade") }
            if (expanded == "autoupgrade") {
                UpgradeTierPicker(meta, level, current = autoTiers) { t -> run { api.itemCommand("auto-upgrade-mark", characterName, item, slotArg, mapOf("equipped" to JsonPrimitive(true), "tiers" to JsonPrimitive(t))) } }
            }
        }
        if (hasAutomaticMarks || mark != null || statScrollMark != null) {
            Text(CLEAR_MARKS_TITLE, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
            TapRow("Clear all marks", color = MaterialTheme.colorScheme.error) { run { api.itemCommand("clear-item-marks", characterName, item, slotArg, mapOf("equipped" to JsonPrimitive(true))) } }
        }
    }
}

/** upgrade-actions.tsx's tier submenu: one row per achievable target tier,
 *  "+N → +N+tiers" with the scroll gold cost. */
@Composable
internal fun UpgradeTierPicker(meta: ItemMeta?, level: Int, current: Int? = null, onPick: (Int) -> Unit) {
    val max = maxOf(0, itemMaximumLevel(meta) - level)
    if (max <= 0) return
    Column(modifier = Modifier.padding(start = 16.dp)) {
        for (tiers in 1..max) {
            Row(
                modifier = Modifier.fillMaxWidth().clickable(enabled = current != tiers) { onPick(tiers) }.padding(vertical = 8.dp, horizontal = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("+$level → +${level + tiers}", style = MaterialTheme.typography.bodySmall, color = if (current == tiers) MaterialTheme.colorScheme.onSurfaceVariant else Color.Unspecified)
                Text("${"%,d".format(upgradeScrollCost(meta, level, tiers))}g", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

/** inventory-panel.tsx's "Auto compound" submenu: one row per tier up to +7
 *  (the server's validTier cap) with the real compound-scroll cost. */
@Composable
internal fun CompoundTierPicker(meta: ItemMeta?, level: Int, buyable: List<MerchantBuyItem>, onPick: (Int) -> Unit) {
    val max = maxOf(0, minOf(7, itemMaximumLevel(meta)) - level)
    if (max <= 0) return
    val grades = (meta?.definition?.get("grades") as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.content?.toDoubleOrNull()?.toInt() }
    Column(modifier = Modifier.padding(start = 16.dp)) {
        for (tier in (level + 1)..(level + max)) {
            val cost = compoundPassCost(grades, tier, buyable)
            Row(modifier = Modifier.fillMaxWidth().clickable { onPick(tier) }.padding(vertical = 8.dp, horizontal = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("+$tier", style = MaterialTheme.typography.bodySmall)
                Text(cost?.let { "${"%,d".format(it.gold)}g" } ?: "Price unavailable", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

/** stat-scroll-mark's option list: str/int/dex/vit are always shown (bought
 *  for gold); every other stat only once enough of its scroll is owned. */
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
            Row(modifier = Modifier.fillMaxWidth().clickable(enabled = !current) { onPick(choice.stat) }.padding(vertical = 8.dp, horizontal = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(choice.label + if (current) " · current" else "", style = MaterialTheme.typography.bodySmall)
                Text(
                    if (choice.purchasable) "${"%,d".format(cost)}g · $required scroll${if (required == 1) "" else "s"}" else "$owned/$required owned",
                    fontFamily = FontFamily.Monospace,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
