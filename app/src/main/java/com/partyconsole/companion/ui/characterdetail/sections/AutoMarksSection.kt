package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.PartyStateDynamic
import com.partyconsole.companion.model.UPGRADE_OFFERING_LABELS
import com.partyconsole.companion.model.UpgradeOfferingRule
import com.partyconsole.companion.model.itemFromRuleKey
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.network.CommandResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.itemdetail.ItemDetailBrowser
import com.partyconsole.companion.ui.itemdetail.upgradeRuleTiers
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

private typealias Action = suspend () -> ApiResult<CommandResult>

private class RuleEdit(
    val id: String,
    val value: Int,
    val label: String,
    val min: Int,
    val max: Int,
    val allowUnlimited: Boolean = false,
    val onSave: (Int) -> Action,
)

private class RuleEntry(
    val key: String,
    val item: Item,
    val detail: String? = null,
    // A running mark can't be removed; a blocked one can be retried.
    val disabled: Boolean = false,
    val retry: Action? = null,
    val upgradeTarget: Int? = null,
    val edits: List<RuleEdit> = emptyList(),
    val onRemove: Action,
)

/** upgrade-rule-quantity.tsx, verbatim: -1 unless the rule carries a safe-integer quantity. */
private fun upgradeRuleQuantity(rule: JsonElement?): Int =
    ((rule as? JsonObject)?.get("quantity") as? JsonPrimitive)?.content?.toDoubleOrNull()?.takeIf { it == Math.floor(it) && kotlin.math.abs(it) <= 9007199254740991.0 }?.toInt() ?: -1

private val Rose = Color(0xFFFB7185)
private val Emerald = Color(0xFF34D399)

