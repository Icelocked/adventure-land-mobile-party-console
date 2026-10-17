package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedIconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.domain.EVENT_DISPLAY_NAMES
import com.partyconsole.companion.domain.SUPPORTED_EVENTS
import com.partyconsole.companion.domain.eventLimits
import com.partyconsole.companion.domain.eventPolicy
import com.partyconsole.companion.domain.eventPriorityOrder
import com.partyconsole.companion.domain.eventTimeLabel
import com.partyconsole.companion.domain.selectedEvents
import com.partyconsole.companion.domain.validEventLimits
import com.partyconsole.companion.model.EventLimits
import com.partyconsole.companion.model.EventSchedule
import com.partyconsole.companion.model.PartyStateDynamic
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.network.CommandResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.components.rememberClock
import com.partyconsole.companion.ui.dungeon.CaveEventRow
import kotlinx.coroutines.launch

/** Leader and follow as two independent tap targets on POST
 *  /party-api/formation. "Leader" sends only {leader} (a radio - tapping the
 *  current leader does nothing); "Follow" sends only {character, follow}. */
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

/** The "Events (n)" popover as an inline list (console 1.4
 *  event-selection-control.tsx): the Cave row first, then each event in
 *  priority order with LIVE / next / stale / unsupported and a skipped
 *  instance's reason. Up/down buttons replace the console's drag to
 *  reorder, and each move saves the whole priority order. Followers use
 *  their leader's events. */
@Composable
private fun EventSelectionControl(state: PartyStateDynamic, name: String, viewModel: PartyViewModel, onOpenAnniversary: () -> Unit) {
    val scope = rememberCoroutineScope()
    val now = rememberClock()
    var open by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var settings by remember { mutableStateOf<String?>(null) }
    var franky by remember { mutableStateOf(false) }
    // Merchant-class characters get no Franky routine (connected-character-card.tsx).
    val characters by viewModel.characters.collectAsState()
    val combat = characters[name]?.vitals?.ctype != "merchant"
    val policy = eventPolicy(state, name)
    val selected = selectedEvents(state, name)
    val order = eventPriorityOrder(state, name)
    // Server schedules are observations, not the supported catalog: seasonal
    // bosses stay selectable even when the current feed omits them.
    val schedules = state.eventSchedules.associateBy { it.id }
    val rows = (order + schedules.keys).distinct()
        .map { id -> (schedules[id] ?: EventSchedule(id = id)).let { it.copy(name = EVENT_DISPLAY_NAMES[id] ?: it.name.ifEmpty { id }) } }
        .filter { it.id != "cave" && it.name.lowercase() != "cave of many dreams" }
    fun send(action: suspend () -> ApiResult<CommandResult>) = scope.launch {
        error = null
        when (val result = action()) {
            is ApiResult.Failure -> error = result.message
            is ApiResult.Success -> viewModel.refreshDynamicStateNow()
        }
    }
    fun move(id: String, offset: Int) {
        val index = order.indexOf(id)
        val target = order.getOrNull(index + offset) ?: return
        val next = order.toMutableList().apply { this[index] = target; this[index + offset] = id }
        send { viewModel.api.setEventPriorities(name, next) }
    }
    FilterChip(selected = open, onClick = { open = !open }, label = { Text("Events (${selected.size}) ▾") })
    if (open) {
        Column(
            modifier = Modifier.fillMaxWidth()
                .border(1.dp, Color(0xFF334155), RoundedCornerShape(4.dp))
                .padding(12.dp)
                .semantics { contentDescription = "Events" },
        ) {
            if (policy.inherited) Text("Using ${policy.source}’s events", color = Color(0xFFFDE68A), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(bottom = 8.dp))
            CaveEventRow(viewModel)
            Text("Higher numbers attend first. Use the arrows to reorder.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            for (event in rows) {
                val supported = event.id in SUPPORTED_EVENTS
                // A leader's manual travel skip stays on the leader; its
                // followers still attend (attendance-limits.ts).
                val ignored = listOf(state.eventAttendance[name]?.get(event.id), state.eventAttendance[policy.source]?.get(event.id))
                    .withIndex()
                    .firstOrNull { (index, entry) -> entry?.ignored != null && !entry.ended && (index == 0 || entry.ignored != "manual travel") }
                    ?.value?.ignored
                val index = order.indexOf(event.id)
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Column {
                        IconButton(
                            onClick = { move(event.id, -1) },
                            enabled = supported && !policy.inherited && index > 0,
                            modifier = Modifier.size(24.dp).semantics { contentDescription = "Move ${event.name} up" },
                        ) { Icon(Icons.Filled.KeyboardArrowUp, contentDescription = null) }
                        IconButton(
                            onClick = { move(event.id, 1) },
                            enabled = supported && !policy.inherited && index >= 0 && index < order.size - 1,
                            modifier = Modifier.size(24.dp).semantics { contentDescription = "Move ${event.name} down" },
                        ) { Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null) }
                    }
                    Text(
                        if (supported) "${order.size - index}" else "0",
                        color = Color(0xFFA7F3D0),
                        style = MaterialTheme.typography.labelSmall,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.width(24.dp).semantics { contentDescription = "${event.name} priority" },
                    )
                    Checkbox(
                        checked = supported && event.id in selected,
                        enabled = supported && !policy.inherited,
                        onCheckedChange = { checked -> send { viewModel.api.setEventSelections(name, if (checked) selected + event.id else selected - event.id) } },
                        modifier = Modifier.semantics { contentDescription = event.name },
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            "${event.name} — " + when {
                                !supported -> "Unsupported"
                                event.live == true -> "LIVE"
                                event.next != null && event.next != 0.0 -> eventTimeLabel(event.next, now)
                                event.slotAt != null && event.slotAt != 0.0 -> "Next chance: ${eventTimeLabel(event.slotAt, now)}"
                                else -> "Time not announced"
                            } + if (event.stale == true) " · timing stale" else "",
                            style = MaterialTheme.typography.labelSmall,
                        )
                        ignored?.let { Text("Skipped this instance: $it", color = Color(0xFFFDE68A), style = MaterialTheme.typography.labelSmall) }
                    }
                    OutlinedIconButton(
                        onClick = { settings = if (settings == event.id) null else event.id },
                        enabled = supported,
                        modifier = Modifier.semantics { contentDescription = "${event.name} settings" },
                    ) { Icon(Icons.Filled.Settings, contentDescription = null, tint = Color(0xFFFBCFE8)) }
                }
                if (settings == event.id) {
                    EventLimitsPanel(
                        event = event.id,
                        label = event.name,
                        limits = eventLimits(state, name)[event.id] ?: EventLimits(),
                        inherited = policy.inherited,
                        onClose = { settings = null },
                        onSave = { limits ->
                            when (val result = viewModel.api.setEventLimits(name, event.id, limits)) {
                                is ApiResult.Failure -> result.message
                                is ApiResult.Success -> {
                                    viewModel.refreshDynamicStateNow()
                                    null
                                }
                            }
                        },
                        onAnniversary = onOpenAnniversary,
                    )
                }
                // Console 1.4 reaches the Franky routine from inside Franky's
                // event settings (event-limits-dialog.tsx).
                if (settings == event.id && event.id == "franky" && combat) {
                    Column(modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                        OutlinedButton(onClick = { franky = !franky }, modifier = Modifier.fillMaxWidth()) { Text("Franky routine settings") }
                        if (franky) FrankyRoutineControl(name, state, viewModel)
                    }
                }
            }
        }
    }
}

