package com.partyconsole.companion.ui.components

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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
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
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.ItemMeta
import com.partyconsole.companion.model.UPGRADE_OFFERING_LABELS
import com.partyconsole.companion.model.UpgradeOfferingRule
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.network.CommandResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.itemdetail.itemMaximumLevel
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import com.partyconsole.companion.ui.itemicon.rememberCatalogLookup
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** runtime/upgrade-offerings.ts, verbatim. */
fun offeringOverlap(rules: List<UpgradeOfferingRule>, next: UpgradeOfferingRule): UpgradeOfferingRule? =
    rules.find { it.id != next.id && it.name == next.name && it.floor < next.ceiling && next.floor < it.ceiling }

// runtime/upgrade-preview.ts previewOptions.
private val PREVIEW_OPTIONS = listOf("none", "offeringp", "offering", "offeringx")
private val Sky = Color(0xFF075985)

/** upgrade-offering-controls.tsx's OfferingSource: an inventory slot, or an equip slot. */
data class OfferingSource(val slot: JsonElement, val equipped: Boolean = false)

@Composable
private fun OfferingIcon(viewModel: PartyViewModel, name: String) {
    val state by viewModel.dynamicState.collectAsState()
    val item = rememberCatalogLookup(state.merchantCatalog)(name)
    Box(modifier = Modifier.size(40.dp).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(4.dp)).background(Color.Black).semantics { contentDescription = item?.name ?: name }) {
        item?.sprite?.let { SpriteIcon(it, size = 40.dp) }
    }
}

@Composable
private fun LevelMenu(label: String, value: Int, options: List<Int>, enabled: Boolean, disabled: (Int) -> Boolean = { false }, onPick: (Int) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(enabled = enabled, onClick = { open = true }, modifier = Modifier.semantics { contentDescription = label }) { Text("+$value") }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            for (n in options) DropdownMenuItem(text = { Text("+$n") }, enabled = !disabled(n), onClick = { open = false; onPick(n) })
        }
    }
}

