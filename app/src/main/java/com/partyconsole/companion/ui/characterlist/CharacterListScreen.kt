package com.partyconsole.companion.ui.characterlist

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.CharacterState
import com.partyconsole.companion.ui.PartyViewModel

@Composable
fun CharacterListScreen(viewModel: PartyViewModel, onSelectCharacter: (String) -> Unit) {
    val characters by viewModel.characters.collectAsState()
    val connected by viewModel.connected.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Party") },
                actions = {
                    if (!connected) Icon(Icons.Filled.CloudOff, contentDescription = "Disconnected")
                },
            )
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            if (!connected) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            if (characters.isEmpty()) {
                Column(
                    modifier = Modifier.fillMaxSize().padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    if (!connected) CircularProgressIndicator()
                    Text(
                        if (connected) "No characters online yet." else "Connecting...",
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }
            } else {
                LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp)) {
                    items(characters.entries.toList(), key = { it.key }) { (name, state) ->
                        CharacterRow(name, state, onClick = { onSelectCharacter(name) })
                    }
                }
            }
        }
    }
}

@Composable
private fun CharacterRow(name: String, state: CharacterState, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(name, style = MaterialTheme.typography.titleMedium)
                state.vitals?.let { Text("Lv ${it.level} ${it.ctype}", style = MaterialTheme.typography.bodyMedium) }
            }
            val vitals = state.vitals
            if (vitals == null) {
                Text("offline", style = MaterialTheme.typography.bodySmall)
            } else {
                Text(
                    activityLine(vitals),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (vitals.rip) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("HP ${vitals.hp}/${vitals.maxHp}", style = MaterialTheme.typography.labelMedium)
                    Text("MP ${vitals.mp}/${vitals.maxMp}", style = MaterialTheme.typography.labelMedium)
                }
            }
        }
    }
}

/** The "what are they actively doing" one-line readout the user asked
 *  for on the party overview, before drilling into a character's detail
 *  tabs. Mirrors the priority order a person would actually care about:
 *  dead first, then a named activity flag the server reports, then a
 *  generic online fallback. */
private fun activityLine(vitals: com.partyconsole.companion.model.CharacterVitals): String = when {
    vitals.rip -> "dead"
    vitals.banking -> "banking"
    vitals.bankQueued -> "waiting for bank"
    vitals.stocking -> "stocking up"
    vitals.upgrading -> "upgrading"
    vitals.farmingMode != null -> "farming (${vitals.farmingMode})"
    else -> "at ${vitals.map} ${vitals.x.toInt()},${vitals.y.toInt()}"
}
