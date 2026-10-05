package com.partyconsole.companion.ui.dungeon

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedIconButton
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.data.DungeonQuery
import com.partyconsole.companion.data.dungeonEntryLabel
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.components.rememberClock
import kotlinx.coroutines.launch

internal val Amber200 = Color(0xFFFDE68A)
internal val Rose200 = Color(0xFFFECDD3)
internal val Slate300 = Color(0xFFCBD5E1)

/** Keeps the dungeon state polling while shown. */
@Composable
fun rememberDungeons(viewModel: PartyViewModel): DungeonQuery {
    val query = viewModel.dungeons
    DisposableEffect(query) {
        val release = query.acquire()
        onDispose { release() }
    }
    return query
}

/** The Cave of Many Dreams row at the top of the Events list, with its
 *  settings as a sheet (manual entry, resume, event protection, release). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CaveEventRow(viewModel: PartyViewModel) {
    val query = rememberDungeons(viewModel)
    val view by query.view.collectAsState()
    val busy by query.busy.collectAsState()
    val error by query.error.collectAsState()
    val actionError by query.actionError.collectAsState()
    val now = rememberClock()
    val scope = rememberCoroutineScope()
    var open by remember { mutableStateOf(false) }
    // Closes when the visit becomes active.
    LaunchedEffect(view?.state?.phase) { if (view?.state?.phase == "active") open = false }
    val members = view?.members.orEmpty()
    val resume = members.firstOrNull()?.observation?.visit?.resume
    val eligible = members.isNotEmpty() && members.size <= 3 && members.all { m ->
        val visit = m.observation?.visit
        m.fresh && m.observation?.supported == true && visit != null && now - visit.checkedAt < 45000 && (visit.available || visit.resume != null)
    }
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("Cave of Many Dreams — ${dungeonEntryLabel(view, now)}", style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
        OutlinedIconButton(onClick = { open = true }, modifier = Modifier.semantics { contentDescription = "Cave of Many Dreams settings" }) {
            Icon(Icons.Filled.Settings, contentDescription = null)
        }
    }
    if (open) {
        ModalBottomSheet(onDismissRequest = { open = false }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
            Column(
                modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp).semantics { contentDescription = "Cave of Many Dreams" },
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Column {
                    Text("Cave of Many Dreams", fontWeight = FontWeight.SemiBold)
                    Text("Manual entry and event protection", color = Slate300, style = MaterialTheme.typography.bodySmall)
                }
                Text(dungeonEntryLabel(view, now), style = MaterialTheme.typography.bodySmall)
                resume?.let { Text("Resume on ${it.server}. Realm changes are manual.", style = MaterialTheme.typography.bodySmall) }
                Text(
                    "Participants: ${members.joinToString(", ") { it.name + if (it.fresh) "" else " (offline)" }.ifEmpty { "Select a leader and combat followers" }}.",
                    style = MaterialTheme.typography.bodySmall,
                )
                for (m in members.filter { it.observation?.visitError != null }) {
                    Text("${m.name}: eligibility check failed (${m.observation?.visitError}); retrying.", color = Amber200, style = MaterialTheme.typography.bodySmall)
                }
                Row(verticalAlignment = Alignment.Top, modifier = Modifier.clickable(enabled = view != null && !busy) {
                    scope.launch { query.action(mapOf("action" to "settings", "protectFromEvents" to (view?.state?.protectFromEvents == false))) }
                }) {
                    Checkbox(
                        checked = view?.state?.protectFromEvents != false,
                        enabled = view != null && !busy,
                        onCheckedChange = { checked -> scope.launch { query.action(mapOf("action" to "settings", "protectFromEvents" to checked)) } },
                    )
                    Text("Don’t leave the Cave of Many Dreams for other events", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 12.dp))
                }
                Text("Disabling this allows enabled events, including Anniversary, to end your visit. You may not be able to enter again until the daily reset.", color = Slate300, style = MaterialTheme.typography.bodySmall)
                OutlinedButton(
                    enabled = eligible && !busy && (view == null || view?.state?.phase in setOf("idle", "held")),
                    onClick = { scope.launch { query.action(mapOf("action" to if (resume != null) "resume" else "enter")) } },
                ) { Text(if (resume != null) "Resume visit" else "Enter now") }
                if (view?.state?.phase == "held") {
                    OutlinedButton(enabled = !busy, onClick = { scope.launch { query.action(mapOf("action" to "release")) } }) { Text("Resume ordinary activity") }
                }
                if (!eligible) Text("Entry needs fresh eligible characters: a leader and at most two combat followers, excluding the merchant.", color = Amber200, style = MaterialTheme.typography.bodySmall)
                (actionError.ifEmpty { null } ?: error ?: view?.state?.error)?.let { Text(it, color = Rose200, style = MaterialTheme.typography.bodySmall) }
                OutlinedButton(onClick = { open = false }) { Text("Close") }
            }
        }
    }
}
