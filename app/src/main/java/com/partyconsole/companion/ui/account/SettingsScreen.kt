package com.partyconsole.companion.ui.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
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
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.RosterMember
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

@Serializable
private data class PairingState(val requirePairing: Boolean = false)

/** Ports hosting-settings.tsx (pairing toggle), account-settings.tsx
 *  (roster + bankboi prefix), and the realm-control block (switch every
 *  active character to a different Adventure Land realm together).
 *  Console-update checks and dashboard-state import/export are a fast-
 *  follow, not in v1. */
@Composable
fun SettingsScreen(viewModel: PartyViewModel, onBack: () -> Unit) {
    val roster by viewModel.roster.collectAsState()
    val dynamicState by viewModel.dynamicState.collectAsState()
    var requirePairing by remember { mutableStateOf<Boolean?>(null) }
    var bankboiPrefix by remember { mutableStateOf<String?>(null) }
    var showRealms by remember { mutableStateOf(false) }
    var realmError by remember { mutableStateOf<String?>(null) }
    var setHome by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val json = remember { Json { ignoreUnknownKeys = true } }

    LaunchedEffect(Unit) {
        (viewModel.api.getRoot("setup/state") as? ApiResult.Success)?.let { result ->
            runCatching { json.decodeFromString(PairingState.serializer(), result.value) }
                .getOrNull()?.let { requirePairing = it.requirePairing }
        }
    }
    LaunchedEffect(dynamicState.bankboiPrefix) {
        if (bankboiPrefix == null) bankboiPrefix = dynamicState.bankboiPrefix
    }

    AccountScreenScaffold("Settings", onBack, onRefresh = { scope.launch { viewModel.refreshDynamicStateNow() } }) {
        Card(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column {
                    Text("Require secure pairing", style = MaterialTheme.typography.titleSmall)
                    Text(
                        "Extra login gate on top of network access",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(
                    checked = requirePairing == true,
                    onCheckedChange = { checked ->
                        scope.launch {
                            val body = JsonObject(mapOf("requirePairing" to JsonPrimitive(checked)))
                            if (viewModel.api.postRoot("setup/pairing", body) is ApiResult.Success) {
                                requirePairing = checked
                            }
                        }
                    },
                )
            }
        }

        Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Bankboi prefix", style = MaterialTheme.typography.titleSmall)
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = bankboiPrefix ?: "",
                        onValueChange = { bankboiPrefix = it },
                        singleLine = true,
                        modifier = Modifier.weight(1f).padding(top = 6.dp),
                    )
                    Button(
                        modifier = Modifier.padding(start = 8.dp, top = 6.dp),
                        onClick = { scope.launch { viewModel.api.setBankboiPrefix(bankboiPrefix ?: "") } },
                    ) { Text("Save") }
                }
            }
        }

        dynamicState.realmControl?.let { realm ->
            Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Realm: ${realm.activeRealm ?: "unknown"}", style = MaterialTheme.typography.titleSmall)
                    Text(
                        "Home: ${realm.homeRealm ?: "unknown"}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    realmError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall) }
                    TextButton(onClick = { showRealms = !showRealms }) {
                        Text(if (showRealms) "Cancel" else "Switch realm...")
                    }
                    if (showRealms) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(checked = setHome, onCheckedChange = { setHome = it })
                            Text("Set as home realm", style = MaterialTheme.typography.labelSmall)
                        }
                        for (option in realm.realms.filter { !it.pvp }) {
                            TextButton(onClick = {
                                scope.launch {
                                    when (val result = viewModel.api.switchRealm(option.key, setHome)) {
                                        is ApiResult.Failure -> realmError = result.message
                                        is ApiResult.Success -> { realmError = null; showRealms = false }
                                    }
                                }
                            }) {
                                Text("${option.label} (${option.players} online)")
                            }
                        }
                    }
                }
            }
        }

        Text(
            "Characters",
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
        )
        LazyColumn(contentPadding = PaddingValues(horizontal = 12.dp)) {
            items(roster.values.toList(), key = { it.name }) { RosterRow(it) }
        }
    }
}

@Composable
private fun RosterRow(member: RosterMember) {
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(member.name, style = MaterialTheme.typography.bodyMedium)
            Text("Lv ${member.level} ${member.ctype}", style = MaterialTheme.typography.labelSmall)
        }
    }
}
