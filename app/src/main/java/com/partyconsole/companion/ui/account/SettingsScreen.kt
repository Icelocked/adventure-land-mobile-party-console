package com.partyconsole.companion.ui.account

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.characterdetail.sections.ConfigLoadingNote
import com.partyconsole.companion.ui.components.CharacterPortrait
import com.partyconsole.companion.ui.components.rememberConsoleUpdates
import com.partyconsole.companion.ui.roster.CreateCharacterSheet
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

private val settingsJson = Json { ignoreUnknownKeys = true; coerceInputValues = true }
private val Rose200 = Color(0xFFFECDD3)
private val Amber200 = Color(0xFFFDE68A)
private val Emerald200 = Color(0xFFA7F3D0)
private val Slate300 = Color(0xFFCBD5E1)

@Serializable
private data class PairingState(val requirePairing: Boolean = false)

@Composable
private fun SettingsCard(label: String, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(6.dp)).padding(16.dp).semantics { contentDescription = label },
        verticalArrangement = Arrangement.spacedBy(8.dp),
        content = content,
    )
}

/** party-inventory-panels.tsx "Interface settings" as a screen (the PWA's
 *  SettingsScreen.tsx), in its order: state import/export, realm,
 *  characters (create, member grid, bankboi name), ALData, hosting, console
 *  updates and debugging - then this app's own connection control and the
 *  Steam recovery offered while a handoff has failed. */
@Composable
fun SettingsScreen(viewModel: PartyViewModel, onBack: () -> Unit, onOpenMail: () -> Unit = {}, onChangeServer: () -> Unit = {}) {
    val dynamicState by viewModel.dynamicState.collectAsState()
    val loaded by viewModel.stateLoaded.collectAsState()
    val scope = rememberCoroutineScope()
    var bankboiPrefix by remember { mutableStateOf<String?>(null) }
    var prefixStatus by remember { mutableStateOf<String?>(null) }
    var creating by remember { mutableStateOf(false) }
    var steamError by remember { mutableStateOf<String?>(null) }
    // Seed once, from the real config value - never from the empty default.
    LaunchedEffect(loaded, dynamicState.bankboiPrefix) { if (bankboiPrefix == null && loaded) bankboiPrefix = dynamicState.bankboiPrefix }

    AccountScreenScaffold("Interface settings", onBack, onRefresh = { scope.launch { viewModel.refreshDynamicStateNow() } }) {
        Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Manage saved dashboard state, character connections, and market access.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            DashboardStateImport(viewModel)
            RealmSection(viewModel)
            SettingsCard("Characters") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Characters", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall)
                        Text("CREATE AND ADD CHARACTERS TO YOUR ACCOUNT ROSTER.", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Color(0xFF94A3B8))
                    }
                    OutlinedButton(onClick = { creating = true }) { Text("Create character") }
                }
                AccountMembers(viewModel)
                Text("Default name for bankboi", fontWeight = FontWeight.Medium, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = bankboiPrefix.orEmpty(),
                        enabled = bankboiPrefix != null,
                        onValueChange = { bankboiPrefix = it.take(11); prefixStatus = null },
                        singleLine = true,
                        modifier = Modifier.weight(1f).semantics { contentDescription = "Default name for bankboi" },
                    )
                    Button(enabled = bankboiPrefix != null, onClick = {
                        scope.launch {
                            prefixStatus = null
                            when (val result = viewModel.api.setBankboiPrefix(bankboiPrefix.orEmpty().trim())) {
                                is ApiResult.Failure -> prefixStatus = result.message
                                is ApiResult.Success -> { prefixStatus = "Saved"; viewModel.refreshDynamicStateNow() }
                            }
                        }
                    }) { Text(if (prefixStatus == "Saved") "Saved" else "Save name") }
                }
                Text("Use 3–11 letters, numbers, or underscores. A number is added automatically, such as ${bankboiPrefix?.ifEmpty { null } ?: "MyBank"}0.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                prefixStatus?.takeIf { it != "Saved" }?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                ConfigLoadingNote(loaded)
            }
            ALDataSection(viewModel, onOpenMail)
            HostingSettings(viewModel)
            ConsoleUpdateSettings(viewModel)
            NotificationsSection(viewModel)
            SettingsCard("App connection") {
                Text("App connection", fontWeight = FontWeight.Medium, style = MaterialTheme.typography.bodySmall)
                Text("Where this app fetches party data from. Changing it forgets this server and its pairing.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedButton(onClick = onChangeServer) { Text("Change server address") }
            }
            if (dynamicState.steamSwitch?.phase == "failed") {
                // party-inventory-panels.tsx: offered while a Steam handoff has failed.
                OutlinedButton(onClick = {
                    scope.launch {
                        steamError = null
                        (viewModel.api.steamRecover() as? ApiResult.Failure)?.let { steamError = it.message.ifEmpty { "Steam recovery failed" } }
                    }
                }) { Text("Recover Steam handoff after characters are offline") }
                steamError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            }
        }
    }
    if (creating) CreateCharacterSheet(viewModel) { creating = false }
}

