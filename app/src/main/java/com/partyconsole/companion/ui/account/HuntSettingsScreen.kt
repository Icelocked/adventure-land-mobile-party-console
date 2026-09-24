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
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import kotlinx.coroutines.launch

/** hunt-settings-control.tsx + the Hunt blacklist viewer from farming-
 *  mode-control.tsx's settings dialog, ported as their own screen. */
@Composable
fun HuntSettingsScreen(viewModel: PartyViewModel, onBack: () -> Unit) {
    val dynamicState by viewModel.dynamicState.collectAsState()
    val scope = rememberCoroutineScope()
    // Monster names/sprites live in the bestiary catalog, NOT the item
    // catalog - a monster id like "booboo" would never resolve there.
    val monsterById = remember(dynamicState.bestiaryCatalog) { dynamicState.bestiaryCatalog.associateBy { it.id } }
    fun monsterFor(id: String): com.partyconsole.companion.model.BestiaryMonster? = monsterById[id]

    var relocate by remember { mutableStateOf(true) }
    var blacklistDeaths by remember { mutableStateOf(true) }
    var deathThreshold by remember { mutableStateOf("3") }
    var blacklistExpirations by remember { mutableStateOf(false) }
    var expirationThreshold by remember { mutableStateOf("1") }
    var seeded by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var blacklistBusy by remember { mutableStateOf(false) }

    LaunchedEffect(dynamicState.huntSettings) {
        val settings = dynamicState.huntSettings
        if (!seeded && settings != null) {
            relocate = settings.relocateIfCompeting
            blacklistDeaths = settings.blacklistDeaths
            deathThreshold = settings.deathThreshold.toString()
            blacklistExpirations = settings.blacklistExpirations
            expirationThreshold = settings.expirationThreshold.toString()
            seeded = true
        }
    }

    val blacklist = dynamicState.huntBlacklist.entries.sortedBy { it.key }

    fun clearBlacklist(monsterId: String?) {
        scope.launch {
            blacklistBusy = true
            when (val result = viewModel.api.updateHuntBlacklist(if (monsterId != null) "remove" else "clear", monsterId)) {
                is ApiResult.Failure -> error = result.message
                is ApiResult.Success -> viewModel.refreshDynamicStateNow()
            }
            blacklistBusy = false
        }
    }

    AccountScreenScaffold("Hunt settings", onBack, onRefresh = { scope.launch { viewModel.refreshDynamicStateNow() } }) {
        Column(modifier = Modifier.fillMaxSize()) {
            Column(modifier = Modifier.padding(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = relocate, onCheckedChange = { relocate = it })
                    Text("Relocate if competing with another party", style = MaterialTheme.typography.bodySmall)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = blacklistDeaths, onCheckedChange = { blacklistDeaths = it })
                    Text("Blacklist after", style = MaterialTheme.typography.bodySmall)
                    OutlinedTextField(
                        value = deathThreshold,
                        onValueChange = { new -> if (new.all { it.isDigit() }) deathThreshold = new },
                        singleLine = true,
                        modifier = Modifier.width(64.dp).padding(horizontal = 6.dp),
                    )
                    Text("deaths", style = MaterialTheme.typography.bodySmall)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = blacklistExpirations, onCheckedChange = { blacklistExpirations = it })
                    Text("Blacklist after", style = MaterialTheme.typography.bodySmall)
                    OutlinedTextField(
                        value = expirationThreshold,
                        onValueChange = { new -> if (new.all { it.isDigit() }) expirationThreshold = new },
                        singleLine = true,
                        modifier = Modifier.width(64.dp).padding(horizontal = 6.dp),
                    )
                    Text("expirations", style = MaterialTheme.typography.bodySmall)
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                Button(
                    enabled = !saving,
                    onClick = {
                        scope.launch {
                            saving = true
                            error = null
                            when (
                                val result = viewModel.api.saveHuntSettings(
                                    relocate,
                                    blacklistDeaths,
                                    deathThreshold.toIntOrNull() ?: 1,
                                    blacklistExpirations,
                                    expirationThreshold.toIntOrNull() ?: 1,
                                )
                            ) {
                                is ApiResult.Failure -> error = result.message
                                is ApiResult.Success -> viewModel.refreshDynamicStateNow()
                            }
                            saving = false
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (saving) "Saving..." else "Save settings") }
            }

            Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Hunt blacklist", style = MaterialTheme.typography.titleSmall)
                Button(enabled = !blacklistBusy && blacklist.isNotEmpty(), onClick = { clearBlacklist(null) }) { Text("Clear all") }
            }
            if (blacklist.isEmpty()) {
                EmptyState("No monsters blacklisted.")
            } else {
                LazyColumn(modifier = Modifier.weight(1f), contentPadding = PaddingValues(12.dp)) {
                    items(blacklist) { (id, entry) ->
                        Card(modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                            Row(modifier = Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                                SpriteIcon(monsterFor(id)?.sprite, size = 28.dp)
                                Column(modifier = Modifier.weight(1f).padding(start = 8.dp)) {
                                    Text(monsterFor(id)?.name ?: id, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
                                    Text(
                                        "${entry.reason} · ${java.text.DateFormat.getDateTimeInstance().format(java.util.Date(entry.at))}",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                Button(enabled = !blacklistBusy, onClick = { clearBlacklist(id) }) { Text("Clear") }
                            }
                        }
                    }
                }
            }
        }
    }
}
