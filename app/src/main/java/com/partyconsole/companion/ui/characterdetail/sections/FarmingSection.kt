package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
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
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.BestiaryMonster
import com.partyconsole.companion.model.MonsterChoice
import com.partyconsole.companion.model.MonsterSpawnRecord
import com.partyconsole.companion.model.Sprite
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import kotlinx.coroutines.launch

private val MODES = listOf(
    "auto" to "Auto",
    "default" to "Default",
    "scatter" to "Scatter",
    "hunt" to "Hunt",
)

/** farming-mode-control.tsx: this character's saved farming policy (scoped
 *  with `character`; a follower copies the leader) and its monster focus.
 *  Hunt settings + the blacklist are their own screen. */
@Composable
fun FarmingSection(
    characterName: String,
    farmingPolicy: String,
    followingLeader: String?,
    monsterFocus: List<String>,
    monsterSearchRadius: Int,
    monsterChoices: List<MonsterChoice>,
    bestiaryCatalog: List<BestiaryMonster>,
    viewModel: PartyViewModel,
    onOpenHuntSettings: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val loaded by viewModel.stateLoaded.collectAsState()
    var showFocus by remember(characterName) { mutableStateOf(false) }
    var pickingBackup by remember(characterName) { mutableStateOf(false) }
    var error by remember(characterName) { mutableStateOf<String?>(null) }

    SectionCard(title = "Farming") {
        Text(
            if (followingLeader != null) "Copy leader · used when Follow is off." else "Farming settings: $farmingPolicy",
            style = MaterialTheme.typography.labelSmall,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for ((id, label) in MODES) {
                FilterChip(
                    selected = farmingPolicy == id,
                    enabled = loaded && !pickingBackup,
                    onClick = {
                        error = null
                        if (id == "hunt") {
                            pickingBackup = true
                        } else {
                            scope.launch {
                                when (val result = viewModel.api.setFarmingMode(id, characterName)) {
                                    is ApiResult.Failure -> error = result.message
                                    is ApiResult.Success -> viewModel.refreshDynamicStateNow()
                                }
                            }
                        }
                    },
                    label = { Text(label) },
                )
            }
        }
        ConfigLoadingNote(loaded)
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }

        if (pickingBackup) {
            HuntBackupPicker(
                bestiaryCatalog = bestiaryCatalog,
                onCancel = { pickingBackup = false },
                onStart = { monsterIds, location ->
                    scope.launch {
                        when (val result = viewModel.api.setFarmingMode("hunt", characterName, monsterIds, location.map, location.x, location.y)) {
                            is ApiResult.Failure -> error = result.message
                            is ApiResult.Success -> {
                                pickingBackup = false
                                viewModel.refreshDynamicStateNow()
                            }
                        }
                    }
                },
            )
        }

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedButton(enabled = loaded, onClick = { showFocus = !showFocus }) { Text("$characterName's monster focus") }
            OutlinedButton(onClick = onOpenHuntSettings) { Text("Hunt settings...") }
        }
        if (showFocus) {
            MonsterFocusForm(
                characterName = characterName,
                monsterFocus = monsterFocus,
                monsterSearchRadius = monsterSearchRadius,
                monsterChoices = monsterChoices,
                viewModel = viewModel,
                onClose = { showFocus = false },
            )
        }
    }
}

/** monster-focus-picker.tsx + monster-radius-control.tsx's rules: "All
 *  monsters" is its own row (picking a monster drops it), an empty
 *  selection is saved as [] (never ['all']), Fairy can't be picked, and the
 *  radius is only sent when changed. */