/** account-settings.tsx's member grid: roster and bankbois with the live
 *  doll/sprite or the saved appearance, class and level, padded to eight
 *  dotted empty slots. */
@Composable
private fun AccountMembers(viewModel: PartyViewModel) {
    val state by viewModel.dynamicState.collectAsState()
    val roster by viewModel.roster.collectAsState()
    val characters by viewModel.characters.collectAsState()
    val diagnostics by viewModel.characterDetails.collectAsState()
    data class Member(val name: String, val ctype: String, val level: Int?)
    val members = (roster.values.map { Member(it.name, it.ctype, it.level) } + state.bankbois.map { Member(it.name, it.ctype ?: "merchant", it.level) }).distinctBy { it.name }
    val cells = members.map { it as Member? } + List(maxOf(0, 8 - members.size)) { null }
    for (row in cells.chunked(2)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for (member in row) {
                Column(
                    modifier = Modifier.weight(1f).heightIn(min = 112.dp).border(1.dp, Color(0xFF475569), RoundedCornerShape(4.dp)).padding(8.dp)
                        .semantics { contentDescription = member?.name ?: "Empty character slot" },
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    if (member != null) {
                        val live = diagnostics[member.name]
                        val saved = state.characterAppearances[member.name]
                        val useLive = live?.characterSprite != null || live?.characterDollHtml != null
                        val html = if (useLive) live?.characterDollHtml else saved?.characterDollHtml
                        val spriteJson = if (useLive) live?.characterSprite else saved?.characterSprite
                        val sprite = spriteJson?.let { runCatching { settingsJson.decodeFromJsonElement(com.partyconsole.companion.model.Sprite.serializer(), it) }.getOrNull() }
                        val skin = if (useLive) live?.skin else saved?.skin
                        Box(modifier = Modifier.size(width = 64.dp, height = 80.dp), contentAlignment = Alignment.Center) {
                            if (html != null || sprite != null) CharacterPortrait(html, sprite, skin, modifier = Modifier.size(width = 64.dp, height = 80.dp))
                            else Text("Appearance saved after first connection", style = MaterialTheme.typography.labelSmall, color = Color(0xFF94A3B8))
                        }
                        val vitals = characters[member.name]?.vitals
                        Text(member.name, style = MaterialTheme.typography.bodySmall)
                        Text("${(vitals?.ctype?.ifEmpty { null } ?: member.ctype).replaceFirstChar { it.uppercase() }} · Lv ${vitals?.level?.takeIf { it != 0 } ?: member.level ?: "—"}", style = MaterialTheme.typography.labelSmall, color = Slate300)
                    }
                }
            }
            if (row.size == 1) Box(modifier = Modifier.weight(1f))
        }
    }
}

/** party-inventory-panels.tsx's ALData key panel: generate / reveal / copy
 *  the publishing key, check auth status, the pending-verification note,
 *  and "Prepare mail" (opens the mail composer with the earthiverse /
 *  aldata_auth draft - it never sends by itself). */