/** inventory-panel.tsx's automatic sections (the PWA's AutoMarksSection.tsx,
 *  merchant only): NPC sales, deconstruction, stand, upgrades, upgrade
 *  offering rules, compounds, merchant marks and bank marks - each with a
 *  two-tap clear, two-tap remove per entry, inline target/remaining edits
 *  for upgrade and compound rules, and Retry for a blocked deconstruction.
 *  Every action surfaces its error; tapping an entry's tile opens its item
 *  details. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AutoMarksSection(
    characterName: String,
    isMerchant: Boolean,
    dynamicState: PartyStateDynamic,
    viewModel: PartyViewModel,
    catalogFor: (String) -> CatalogItem? = { null },
) {
    if (!isMerchant) return
    val state = dynamicState
    val api = viewModel.api
    val scope = rememberCoroutineScope()
    var error by remember { mutableStateOf<String?>(null) }
    var viewing by remember { mutableStateOf<Item?>(null) }

    val merchant = state.merchantCharacter ?: characterName
    // connected-inventory.tsx ruleName: shared rules live under the merchant.
    val ruleName = if (state.merchantRules != null) merchant else characterName
    val autoItemMarks = state.autoItemMarks[ruleName].orEmpty()
    suspend fun perform(action: Action) {
        error = null
        val result = action()
        if (result is ApiResult.Failure) error = result.message.ifEmpty { "Automatic rule update failed" }
        viewModel.refreshDynamicStateNow()
    }

    val npc = state.autoNpcSales.entries.filter { it.value.character == null }.map { (key, rule) ->
        RuleEntry(key, rule.item, onRemove = { api.autoNpcSale(null, rule.item, remove = true) })
    } + state.npcSaleMarks.map { mark ->
        RuleEntry(
            mark.id,
            mark.item,
            detail = "${mark.character ?: merchant} · ${mark.quantity} × · ${mark.state ?: "queued"}" + (mark.error?.let { " · $it" } ?: ""),
            disabled = mark.state == "running",
            onRemove = { api.removeNpcSaleMark(mark.character ?: characterName, mark.id) },
        )
    }
    val autoDeconstruction = state.autoDeconstruction[ruleName].orEmpty()
    val deconstruction = autoDeconstruction.map { (key, rule) ->
        RuleEntry(key, rule.item, detail = "Automatic", onRemove = { api.autoDeconstruct(characterName, rule.item, remove = true) })
    } + state.deconstructionMarks.filter { it.state != "complete" }.map { mark ->
        val owner = mark.owner.ifEmpty { characterName }
        RuleEntry(
            mark.id,
            mark.item,
            detail = "${mark.owner} · ${mark.quantity} × · ${mark.state}" + (mark.error?.let { " · $it" } ?: ""),
            disabled = mark.state == "running",
            retry = if (mark.state == "blocked") ({ api.retryDeconstructionMark(owner, mark.id) }) else null,
            onRemove = { api.removeDeconstructionMark(owner, mark.id, mark.slot, mark.item) },
        )
    }
    val stand = state.autoStandMarks.map { (key, rule) ->
        RuleEntry(key, rule.item, detail = "${"%,d".format(rule.price)}g", onRemove = { api.autoStand(rule.item, rule.price, remove = true) })
    }
    val upgrades = state.autoUpgradeMarks.flatMap { (owner, rules) ->
        rules.map { (ruleKey, rule) ->
            val item = itemFromRuleKey(ruleKey)
            val level = item.level ?: 0
            val tiers = upgradeRuleTiers(rule)
            val quantity = upgradeRuleQuantity(rule)
            RuleEntry(
                "$owner:$ruleKey",
                item,
                upgradeTarget = level + tiers,
                detail = if (owner == characterName) null else owner,
                edits = listOf(
                    RuleEdit("target", tiers, "$tiers tier${if (tiers == 1) "" else "s"} → +${level + tiers}", 1, maxOf(1, 13 - level)) { value ->
                        { api.itemCommand("update-auto-upgrade-rule", owner, item, null, mapOf("ruleKey" to JsonPrimitive(ruleKey), "tiers" to JsonPrimitive(value))) }
                    },
                    RuleEdit("quantity", quantity, remainingLabel(quantity), 1, 9999, allowUnlimited = true) { value ->
                        { api.itemCommand("update-auto-upgrade-rule", owner, item, null, mapOf("ruleKey" to JsonPrimitive(ruleKey), "quantity" to JsonPrimitive(value))) }
                    },
                ),
                onRemove = { api.removeAutoUpgradeRule(owner, item, ruleKey) },
            )
        }
    }
    val compounds = state.autoCompounds.flatMap { (owner, rules) ->
        rules.map { rule ->
            val item = Item(name = rule.name)
            RuleEntry(
                "$owner:${rule.name}",
                Item(name = rule.name, level = 0),
                detail = if (owner == characterName) null else owner,
                edits = listOf(
                    RuleEdit("target", rule.targetTier, "Target +${rule.targetTier}", 1, 7) { value ->
                        { api.itemCommand("auto-compound-mark", owner, item, null, mapOf("targetTier" to JsonPrimitive(value))) }
                    },
                    RuleEdit("quantity", rule.quantity, remainingLabel(rule.quantity), 1, 9999, allowUnlimited = true) { value ->
                        { api.itemCommand("auto-compound-mark", owner, item, null, mapOf("targetTier" to JsonPrimitive(rule.targetTier), "quantity" to JsonPrimitive(value))) }
                    },
                ),
                onRemove = { api.removeAutoCompound(owner, rule.name, rule.targetTier) },
            )
        }
    }
    fun markEntries(mode: String) = autoItemMarks.filter { it.value == mode }.map { (key, _) ->
        RuleEntry(key, itemFromRuleKey(key), onRemove = { api.removeAutoItemMark(characterName, mode, key) })
    }

    SectionCard(title = "Automatic rules") {
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(bottom = 8.dp)) }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            AutoRuleGroup("Auto NPC sales", Color(0xFF9F1239), Rose, npc, catalogFor, { scope.launch { perform(it) } }, { viewing = it }) {
                perform { api.clearAllAutoNpcSales(null) }
            }
            AutoRuleGroup("Auto deconstruction", Color(0xFF9A3412), Color(0xFFFB923C), deconstruction, catalogFor, { scope.launch { perform(it) } }, { viewing = it }) {
                for (rule in autoDeconstruction.values) perform { api.autoDeconstruct(characterName, rule.item, remove = true) }
            }
            AutoRuleGroup("Auto stand marks", Color(0xFF92400E), Color(0xFFFBBF24), stand, catalogFor, { scope.launch { perform(it) } }, { viewing = it }) {
                perform { api.clearAllAutoStand() }
            }
            AutoRuleGroup("Auto upgrades", Color(0xFF075985), Color(0xFF38BDF8), upgrades, catalogFor, { scope.launch { perform(it) } }, { viewing = it }) {
                perform { api.clearAutoUpgrades(characterName) }
            }
            UpgradeOfferingRules(characterName, state.upgradeOfferingRules, state.merchantCatalog?.allItems.orEmpty(), viewModel, catalogFor)
            AutoRuleGroup("Auto compounds", Color(0xFF86198F), Color(0xFFE879F9), compounds, catalogFor, { scope.launch { perform(it) } }, { viewing = it }) {
                perform { api.clearAutoCompounds(characterName) }
            }
            AutoRuleGroup("Auto merchant marks", Color(0xFF6B21A8), Color(0xFFC084FC), markEntries("merchant"), catalogFor, { scope.launch { perform(it) } }, { viewing = it }) {
                perform { api.clearAutoItemMarks(characterName, "merchant") }
            }
            AutoRuleGroup("Auto bank marks", Color(0xFF92400E), Color(0xFFFBBF24), markEntries("bank"), catalogFor, { scope.launch { perform(it) } }, { viewing = it }) {
                perform { api.clearAutoItemMarks(characterName, "bank") }
            }
        }
    }

    viewing?.let { item ->
        ModalBottomSheet(onDismissRequest = { viewing = null }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
            Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp)) {
                ItemDetailBrowser(rootItemId = item.name, rootLevel = item.level ?: 0, catalog = state.merchantCatalog, monsters = state.bestiaryCatalog, viewModel = viewModel)
            }
        }
    }
}

private fun remainingLabel(quantity: Int) = when (quantity) {
    -1 -> "Remaining ∞"
    0 -> "Completed"
    else -> "Remaining $quantity"
}

@Composable
private fun GroupHeader(title: String, count: Int, color: Color, open: Boolean, onToggle: () -> Unit, clearEnabled: Boolean, clearArmed: Boolean, onClear: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Row(
            modifier = Modifier.weight(1f).clickable(onClick = onToggle).padding(horizontal = 12.dp, vertical = 10.dp).semantics { contentDescription = "$title, $count" },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(if (open) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore, contentDescription = null, tint = color, modifier = Modifier.size(16.dp))
            Text(title, color = color, style = MaterialTheme.typography.labelMedium, modifier = Modifier.weight(1f).padding(start = 8.dp))
            Text("$count", color = color.copy(alpha = 0.7f), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelMedium)
        }
        TextButton(
            onClick = onClear,
            enabled = clearEnabled,
            contentPadding = PaddingValues(horizontal = 8.dp),
            modifier = Modifier.semantics { contentDescription = if (clearArmed) "Really clear all $title" else "Clear all $title" }
                .then(if (clearArmed) Modifier.background(Color(0xFFE11D48)) else Modifier),
        ) {
            if (clearArmed) Text("Really?", color = Color.White, fontSize = 10.sp)
            Icon(Icons.Filled.Close, contentDescription = null, tint = if (clearArmed) Color.White else Rose, modifier = Modifier.size(16.dp))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AutoRuleGroup(
    title: String,
    border: Color,
    color: Color,
    entries: List<RuleEntry>,
    catalogFor: (String) -> CatalogItem?,
    perform: (Action) -> Unit,
    onView: (Item) -> Unit,
    onClear: suspend () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var open by remember { mutableStateOf(false) }
    var clearArmed by remember { mutableStateOf(false) }
    var removalArmed by remember { mutableStateOf<String?>(null) }
    var editing by remember { mutableStateOf<String?>(null) }
    var value by remember { mutableStateOf("") }
    fun stopEditing() { editing = null; value = "" }

    Column(modifier = Modifier.fillMaxWidth().border(1.dp, border, RoundedCornerShape(6.dp))) {
        GroupHeader(
            title, entries.size, color, open,
            onToggle = { open = !open; clearArmed = false; removalArmed = null; stopEditing() },
            clearEnabled = entries.isNotEmpty(),
            clearArmed = clearArmed,
            onClear = {
                if (!clearArmed) { clearArmed = true; removalArmed = null } else { clearArmed = false; scope.launch { onClear() } }
            },
        )
        if (open) {
            Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp)) {
                if (entries.isEmpty()) Text("No active marks.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                for (entry in entries) {
                    val definition = catalogFor(entry.item.name)
                    val level = entry.item.level ?: 0
                    val label = (definition?.name ?: entry.item.name) + if (level != 0) " +$level" else ""
                    val upgradeRange = entry.upgradeTarget?.let { "+$level → +$it" }
                    val armed = removalArmed == entry.key
                    FlowRow(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Box(
                            modifier = Modifier.size(width = if (upgradeRange != null) 64.dp else 40.dp, height = if (upgradeRange != null) 56.dp else 40.dp)
                                .border(1.dp, MaterialTheme.colorScheme.outlineVariant)
                                .clickable { onView(entry.item) }
                                .semantics { contentDescription = "View $label" + (upgradeRange?.let { " · $it" } ?: "") },
                        ) {
                            Box(modifier = Modifier.align(Alignment.TopCenter).size(40.dp), contentAlignment = Alignment.Center) { SpriteIcon(definition?.sprite, size = 40.dp) }
                            if (upgradeRange != null) {
                                Text(
                                    upgradeRange,
                                    color = Color(0xFFE0F2FE),
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 11.sp,
                                    modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(Color(0xFF082F49)).padding(horizontal = 2.dp),
                                )
                            } else if (level != 0) {
                                Text("+$level", color = Color(0xFFFDE68A), fontFamily = FontFamily.Monospace, fontSize = 9.sp, modifier = Modifier.align(Alignment.BottomEnd).background(Color.Black).padding(horizontal = 2.dp))
                            }
                        }
                        Column(modifier = Modifier.weight(1f).align(Alignment.CenterVertically)) {
                            Text(label, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                            entry.detail?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1) }
                        }
                        if (!armed) {
                            for (edit in entry.edits) {
                                val fieldKey = "${entry.key}:${edit.id}"
                                val parsed = value.toIntOrNull()
                                val valid = parsed != null && ((edit.allowUnlimited && parsed == -1) || parsed in edit.min..edit.max)
                                if (editing == fieldKey) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        OutlinedTextField(
                                            value = value,
                                            onValueChange = { text -> value = text.filter { it.isDigit() || (edit.allowUnlimited && it == '-') } },
                                            singleLine = true,
                                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                            modifier = Modifier.width(80.dp).semantics { contentDescription = "New ${edit.id} for $label" },
                                        )
                                        IconButton(
                                            enabled = valid,
                                            onClick = { val chosen = parsed!!; stopEditing(); perform(edit.onSave(chosen)) },
                                            modifier = Modifier.semantics { contentDescription = "Save ${edit.id} for $label" },
                                        ) { Icon(Icons.Filled.Check, contentDescription = null, tint = if (valid) Emerald else Color.Gray) }
                                    }
                                } else {
                                    OutlinedButton(
                                        onClick = { editing = fieldKey; value = edit.value.toString() },
                                        contentPadding = PaddingValues(horizontal = 8.dp),
                                        modifier = Modifier.height(32.dp),
                                    ) { Text(edit.label, color = Emerald, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall) }
                                }
                            }
                        }
                        TextButton(
                            enabled = !entry.disabled,
                            onClick = {
                                if (!armed) { removalArmed = entry.key; stopEditing() } else { removalArmed = null; perform(entry.onRemove) }
                            },
                            contentPadding = PaddingValues(horizontal = 6.dp),
                            modifier = Modifier.semantics { contentDescription = if (armed) "Really remove $label" else "Remove $label" }
                                .then(if (armed) Modifier.background(Color(0xFFE11D48)) else Modifier),
                        ) {
                            if (armed) Text("Really?", color = Color.White, fontSize = 10.sp)
                            Icon(Icons.Filled.Close, contentDescription = null, tint = if (armed) Color.White else Rose, modifier = Modifier.size(16.dp))
                        }
                        entry.retry?.let { retry ->
                            OutlinedButton(onClick = { perform(retry) }, contentPadding = PaddingValues(horizontal = 8.dp), modifier = Modifier.height(32.dp)) {
                                Text("Retry", color = Color(0xFFFB923C), style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                }
            }
        }
    }
}

/** upgrade-offering-controls.tsx UpgradeOfferingRules: the standing rules
 *  with Edit / Remove, and a two-tap clear of them all. */
