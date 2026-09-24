package com.partyconsole.companion.ui.account

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.ActivityEntry
import com.partyconsole.companion.model.GameLogEntry
import com.partyconsole.companion.ui.PartyViewModel
import kotlinx.coroutines.launch

/** Read-only activity feed (log-sidebar.tsx's "Dashboard logs" and "Game
 *  logs" tabs) - merchant errand history, per-character combat log lines,
 *  and raw in-game chat/system messages (the ?section=logs-only field
 *  that was deferred earlier). */
@Composable
fun LogsScreen(viewModel: PartyViewModel, onBack: () -> Unit) {
    val state by viewModel.dynamicState.collectAsState()
    val gameLogs by viewModel.gameLogs.collectAsState()
    val combatEntries = state.combatLogs.flatMap { (name, entries) -> entries.map { name to it } }
        .sortedByDescending { it.second.at }
    val merchantEntries = state.merchantActivity.sortedByDescending { it.at }
    val gameEntries = gameLogs.flatMap { (name, entries) -> entries.map { name to it } }
        .sortedByDescending { it.second.at }

    val scope = rememberCoroutineScope()
    AccountScreenScaffold("Logs", onBack, onRefresh = { scope.launch { viewModel.refreshDynamicStateNow() } }) {
        if (combatEntries.isEmpty() && merchantEntries.isEmpty() && gameEntries.isEmpty()) {
            EmptyState("No activity yet.")
        } else {
            LazyColumn(contentPadding = PaddingValues(12.dp)) {
                if (gameEntries.isNotEmpty()) {
                    item { Text("Game log", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(bottom = 4.dp)) }
                    items(gameEntries.take(100)) { (name, entry) -> GameLogRow(name, entry) }
                }
                if (merchantEntries.isNotEmpty()) {
                    item { Text("Merchant activity", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 12.dp, bottom = 4.dp)) }
                    items(merchantEntries) { LogRow(null, it) }
                }
                if (combatEntries.isNotEmpty()) {
                    item { Text("Combat", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 12.dp, bottom = 4.dp)) }
                    items(combatEntries) { (name, entry) -> LogRow(name, entry) }
                }
            }
        }
    }
}

@Composable
private fun LogRow(character: String?, entry: ActivityEntry) {
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Text(
            (character?.let { "[$it] " } ?: "") + entry.message,
            modifier = Modifier.padding(10.dp),
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

@Composable
private fun GameLogRow(character: String, entry: GameLogEntry) {
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Text(
            "[$character] ${entry.message}",
            modifier = Modifier.padding(10.dp),
            style = MaterialTheme.typography.bodySmall,
        )
    }
}