@Composable
private fun ALDataSection(viewModel: PartyViewModel, onOpenMail: () -> Unit) {
    val dynamicState by viewModel.dynamicState.collectAsState()
    val pending by viewModel.aldataAuthPending.collectAsState()
    val authStatus by viewModel.aldataAuthStatus.collectAsState()
    val aldata = dynamicState.aldata
    val scope = rememberCoroutineScope()
    val clipboard = LocalClipboardManager.current
    var key by remember { mutableStateOf("") }
    var keyVisible by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    // party-header.tsx: opening settings loads a stored key (still masked) so Copy works.
    LaunchedEffect(aldata?.hasKey) {
        if (aldata?.hasKey == true && key.isEmpty()) (viewModel.api.revealAlDataKey() as? ApiResult.Success)?.let { key = it.value }
    }
    SettingsCard("ALData") {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text("ALData", fontWeight = FontWeight.Medium, style = MaterialTheme.typography.bodySmall)
                if (pending) Text("Waiting for mail delivery and ALData verification… Do not resend; each message costs gold.", color = Amber200, style = MaterialTheme.typography.bodySmall)
                Text("AUTH: ${authStatus ?: aldata?.auth ?: "NO"} · PUBLISH: ${aldata?.publishStatus ?: "idle"}".uppercase(), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            OutlinedButton(enabled = !busy, onClick = {
                scope.launch {
                    busy = true
                    error = null
                    when (val result = viewModel.api.checkAlDataAuth()) {
                        is ApiResult.Failure -> error = result.message
                        is ApiResult.Success -> {
                            viewModel.aldataAuthStatus.value = result.value
                            if (result.value == "CORRECT") viewModel.aldataAuthPending.value = false
                        }
                    }
                    viewModel.refreshDynamicStateNow()
                    busy = false
                }
            }) { Text("Check status") }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = if (keyVisible) key else "•".repeat(key.length),
                onValueChange = {},
                readOnly = true,
                singleLine = true,
                placeholder = { Text(if (aldata?.hasKey == true) "Stored key - reveal to view" else "No key generated") },
                textStyle = MaterialTheme.typography.labelSmall.copy(fontFamily = FontFamily.Monospace),
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = {
                scope.launch {
                    if (key.isEmpty()) when (val result = viewModel.api.revealAlDataKey()) {
                        is ApiResult.Success -> key = result.value
                        is ApiResult.Failure -> error = result.message
                    }
                    keyVisible = !keyVisible
                }
            }) { Icon(if (keyVisible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility, contentDescription = "Reveal key") }
            IconButton(enabled = key.isNotEmpty(), onClick = { clipboard.setText(AnnotatedString(key)) }) { Icon(Icons.Filled.ContentCopy, contentDescription = "Copy key") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(enabled = !busy, modifier = Modifier.weight(1f), onClick = {
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
            }) { Text("Generate key") }
            OutlinedButton(enabled = !busy && aldata?.hasKey == true, modifier = Modifier.weight(1f), onClick = {
                scope.launch {
                    busy = true
                    error = null
                    val result = if (key.isNotEmpty()) ApiResult.Success(key) else viewModel.api.revealAlDataKey()
                    // use-party-console.tsx: Prepare mail opens the mail composer with the draft (postage shown there).
                    when (result) {
                        is ApiResult.Success -> {
                            viewModel.mailDraft.value = MailDraft("earthiverse", "aldata_auth", result.value)
                            onOpenMail()
                        }
                        is ApiResult.Failure -> error = result.message
                    }
                    busy = false
                }
            }) { Text("Prepare mail") }
        }
        Text(
            "Public market browsing needs no key or separate ALData server. Publishing requires authentication: generate a unique key. Prepare mail opens a prefilled authentication mail. Review the postage and click Send; your merchant will send it. ALData stores this key in plaintext; never reuse a password. Allow about a minute, then check status.",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        (error ?: aldata?.error)?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall) }
    }
}

