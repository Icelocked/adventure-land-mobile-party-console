package com.partyconsole.companion.ui.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
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
    var destination by remember { mutableStateOf<String?>(null) }
    var switching by remember { mutableStateOf(false) }
    var prefixStatus by remember { mutableStateOf<String?>(null) }
    val loaded by viewModel.stateLoaded.collectAsState()
    val scope = rememberCoroutineScope()
    val json = remember { Json { ignoreUnknownKeys = true } }

    LaunchedEffect(Unit) {
        (viewModel.api.getRoot("setup/state") as? ApiResult.Success)?.let { result ->
            runCatching { json.decodeFromString(PairingState.serializer(), result.value) }
                .getOrNull()?.let { requirePairing = it.requirePairing }
        }
    }
    // Seeded once the server's value has arrived - never from the empty
    // default, or Save would erase the real prefix.
    LaunchedEffect(loaded, dynamicState.bankboiPrefix) {
        if (bankboiPrefix == null && loaded) bankboiPrefix = dynamicState.bankboiPrefix
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
                        enabled = bankboiPrefix != null,
                        onValueChange = { bankboiPrefix = it.take(11); prefixStatus = null },
                        singleLine = true,
                        modifier = Modifier.weight(1f).padding(top = 6.dp),
                    )
                    Button(
                        enabled = bankboiPrefix != null,
                        modifier = Modifier.padding(start = 8.dp, top = 6.dp),
                        onClick = {
                            scope.launch {
                                prefixStatus = null
                                when (val result = viewModel.api.setBankboiPrefix((bankboiPrefix ?: "").trim())) {
                                    is ApiResult.Failure -> prefixStatus = result.message
                                    is ApiResult.Success -> {
                                        prefixStatus = "Saved"
                                        viewModel.refreshDynamicStateNow()
                                    }
                                }
                            }
                        },
                    ) { Text(if (prefixStatus == "Saved") "Saved" else "Save name") }
                }
                Text(
                    "Use 3–11 letters, numbers, or underscores. A number is added automatically, such as ${bankboiPrefix?.ifBlank { null } ?: "MyBank"}0.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                prefixStatus?.takeIf { it != "Saved" }?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall) }
            }
        }

        ALDataSection(viewModel)

        dynamicState.realmControl?.let { realm ->
            // party-inventory-panels.tsx: a switch asks first, with the Realm
            // Fatigue and Hop Sickness warnings, and waits while one runs.
            val blocked = realm.operation != null && realm.operation.phase !in setOf("complete", "failed")
            fun labelFor(key: String?) = realm.realms.find { it.key == key }?.label ?: key ?: "Unknown"
            val current = realm.currentRealm ?: realm.activeRealm
            Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Realm", style = MaterialTheme.typography.titleSmall)
                    Text(
                        "Current: ${if (realm.split) "Mixed realms" else labelFor(current)} · Home: ${labelFor(realm.homeRealm)}",
                        style = MaterialTheme.typography.labelSmall,
                        color = if (realm.split) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (realm.split) {
                        for (member in realm.characters) Text("${member.name}: ${member.realm ?: "offline"}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
                    }
                    val target = destination
                    if (target == null) {
                        TextButton(enabled = !blocked, onClick = { showRealms = !showRealms }) {
                            Text(if (showRealms) "Cancel" else "Change realm…")
                        }
                        if (showRealms) {
                            for (option in realm.realms) {
                                TextButton(
                                    // Nothing to do when the whole party is already there.
                                    enabled = !option.pvp && !blocked && (realm.split || option.key != current),
                                    onClick = { realmError = null; setHome = false; destination = option.key },
                                ) {
                                    Text("${option.label} (${"%,d".format(option.players)} players)${if (option.pvp) " — disabled" else ""}")
                                }
                            }
                        }
                    } else {
                        Text("Switch realm?", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
                        Text(
                            "This switches every active party character to ${labelFor(target)} and gives non-merchant characters Realm Fatigue.",
                            style = MaterialTheme.typography.labelSmall,
                        )
                        Text(
                            "Realm Fatigue: approximately 30 minutes. Home-realm rewards are paused; ordinary rewards continue.",
                            style = MaterialTheme.typography.labelSmall,
                        )
                        if (target != realm.homeRealm) {
                            Text(
                                "Outside your home realm: Hop Sickness applies −80 Luck, Gold, and XP, plus −20% output, until you return home or change your home realm through Bean.",
                                style = MaterialTheme.typography.labelSmall,
                            )
                            Row(verticalAlignment = Alignment.Top) {
                                Checkbox(checked = setHome, onCheckedChange = { setHome = it })
                                Column(modifier = Modifier.padding(top = 12.dp)) {
                                    Text("Set as home realm", style = MaterialTheme.typography.labelMedium)
                                    Text(
                                        "After switching, one non-merchant will visit Bean in Main and request the home change. Current game data exposes no separate home-change cooldown.",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        } else {
                            Text("This destination is already your home realm, so Hop Sickness should not apply.", style = MaterialTheme.typography.labelSmall)
                        }
                        realmError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall) }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            TextButton(enabled = !switching, onClick = { destination = null }) { Text("Cancel") }
                            Button(enabled = !switching, onClick = {
                                scope.launch {
                                    realmError = null
                                    switching = true
                                    when (val result = viewModel.api.switchRealm(target, setHome)) {
                                        is ApiResult.Failure -> realmError = result.message
                                        is ApiResult.Success -> {
                                            destination = null
                                            showRealms = false
                                            viewModel.refreshDynamicStateNow()
                                        }
                                    }
                                    switching = false
                                }
                            }) { Text(if (switching) "Starting…" else "Switch all characters") }
                        }
                    }
                    realm.operation?.let { operation ->
                        Text(
                            operation.phase.replace("-", " ").replaceFirstChar { it.uppercase() },
                            style = MaterialTheme.typography.labelMedium,
                            color = when (operation.phase) {
                                "failed" -> MaterialTheme.colorScheme.error
                                else -> MaterialTheme.colorScheme.onSurface
                            },
                            modifier = Modifier.padding(top = 8.dp),
                        )
                        operation.error?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error) }
                        for (member in operation.characters) Text("${member.name}: ${member.realm ?: "waiting"}", style = MaterialTheme.typography.labelSmall)
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

/** party-inventory-panels.tsx's ALData key-management panel - generate/reveal/copy the
 *  publishing key, check auth status, and "Prepare mail" (fills the fixed earthiverse/
 *  aldata_auth authentication mail so the user can review postage and send it themselves,
 *  same as the dashboard - this never auto-sends, since each message costs real gold). */
@Composable
private fun ALDataSection(viewModel: PartyViewModel) {
    val dynamicState by viewModel.dynamicState.collectAsState()
    val aldata = dynamicState.aldata
    val scope = rememberCoroutineScope()
    val clipboard = LocalClipboardManager.current
    var key by remember { mutableStateOf("") }
    var keyVisible by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var preparingMail by remember { mutableStateOf(false) }

    Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Column {
                    Text("ALData", style = MaterialTheme.typography.titleSmall)
                    Text(
                        "Auth: ${aldata?.auth ?: "NO"} · Publish: ${aldata?.publishStatus ?: "idle"}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                OutlinedButton(
                    enabled = !busy,
                    onClick = {
                        scope.launch {
                            busy = true
                            error = null
                            val result = viewModel.api.checkAlDataAuth()
                            if (result is ApiResult.Failure) error = result.message
                            viewModel.refreshDynamicStateNow()
                            busy = false
                        }
                    },
                ) { Text("Check status") }
            }

            Row(modifier = Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = if (keyVisible) key else if (key.isNotEmpty()) "•".repeat(key.length) else "",
                    onValueChange = {},
                    readOnly = true,
                    singleLine = true,
                    placeholder = { Text(if (aldata?.hasKey == true) "Stored key - reveal to view" else "No key generated") },
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = {
                    scope.launch {
                        if (key.isEmpty()) {
                            when (val result = viewModel.api.revealAlDataKey()) {
                                is ApiResult.Success -> key = result.value
                                is ApiResult.Failure -> error = result.message
                            }
                        }
                        keyVisible = !keyVisible
                    }
                }) {
                    Icon(if (keyVisible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility, contentDescription = "Reveal key")
                }
                IconButton(enabled = key.isNotEmpty(), onClick = { clipboard.setText(AnnotatedString(key)) }) {
                    Icon(Icons.Filled.ContentCopy, contentDescription = "Copy key")
                }
            }

            Row(modifier = Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    enabled = !busy,
                    modifier = Modifier.weight(1f),
                    onClick = {
                        scope.launch {
                            busy = true
                            error = null
                            when (val result = viewModel.api.generateAlDataKey()) {
                                is ApiResult.Success -> { key = result.value; keyVisible = true }
                                is ApiResult.Failure -> error = result.message
                            }
                            viewModel.refreshDynamicStateNow()
                            busy = false
                        }
                    },
                ) { Text("Generate key") }
                Button(
                    enabled = !busy && aldata?.hasKey == true,
                    modifier = Modifier.weight(1f),
                    onClick = {
                        scope.launch {
                            busy = true
                            error = null
                            val revealed = if (key.isNotEmpty()) ApiResult.Success(key) else viewModel.api.revealAlDataKey()
                            when (revealed) {
                                is ApiResult.Success -> { key = revealed.value; preparingMail = true }
                                is ApiResult.Failure -> error = revealed.message
                            }
                            busy = false
                        }
                    },
                ) { Text("Prepare mail") }
            }

            if (preparingMail && key.isNotEmpty()) {
                Card(modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(
                            "To earthiverse, subject aldata_auth. Do not resend - each message costs gold.",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Row(modifier = Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = {
                                scope.launch {
                                    when (val result = viewModel.api.sendMail("earthiverse", "aldata_auth", key, 1)) {
                                        is ApiResult.Failure -> error = result.message
                                        is ApiResult.Success -> preparingMail = false
                                    }
                                }
                            }) { Text("Send") }
                            OutlinedButton(onClick = { preparingMail = false }) { Text("Cancel") }
                        }
                    }
                }
            }

            Text(
                "Public market browsing needs no key. Publishing requires authentication: generate a unique key, then Prepare mail to send it to ALData for verification. " +
                    "ALData stores this key in plaintext - never reuse a password. Allow about a minute, then check status.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 8.dp),
            )
            (error ?: aldata?.error)?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 4.dp))
            }
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
