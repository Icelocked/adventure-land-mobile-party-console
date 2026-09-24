package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.BestiaryMonster
import com.partyconsole.companion.model.MonsterSpawnRecord
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

/** farming-mode-control.tsx ported, scoped down from its full scope: the
 *  mode selector (account-wide - /farming-mode takes no `character` field
 *  at all) and this character's own monster focus. Passive/rare hunting
 *  rules, the visual radius-map preview, and Phoenix's 5-region patrol
 *  ordering are NOT ported - all niche/advanced sub-features on top of
 *  the core "what should this character farm" control that this section
 *  exists for. Hunt settings + the blacklist viewer are their own screen
 *  (too big for an inline card). */
@Composable
fun FarmingSection(
    characterName: String,
    farmingPolicy: String,
    monsterFocus: List<String>,
    monsterSearchRadius: Int,
    bestiaryCatalog: List<BestiaryMonster>,
    viewModel: PartyViewModel,
    onOpenHuntSettings: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var showFocus by remember { mutableStateOf(false) }
    var pickingBackup by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    SectionCard(title = "Farming") {
        Text("Account-wide - applies to the whole party.", style = MaterialTheme.typography.labelSmall)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for ((id, label) in MODES) {
                FilterChip(
                    selected = farmingPolicy == id,
                    onClick = {
                        error = null
                        if (id == "hunt") {
                            pickingBackup = true
                        } else {
                            scope.launch {
                                when (val result = viewModel.api.setFarmingMode(id)) {
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
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }

        if (pickingBackup) {
            HuntBackupPicker(
                bestiaryCatalog = bestiaryCatalog,
                onCancel = { pickingBackup = false },
                onStart = { monsterIds, location ->
                    scope.launch {
                        when (val result = viewModel.api.setFarmingMode("hunt", monsterIds, location.map, location.x, location.y)) {
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
            OutlinedButton(onClick = { showFocus = !showFocus }) { Text("$characterName's monster focus") }
            OutlinedButton(onClick = onOpenHuntSettings) { Text("Hunt settings...") }
        }
        if (showFocus) {
            MonsterFocusForm(
                characterName = characterName,
                monsterFocus = monsterFocus,
                monsterSearchRadius = monsterSearchRadius,
                bestiaryCatalog = bestiaryCatalog,
                viewModel = viewModel,
                onClose = { showFocus = false },
            )
        }
    }
}

@Composable
private fun MonsterFocusForm(
    characterName: String,
    monsterFocus: List<String>,
    monsterSearchRadius: Int,
    bestiaryCatalog: List<BestiaryMonster>,
    viewModel: PartyViewModel,
    onClose: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var selected by remember { mutableStateOf(monsterFocus.toSet()) }
    var radius by remember { mutableStateOf(monsterSearchRadius.toString()) }
    var search by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val filtered = bestiaryCatalog.filter { it.name.contains(search, ignoreCase = true) }

    Column {
        OutlinedTextField(value = search, onValueChange = { search = it }, label = { Text("Search monsters...") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 260.dp)) {
            items(filtered) { monster ->
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Checkbox(
                        checked = selected.contains(monster.id),
                        onCheckedChange = { checked -> selected = if (checked) selected + monster.id else selected - monster.id },
                    )
                    SpriteIcon(monster.sprite, size = 24.dp)
                    Text(monster.name, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(start = 6.dp))
                }
            }
        }
        OutlinedTextField(
            value = radius,
            onValueChange = { new -> if (new.all { it.isDigit() }) radius = new },
            label = { Text("Search radius") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedButton(onClick = onClose) { Text("Cancel") }
            Button(
                enabled = !saving,
                onClick = {
                    scope.launch {
                        saving = true
                        error = null
                        val focus = if (selected.isEmpty()) listOf("all") else selected.toList()
                        when (val result = viewModel.api.setFocus(characterName, focus, radius.toIntOrNull() ?: 400)) {
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
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
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
