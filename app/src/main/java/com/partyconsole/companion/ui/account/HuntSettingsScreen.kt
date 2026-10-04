package com.partyconsole.companion.ui.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.HuntSettings
import com.partyconsole.companion.model.farmingContext
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.characterdetail.sections.ConfigLoadingNote
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive

/** hunt-settings-control.tsx + the Hunt blacklist from farming-mode-
 *  control.tsx's settings dialog, for one character. Like the dashboard,
 *  every control saves its own field as soon as it changes (thresholds when
 *  the field loses focus), always scoped with `character`; a character
 *  following the leader sees the leader's settings read-only. */
@Composable
fun HuntSettingsScreen(viewModel: PartyViewModel, name: String, onBack: () -> Unit) {
    val dynamicState by viewModel.dynamicState.collectAsState()
    val loaded by viewModel.stateLoaded.collectAsState()
    val scope = rememberCoroutineScope()
    // Monster names/sprites live in the bestiary catalog, NOT the item
    // catalog - a monster id like "booboo" would never resolve there.
    val monsterById = remember(dynamicState.bestiaryCatalog) { dynamicState.bestiaryCatalog.associateBy { it.id } }

    val context = dynamicState.farmingContext(name)
    val inherited = context.followingLeader != null
    val settings = context.settings ?: HuntSettings()
    val editable = loaded && !inherited

    var deaths by remember(name) { mutableStateOf(settings.deathThreshold.toString()) }
    var expirations by remember(name) { mutableStateOf(settings.expirationThreshold.toString()) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var clearAllError by remember { mutableStateOf<String?>(null) }
    var blacklistBusy by remember { mutableStateOf(false) }
    var confirmingClearAll by remember { mutableStateOf(false) }

    LaunchedEffect(settings.deathThreshold, settings.expirationThreshold) {
        deaths = settings.deathThreshold.toString()
        expirations = settings.expirationThreshold.toString()
    }

    fun save(patch: Map<String, JsonElement>) {
        if (!editable) return
        scope.launch {
            busy = true
            error = null
            when (val result = viewModel.api.saveHuntSettings(name, patch)) {
                is ApiResult.Failure -> error = result.message
                is ApiResult.Success -> viewModel.refreshDynamicStateNow()
            }
            busy = false
        }
    }
    fun threshold(key: String, text: String, current: Int) {
        val n = text.trim().toIntOrNull()
        if (n == null || n < 1) {
            error = "Thresholds must be positive whole numbers."
            return
        }
        if (n != current) save(mapOf(key to JsonPrimitive(n)))
    }

    val blacklist = context.blacklist.entries.sortedBy { it.key }

    fun clearBlacklist(monsterId: String?) {
        scope.launch {
            blacklistBusy = true
            error = null
            clearAllError = null
            when (val result = viewModel.api.updateHuntBlacklist(name, if (monsterId != null) "remove" else "clear", monsterId)) {
                is ApiResult.Failure -> if (monsterId != null) error = result.message else clearAllError = result.message
                is ApiResult.Success -> {
                    if (monsterId == null) confirmingClearAll = false
                    viewModel.refreshDynamicStateNow()
                }
            }
            blacklistBusy = false
        }
    }

    AccountScreenScaffold("Hunt settings · ${context.owner}", onBack, onRefresh = { scope.launch { viewModel.refreshDynamicStateNow() } }) {
        Column(modifier = Modifier.fillMaxSize()) {
            Column(modifier = Modifier.padding(12.dp)) {
                Text(
                    "Configure Hunt relocation and automatic blacklisting. Blacklisted quests are skipped until you clear the entry. Normal farming selections are unaffected.",
                    style = MaterialTheme.typography.labelSmall,
                )
                if (inherited) Text("Settings inherited from the leader (${context.owner}).", style = MaterialTheme.typography.labelSmall)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = settings.relocateIfCompeting,
                        enabled = editable && !busy,
                        onCheckedChange = { save(mapOf("relocateIfCompeting" to JsonPrimitive(it))) },
                    )
                    Text("Relocate to different spawn if competing", style = MaterialTheme.typography.bodySmall)
                }
                Text(
                    "Relocate only when everyone’s hunt radius is empty and a competing farmer is nearby.",
                    style = MaterialTheme.typography.labelSmall,
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = settings.blacklistDeaths,
                        enabled = editable && !busy,
                        onCheckedChange = { save(mapOf("blacklistDeaths" to JsonPrimitive(it))) },
                    )
                    Text("Blacklist hunts after", style = MaterialTheme.typography.bodySmall)
                    OutlinedTextField(
                        value = deaths,
                        enabled = editable && !busy && settings.blacklistDeaths,
                        onValueChange = { deaths = it },
                        singleLine = true,
                        modifier = Modifier.width(64.dp).padding(horizontal = 6.dp)
                            .onFocusChanged { if (!it.isFocused && deaths != settings.deathThreshold.toString()) threshold("deathThreshold", deaths, settings.deathThreshold) },
                    )
                    Text("deaths", style = MaterialTheme.typography.bodySmall)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = settings.blacklistExpirations,
                        enabled = editable && !busy,
                        onCheckedChange = { save(mapOf("blacklistExpirations" to JsonPrimitive(it))) },
                    )
                    Text("Blacklist hunts after", style = MaterialTheme.typography.bodySmall)
                    OutlinedTextField(
                        value = expirations,
                        enabled = editable && !busy && settings.blacklistExpirations,
                        onValueChange = { expirations = it },
                        singleLine = true,
                        modifier = Modifier.width(64.dp).padding(horizontal = 6.dp)
                            .onFocusChanged { if (!it.isFocused && expirations != settings.expirationThreshold.toString()) threshold("expirationThreshold", expirations, settings.expirationThreshold) },
                    )
                    Text("hunts expire", style = MaterialTheme.typography.bodySmall)
                }
                Text(
                    "Failures accumulate per monster across Hunts. Clearing its blacklist entry resets its counts. Turning a rule off keeps counts and existing blacklist entries.",
                    style = MaterialTheme.typography.labelSmall,
                )
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                ConfigLoadingNote(loaded)
            }

            Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Hunt blacklist", style = MaterialTheme.typography.titleSmall)
                if (!confirmingClearAll) {
                    TextButton(enabled = editable && blacklist.isNotEmpty(), onClick = { confirmingClearAll = true }) {
                        Text("Clear all", color = MaterialTheme.colorScheme.error)
                    }
                }
            }
            if (confirmingClearAll) {
                Column(modifier = Modifier.padding(horizontal = 12.dp)) {
                    Text(
                        "Remove all ${blacklist.size} blacklisted monsters for ${context.owner}? Hunt can accept quests for these monsters again.",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(enabled = editable && !blacklistBusy, onClick = { clearBlacklist(null) }) { Text(if (blacklistBusy) "Clearing..." else "Clear all") }
                        TextButton(enabled = !blacklistBusy, onClick = { confirmingClearAll = false; clearAllError = null }) { Text("Cancel") }
                    }
                    clearAllError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                }
            }
            if (blacklist.isEmpty()) {
                EmptyState("No monsters blacklisted.")
            } else {
                LazyColumn(modifier = Modifier.weight(1f), contentPadding = PaddingValues(12.dp)) {
                    items(blacklist) { (id, entry) ->
                        Card(modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                            Row(modifier = Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                                SpriteIcon(monsterById[id]?.sprite, size = 28.dp)
                                Column(modifier = Modifier.weight(1f).padding(start = 8.dp)) {
                                    Text(monsterById[id]?.name ?: id, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
                                    Text(
                                        "${entry.reason} · ${java.text.DateFormat.getDateTimeInstance().format(java.util.Date(entry.at))}",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                Button(enabled = editable && !blacklistBusy, onClick = { clearBlacklist(id) }) { Text("Clear") }
                            }
                        }
                    }
                }
            }
        }
    }
}