@Composable
private fun MonsterFocusForm(
    characterName: String,
    monsterFocus: List<String>,
    monsterSearchRadius: Int,
    monsterChoices: List<MonsterChoice>,
    viewModel: PartyViewModel,
    onClose: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var selected by remember { mutableStateOf(monsterFocus) }
    var dirty by remember { mutableStateOf(false) }
    var radius by remember { mutableStateOf(monsterSearchRadius.toString()) }
    var search by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var fairyExplanation by remember { mutableStateOf(false) }

    // An untouched draft follows the server's saved focus.
    LaunchedEffect(monsterFocus) { if (!dirty) selected = monsterFocus }

    fun choose(next: List<String>) {
        dirty = true
        selected = next
    }
    fun toggle(id: String, checked: Boolean) {
        when (id) {
            "tinyp" -> fairyExplanation = true
            "all" -> choose(if (checked) listOf("all") else emptyList())
            else -> {
                val rest = selected.filter { it != "all" }
                choose(if (checked) rest + id else rest.filter { it != id })
            }
        }
    }

    val choices: List<Triple<String, String, Sprite?>> =
        listOf(Triple("all", "All monsters", null)) + monsterChoices.map { Triple(it.id, "${it.name ?: it.id} · ${it.id}", it.sprite) }
    val query = search.trim().lowercase()
    val filtered = if (query.isEmpty()) choices else choices.filter { (id, label) -> id.lowercase().contains(query) || label.lowercase().contains(query) }

    Column {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedTextField(value = search, onValueChange = { search = it }, label = { Text("Search monsters...") }, singleLine = true, modifier = Modifier.weight(1f))
            OutlinedButton(onClick = { choose(emptyList()) }) { Text("Clear all") }
        }
        LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 260.dp)) {
            items(filtered, key = { it.first }) { (id, label, sprite) ->
                if (id == "tinyp") {
                    Row(
                        modifier = Modifier.fillMaxWidth().clickable { fairyExplanation = true }.padding(vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("Disabled", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = selected.contains(id), onCheckedChange = { checked -> toggle(id, checked) })
                        if (sprite != null) SpriteIcon(sprite, size = 24.dp) else Text("*", modifier = Modifier.size(24.dp))
                        Text(label, style = MaterialTheme.typography.bodySmall, maxLines = 1, modifier = Modifier.padding(start = 6.dp))
                    }
                }
            }
        }
        if (filtered.isEmpty()) Text("No matching monsters", style = MaterialTheme.typography.bodySmall)
        if (fairyExplanation) {
            Text(
                "Fairy has no verified regular spawn route. Enable “Passively hunt fairy” to attack on sight.",
                style = MaterialTheme.typography.labelSmall,
            )
        }
        OutlinedTextField(
            value = radius,
            onValueChange = { new -> if (new.all { it.isDigit() }) radius = new },
            label = { Text("Monster search radius") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Text("Clearing monster focus resets this to 400.", style = MaterialTheme.typography.labelSmall)
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedButton(onClick = onClose) { Text("Cancel") }
            Button(
                enabled = !saving,
                onClick = {
                    var nextRadius: Int? = null
                    if (radius != monsterSearchRadius.toString()) {
                        val value = radius.toIntOrNull()
                        if (value == null || value < 1 || value > 10_000) {
                            error = "Enter a radius from 1 to 10,000."
                            return@Button
                        }
                        nextRadius = value
                    }
                    scope.launch {
                        saving = true
                        error = null
                        when (val result = viewModel.api.setFocus(characterName, selected, nextRadius)) {
                            is ApiResult.Failure -> error = result.message
                            is ApiResult.Success -> {
                                viewModel.refreshDynamicStateNow()
                                onClose()
                            }
                        }
                        saving = false
                    }
                },
            ) { Text("Save") }
        }
    }
}

@Composable
private fun HuntBackupPicker(
    bestiaryCatalog: List<BestiaryMonster>,
    onCancel: () -> Unit,
    onStart: (List<String>, MonsterSpawnRecord) -> Unit,
) {
    var search by remember { mutableStateOf("") }
    var selectedMonsters by remember { mutableStateOf(setOf<String>()) }
    var chosenLocation by remember { mutableStateOf<MonsterSpawnRecord?>(null) }

    val filtered = bestiaryCatalog.filter { it.name.contains(search, ignoreCase = true) }
    val candidateLocations = selectedMonsters.flatMap { id -> bestiaryCatalog.find { it.id == id }?.spawnRecords ?: emptyList() }

    Column {
        Text(
            "Select backup farming monsters and a spawn location. Hunt returns here between quests.",
            style = MaterialTheme.typography.labelSmall,
        )
        OutlinedTextField(value = search, onValueChange = { search = it }, label = { Text("Search monsters...") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 180.dp)) {
            items(filtered) { monster ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = selectedMonsters.contains(monster.id),
                        onCheckedChange = { checked ->
                            selectedMonsters = if (checked) selectedMonsters + monster.id else selectedMonsters - monster.id
                            chosenLocation = null
                        },
                    )
                    SpriteIcon(monster.sprite, size = 24.dp)
                    Text(monster.name, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(start = 6.dp))
                }
            }
        }
        if (selectedMonsters.isNotEmpty()) {
            Text("Spawn location", style = MaterialTheme.typography.labelSmall)
            LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 180.dp)) {
                items(candidateLocations) { record ->
                    OutlinedButton(
                        onClick = { chosenLocation = record },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("${record.mapName ?: record.map} (${record.x.toInt()}, ${record.y.toInt()})", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedButton(onClick = onCancel) { Text("Cancel") }
            Button(
                enabled = selectedMonsters.isNotEmpty() && chosenLocation != null,
                onClick = { chosenLocation?.let { onStart(selectedMonsters.toList(), it) } },
            ) { Text("Save backup and start Hunt") }
        }
    }
}