/** hosting-settings.tsx HostingSettings: the pairing requirement and the setup link. */
@Composable
private fun HostingSettings(viewModel: PartyViewModel) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var required by remember { mutableStateOf<Boolean?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    LaunchedEffect(Unit) {
        when (val result = viewModel.api.getRoot("setup/state")) {
            is ApiResult.Failure -> error = "Choose Load setup to pair this browser."
            is ApiResult.Success -> runCatching { settingsJson.decodeFromString(PairingState.serializer(), result.value).requirePairing }
                .onSuccess { required = it }.onFailure { error = "Choose Load setup to pair this browser." }
        }
    }
    fun change(requirePairing: Boolean) = scope.launch {
        busy = true
        error = ""
        when (val result = viewModel.api.postRoot("setup/pairing", JsonObject(mapOf("requirePairing" to JsonPrimitive(requirePairing))))) {
            is ApiResult.Failure -> error = result.message
            is ApiResult.Success -> required = runCatching { settingsJson.decodeFromString(PairingState.serializer(), result.value).requirePairing }.getOrDefault(requirePairing)
        }
        busy = false
    }
    SettingsCard("Hosting") {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = required == true, enabled = !busy && required != null, onCheckedChange = { change(it) }, modifier = Modifier.semantics { contentDescription = "Require secure pairing" })
            Text("Require secure pairing", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall)
        }
        Text("Require paired browsers and private Steam connection tokens. Recommended when hosting at a publicly accessible URL; use HTTPS. When off, anyone who can reach this dashboard can control it.", style = MaterialTheme.typography.labelSmall)
        if (required == true) Text("This browser is authorized. Unpaired browsers and tokenless Steam loaders must reconnect using an invitation or a new private loader.", color = Amber200, style = MaterialTheme.typography.labelSmall)
        OutlinedButton(onClick = {
            runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(viewModel.api.baseUrl.trimEnd('/') + "/setup"))) }
        }) { Text("Load setup") }
        if (error.isNotEmpty()) Text(error, color = Color(0xFFFDA4AF), style = MaterialTheme.typography.bodySmall)
    }
}

/** console-updates.tsx ConsoleUpdateSettings (with DebugInstanceSettings). */
@Composable
private fun ConsoleUpdateSettings(viewModel: PartyViewModel) {
    val scope = rememberCoroutineScope()
    val state = rememberConsoleUpdates(viewModel)
    var actionError by remember { mutableStateOf("") }
    fun action(name: String, value: Map<String, Any> = emptyMap()) = scope.launch {
        actionError = ""
        val body = JsonObject(value.mapValues { (_, v) -> if (v is Boolean) JsonPrimitive(v) else JsonPrimitive(v.toString()) })
        (viewModel.api.postRoot("console-update/$name", body) as? ApiResult.Failure)?.let { actionError = it.message.ifEmpty { "Update request failed" } }
    }
    val phase = state?.phase.orEmpty()
    val busy = state != null && phase in setOf("checking", "downloading", "restarting")
    SettingsCard("Adventureland Party Console") {
        Text("Adventureland Party Console", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall)
        Text("Installed version: ${state?.current ?: "Checking…"}", style = MaterialTheme.typography.bodySmall)
        if (state?.updateAvailable == true) {
            Text("New release available: ${(state.available as? JsonPrimitive)?.content}" + (state.notes?.ifEmpty { null }?.let { " · Release notes: $it" } ?: ""), color = Emerald200, style = MaterialTheme.typography.bodySmall)
        }
        if (state != null) {
            Text(
                when (phase) {
                    "ready" -> "Update downloaded. Restart when you are ready."
                    "restarting" -> "Pausing work and restarting. This page will reconnect automatically."
                    "idle" -> if (state.checkedAt != null) "Up to date." else "Waiting for the first update check."
                    else -> phase.replaceFirstChar { it.uppercase() }
                },
                style = MaterialTheme.typography.bodySmall,
            )
        }
        @OptIn(ExperimentalLayoutApi::class)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(enabled = !busy && state != null, onClick = { action("check") }) { Text("Check now") }
            if (state?.updateAvailable == true && state.managed == true && phase !in setOf("ready", "blocked")) {
                OutlinedButton(enabled = !busy, onClick = { action("download") }) { Text("Download and install update") }
            }
            if (state?.managed == true && phase in setOf("ready", "blocked")) OutlinedButton(onClick = { action("restart") }) { Text("Restart now") }
        }
        Row(verticalAlignment = Alignment.Top) {
            Checkbox(checked = state?.automatic == true, enabled = state?.managed == true && !busy, onCheckedChange = { action("preferences", mapOf("automatic" to it)) })
            Text("Automatically download and install new versions when available", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 12.dp))
        }
        Text("While running, updates download and wait for Restart now. At startup, enabled automatic updates install before characters start. Local source edits must be reconciled before installing.", style = MaterialTheme.typography.labelSmall, color = Slate300)
        if (state != null && state.managed != true) Text("Development checkout: update notifications only. Update your source manually, or use the editable release package for managed updates.", color = Amber200, style = MaterialTheme.typography.labelSmall)
        DebugInstanceSettings(viewModel)
        (actionError.ifEmpty { null } ?: state?.error)?.let { Text(it, color = Color(0xFFFDA4AF), style = MaterialTheme.typography.bodySmall) }
    }
}

