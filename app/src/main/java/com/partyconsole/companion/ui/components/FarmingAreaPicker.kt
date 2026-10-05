package com.partyconsole.companion.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.material.icons.filled.Close
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
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
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.domain.Area
import com.partyconsole.companion.domain.CatalogMonster
import com.partyconsole.companion.domain.defaultPhoenixOrder
import com.partyconsole.companion.domain.farmingAreas
import com.partyconsole.companion.model.BestiaryMonster
import com.partyconsole.companion.model.MapLocation
import com.partyconsole.companion.model.MonsterChoice
import com.partyconsole.companion.model.MonsterSpawnRecord
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import kotlinx.coroutines.launch
import kotlin.math.hypot
import kotlin.math.roundToLong

private val SPAWN_REASONS = mapOf(
    "ignore" to "Ignored map",
    "instance" to "Instance-only map",
    "irregular" to "Special-access map",
    "zero-count" to "Zero-count spawn; no regular population",
    "missing-map" to "Map definition unavailable",
    "invalid-geometry" to "Spawn coordinates unavailable",
)

private fun coordinate(value: Double) = if (value == Math.floor(value)) value.roundToLong().toString() else value.toString()

/** monster-spawns.tsx: every recorded spawn and why ordinary routing can't use it. */
@Composable
fun MonsterSpawns(records: List<MonsterSpawnRecord>?) {
    Column(modifier = Modifier.fillMaxWidth().border(1.dp, Color(0xFF065F46), RoundedCornerShape(4.dp)).padding(12.dp)) {
        Text("Recorded spawn locations", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(bottom = 8.dp))
        when {
            records == null -> Text("Waiting for refreshed spawn data.", style = MaterialTheme.typography.bodySmall)
            records.isEmpty() -> Text("No static spawn recorded in game data.", style = MaterialTheme.typography.bodySmall)
            else -> for (record in records) {
                Text(
                    "${record.mapName ?: record.map} (${record.map})" +
                        (if (record.x != null && record.y != null && record.x.isFinite() && record.y.isFinite()) " · (${coordinate(record.x)}, ${coordinate(record.y)})" else "") +
                        (record.count?.let { " · Count: $it" } ?: ""),
                    style = MaterialTheme.typography.bodySmall,
                )
                Text(
                    if (record.restrictions.isNotEmpty()) "${record.restrictions.joinToString("; ") { SPAWN_REASONS[it] ?: it }}. Ordinary hunt routing unavailable." else "Available for ordinary hunt routing.",
                    color = if (record.restrictions.isNotEmpty()) Color(0xFFF59E0B) else Color(0xFF06B6D4),
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(bottom = 8.dp),
                )
            }
        }
    }
}

