package com.partyconsole.companion.ui.account

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
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
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.domain.CatalogComparisonEntry
import com.partyconsole.companion.domain.ComparisonSource
import com.partyconsole.companion.domain.EQUIPMENT_TYPES
import com.partyconsole.companion.domain.comparisonEntry
import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.components.localeAmount
import com.partyconsole.companion.ui.itemdetail.ITEM_DETAIL_PROPERTY_RANK
import com.partyconsole.companion.ui.itemdetail.ItemDetailBrowser
import com.partyconsole.companion.ui.itemdetail.STAT_SCROLLS
import com.partyconsole.companion.ui.itemdetail.itemMaximumLevel
import com.partyconsole.companion.ui.itemdetail.propertiesAtLevel
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.abs
import kotlin.math.roundToInt

private val SORTS = listOf(
    "tier" to "Tier", "name" to "Name", "set" to "Set", "value" to "Default value", "attack" to "Attack", "armor" to "Armor", "resistance" to "Resistance",
    "stat" to "Stat", "str" to "STR", "int" to "INT", "dex" to "DEX", "vit" to "VIT", "speed" to "Speed", "frequency" to "Attack speed", "range" to "Range",
    "apiercing" to "Armor piercing", "rpiercing" to "Resistance piercing", "pnresistance" to "Poison resistance", "firesistance" to "Fire resistance",
    "fzresistance" to "Freeze resistance", "phresistance" to "Physical resistance", "stresistance" to "Status resistance", "evasion" to "Evasion",
    "crit" to "Critical", "luck" to "Luck",
)

private fun CatalogItem.def(key: String) = meta?.definition?.get(key) as? JsonPrimitive
private fun CatalogItem.type() = def("type")?.content.orEmpty()
private fun CatalogItem.value(key: String): Double =
    (meta?.properties?.get(key) as? JsonPrimitive)?.content?.toDoubleOrNull() ?: def(key)?.content?.toDoubleOrNull() ?: 0.0
private fun jsNumber(value: Double) = if (value == Math.floor(value) && value.isFinite()) value.toLong().toString() else value.toString()