/** JavaScript Number(text) for a limit field: blank is null (unlimited) and
 *  unparseable text is NaN, which [validEventLimits] refuses. */
private fun limitValue(text: String): Double? = text.trim().ifEmpty { null }?.let { it.toDoubleOrNull() ?: Double.NaN }

/** A saved limit as the console's input shows it: whole numbers without ".0". */
private fun limitText(value: Double?): String = when {
    value == null -> ""
    value.isFinite() && value == Math.floor(value) -> value.toLong().toString()
    else -> value.toString()
}

/** Console 1.4 event-limits-dialog.tsx as an inline group under the event's
 *  row. [onSave] answers the server's error message, or null once saved. */
@Composable
private fun EventLimitsPanel(
    event: String,
    label: String,
    limits: EventLimits,
    inherited: Boolean,
    onClose: () -> Unit,
    onSave: suspend (EventLimits) -> String?,
    onAnniversary: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var deaths by remember { mutableStateOf(limitText(limits.deathLimit)) }
    var minutes by remember { mutableStateOf(limitText(limits.timeLimitMinutes)) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    val value = EventLimits(deathLimit = limitValue(deaths), timeLimitMinutes = limitValue(minutes))
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Column(
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(6.dp))
            .padding(12.dp)
            .semantics { contentDescription = "$label settings" },
    ) {
        Text("$label settings", style = MaterialTheme.typography.titleSmall)
        Text("Blank means unlimited. Exceeding a limit skips the current event instance, then resumes farming or attends the next eligible event.", style = MaterialTheme.typography.labelSmall, color = muted)
        OutlinedTextField(
            value = deaths,
            onValueChange = { deaths = it },
            label = { Text("Death limit") },
            placeholder = { Text("Unlimited") },
            enabled = !inherited && !saving,
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Death limit" },
        )
        Text("Stop rejoining after more than this many deaths. 0 stops after the first death.", style = MaterialTheme.typography.labelSmall, color = muted)
        OutlinedTextField(
            value = minutes,
            onValueChange = { minutes = it },
            label = { Text("Time limit (mins)") },
            placeholder = { Text("Unlimited") },
            enabled = !inherited && !saving,
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Time limit (mins)" },
        )
        if (inherited) Text("Using the leader’s event settings.", color = Color(0xFFFDE68A), style = MaterialTheme.typography.labelSmall)
        if (error.isNotEmpty()) Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        if (event == "anniversary") OutlinedButton(onClick = onAnniversary) { Text("Anniversary visit settings") }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End), modifier = Modifier.fillMaxWidth()) {
            OutlinedButton(onClick = onClose, enabled = !saving, modifier = Modifier.semantics { contentDescription = "Close event settings" }) { Text("Close") }
            if (!inherited) {
                Button(
                    enabled = !saving && validEventLimits(value),
                    onClick = {
                        scope.launch {
                            saving = true
                            error = ""
                            val failure = onSave(value)
                            saving = false
                            if (failure != null) error = failure else onClose()
                        }
                    },
                ) { Text("Save event settings") }
            }
        }
    }
}