@Serializable
private data class DebugState(val phase: String = "", val message: String = "", val error: String? = null, val port: Int? = null, val token: String? = null, val project: String? = null, val insideDebug: Boolean = false)

/** debug-instance.tsx DebugInstanceSettings: start / stop the Cave debug
 *  instance (polled every 1.5 s) and open its console. */
@Composable
private fun DebugInstanceSettings(viewModel: PartyViewModel) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var state by remember { mutableStateOf<DebugState?>(null) }
    var error by remember { mutableStateOf("") }
    var pending by remember { mutableStateOf(false) }
    LaunchedEffect(viewModel) {
        while (true) {
            when (val result = viewModel.api.consoleDebug()) {
                is ApiResult.Failure -> error = "Debug service is starting or unavailable."
                is ApiResult.Success -> runCatching { settingsJson.decodeFromString(DebugState.serializer(), result.value) }
                    .onSuccess { state = it; error = "" }.onFailure { error = "Debug service is starting or unavailable." }
            }
            delay(1500)
        }
    }
    fun action(name: String) = scope.launch {
        pending = true
        error = ""
        when (val result = viewModel.api.consoleDebugAction(name)) {
            is ApiResult.Failure -> error = result.message.ifEmpty { "Debug request failed" }
            is ApiResult.Success -> runCatching { settingsJson.decodeFromString(DebugState.serializer(), result.value) }.onSuccess { state = it }
        }
        pending = false
    }
    val current = state
    val busy = pending || current?.phase == "starting" || current?.phase == "stopping"
    val href = current?.port?.let { port ->
        runCatching { Uri.parse(viewModel.api.baseUrl).let { base -> "http://${base.host}:$port/#debug=${current.token}" } }.getOrNull()
    }
    Column(modifier = Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (current?.insideDebug == true) {
            Text("Debug instance", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall)
            Text("God party · unlimited Cave visits. Stop this instance from your main console to destroy its data.", style = MaterialTheme.typography.bodySmall)
            return@Column
        }
        Text("Cave of Many Dreams debugging", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall)
        Text("Launch a separate game server and Party Console with a god-equipped party and unlimited Cave visits. Requires Docker. Stopping destroys the debug party and all its data.", color = Slate300, style = MaterialTheme.typography.labelSmall)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (current?.project == null) OutlinedButton(enabled = !pending && current != null, onClick = { action("start") }) { Text("Start debug instance") }
            else OutlinedButton(enabled = !pending && current.phase != "stopping", onClick = { action("stop") }) { Text("Stop running") }
            if (current?.phase == "running" && href != null) {
                OutlinedButton(onClick = { runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(href))) } }) { Text("Open debug console") }
            }
            if (busy) CircularProgressIndicator(modifier = Modifier.size(20.dp).semantics { contentDescription = "Working" }, strokeWidth = 2.dp)
        }
        Text(current?.message?.ifEmpty { null } ?: "Checking debug service…", color = Slate300, style = MaterialTheme.typography.labelSmall, modifier = Modifier.semantics { contentDescription = "Debug instance status" })
        (current?.error ?: error.ifEmpty { null })?.let { Text(it, color = Color(0xFFFDA4AF), style = MaterialTheme.typography.bodySmall) }
    }
}

@Serializable
private data class StateSourceInfo(val filename: String = "", val canonicalPath: String = "", val localPath: String = "", val dockerPath: String = "", val maxBytes: Long = 128L * 1024 * 1024)