@Composable
private fun UpgradeOfferingRules(
    characterName: String,
    rules: List<UpgradeOfferingRule>,
    catalog: List<CatalogItem>,
    viewModel: PartyViewModel,
    catalogFor: (String) -> CatalogItem?,
) {
    val scope = rememberCoroutineScope()
    var open by remember { mutableStateOf(false) }
    var clearArmed by remember { mutableStateOf(false) }
    var clearing by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<UpgradeOfferingRule?>(null) }
    var error by remember { mutableStateOf("") }
    fun nameOf(id: String) = catalogFor(id)?.name ?: id
    fun remove(rule: UpgradeOfferingRule) = scope.launch {
        val result = viewModel.api.removeOfferingRule(characterName, rule.id)
        error = if (result is ApiResult.Failure) result.message.ifEmpty { "Could not remove rule" } else ""
        viewModel.refreshDynamicStateNow()
    }
    fun clear() = scope.launch {
        clearing = true
        error = ""
        for (rule in rules) {
            val result = viewModel.api.removeOfferingRule(characterName, rule.id)
            if (result is ApiResult.Failure) { error = result.message.ifEmpty { "Could not clear upgrade rules" }; break }
        }
        clearing = false
        clearArmed = false
        viewModel.refreshDynamicStateNow()
    }
    val sky = Color(0xFF38BDF8)
    Column(modifier = Modifier.fillMaxWidth().border(1.dp, Color(0xFF075985), RoundedCornerShape(6.dp))) {
        GroupHeader(
            "Upgrade rules", rules.size, sky, open,
            onToggle = { open = !open; clearArmed = false },
            clearEnabled = rules.isNotEmpty() && !clearing,
            clearArmed = clearArmed,
            onClear = { if (clearArmed) clear() else clearArmed = true },
        )
        if (open) {
            Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp)) {
                if (rules.isEmpty()) Text("No upgrade rules.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                for (rule in rules) {
                    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            SpriteIcon(catalogFor(rule.name)?.sprite, size = 28.dp)
                            Text(nameOf(rule.name), style = MaterialTheme.typography.bodySmall)
                            Text("+${rule.floor} → +${rule.ceiling}", style = MaterialTheme.typography.bodySmall)
                        }
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            SpriteIcon(catalogFor(rule.offering)?.sprite, size = 28.dp)
                            Text(UPGRADE_OFFERING_LABELS[rule.offering] ?: rule.offering, style = MaterialTheme.typography.bodySmall)
                            Text(if (rule.required) "Required" else "When available", color = sky, style = MaterialTheme.typography.labelSmall)
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(enabled = !clearing, onClick = { editing = rule }) { Text("Edit") }
                            OutlinedButton(enabled = !clearing, onClick = { remove(rule) }) { Text("Remove") }
                        }
                    }
                }
            }
        }
        if (error.isNotEmpty()) Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
    }
    editing?.let { rule ->
        com.partyconsole.companion.ui.components.OfferingDialog(viewModel, characterName, Item(name = rule.name), rule = rule, onClose = { editing = null })
    }
}