/** farming-area-picker.tsx (the PWA's FarmingAreaPicker.tsx): Hunt backup
 *  setup ([preparation], with the monster picker inline), Phoenix's ordered
 *  5-region patrol, or the general "choose a farming area" list grouped by
 *  how many selected monsters share each area and ranked by the saved
 *  waypoint, then proximity. The selected area shows FarmingAreaPreview
 *  with the legend and "Enlarge map" (a full-screen view). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FarmingAreaPicker(
    catalog: List<MonsterChoice>,
    bestiaryCatalog: List<BestiaryMonster>,
    ids: List<String>,
    onIdsChange: ((List<String>) -> Unit)? = null,
    character: MapLocation? = null,
    waypoint: MapLocation? = null,
    override: Boolean = false,
    radius: Int,
    busy: Boolean,
    preparation: Boolean = false,
    savedPhoenixOrder: List<String> = emptyList(),
    onCancel: () -> Unit,
    onStart: suspend (Area, List<String>?) -> Unit,
    // The map preview's source (definitions are cached on the view model).
    viewModel: com.partyconsole.companion.ui.PartyViewModel? = null,
) {
    var large by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val phoenix = "phoenix" in ids && !preparation
    val zoneCatalog = remember(catalog) { catalog.map { CatalogMonster(it.id, it.locations) } }
    val areas = remember(zoneCatalog, ids, phoenix) { farmingAreas(zoneCatalog, if (phoenix) listOf("phoenix") else ids) }
    fun startingOrder(candidates: List<Area>): List<String> {
        val saved = savedPhoenixOrder.filter { id -> candidates.any { it.id == id } }
        return if (saved.size == 5 && saved.toSet().size == 5) saved else defaultPhoenixOrder(candidates)
    }
    var search by remember { mutableStateOf("") }
    // Reset the chosen area/order whenever the monster selection changes.
    var choice by remember(ids) { mutableStateOf<String?>(null) }
    var order by remember(ids) { mutableStateOf(if (phoenix) startingOrder(areas) else emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var fairyNote by remember { mutableStateOf(false) }

    val highest = areas.firstOrNull()?.monsterIds?.size
    val preferred = areas.filter { it.monsterIds.size == highest }.minByOrNull { area ->
        when {
            waypoint != null && area.map == waypoint.map && area.x == waypoint.x && area.y == waypoint.y -> -1.0
            character != null && area.map == character.map -> hypot(area.x - character.x, area.y - character.y)
            else -> Double.MAX_VALUE
        }
    }
    val selected = if (choice == null) preferred else areas.find { it.id == choice }
    fun choiceFor(id: String) = catalog.find { it.id == id }
    fun nameOf(id: String) = choiceFor(id)?.name ?: bestiaryCatalog.find { it.id == id }?.name ?: id
    fun spriteOf(id: String) = choiceFor(id)?.sprite ?: bestiaryCatalog.find { it.id == id }?.sprite
    fun group(a: Area) = when {
        ids.size == 1 -> "Spawn areas"
        a.monsterIds.size == ids.size -> "Shared by all selected monsters"
        a.monsterIds.size > 1 -> "Shared by ${a.monsterIds.size} selected monsters"
        else -> nameOf(a.monsterIds[0])
    }
    val query = search.trim().lowercase()
    val monsterOptions = if (preparation) catalog.filter { "${it.name.orEmpty()} ${it.id}".lowercase().contains(query) } else emptyList()

    Column(modifier = Modifier.fillMaxWidth().padding(top = 8.dp).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(6.dp)).padding(8.dp)) {
        Text(if (phoenix) "Choose Phoenix search order" else if (preparation) "Getting ready to hunt" else "Choose a farming area", fontWeight = FontWeight.Medium, style = MaterialTheme.typography.bodySmall)
        Text(
            when {
                phoenix -> "Select all five regions in the order to search. Tap a selected region to remove it. Starting selects Phoenix alone."
                preparation -> "Select backup farming monsters and an area. Hunt will return here when it ends."
                override -> "Starting selects this monster, switches farming to Auto, leaves the current combat event, and starts a party convoy."
                else -> "Choose a waypoint for the selected monsters. Your monster selections and hunt radius stay the same."
            },
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 8.dp),
        )

        if (preparation && onIdsChange != null) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(if (ids.isNotEmpty()) ids.joinToString(", ") { nameOf(it) } else "No monsters selected", style = MaterialTheme.typography.bodySmall, maxLines = 1, modifier = Modifier.weight(1f))
                Text("${ids.size}", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, modifier = Modifier.semantics { contentDescription = "Selected monster count" })
                OutlinedButton(enabled = ids.isNotEmpty(), onClick = { onIdsChange(emptyList()) }) { Text("Clear all") }
            }
            OutlinedTextField(search, { search = it }, placeholder = { Text("Search monsters...") }, singleLine = true, modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp))
            Column(modifier = Modifier.heightIn(max = 160.dp).verticalScroll(rememberScrollState())) {
                for (monster in monsterOptions) {
                    // monster-focus-picker.tsx: Fairy has no verified regular spawn route.
                    if (monster.id == "tinyp") {
                        Row(modifier = Modifier.fillMaxWidth().clickable { fairyNote = true }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            SpriteIcon(monster.sprite, size = 24.dp)
                            Text("${monster.name ?: monster.id} · ${monster.id}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f).padding(start = 8.dp))
                            Text("Disabled", style = MaterialTheme.typography.labelSmall, color = Color(0xFFFDE68A))
                        }
                    } else {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(checked = monster.id in ids, onCheckedChange = { onIdsChange(if (monster.id in ids) ids - monster.id else ids + monster.id) })
                            SpriteIcon(monster.sprite, size = 24.dp)
                            Text("${monster.name ?: monster.id} · ${monster.id}", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(start = 8.dp))
                        }
                    }
                }
            }
            if (fairyNote) Text("Fairy has no verified regular spawn route. Enable “Passively hunt fairy” to attack on sight.", style = MaterialTheme.typography.bodySmall, color = Color(0xFFFEF3C7), modifier = Modifier.padding(top = 8.dp).border(1.dp, Color(0xFFD97706), RoundedCornerShape(4.dp)).padding(8.dp))
        }

        if (phoenix) OutlinedButton(enabled = !busy, onClick = { order = emptyList() }, modifier = Modifier.padding(bottom = 8.dp)) { Text("Clear order (${order.size}/5)") }

        Column(modifier = Modifier.heightIn(max = 256.dp).verticalScroll(rememberScrollState())) {
            if (areas.isEmpty()) {
                Text("No ordinary hunt routes available for these monsters.", color = Color(0xFFF59E0B), style = MaterialTheme.typography.bodySmall)
                for (id in ids) {
                    Text(nameOf(id), fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp, bottom = 4.dp))
                    MonsterSpawns(choiceFor(id)?.spawnRecords)
                }
            }
            areas.forEachIndexed { index, area ->
                val isSelected = if (phoenix) area.id in order else selected?.id == area.id
                if (index == 0 || group(areas[index - 1]) != group(area)) {
                    Text(group(area), fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp, bottom = 4.dp))
                }
                Box(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp)
                        .border(1.dp, if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(6.dp))
                        .background(if (isSelected) MaterialTheme.colorScheme.primary.copy(alpha = 0.1f) else Color.Transparent, RoundedCornerShape(6.dp))
                        .clickable(enabled = !busy) {
                            choice = area.id
                            error = null
                            if (phoenix) order = if (area.id in order) order - area.id!! else order + area.id!!
                        }
                        .padding(10.dp),
                ) {
                    Column(modifier = Modifier.padding(end = 32.dp)) {
                        Text("${area.mapName ?: area.map} (${Math.round(area.x)}, ${Math.round(area.y)})", fontWeight = FontWeight.Medium, style = MaterialTheme.typography.bodySmall)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 4.dp)) {
                            for (id in area.monsterIds) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    SpriteIcon(spriteOf(id), size = 18.dp)
                                    Text(nameOf(id), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 4.dp))
                                }
                            }
                        }
                    }
                    if (phoenix && area.id in order) {
                        Box(
                            modifier = Modifier.align(Alignment.TopEnd).size(24.dp).border(1.dp, MaterialTheme.colorScheme.primary, CircleShape).background(MaterialTheme.colorScheme.primary.copy(alpha = 0.2f), CircleShape),
                            contentAlignment = Alignment.Center,
                        ) { Text("${order.indexOf(area.id) + 1}", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelSmall) }
                    }
                }
            }
        }
        if (selected != null && viewModel != null) {
            com.partyconsole.companion.ui.map.FarmingAreaPreview(viewModel, selected, radius, modifier = Modifier.padding(top = 8.dp))
        }
        if (selected != null) {
            Text("Cyan: spawn area · White: waypoint", color = Color(0xFFA5F3FC), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp))
            Text(if (phoenix) "Search uses shared sightings and overlapping visibility coverage." else "Gold circle: hunt radius ($radius)", color = Color(0xFFFDE68A), style = MaterialTheme.typography.bodySmall)
        }
        if (selected != null && viewModel != null) OutlinedButton(onClick = { large = true }, modifier = Modifier.padding(top = 8.dp)) { Text("Enlarge map") }
        if (large && selected != null && viewModel != null) {
            androidx.compose.ui.window.Dialog(onDismissRequest = { large = false }, properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)) {
                androidx.compose.material3.Surface(
                    modifier = Modifier.fillMaxSize().semantics { contentDescription = "${selected.mapName ?: selected.map} farming area" },
                    color = Color(0xFF081713),
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                            Text("${selected.mapName ?: selected.map} farming area", fontWeight = FontWeight.Medium, color = Color(0xFFECFDF5), modifier = Modifier.weight(1f))
                            androidx.compose.material3.IconButton(onClick = { large = false }, modifier = Modifier.semantics { contentDescription = "Close enlarged map" }) {
                                androidx.compose.material3.Icon(androidx.compose.material.icons.Icons.Filled.Close, contentDescription = null, tint = Color(0xFFD1FAE5))
                            }
                        }
                        androidx.compose.foundation.layout.BoxWithConstraints(modifier = Modifier.fillMaxWidth().weight(1f)) {
                            com.partyconsole.companion.ui.map.FarmingAreaPreview(viewModel, selected, radius, modifier = Modifier.height(maxHeight))
                        }
                    }
                }
            }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp)) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.align(Alignment.End).padding(top = 8.dp)) {
            OutlinedButton(enabled = !busy, onClick = onCancel) { Text("Cancel") }
            Button(
                enabled = !busy && if (phoenix) order.size == 5 else selected != null,
                onClick = {
                    val starting = (if (phoenix) areas.find { it.id == order.firstOrNull() } else selected) ?: return@Button
                    error = null
                    scope.launch {
                        try {
                            onStart(starting, if (phoenix) order else null)
                        } catch (e: Exception) {
                            error = e.message ?: "Farming route failed"
                        }
                    }
                },
            ) { Text(if (busy) "Starting…" else if (phoenix) "Start Phoenix patrol" else if (preparation) "Save backup and start Hunt" else "Start farming") }
        }
    }
}