/** The equipment catalog: search by name / id / set, the 25 sorts with the
 *  sorted stat on each tile, type and class filters with "Exclusive gear",
 *  the result line, and details on tap. Opened from item details' "From
 *  catalog", it collects up to three alternatives against A and shows the
 *  catalog comparison. Rows render lazily. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun CatalogScreen(viewModel: PartyViewModel, onBack: () -> Unit) {
    val state by viewModel.dynamicState.collectAsState()
    val source by viewModel.catalogComparison.collectAsState()
    val scope = rememberCoroutineScope()
    val catalog = state.merchantCatalog?.allItems.orEmpty()
    var search by remember { mutableStateOf("") }
    var types by remember { mutableStateOf<List<String>>(emptyList()) }
    var selectedClasses by remember { mutableStateOf<List<String>>(emptyList()) }
    var exclusiveGear by remember { mutableStateOf(false) }
    var sort by remember { mutableStateOf("tier") }
    var sortMenu by remember { mutableStateOf(false) }
    var inspecting by remember { mutableStateOf<CatalogItem?>(null) }
    var entries by remember { mutableStateOf<List<CatalogComparisonEntry>>(emptyList()) }
    var viewComparison by remember { mutableStateOf(false) }
    // A new comparison source restarts the comparison.
    LaunchedEffect(source) {
        inspecting = null
        entries = source?.let { listOf(comparisonEntry(it)) }.orEmpty()
        viewComparison = false
        source?.let {
            types = listOfNotNull((it.meta?.definition?.get("type") as? JsonPrimitive)?.content?.ifEmpty { null })
            search = ""
            selectedClasses = emptyList()
            exclusiveGear = false
        }
    }
    val equipment = remember(catalog) { catalog.filter { it.type() in EQUIPMENT_TYPES } }
    val availableTypes = remember(equipment) { equipment.map { it.type() }.distinct().sorted() }
    val availableClasses = remember(equipment) {
        equipment.flatMap { item -> item.meta?.usage?.classes.orEmpty().map { it.id to it.name } }.toMap().entries.sortedBy { it.value }
    }
    val query = search.trim().lowercase()
    val rows = equipment
        .filter { item ->
            (query.isEmpty() || "${item.name} ${item.id} ${item.def("set")?.content.orEmpty()}".lowercase().contains(query)) &&
                (types.isEmpty() || item.type() in types) &&
                (selectedClasses.isEmpty() || run {
                    val eligible = item.meta?.usage?.classes.orEmpty().map { it.id }.toSet()
                    selectedClasses.all { it in eligible } && (!exclusiveGear || eligible.size == selectedClasses.size)
                })
        }
        .sortedWith { a, b ->
            when (sort) {
                "name" -> a.name.compareTo(b.name)
                "set" -> (a.def("set")?.content ?: "zzz").compareTo(b.def("set")?.content ?: "zzz").takeIf { it != 0 } ?: a.name.compareTo(b.name)
                "value" -> b.value("g").compareTo(a.value("g")).takeIf { it != 0 } ?: a.name.compareTo(b.name)
                else -> b.value(sort).compareTo(a.value(sort)).takeIf { it != 0 } ?: a.name.compareTo(b.name)
            }
        }
    val comparing = source != null && entries.isNotEmpty()
    val selectedIds = entries.drop(1).map { it.entry.item.name }
    fun cancelComparison() { viewModel.catalogComparison.value = null }
    val sourceName = source?.let { (it.meta?.definition?.get("name") as? JsonPrimitive)?.content ?: it.item.name }.orEmpty()

    if (comparing && viewComparison) {
        AccountScreenScaffold("Compare catalog items", onBack) {
            Column(modifier = Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Compare up to three alternatives against item A.", style = MaterialTheme.typography.labelSmall, color = Color(0xFFCBD5E1))
                OutlinedButton(onClick = { viewComparison = false }) { Text("Back to catalog · ${maxOf(0, entries.size - 1)}/3 selected") }
                CatalogComparison(
                    entries,
                    onChange = { index, value -> entries = entries.mapIndexed { i, e -> if (i == index) value else e } },
                    onRemove = { index -> entries = entries.filterIndexed { i, _ -> i != index } },
                )
            }
        }
        return
    }

    AccountScreenScaffold("Equipment catalog", onBack, onRefresh = { scope.launch { viewModel.refreshDynamicStateNow() } }) {
        LazyVerticalGrid(columns = GridCells.Fixed(2), modifier = Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item(span = { GridItemSpan(2) }) {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Every equippable item in the current game data. Click an item for its full details and WTB action.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (comparing) {
                        FlowRow(
                            modifier = Modifier.fillMaxWidth().border(1.dp, Color(0xFF0E7490), RoundedCornerShape(4.dp)).padding(12.dp).semantics { contentDescription = "Catalog comparison" },
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Text("A: $sourceName +${entries[0].level}", style = MaterialTheme.typography.bodySmall, modifier = Modifier.align(Alignment.CenterVertically))
                            Text("${entries.size - 1}/3 selected", style = MaterialTheme.typography.bodySmall, modifier = Modifier.align(Alignment.CenterVertically))
                            entries.drop(1).forEachIndexed { index, value ->
                                val name = (value.entry.meta?.definition?.get("name") as? JsonPrimitive)?.content ?: value.entry.item.name
                                OutlinedButton(onClick = { entries = entries.filterIndexed { i, _ -> i != index + 1 } }, modifier = Modifier.semantics { contentDescription = "Remove $name" }) {
                                    Text("${'B' + index}: $name ×")
                                }
                            }
                            OutlinedButton(enabled = entries.size >= 2, onClick = { viewComparison = true }) { Text("Compare selected") }
                            OutlinedButton(onClick = { cancelComparison() }) { Text("Cancel comparison") }
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(search, { search = it }, placeholder = { Text("Search equipment, ID, or set…") }, singleLine = true, modifier = Modifier.weight(1f))
                        Box {
                            OutlinedButton(onClick = { sortMenu = true }, modifier = Modifier.semantics { contentDescription = "Sort equipment" }) { Text(SORTS.first { it.first == sort }.second) }
                            DropdownMenu(expanded = sortMenu, onDismissRequest = { sortMenu = false }) {
                                for ((id, label) in SORTS) DropdownMenuItem(text = { Text(label) }, onClick = { sort = id; sortMenu = false })
                            }
                        }
                    }
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.semantics { contentDescription = "Equipment types" }) {
                        FilterChip(selected = types.isEmpty(), onClick = { types = emptyList() }, label = { Text("All") })
                        for (type in availableTypes) {
                            FilterChip(selected = type in types, onClick = { types = if (type in types) types - type else types + type }, label = { Text(type.replace('_', ' ')) })
                        }
                    }
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.semantics { contentDescription = "Usable by every selected class" }) {
                        FilterChip(selected = selectedClasses.isEmpty(), onClick = { selectedClasses = emptyList() }, label = { Text("All classes") })
                        for ((id, name) in availableClasses) {
                            FilterChip(selected = id in selectedClasses, onClick = { selectedClasses = if (id in selectedClasses) selectedClasses - id else selectedClasses + id }, label = { Text(name) })
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(checked = exclusiveGear, enabled = selectedClasses.isNotEmpty(), onCheckedChange = { exclusiveGear = it }, modifier = Modifier.semantics { contentDescription = "Exclusive gear" })
                            Text("Exclusive gear", style = MaterialTheme.typography.bodySmall, color = Color(0xFFCFFAFE))
                        }
                    }
                    Text(
                        ("${rows.size} item${if (rows.size == 1) "" else "s"} · sorted by ${SORTS.first { it.first == sort }.second}" +
                            if (selectedClasses.isNotEmpty()) if (exclusiveGear) " · usable only by the selected classes" else " · usable by every selected class" else "").uppercase(),
                        fontFamily = FontFamily.Monospace,
                        style = MaterialTheme.typography.labelSmall,
                        color = Color(0x8CA5F3FC),
                    )
                }
            }
            items(rows, key = { it.id }) { item ->
                val primary = if (sort != "tier" && sort !in setOf("name", "set", "value")) item.value(sort) else null
                Column {
                    Column(
                        modifier = Modifier.fillMaxWidth().border(1.dp, Color(0xFF083344), RoundedCornerShape(4.dp)).clickable { inspecting = item }.padding(8.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        SpriteIcon(item.sprite, size = 48.dp)
                        Text(item.name, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelSmall, maxLines = 1, modifier = Modifier.padding(top = 4.dp))
                        Text("${item.type()} · T${item.def("tier")?.content?.toDoubleOrNull()?.toInt() ?: 0}".uppercase(), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Color(0x73CFFAFE))
                        item.def("set")?.content?.ifEmpty { null }?.let { Text(it, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Color(0xFFC4B5FD), maxLines = 1) }
                        primary?.let { Text("${sort.uppercase()} ${jsNumber(it)}", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Color(0xFFFCD34D)) }
                    }
                    if (comparing) {
                        OutlinedButton(
                            enabled = item.id !in selectedIds && selectedIds.size < 3,
                            onClick = {
                                if (entries.size < 4 && entries.drop(1).none { it.entry.item.name == item.id }) entries = entries + comparisonEntry(ComparisonSource(-1, Item(name = item.id), item.meta))
                            },
                            modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                        ) { Text(if (item.id in selectedIds) "Added to compare" else "Add to compare", style = MaterialTheme.typography.labelSmall) }
                    }
                }
            }
        }
    }
    inspecting?.let { item ->
        ModalBottomSheet(onDismissRequest = { inspecting = null }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
            Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp)) {
                ItemDetailBrowser(rootItemId = item.id, rootLevel = 0, catalog = state.merchantCatalog, monsters = state.bestiaryCatalog, viewModel = viewModel, context = com.partyconsole.companion.ui.itemdetail.ItemDetailContext("Equipment catalog", -1))
            }
        }
    }
}

/** Item A as the baseline and up to three alternatives, each with a preview
 *  level and stat scroll; every stat difference is against A. */
