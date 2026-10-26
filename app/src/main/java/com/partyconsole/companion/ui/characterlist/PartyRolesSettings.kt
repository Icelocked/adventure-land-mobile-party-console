package com.partyconsole.companion.ui.characterlist

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Checkbox
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.PartyStateDynamic
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

// Console party-roles-settings.tsx hints.
private const val TANK_HINT = "The tank holds its target at its own range and owns taunt and absorb."
private const val OFF_TANK_HINT = "The off tank takes the tank's attackers while the tank is in danger and hands them back once it recovers."
private const val PULL_HINT = "With Pull on, the party waits outside the pack and its longest-range member draws one monster at a time."

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun RolePicker(label: String, hint: String, value: String?, characters: List<String>, enabled: Boolean, onSelect: (String?) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        FilterChip(selected = open, enabled = enabled, onClick = { open = !open }, label = { Text("$label: ${value ?: "None"} ▾") })
        if (open) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.semantics { contentDescription = label }) {
                for (name in listOf<String?>(null) + characters) {
                    FilterChip(
                        selected = name == value,
                        onClick = {
                            open = false
                            // The console's select fires only on a change.
                            if (name != value) onSelect(name)
                        },
                        label = { Text(name ?: "None") },
                    )
                }
            }
        }
        Text(hint, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall)
    }
}

/** The party-wide tank, off tank and pull mode. Every character's Farming
 *  settings shows the same values, and each change sends POST
 *  /party-api/formation with only the changed field ({tank}, {offTank} or
 *  {pullMode}); null clears a role. The console's selects become chips
 *  that open the choices inline. With [pull] false (a console without off
 *  tank and pull mode) only the tank shows. PWA: PartyRolesSettings.tsx;
 *  console: party-roles-settings.tsx in farming-mode-control.tsx. */
@Composable
fun PartyRolesSettings(viewModel: PartyViewModel, tank: String?, offTank: String?, pullMode: Boolean, pull: Boolean, characters: List<String>) {
    val scope = rememberCoroutineScope()
    val configLoaded by viewModel.stateLoaded.collectAsState()
    var error by remember { mutableStateOf<String?>(null) }
    fun formation(field: String, value: JsonElement) = scope.launch {
        error = null
        (viewModel.api.setFormationRoles(mapOf(field to value)) as? ApiResult.Failure)?.let { error = it.message.ifBlank { "Formation update failed" } }
        viewModel.refreshDynamicStateNow()
    }
    fun role(name: String?): JsonElement = name?.let { JsonPrimitive(it) } ?: JsonNull
    Column(
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.padding(start = 12.dp, end = 12.dp, top = 12.dp).fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(8.dp))
            .padding(12.dp)
            .semantics { contentDescription = "Party roles" },
    ) {
        RolePicker("Tank", TANK_HINT, tank, characters, configLoaded) { formation("tank", role(it)) }
        if (pull) {
            RolePicker("Off tank", OFF_TANK_HINT, offTank, characters, configLoaded) { formation("offTank", role(it)) }
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = pullMode,
                        enabled = configLoaded,
                        onCheckedChange = { formation("pullMode", JsonPrimitive(it)) },
                        modifier = Modifier.semantics { contentDescription = "Pull" },
                    )
                    Text("Pull", style = MaterialTheme.typography.bodySmall)
                }
                Text(PULL_HINT, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall)
            }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    }
}

/** The connected party in slot order, bankbois left out: the console's
 *  role pickers list every connected card (party-workspace.tsx chars). */
fun partyRoleNames(state: PartyStateDynamic, connected: List<String>): List<String> {
    val bankbois = state.bankbois.map { it.name }.toSet()
    val slotted = if ("activeSlots" in state.stateKeys) {
        state.activeSlots.sortedBy { it.index }.mapNotNull { it.character }.filter { it in connected }
    } else connected
    return slotted.filter { it !in bankbois }
}
