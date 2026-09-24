package com.partyconsole.companion.ui.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
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
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.model.UPGRADE_OFFERING_LABELS
import com.partyconsole.companion.model.UpgradeOfferingRule
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.itemdetail.itemMaximumLevel
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import kotlinx.coroutines.launch

/** upgrade-offering-controls.tsx's rule list ("Upgrade rules" accordion
 *  under the inventory panel) ported as its own screen - "use a Primling/
 *  Primordial Essence/Primordial X instead of scrolls" during AUTOMATIC
 *  upgrades within a level range, entirely missing from both clients
 *  before this. The dashboard's MANUAL "use an offering on this one item
 *  right now" path is not ported - the standing-rule system here is the
 *  actual account-wide automation this screen exists for. */
@Composable
fun OfferingsScreen(viewModel: PartyViewModel, onBack: () -> Unit) {
    val dynamicState by viewModel.dynamicState.collectAsState()
    val characters by viewModel.characters.collectAsState()
    val scope = rememberCoroutineScope()
    var editing by remember { mutableStateOf<Any?>(null) } // UpgradeOfferingRule, "new", or null
    var error by remember { mutableStateOf<String?>(null) }

    val catalog = dynamicState.merchantCatalog?.allItems ?: emptyList()
    fun catalogFor(id: String): CatalogItem? = catalog.find { it.id == id }
    val merchant = characters.entries.find { it.value.vitals?.ctype == "merchant" }?.key
    val rules = dynamicState.upgradeOfferingRules

    fun remove(id: String) {
        val owner = merchant ?: return
        scope.launch {
            error = null
            when (val result = viewModel.api.removeOfferingRule(owner, id)) {
                is ApiResult.Failure -> error = result.message
                is ApiResult.Success -> viewModel.refreshDynamicStateNow()
            }
        }
    }

    AccountScreenScaffold("Upgrade offering rules", onBack, onRefresh = { scope.launch { viewModel.refreshDynamicStateNow() } }) {
        Column(modifier = Modifier.fillMaxSize()) {
            Text(
                "Uses a Primling/Primordial Essence/Primordial X instead of scrolls during automatic upgrades within a level range.",
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(12.dp),
            )
            Button(onClick = { editing = "new" }, enabled = merchant != null, modifier = Modifier.padding(horizontal = 12.dp)) { Text("Add rule") }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(12.dp)) }

            if (rules.isEmpty()) {
                EmptyState("No upgrade offering rules.")
            } else {
                LazyColumn(modifier = Modifier.weight(1f), contentPadding = PaddingValues(12.dp)) {
                    items(rules) { rule ->
                        Card(modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                            Row(modifier = Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                                SpriteIcon(catalogFor(rule.name)?.sprite, size = 32.dp)
                                Column(modifier = Modifier.weight(1f).padding(start = 8.dp)) {
                                    Text(catalogFor(rule.name)?.name ?: rule.name, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
                                    Text(
                                        "+${rule.floor} → +${rule.ceiling} · ${UPGRADE_OFFERING_LABELS[rule.offering] ?: rule.offering} · ${if (rule.required) "Required" else "When available"}",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                androidx.compose.material3.OutlinedButton(onClick = { editing = rule }) { Text("Edit") }
                                Button(onClick = { remove(rule.id) }, modifier = Modifier.padding(start = 4.dp)) { Text("Remove") }
                            }
                        }
                    }
                }
            }
        }
    }

    val editingRule = editing as? UpgradeOfferingRule
    if ((editing == "new" || editingRule != null) && merchant != null) {
        RuleFormOverlay(rule = editingRule, catalog = catalog, merchant = merchant, viewModel = viewModel, onClose = { editing = null })
    }
}

@Composable
private fun RuleFormOverlay(rule: UpgradeOfferingRule?, catalog: List<CatalogItem>, merchant: String, viewModel: PartyViewModel, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    var itemId by remember { mutableStateOf(rule?.name ?: "") }
    var search by remember { mutableStateOf("") }
    var floor by remember { mutableStateOf(rule?.floor ?: 0) }
    var ceiling by remember { mutableStateOf(rule?.ceiling ?: 1) }
    var offering by remember { mutableStateOf(rule?.offering ?: "offeringp") }
    var required by remember { mutableStateOf(rule?.required ?: true) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val selectedCatalogItem = catalog.find { it.id == itemId }
    val max = itemMaximumLevel(selectedCatalogItem?.meta)
    val upgradeable = catalog.filter { it.upgradeable && it.name.contains(search, ignoreCase = true) }.take(100)

    androidx.compose.ui.window.Dialog(onDismissRequest = onClose, properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)) {
        androidx.compose.material3.Surface(modifier = Modifier.fillMaxSize()) {
            Column(modifier = Modifier.fillMaxSize().padding(12.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text(if (rule != null) "Edit upgrade rule" else "Add upgrade rule", style = MaterialTheme.typography.titleSmall)
                    androidx.compose.material3.TextButton(onClick = onClose) { Text("Close") }
                }
                Column(modifier = Modifier.weight(1f)) {
                    if (rule == null) {
                        OutlinedTextField(value = search, onValueChange = { search = it }, label = { Text("Search upgradeable items...") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        LazyColumn(modifier = Modifier.fillMaxWidth().padding(top = 4.dp), contentPadding = PaddingValues(vertical = 4.dp)) {
                            items(upgradeable) { item ->
                                androidx.compose.material3.TextButton(
                                    onClick = {
                                        itemId = item.id
                                        floor = 0
                                        ceiling = minOf(1, itemMaximumLevel(item.meta))
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                        SpriteIcon(item.sprite, size = 24.dp)
                                        Text(item.name, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(start = 8.dp))
                                    }
                                }
                            }
                        }
                    }
                    if (selectedCatalogItem != null) {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 8.dp)) {
                            SpriteIcon(selectedCatalogItem.sprite, size = 32.dp)
                            Text(selectedCatalogItem.name, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(start = 8.dp))
                        }
                    }
                    if (itemId.isNotEmpty()) {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 8.dp)) {
                            Text("From +$floor to +$ceiling", style = MaterialTheme.typography.bodyMedium)
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 4.dp)) {
                            androidx.compose.material3.OutlinedButton(onClick = { if (floor > 0) floor -= 1 }) { Text("Floor -") }
                            androidx.compose.material3.OutlinedButton(onClick = { if (floor + 1 < ceiling) floor += 1 }) { Text("Floor +") }
                            androidx.compose.material3.OutlinedButton(onClick = { if (ceiling - 1 > floor) ceiling -= 1 }) { Text("Ceiling -") }
                            androidx.compose.material3.OutlinedButton(onClick = { if (ceiling < max) ceiling += 1 }) { Text("Ceiling +") }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 8.dp)) {
                            for ((id, label) in UPGRADE_OFFERING_LABELS) {
                                FilterChip(selected = offering == id, onClick = { offering = id }, label = { Text(label) })
                            }
                        }
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 8.dp)) {
                            RadioButton(selected = required, onClick = { required = true })
                            Text("Required to attempt upgrade", style = MaterialTheme.typography.bodySmall)
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(selected = !required, onClick = { required = false })
                            Text("Only if item is available", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                }
                Button(
                    enabled = !saving && itemId.isNotEmpty() && floor < ceiling,
                    onClick = {
                        scope.launch {
                            saving = true
                            error = null
                            when (val result = viewModel.api.saveOfferingRule(merchant, rule?.id ?: "", itemId, floor, ceiling, offering, required)) {
                                is ApiResult.Failure -> error = result.message
                                is ApiResult.Success -> {
                                    viewModel.refreshDynamicStateNow()
                                    onClose()
                                }
                            }
                            saving = false
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (saving) "Saving..." else "Confirm") }
            }
        }
    }
}
