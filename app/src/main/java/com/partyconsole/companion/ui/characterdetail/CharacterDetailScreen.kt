package com.partyconsole.companion.ui.characterdetail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.CharacterState
import com.partyconsole.companion.model.EquippedEntry
import com.partyconsole.companion.model.InventoryEntry
import com.partyconsole.companion.ui.PartyViewModel

private val TABS = listOf("Activity", "Equipment", "Inventory")

@Composable
fun CharacterDetailScreen(viewModel: PartyViewModel, characterName: String, onBack: () -> Unit) {
    val characters by viewModel.characters.collectAsState()
    val state = characters[characterName]
    var tabIndex by remember { mutableIntStateOf(0) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(characterName) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            if (state == null) {
                Text(
                    "This character isn't reporting in right now.",
                    modifier = Modifier.padding(24.dp),
                )
                return@Column
            }
            TabRow(selectedTabIndex = tabIndex) {
                TABS.forEachIndexed { index, title ->
                    Tab(selected = tabIndex == index, onClick = { tabIndex = index }, text = { Text(title) })
                }
            }
            when (tabIndex) {
                0 -> ActivityTab(state)
                1 -> EquipmentTab(state)
                2 -> InventoryTab(state)
            }
        }
    }
}

@Composable
private fun ActivityTab(state: CharacterState) {
    val vitals = state.vitals ?: return
    Column(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        StatRow("Level", "${vitals.level} ${vitals.ctype}")
        StatRow("HP", "${vitals.hp} / ${vitals.maxHp}")
        StatRow("MP", "${vitals.mp} / ${vitals.maxMp}")
        StatRow("Gold", vitals.gold.toString())
        StatRow("Location", "${vitals.map} (${vitals.x.toInt()}, ${vitals.y.toInt()})")
        if (vitals.rip) StatRow("Status", "DEAD", isWarning = true)
        vitals.farmingMode?.let { StatRow("Farming mode", it) }
        if (vitals.conditions.isNotEmpty()) {
            Text("Conditions", style = MaterialTheme.typography.titleSmall)
            for (condition in vitals.conditions) {
                Text("- ${condition.name}", style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
private fun StatRow(label: String, value: String, isWarning: Boolean = false) {
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            value,
            style = MaterialTheme.typography.bodyLarge,
            color = if (isWarning) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun EquipmentTab(state: CharacterState) {
    val slots = state.inventory?.slots.orEmpty()
    if (slots.isEmpty()) {
        Text("No equipment data yet.", modifier = Modifier.padding(24.dp))
        return
    }
    LazyVerticalGrid(columns = GridCells.Fixed(2), contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp)) {
        items(slots.entries.toList()) { (slotName, entry) ->
            EquipmentCard(slotName, entry)
        }
    }
}

@Composable
private fun EquipmentCard(slotName: String, entry: EquippedEntry?) {
    Card(modifier = Modifier.fillMaxWidth().padding(6.dp)) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(slotName, style = MaterialTheme.typography.labelMedium)
            if (entry == null) {
                Text("empty", style = MaterialTheme.typography.bodySmall)
            } else {
                Text(entry.item.name, style = MaterialTheme.typography.bodyMedium)
                entry.item.level?.let { Text("+$it", style = MaterialTheme.typography.bodySmall) }
            }
        }
    }
}

@Composable
private fun InventoryTab(state: CharacterState) {
    val items = state.inventory?.items.orEmpty()
    if (items.isEmpty()) {
        Text("No inventory data yet.", modifier = Modifier.padding(24.dp))
        return
    }
    LazyVerticalGrid(columns = GridCells.Fixed(4), contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp)) {
        items(items) { entry -> InventoryCell(entry) }
    }
}

@Composable
private fun InventoryCell(entry: InventoryEntry?) {
    Card(modifier = Modifier.fillMaxWidth().padding(4.dp)) {
        Column(modifier = Modifier.padding(8.dp)) {
            if (entry == null) {
                Text(" ", style = MaterialTheme.typography.bodySmall)
            } else {
                Text(entry.item.name, style = MaterialTheme.typography.bodySmall, maxLines = 2)
                entry.item.q?.let { if (it > 1) Text("x$it", style = MaterialTheme.typography.labelSmall) }
                entry.item.level?.let { Text("+$it", style = MaterialTheme.typography.labelSmall) }
            }
        }
    }
}
