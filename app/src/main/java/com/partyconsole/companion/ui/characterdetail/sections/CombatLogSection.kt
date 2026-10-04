package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.data.Domain
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.DomainInterest
import com.partyconsole.companion.ui.PartyViewModel
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val COLORS = mapOf(
    "skill" to Color(0xFF22D3EE),
    "kill" to Color(0xFFFB7185),
    "loot" to Color(0xFFF59E0B),
    "death" to Color(0xFFEF4444),
    "item" to Color(0xFF34D399),
)

/** connected-combat-log.tsx + combat-log.tsx (the PWA's
 *  CombatLogSection.tsx): a collapsed "Combat log" that, while open, keeps
 *  the logs domain fresh and lists the last 50 events (newest first,
 *  coloured by type) with Clear history. */
@Composable
fun CombatLogSection(characterName: String, viewModel: PartyViewModel) {
    var open by remember { mutableStateOf(false) }
    CollapsibleCard("Combat log", open, { open = !open }) {
        if (open) LogContents(characterName, viewModel)
    }
}

@Composable
private fun LogContents(characterName: String, viewModel: PartyViewModel) {
    DomainInterest(viewModel, Domain.LOGS)
    val state by viewModel.dynamicState.collectAsState()
    val scope = rememberCoroutineScope()
    val entries = state.combatLogs[characterName].orEmpty()
    var error by remember { mutableStateOf<String?>(null) }
    val time = remember { SimpleDateFormat("HH:mm:ss", Locale.getDefault()) }
    Column(modifier = Modifier.padding(top = 8.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("${entries.size} EVENTS", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
            if (entries.isNotEmpty()) {
                TextButton(onClick = {
                    scope.launch {
                        error = null
                        val result = viewModel.api.clearCombatLog(characterName)
                        if (result is ApiResult.Failure) error = result.message
                        viewModel.refreshDynamicStateNow()
                    }
                }) { Text("CLEAR HISTORY", color = Color(0xFFFB7185), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall) }
            }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall) }
        Column(modifier = Modifier.heightIn(max = 192.dp).verticalScroll(rememberScrollState())) {
            if (entries.isEmpty()) Text("No combat events yet", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            for (entry in entries.takeLast(50).reversed()) {
                Row(modifier = Modifier.padding(vertical = 2.dp)) {
                    Text(time.format(Date(entry.at)), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.alpha(0.6f).padding(end = 8.dp))
                    Text(entry.message, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = COLORS[entry.type] ?: MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}
