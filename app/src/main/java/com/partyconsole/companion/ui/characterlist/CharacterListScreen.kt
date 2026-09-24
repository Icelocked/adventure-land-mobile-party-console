package com.partyconsole.companion.ui.characterlist

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
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
import com.partyconsole.companion.model.CharacterState
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.activityLine
import com.partyconsole.companion.ui.characterdetail.sections.classLook
import kotlinx.coroutines.launch

@Composable
fun CharacterListScreen(viewModel: PartyViewModel, onSelectCharacter: (String) -> Unit) {
    val characters by viewModel.characters.collectAsState()
    val connected by viewModel.connected.collectAsState()
    val lastConnectionError by viewModel.lastConnectionError.collectAsState()
    val dynamicState by viewModel.dynamicState.collectAsState()
    val accountGold = (dynamicState.bank?.gold ?: 0L) + characters.values.sumOf { it.vitals?.gold ?: 0L }
    val scope = rememberCoroutineScope()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Party") },
                actions = {
                    Text(
                        "${"%,d".format(accountGold)}g",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(end = 12.dp),
                    )
                    if (!connected) Icon(Icons.Filled.CloudOff, contentDescription = "Disconnected")
                    IconButton(onClick = { scope.launch { viewModel.refreshDynamicStateNow() } }) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Refresh")
                    }
                },
            )
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            if (!connected) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            if (characters.isNotEmpty()) PartyControls(viewModel)
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
                        modifier = Modifier.padding(top = 12.dp),
                    )
                    if (!connected && lastConnectionError != null) {
                        Text(
                            lastConnectionError ?: "",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                    }
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

/** party-workspace.tsx's two party-wide (not per-character) buttons: "Send party to
 *  town" (bulk /town-party) and "Escape" (escape-control.tsx's polled emergency-
 *  recovery command - needs one online warrior/mage/priest, the server owns the
 *  whole staged rendezvous/convoy-fallback sequence, this just triggers + shows
 *  stage/error). */
@Composable
private fun PartyControls(viewModel: PartyViewModel) {
    val escape by viewModel.escape.collectAsState()
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val running = escape != null && escape?.stage !in listOf("complete", "failed-hold", "released")
    val failed = error != null || (escape != null && escape?.stage != "released" && (escape?.error != null || escape?.stage == "failed-hold"))
    val label = if (failed) "Escape · failed" else if (escape?.stage == "complete") "Escape · success" else "Escape"

    Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(onClick = { scope.launch { viewModel.api.sendPartyToTown() } }, modifier = Modifier.weight(1f)) {
            Text("Send party to town")
        }
        Button(
            onClick = {
                scope.launch {
                    busy = true
                    error = null
                    val result = viewModel.api.triggerEscape()
                    if (result is ApiResult.Failure) error = result.message
                    viewModel.refreshDynamicStateNow()
                    busy = false
                }
            },
            enabled = !busy && !running,
            colors = if (failed) ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error) else ButtonDefaults.buttonColors(),
            modifier = Modifier.weight(1f),
        ) {
            if (busy || running) {
                CircularProgressIndicator(modifier = Modifier.size(14.dp).padding(end = 6.dp), strokeWidth = 2.dp)
            }
            Text(label)
        }
    }
}

@Composable
private fun CharacterRow(name: String, state: CharacterState, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
    ) {
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            val (icon, color) = classLook(state.vitals?.ctype ?: "")
            Box(
                modifier = Modifier.size(36.dp).background(color.copy(alpha = 0.2f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = state.vitals?.ctype, tint = color, modifier = Modifier.size(20.dp))
            }
            Column(modifier = Modifier.padding(start = 12.dp).fillMaxWidth()) {
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
                        Text("${"%,d".format(vitals.gold)}g", style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }
    }
}