@Composable
private fun CatalogComparison(entries: List<CatalogComparisonEntry>, onChange: (Int, CatalogComparisonEntry) -> Unit, onRemove: (Int) -> Unit) {
    val properties = entries.map { propertiesAtLevel(it.entry.meta, it.entry.item, it.level, it.stat.ifEmpty { null }) }
    // Ability parameters describe different effects; keep them with their named ability.
    val keys = properties.flatMap { it.keys }.distinct()
        .filter { key -> key !in setOf("level", "attr0", "attr1") && properties.any { (it[key] ?: 0.0).let { v -> v.isFinite() && v != 0.0 } } }
        .sortedWith(compareBy<String> { ITEM_DETAIL_PROPERTY_RANK[it] ?: 999 }.thenBy { it })
    val columnWidth = 176.dp
    Column(modifier = Modifier.fillMaxWidth().border(1.dp, Color(0xFF155E75), RoundedCornerShape(4.dp)).verticalScroll(rememberScrollState()).horizontalScroll(rememberScrollState())) {
        Text("Item stats only. Every difference is against A; character bonuses and passive damage are not included.", style = MaterialTheme.typography.bodySmall, color = Color(0xFFCBD5E1), modifier = Modifier.width(columnWidth * (entries.size + 1) / 1.5f).padding(12.dp))
        Row {
            Text("Stat", fontWeight = FontWeight.SemiBold, modifier = Modifier.width(96.dp).padding(12.dp))
            entries.forEachIndexed { index, value ->
                val entry = value.entry
                val name = (entry.meta?.definition?.get("name") as? JsonPrimitive)?.content ?: entry.item.name
                val label = ('A' + index).toString()
                Column(modifier = Modifier.width(columnWidth).padding(12.dp)) {
                    Text("$label${if (index == 0) " · Baseline" else " · vs A"}", fontWeight = FontWeight.SemiBold, color = Color(0xFFA5F3FC))
                    SpriteIcon(entry.meta?.sprite, size = 48.dp)
                    Text(name, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = 8.dp))
                    if (entry.meta?.upgradeable == true || entry.meta?.compoundable == true) {
                        val max = maxOf(entry.item.level ?: 0, itemMaximumLevel(entry.meta))
                        Row { Text("PREVIEW LEVEL", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Color(0xFFC4B5FD), modifier = Modifier.weight(1f)); Text("+${value.level}", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Color(0xFFC4B5FD)) }
                        Slider(
                            value = value.level.toFloat(),
                            onValueChange = { onChange(index, value.copy(level = it.roundToInt())) },
                            valueRange = 0f..maxOf(1, max).toFloat(),
                            steps = (max - 1).coerceAtLeast(0),
                            modifier = Modifier.semantics { contentDescription = "$label $name preview level" },
                        )
                    }
                    if (entry.meta?.definition?.get("stat") != null) {
                        var menu by remember { mutableStateOf(false) }
                        Box {
                            OutlinedButton(onClick = { menu = true }, modifier = Modifier.semantics { contentDescription = "$label $name stat scroll" }) {
                                Text(STAT_SCROLLS.find { it.stat == value.stat }?.label ?: "No stat scroll", style = MaterialTheme.typography.labelSmall)
                            }
                            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                                DropdownMenuItem(text = { Text("No stat scroll") }, onClick = { menu = false; onChange(index, value.copy(stat = "")) })
                                for (choice in STAT_SCROLLS) DropdownMenuItem(text = { Text(choice.label) }, onClick = { menu = false; onChange(index, value.copy(stat = choice.stat)) })
                            }
                        }
                    }
                    if (index > 0) OutlinedButton(onClick = { onRemove(index) }, modifier = Modifier.padding(top = 8.dp).semantics { contentDescription = "Remove $label $name" }) { Text("Remove") }
                }
            }
        }
        for (key in listOf("type", "wtype", "damage_type", "ability").filter { key -> entries.any { (it.entry.meta?.definition?.get(key) as? JsonPrimitive)?.content?.isNotEmpty() == true } }) {
            Row {
                Text(key.replace('_', ' ').replaceFirstChar { it.uppercase() }, color = Color(0xFFCBD5E1), style = MaterialTheme.typography.bodySmall, modifier = Modifier.width(96.dp).padding(12.dp))
                entries.forEachIndexed { index, value ->
                    val text = (value.entry.meta?.definition?.get(key) as? JsonPrimitive)?.content?.ifEmpty { null } ?: "—"
                    val extra = if (key == "ability" && value.entry.meta?.definition?.get("ability") != null) {
                        listOf("attr0", "attr1").mapNotNull { attr -> properties[index][attr]?.let { "${if (attr == "attr0") "Value" else "Secondary value"}: ${localeAmount(it)}" } }.joinToString(" ")
                    } else ""
                    Text((text + if (extra.isNotEmpty()) " $extra" else ""), style = MaterialTheme.typography.bodySmall, modifier = Modifier.width(columnWidth).padding(12.dp))
                }
            }
        }
        for (key in keys) {
            Row {
                Text(key.replace('_', ' ').replaceFirstChar { it.uppercase() }, color = Color(0xFFCBD5E1), style = MaterialTheme.typography.bodySmall, modifier = Modifier.width(96.dp).padding(12.dp))
                properties.forEachIndexed { index, props ->
                    val v = props[key] ?: 0.0
                    val baseline = properties[0][key] ?: 0.0
                    val delta = v - baseline
                    Text(
                        localeAmount(v) + if (index > 0) " (${if (delta > 0) "+" else ""}${localeAmount(delta)}${if (baseline != 0.0) " · ${if (delta > 0) "+" else ""}${localeAmount(delta / abs(baseline) * 100)}%" else ""})" else "",
                        fontFamily = FontFamily.Monospace,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.width(columnWidth).padding(12.dp).semantics { contentDescription = "$key ${'A' + index}" },
                    )
                }
            }
        }
    }
}