private data class StatePreview(val fields: List<String>, val characters: List<String>, val digest: String, val skippedCharacters: Map<String, List<String>>, val backupPath: String?)

private fun parsePreview(text: String): StatePreview {
    val data = runCatching { Json.parseToJsonElement(text) as? JsonObject }.getOrNull() ?: throw IllegalStateException(text.ifEmpty { "Import request failed" })
    fun list(key: String) = (data[key] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.content }
    val fields = list("fields")
    val characters = list("characters")
    val digest = (data["digest"] as? JsonPrimitive)?.takeIf { it.isString }?.content
    if (fields == null || characters == null || digest == null) throw IllegalStateException("Invalid import response")
    val skipped = (data["skippedCharacters"] as? JsonObject)?.mapValues { (_, v) -> (v as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.content }.orEmpty() }.orEmpty()
    return StatePreview(fields, characters, digest, skipped, (data["backupPath"] as? JsonPrimitive)?.content)
}

private val FIELD_LABELS = mapOf(
    "marked" to "Bank collection marks",
    "merchantMarked" to "Merchant collection marks",
    "compounds" to "Compound groups",
    "autoCompounds" to "Automatic compound rules",
    "upgrades" to "Upgrade marks",
    "upgradeOfferingRules" to "Upgrade offering rules",
    "autoUpgradeMarks" to "Automatic upgrade rules",
    "autoItemMarks" to "Automatic collection rules",
)

private fun fieldLabel(field: String) = FIELD_LABELS[field] ?: field.replace(Regex("([A-Z])"), " $1").replaceFirstChar { it.uppercase() }

/** dashboard-state-import.tsx with state-export-button.tsx and
 *  settings-export.ts: export to a chosen file, and import a settings or
 *  legacy caraGarage.jsonl file through preview and digest. */