/** upgrade-offering-controls.tsx OfferingDialog, inline: with a [source] it
 *  confirms a one-tier upgrade with that offering ("Confirm upgrade");
 *  without, it adds or edits a standing rule (range, offering, Required /
 *  Only if available) with the overlap and destination checks. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun OfferingDialog(
    viewModel: PartyViewModel,
    character: String,
    item: Item,
    meta: ItemMeta? = null,
    source: OfferingSource? = null,
    offering: String? = null,
    rule: UpgradeOfferingRule? = null,
    onClose: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val state by viewModel.dynamicState.collectAsState()
    val catalogFor = rememberCatalogLookup(state.merchantCatalog)
    val stock = state.upgradeOfferingStock
    val manual = source != null
    val level = item.level ?: 0
    val max = itemMaximumLevel(meta ?: catalogFor(item.name)?.meta)
    var draft by remember { mutableStateOf(rule ?: UpgradeOfferingRule(id = "", name = item.name, floor = level, ceiling = minOf(level + 1, max), offering = offering ?: "offeringp", required = true)) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var offeringMenu by remember { mutableStateOf(false) }
    val overlap = if (!manual) offeringOverlap(state.upgradeOfferingRules, draft) else null
    val invalid = when {
        overlap != null -> "There is already a rule that covers +${overlap.floor} to +${overlap.ceiling}."
        !manual && (draft.floor >= draft.ceiling || draft.ceiling > max) -> "Choose a higher destination level."
        manual && (stock[draft.offering] ?: 0) == 0 -> "This offering is no longer available."
        else -> ""
    }
    val name = catalogFor(item.name)?.name ?: item.name
    val title = if (manual) "Confirm upgrade" else if (rule != null) "Edit upgrade rule" else "Add upgrade rule"
    fun confirm() {
        if (busy || invalid.isNotEmpty()) return
        busy = true
        error = ""
        scope.launch {
            val result: ApiResult<CommandResult> = if (source != null) {
                viewModel.api.itemCommand("upgrade-mark", character, item, source.slot, buildMap {
                    if (source.equipped) put("equipped", JsonPrimitive(true))
                    put("tiers", JsonPrimitive(1))
                    put("offering", JsonPrimitive(draft.offering))
                })
            } else viewModel.api.saveOfferingRule(character, draft.id, draft.name, draft.floor, draft.ceiling, draft.offering, draft.required)
            busy = false
            when (result) {
                is ApiResult.Failure -> error = result.message.ifEmpty { "Could not save upgrade" }
                is ApiResult.Success -> {
                    viewModel.refreshDynamicStateNow()
                    onClose()
                }
            }
        }
    }

    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp).border(1.dp, Sky, RoundedCornerShape(6.dp)).padding(start = 16.dp, top = 10.dp, end = 10.dp, bottom = 10.dp)
            .semantics { contentDescription = title },
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(title, fontWeight = FontWeight.Medium, style = MaterialTheme.typography.bodySmall)
        Text(
            if (manual) "Use ${UPGRADE_OFFERING_LABELS[draft.offering]} to upgrade $name from +$level to +${level + 1}?" else "Use an offering during automatic upgrades within this level range.",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            OfferingIcon(viewModel, item.name)
            Text(name, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(start = 8.dp))
        }
        if (manual) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                OfferingIcon(viewModel, draft.offering)
                Text(UPGRADE_OFFERING_LABELS[draft.offering] ?: draft.offering, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(start = 8.dp))
            }
        } else {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.Center) {
                Text("When upgrading from", style = MaterialTheme.typography.bodySmall, modifier = Modifier.align(Alignment.CenterVertically))
                LevelMenu("Starting level", draft.floor, (0 until max).toList(), !busy) { draft = draft.copy(floor = it) }
                Text("to", style = MaterialTheme.typography.bodySmall, modifier = Modifier.align(Alignment.CenterVertically))
                LevelMenu("Ending level", draft.ceiling, (1..max).toList(), !busy, disabled = { it <= draft.floor }) { draft = draft.copy(ceiling = it) }
                Text("use", style = MaterialTheme.typography.bodySmall, modifier = Modifier.align(Alignment.CenterVertically))
                Box {
                    OutlinedButton(enabled = !busy, onClick = { offeringMenu = true }, modifier = Modifier.semantics { contentDescription = "Upgrade offering" }) {
                        Text(UPGRADE_OFFERING_LABELS[draft.offering] ?: draft.offering)
                    }
                    DropdownMenu(expanded = offeringMenu, onDismissRequest = { offeringMenu = false }) {
                        for ((id, label) in UPGRADE_OFFERING_LABELS) DropdownMenuItem(text = { Text(label) }, onClick = { offeringMenu = false; draft = draft.copy(offering = id) })
                    }
                }
            }
            for ((required, label) in listOf(true to "Required to attempt upgrade", false to "Only if item is available")) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable(enabled = !busy) { draft = draft.copy(required = required) }) {
                    RadioButton(selected = draft.required == required, onClick = { draft = draft.copy(required = required) }, enabled = !busy)
                    Text(label, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        (invalid.ifEmpty { error }).takeIf { it.isNotEmpty() }?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(enabled = !busy, onClick = onClose) { Text("Cancel") }
            Button(enabled = !busy && invalid.isEmpty(), onClick = { confirm() }) { Text(if (busy) "Saving…" else "Confirm") }
        }
    }
}

private val previewJson = Json { ignoreUnknownKeys = true }

/** upgrade-preview-panel.tsx: the merchant's stored server preview for the
 *  next attempt (no offering and each offering), polled every 2 s, with
 *  "Refresh chances" to queue a new one. Only for the merchant's own
 *  inventory items. */
