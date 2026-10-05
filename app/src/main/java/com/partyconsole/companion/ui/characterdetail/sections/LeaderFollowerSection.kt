package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.border
import androidx.compose.material.icons.filled.Settings
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.PartyStateDynamic
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import kotlinx.coroutines.launch

/** Ports party-workspace.tsx's leader RadioGroup + per-card follow
 *  Checkbox into two independent tap targets on POST /party-api/formation.
 *  "Leader" sends only {leader} (a radio - tapping the current leader does
 *  nothing, as on the dashboard); "Follow" sends only {character, follow}. */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun LeaderFollowerSection(characterName: String, dynamicState: PartyStateDynamic, viewModel: PartyViewModel, onOpenAnniversary: () -> Unit = {}) {
    val scope = rememberCoroutineScope()
    val loaded by viewModel.stateLoaded.collectAsState()
    val isLeader = dynamicState.leader == characterName
    val isFollowing = dynamicState.followers[characterName] == true
    var error by remember(characterName) { mutableStateOf<String?>(null) }

    SectionCard(title = "Formation") {
        androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            FilterChip(
                selected = isLeader,
                enabled = loaded,
                onClick = {
                    if (!isLeader) {
                        scope.launch {
                            error = null
                            val result = viewModel.api.setLeader(characterName)
                            if (result is ApiResult.Failure) error = result.message.ifBlank { "Formation update failed" }
                            viewModel.refreshDynamicStateNow()
                        }
                    }
                },
                label = { Text("Leader") },
            )
            FilterChip(
                selected = isFollowing,
                enabled = loaded,
                onClick = {
                    scope.launch {
                        error = null
                        val result = viewModel.api.setFollow(characterName, !isFollowing)
                        if (result is ApiResult.Failure) error = result.message.ifBlank { "Formation update failed" }
                        viewModel.refreshDynamicStateNow()
                    }
                },
                label = { Text("Follow") },
            )
            EventSelectionControl(dynamicState, characterName, viewModel, onOpenAnniversary)
        }
        ConfigLoadingNote(loaded)
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp)) }
        if (!isLeader && dynamicState.leader != null) {
            Text(
                "Following ${dynamicState.leader}",
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(top = 6.dp),
            )
        }
    }
}

/** event-selection-control.tsx: the "Events (n)" popover as an inline list -
 *  the Cave row first, then each event (sorted by name) with LIVE / next /
 *  stale / unsupported. Followers use their leader's events. */
@Composable
private fun EventSelectionControl(state: PartyStateDynamic, name: String, viewModel: PartyViewModel, onOpenAnniversary: () -> Unit) {
    val scope = rememberCoroutineScope()
    val now = com.partyconsole.companion.ui.components.rememberClock()
    var open by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val policy = com.partyconsole.companion.domain.eventPolicy(state, name)
    val selected = com.partyconsole.companion.domain.selectedEvents(state, name)
    val catalog = state.eventSchedules.ifEmpty { com.partyconsole.companion.domain.SUPPORTED_EVENTS.map { com.partyconsole.companion.model.EventSchedule(id = it, name = it) } }
    fun onChange(events: List<String>) = scope.launch {
        error = null
        when (val result = viewModel.api.setEventSelections(name, events)) {
            is ApiResult.Failure -> error = result.message
            is ApiResult.Success -> viewModel.refreshDynamicStateNow()
        }
    }
    FilterChip(selected = open, onClick = { open = !open }, label = { Text("Events (${selected.size}) ▾") })
    if (open) {
        androidx.compose.foundation.layout.Column(
            modifier = Modifier.fillMaxWidth()
                .border(1.dp, androidx.compose.ui.graphics.Color(0xFF334155), androidx.compose.foundation.shape.RoundedCornerShape(4.dp))
                .padding(12.dp)
                .semantics { contentDescription = "Events" },
        ) {
            if (policy.inherited) Text("Using ${policy.source}’s events", color = androidx.compose.ui.graphics.Color(0xFFFDE68A), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(bottom = 8.dp))
            com.partyconsole.companion.ui.dungeon.CaveEventRow(viewModel)
            for (event in catalog.sortedBy { it.name }) {
                val supported = event.id in com.partyconsole.companion.domain.SUPPORTED_EVENTS
                androidx.compose.foundation.layout.Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    androidx.compose.material3.Checkbox(
                        checked = supported && event.id in selected,
                        enabled = supported && !policy.inherited,
                        onCheckedChange = { checked -> onChange(if (checked) selected + event.id else selected - event.id) },
                        modifier = Modifier.semantics { contentDescription = event.name },
                    )
                    Text(
                        "${event.name} — " + when {
                            !supported -> "Unsupported"
                            event.live == true -> "LIVE"
                            event.next != null && event.next != 0.0 -> com.partyconsole.companion.domain.eventTimeLabel(event.next, now)
                            event.slotAt != null && event.slotAt != 0.0 -> "Next chance: ${com.partyconsole.companion.domain.eventTimeLabel(event.slotAt, now)}"
                            else -> "Time not announced"
                        } + if (event.stale == true) " · timing stale" else "",
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.weight(1f),
                    )
                    if (event.id == "anniversary") {
                        androidx.compose.material3.OutlinedIconButton(onClick = onOpenAnniversary, modifier = Modifier.semantics { contentDescription = "Anniversary settings" }) {
                            androidx.compose.material3.Icon(androidx.compose.material.icons.Icons.Filled.Settings, contentDescription = null, tint = androidx.compose.ui.graphics.Color(0xFFFBCFE8))
                        }
                    }
                }
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