@Composable
private fun DashboardStateImport(viewModel: PartyViewModel) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var info by remember { mutableStateOf<StateSourceInfo?>(null) }
    var preview by remember { mutableStateOf<StatePreview?>(null) }
    var content by remember { mutableStateOf("") }
    var filename by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var errorContext by remember { mutableStateOf("Could not load import/export settings") }
    var backup by remember { mutableStateOf("") }
    var skipped by remember { mutableStateOf<List<String>>(emptyList()) }
    var exportError by remember { mutableStateOf("") }
    var exporting by remember { mutableStateOf(false) }
    LaunchedEffect(viewModel) {
        when (val result = viewModel.api.dashboardStateInfo()) {
            is ApiResult.Failure -> error = result.message
            is ApiResult.Success -> runCatching { settingsJson.decodeFromString(StateSourceInfo.serializer(), result.value) }.onSuccess { info = it }.onFailure { error = "Invalid response" }
        }
    }
    suspend fun request(action: String, source: String, digest: String? = null): StatePreview = when (val result = viewModel.api.dashboardStateRequest(action, source, digest)) {
        is ApiResult.Failure -> throw IllegalStateException(result.message.ifEmpty { "Import request failed (${result.status})" })
        is ApiResult.Success -> parsePreview(result.value)
    }
    val exporter = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri == null) { exporting = false; return@rememberLauncherForActivityResult }
        scope.launch {
            try {
                when (val result = viewModel.api.dashboardStateExport()) {
                    is ApiResult.Failure -> throw IllegalStateException(result.message)
                    is ApiResult.Success -> {
                        val pretty = Json { prettyPrint = true; prettyPrintIndent = "  " }.encodeToString(kotlinx.serialization.json.JsonElement.serializer(), Json.parseToJsonElement(result.value))
                        withContext(Dispatchers.IO) { context.contentResolver.openOutputStream(uri)?.use { it.write(pretty.toByteArray()) } }
                    }
                }
            } catch (e: Exception) {
                exportError = e.message ?: e.toString()
            } finally {
                exporting = false
            }
        }
    }
    val importer = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri ?: return@rememberLauncherForActivityResult
        scope.launch {
            error = ""
            backup = ""
            preview = null
            content = ""
            filename = uri.lastPathSegment?.substringAfterLast('/') ?: "state file"
            errorContext = "Error reading state file"
            busy = true
            try {
                val source = withContext(Dispatchers.IO) {
                    context.contentResolver.openInputStream(uri)?.use { stream ->
                        val bytes = stream.readBytes()
                        if (bytes.size > (info?.maxBytes ?: 128L * 1024 * 1024)) throw IllegalStateException("Choose a state file smaller than 128 MB.")
                        String(bytes)
                    }.orEmpty()
                }
                preview = request("preview", source)
                content = source
            } catch (e: Exception) {
                error = e.message ?: "Could not read this file"
            } finally {
                busy = false
            }
        }
    }
    SettingsCard("Dashboard state import/export") {
        Text("Dashboard state import/export", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall)
        Text("Choose an exported settings JSON file or a legacy caraGarage.jsonl file. Import saved marks, automation rules, farming and event preferences.", style = MaterialTheme.typography.labelSmall)
        for ((label, value) in listOf(
            "This server’s canonical path" to (info?.canonicalPath?.ifEmpty { null } ?: "Loading…"),
            "Local installation" to (info?.localPath?.ifEmpty { null } ?: "<installation>/.caracal/localStorage/caraGarage.jsonl"),
            "Docker volume" to "/data/localStorage/caraGarage.jsonl",
        )) {
            Column {
                Text(label, fontWeight = FontWeight.SemiBold, color = Color(0xFFD1FAE5), style = MaterialTheme.typography.labelSmall)
                Text(value, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall)
            }
        }
        Text("Use a copy taken while the old service was stopped. Credentials, logins, queued work and travel state stay as they are. Full migration instructions are in the README.", color = Slate300, style = MaterialTheme.typography.labelSmall)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(enabled = !exporting, onClick = {
                exporting = true
                exportError = ""
                val stamp = java.text.SimpleDateFormat("yyyy-MM-dd'_'HH-mm-ss-SSS'Z'", java.util.Locale.US).apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }.format(java.util.Date())
                exporter.launch("party_console_settings_$stamp.json")
            }) { Text(if (exporting) "Exporting…" else "Export state file") }
            OutlinedButton(enabled = !busy, onClick = { importer.launch(arrayOf("application/json", "application/x-ndjson", "text/plain", "*/*")) }) { Text(if (busy) "Working…" else "Import state file") }
        }
        if (exportError.isNotEmpty()) Text("Error exporting state file: $exportError", color = Rose200, style = MaterialTheme.typography.bodySmall)
        preview?.let { p ->
            Column(
                modifier = Modifier.fillMaxWidth().border(1.dp, Color(0xFFD97706), RoundedCornerShape(4.dp)).padding(12.dp).semantics { contentDescription = "Review $filename" },
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text("Review $filename", fontWeight = FontWeight.SemiBold, color = Color(0xFFFEF3C7), style = MaterialTheme.typography.bodySmall)
                Text("These saved settings will replace the corresponding settings here, including empty lists. Missing settings are kept.", color = Color(0xFFFEF3C7), style = MaterialTheme.typography.bodySmall)
                Text("Characters: ${p.characters.joinToString(", ").ifEmpty { "Shared settings only" }}", color = Color(0xFFFEF3C7), style = MaterialTheme.typography.bodySmall)
                for ((name, fields) in p.skippedCharacters) Text("Skipping $name (not in this account): ${fields.joinToString(", ") { fieldLabel(it) }}.", color = Color(0xFFFEF3C7), style = MaterialTheme.typography.bodySmall)
                for (field in p.fields) Text("• ${fieldLabel(field)}", color = Color(0xFFFEF3C7), style = MaterialTheme.typography.bodySmall)
                Text(if (p.fields.isNotEmpty()) "A backup is saved on this server before importing. Imported automation rules take effect immediately." else "Nothing to import: all saved characters were skipped.", color = Color(0xFFFEF3C7), style = MaterialTheme.typography.bodySmall)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(enabled = !busy && p.fields.isNotEmpty(), onClick = {
                        scope.launch {
                            busy = true
                            error = ""
                            errorContext = "Error importing state file"
                            try {
                                val result = request("import", content, p.digest)
                                skipped = result.skippedCharacters.keys.toList()
                                backup = result.backupPath ?: "Saved beside caraGarage.jsonl"
                                preview = null
                                content = ""
                            } catch (e: Exception) {
                                error = e.message ?: "Import failed"
                            } finally {
                                busy = false
                            }
                        }
                    }) { Text("Import dashboard state") }
                    OutlinedButton(enabled = !busy, onClick = { preview = null; content = "" }) { Text("Cancel") }
                }
            }
        }
        if (error.isNotEmpty()) Text("$errorContext: $error", color = Rose200, style = MaterialTheme.typography.bodySmall)
        if (backup.isNotEmpty()) Text("Dashboard state imported. ${if (skipped.isNotEmpty()) "Skipped: ${skipped.joinToString(", ")}. " else ""}Backup: $backup", color = Emerald200, style = MaterialTheme.typography.bodySmall)
    }
}