@Composable
fun UpgradePreviewPanel(viewModel: PartyViewModel, item: Item, source: OfferingSource?, character: String) {
    val state by viewModel.dynamicState.collectAsState()
    val executor = state.merchantCharacter
    var revision by remember { mutableIntStateOf(0) }
    var queueNext by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<JsonObject?>(null) }
    var status by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val body = remember(character, source, item) {
        JsonObject(buildMap {
            put("character", JsonPrimitive(character))
            source?.let {
                put("slot", it.slot)
                if (it.equipped) put("equipped", JsonPrimitive(true))
            }
            put("item", previewJson.encodeToJsonElement(Item.serializer(), item))
        })
    }
    val unavailable = when {
        executor == null -> "No merchant configured"
        source == null || source.equipped || character != executor -> "Item not in merchant inventory"
        else -> ""
    }
    LaunchedEffect(body, executor, revision, unavailable) {
        result = null
        status = null
        error = null
        if (unavailable.isNotEmpty()) return@LaunchedEffect
        var queue = queueNext
        queueNext = false
        while (isActive) {
            when (val response = viewModel.api.upgradePreview(JsonObject(body + ("refresh" to JsonPrimitive(queue))))) {
                is ApiResult.Failure -> { error = response.message; result = null; status = null }
                is ApiResult.Success -> {
                    error = null
                    result = response.value["result"] as? JsonObject
                    status = (response.value["status"] as? JsonPrimitive)?.content
                }
            }
            queue = false
            delay(2000)
        }
    }
    val statusText = unavailable.ifEmpty { null } ?: error ?: when (status) {
        "queued" -> "Queued — waiting for merchant priority"
        "running" -> "Refreshing chances…"
        "unavailable" -> "No chances calculated - resolve the missing supplies and refresh"
        "partial" -> "Some chances saved - see unavailable options below"
        "complete" -> "Stored preview — valid until the next upgrade"
        "invalidated" -> "Upgrade performed — refresh chances again"
        else -> "Choose Refresh chances to queue a preview"
    }
    val time = remember { SimpleDateFormat("h:mm:ss a", Locale.getDefault()) }
    val options = result?.get("options") as? JsonObject
    val level = item.level ?: 0
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(6.dp)).padding(10.dp)
            .semantics { contentDescription = "Upgrade chances" },
    ) {
        Text("Next attempt: +$level → +${level + 1}", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall)
        Text("Server preview" + (executor?.let { " · $it" } ?: ""), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(statusText, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 8.dp))
        for (option in PREVIEW_OPTIONS) {
            val value = options?.get(option) as? JsonObject
            val chance = ((value?.get("preview") as? JsonObject)?.get("chance") as? JsonPrimitive)?.content?.toDoubleOrNull()
            Row(modifier = Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(if (option == "none") "No offering" else UPGRADE_OFFERING_LABELS[option] ?: option, style = MaterialTheme.typography.bodySmall)
                if (chance != null) {
                    Column(horizontalAlignment = Alignment.End) {
                        Text("${"%.2f".format(minOf(1.0, chance) * 100)}%", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall)
                        (value["observedAt"] as? JsonPrimitive)?.content?.toDoubleOrNull()?.let { Text(time.format(Date(it.toLong())), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                } else {
                    Text(
                        unavailable.ifEmpty { null } ?: error ?: (value?.get("reason") as? JsonPrimitive)?.content ?: "Not calculated",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        OutlinedButton(
            enabled = unavailable.isEmpty() && status != "queued" && status != "running",
            onClick = { queueNext = true; revision++ },
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        ) { Text("Refresh chances") }
        Text("Chances can change before upgrading. The server preview excludes the separate lucky-slot roll bonus.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
    }
}

/** upgrade-actions.tsx's offering rows under Mark for upgrade: "Upgrade with
 *  X" (needs stock and a source) and, beside them, the server preview. */
@Composable
fun OfferingRows(viewModel: PartyViewModel, character: String, item: Item, meta: ItemMeta?, source: OfferingSource? = null, enabled: Boolean = true) {
    val state by viewModel.dynamicState.collectAsState()
    var picked by remember(item) { mutableStateOf<String?>(null) }
    Column(modifier = Modifier.padding(start = 16.dp, top = 4.dp, bottom = 4.dp)) {
        HorizontalDivider()
        for ((id, label) in UPGRADE_OFFERING_LABELS) {
            TextButton(
                enabled = enabled && (state.upgradeOfferingStock[id] ?: 0) > 0 && source != null,
                onClick = { picked = id },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Upgrade with $label", modifier = Modifier.fillMaxWidth()) }
        }
        picked?.let { OfferingDialog(viewModel, character, item, meta, source, it, onClose = { picked = null }) }
        if (enabled) UpgradePreviewPanel(viewModel, item, source, character)
    }
}

/** upgrade-actions.tsx's "Add upgrade rule" under Auto mark for upgrade. */
@Composable
fun AddUpgradeRule(viewModel: PartyViewModel, character: String, item: Item, meta: ItemMeta?, enabled: Boolean = true) {
    var open by remember(item) { mutableStateOf(false) }
    Column(modifier = Modifier.padding(start = 16.dp)) {
        HorizontalDivider(modifier = Modifier.padding(top = 4.dp))
        TextButton(enabled = enabled, onClick = { open = true }, modifier = Modifier.fillMaxWidth()) { Text("Add upgrade rule", modifier = Modifier.fillMaxWidth()) }
        if (open) OfferingDialog(viewModel, character, item, meta, onClose = { open = false })
    }
}
