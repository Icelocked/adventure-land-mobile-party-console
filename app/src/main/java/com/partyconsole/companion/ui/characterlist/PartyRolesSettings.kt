package com.partyconsole.companion.ui.characterlist

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import kotlinx.coroutines.launch

/** The party's designated tank, picked from the connected characters
 *  (stable console fork only, see ConsoleFeatures.kt). Sends POST
 *  /party-api/formation {tank}, with null for None. The console's select
 *  becomes a chip that opens the choices inline. PWA: PartyRolesSettings.tsx;
 *  console: party-roles-settings.tsx. */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun PartyRolesSettings(viewModel: PartyViewModel, tank: String?, characters: List<String>) {
    val scope = rememberCoroutineScope()
    val configLoaded by viewModel.stateLoaded.collectAsState()
    var open by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    fun choose(name: String?) = scope.launch {
        open = false
        // The console's select fires only on a change.
        if (name == tank) return@launch
        error = null
        (viewModel.api.setDesignatedTank(name) as? ApiResult.Failure)?.let { error = it.message.ifBlank { "Formation update failed" } }
        viewModel.refreshDynamicStateNow()
    }
    Column(
        verticalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp).fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(8.dp))
            .padding(12.dp),
    ) {
        FilterChip(selected = open, enabled = configLoaded, onClick = { open = !open }, label = { Text("Tank: ${tank ?: "None"} ▾") })
        if (open) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.semantics { contentDescription = "Tank" }) {
                for (name in listOf<String?>(null) + characters) {
                    FilterChip(selected = name == tank, onClick = { choose(name) }, label = { Text(name ?: "None") })
                }
            }
        }
        Text(
            "Holds melee range for the party regardless of class, owns taunt/absorb aggro-pulling, and swaps into its highest-luck available gear right before a kill.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.labelSmall,
        )
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    }
}