/** The realm control (party-inventory-panels.tsx): current / home realm, a
 *  confirmed switch with the Realm Fatigue and Hop Sickness warnings and
 *  "Set as home realm", and the running operation. */
@Composable
private fun RealmSection(viewModel: PartyViewModel) {
    val dynamicState by viewModel.dynamicState.collectAsState()
    val scope = rememberCoroutineScope()
    var showRealms by remember { mutableStateOf(false) }
    var realmError by remember { mutableStateOf<String?>(null) }
    var setHome by remember { mutableStateOf(false) }
    var destination by remember { mutableStateOf<String?>(null) }
    var switching by remember { mutableStateOf(false) }
    val realm = dynamicState.realmControl ?: return
    val blocked = realm.operation != null && realm.operation.phase !in setOf("complete", "failed")
    fun labelFor(key: String?) = realm.realms.find { it.key == key }?.label ?: key ?: "Unknown"
    val current = realm.currentRealm ?: realm.activeRealm
    SettingsCard("Realm") {
        Text("Realm", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall)
        Text(
            "Current: ${if (realm.split) "Mixed realms" else labelFor(current)} · Home: ${labelFor(realm.homeRealm)}",
            style = MaterialTheme.typography.labelSmall,
            color = if (realm.split) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (realm.split) for (member in realm.characters) Text("${member.name}: ${member.realm ?: "offline"}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
        val target = destination
        if (target == null) {
            TextButton(enabled = !blocked, onClick = { showRealms = !showRealms }) { Text(if (showRealms) "Cancel" else "Change realm…") }
            if (showRealms) {
                for (option in realm.realms) {
                    TextButton(
                        // Nothing to do when the whole party is already there.
                        enabled = !option.pvp && !blocked && (realm.split || option.key != current),
                        onClick = { realmError = null; setHome = false; destination = option.key },
                    ) { Text("${option.label} (${"%,d".format(option.players)} players)${if (option.pvp) " — disabled" else ""}") }
                }
            }
        } else {
            Text("Switch realm?", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall)
            Text("This switches every active party character to ${labelFor(target)} and gives non-merchant characters Realm Fatigue.", style = MaterialTheme.typography.labelSmall)
            Text("Realm Fatigue: approximately 30 minutes. Home-realm rewards are paused; ordinary rewards continue.", style = MaterialTheme.typography.labelSmall)
            if (target != realm.homeRealm) {
                Text("Outside your home realm: Hop Sickness applies −80 Luck, Gold, and XP, plus −20% output, until you return home or change your home realm through Bean.", style = MaterialTheme.typography.labelSmall)
                Row(verticalAlignment = Alignment.Top) {
                    Checkbox(checked = setHome, onCheckedChange = { setHome = it })
                    Column(modifier = Modifier.padding(top = 12.dp)) {
                        Text("Set as home realm", style = MaterialTheme.typography.labelMedium)
                        Text("After switching, one non-merchant will visit Bean in Main and request the home change. Current game data exposes no separate home-change cooldown.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
                            is ApiResult.Success -> { destination = null; showRealms = false; viewModel.refreshDynamicStateNow() }
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
                color = if (operation.phase == "failed") MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
            )
            operation.error?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error) }
            for (member in operation.characters) Text("${member.name}: ${member.realm ?: "waiting"}", style = MaterialTheme.typography.labelSmall)
        }
    }
}
