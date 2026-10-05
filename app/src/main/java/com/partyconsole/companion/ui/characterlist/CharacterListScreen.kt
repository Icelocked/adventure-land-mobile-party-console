package com.partyconsole.companion.ui.characterlist

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.domain.PENDING_LABELS
import com.partyconsole.companion.domain.PendingCharacter
import com.partyconsole.companion.domain.orderCharacters
import com.partyconsole.companion.domain.pendingCharacters
import com.partyconsole.companion.domain.pendingHelp
import com.partyconsole.companion.model.BestiaryMonster
import com.partyconsole.companion.model.CharacterState
import com.partyconsole.companion.model.Sprite
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.AccountMenuSheet
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.Routes
import com.partyconsole.companion.ui.activityLine
import com.partyconsole.companion.ui.characterdetail.sections.classLook
import com.partyconsole.companion.ui.components.CharacterPortrait
import com.partyconsole.companion.ui.components.FreshnessBadge
import com.partyconsole.companion.ui.components.LatencyBadge
import com.partyconsole.companion.ui.components.PartyGold
import com.partyconsole.companion.ui.components.rememberConsoleUpdates
import com.partyconsole.companion.ui.roster.CreateCharacterSheet
import com.partyconsole.companion.ui.roster.RosterPickerSheet
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json

/** Party overview (the PWA's CharacterListScreen.tsx): live characters in
 *  the console's order, pending cards for ones still loading, the empty
 *  slots to load a character into, and the party-wide controls. */
@Composable
fun CharacterListScreen(viewModel: PartyViewModel, onSelectCharacter: (String) -> Unit, onReconnect: () -> Unit = {}, onNavigate: (String) -> Unit = {}) {
    val characters by viewModel.characters.collectAsState()
    val connected by viewModel.connected.collectAsState()
    val lastConnectionError by viewModel.lastConnectionError.collectAsState()
    val sessionLost by viewModel.sessionLost.collectAsState()
    val state by viewModel.dynamicState.collectAsState()
    val roster by viewModel.roster.collectAsState()
    val configLoaded by viewModel.stateLoaded.collectAsState()
    val scope = rememberCoroutineScope()
    var menuOpen by remember { mutableStateOf(false) }
    var pickerSlot by remember { mutableStateOf<Int?>(null) }
    var creating by remember { mutableStateOf(false) }
    val updates = rememberConsoleUpdates(viewModel)

    // use-party-console.tsx chars: active slots in slot order (all live
    // characters on a server that reports no slots), bankbois excluded,
    // then orderCharacters.
    val bankboiNames = state.bankbois.map { it.name }.toSet()
    val slots = state.activeSlots
    val liveNames = (if (slots.isNotEmpty()) slots.sortedBy { it.index }.mapNotNull { it.character }.filter { characters.containsKey(it) } else characters.keys.toList())
        .filter { it !in bankboiNames }
    val primary = slots.find { it.primary }?.character ?: slots.find { it.kind == "native" && it.index == 0 }?.character
    val steam = slots.filter { it.kind == "native" && it.character != null }.mapNotNull { it.character }
    val names = orderCharacters(liveNames, roster.keys.toList(), primary, state.merchantCharacter, steam, { it }, { characters[it]?.vitals?.ctype })
    val pending = pendingCharacters(state.bankbois, state.bankboiTransaction, state.characterConnections, state.activeSlots, names)
    val pendingNames = pending.map { it.name }.toSet()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Party")
                            // console-updates.tsx ConsoleUpdateIndicator
                            if (updates?.updateAvailable == true) {
                                Box(
                                    modifier = Modifier.size(20.dp).background(Color(0xFF047857), CircleShape).clickable { onNavigate(Routes.ACCOUNT_SETTINGS) },
                                    contentAlignment = Alignment.Center,
                                ) { Text("!", color = Color.White, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold) }
                            }
                        }
                        // party-header.tsx version line
                        Text(
                            (state.gameVersion?.let { "Game v$it · " } ?: "") + "Console " + (updates?.let { "v${it.displayVersion ?: it.current}" } ?: "loading…"),
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = FontFamily.Monospace,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
                actions = {
                    PartyGold(viewModel)
                    Box(modifier = Modifier.padding(horizontal = 6.dp)) { LatencyBadge(viewModel) }
                    if (!connected) Icon(Icons.Filled.CloudOff, contentDescription = "Disconnected")
                    IconButton(onClick = { scope.launch { viewModel.refreshDynamicStateNow() } }) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Refresh")
                    }
                    IconButton(onClick = { menuOpen = true }) {
                        Icon(Icons.Filled.Menu, contentDescription = "Account menu")
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(modifier = Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(bottom = 12.dp)) {
            if (!connected) item { LinearProgressIndicator(modifier = Modifier.fillMaxWidth()) }
            if (sessionLost) item { SessionLostCard(onReconnect) }
            item { DebugBrowserBanner(viewModel) }
            // party-workspace.tsx: the dungeon panel heads the party while a visit runs.
            item { com.partyconsole.companion.ui.dungeon.DungeonPanel(viewModel) }
            if (names.isNotEmpty() || pending.isNotEmpty()) item { PartyControls(viewModel) }
            if (names.isEmpty() && pending.isEmpty()) {
                item {
                    Column(modifier = Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        // party-workspace.tsx's empty states.
                        when {
                            !configLoaded -> {
                                CircularProgressIndicator()
                                Text("Party Console is loading…", modifier = Modifier.padding(top = 12.dp))
                            }
                            !connected -> Text("Reconnecting to Party Console…")
                            else -> Text("No characters connected yet. Load a character or open setup on the console to link Steam.")
                        }
                        lastConnectionError?.takeIf { !connected }?.let {
                            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp))
                        }
                    }
                }
            } else {
                items(names.filter { it !in pendingNames }, key = { it }) { name ->
                    characters[name]?.let { CharacterRow(viewModel, name, it, state.bestiaryCatalog) { onSelectCharacter(name) } }
                }
                items(pending, key = { "pending-${it.name}" }) { PendingCharacterCard(viewModel, it) }
            }
            // roster-controls.tsx: one "Load character slot N" per empty
            // headless slot, disabled while a Steam handoff is running.
            val handoffRunning = state.steamSwitch?.phase?.let { it != "complete" } == true
            items(slots.filter { it.kind == "headless" && it.character == null }, key = { "slot-${it.index}" }) { slot ->
                OutlinedButton(
                    enabled = !handoffRunning,
                    onClick = { pickerSlot = slot.index },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 12.dp, vertical = 4.dp),
                ) {
                    Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                    Text("Load character slot ${slot.index + 1}", modifier = Modifier.padding(start = 6.dp))
                }
            }
            state.bankboiTransaction?.let { transaction ->
                // party-workspace.tsx's "Bankboi Active" card.
                item {
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(12.dp)
                            .border(BorderStroke(2.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.6f)), RoundedCornerShape(8.dp))
                            .padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text("BANKBOI ACTIVE", color = MaterialTheme.colorScheme.primary, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Black, style = MaterialTheme.typography.titleMedium)
                        Text(transaction.bankboi.uppercase(), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall)
                        Text("${transaction.mode} · ${transaction.phase}".uppercase(), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }

    pickerSlot?.let { slot ->
        RosterPickerSheet(viewModel, slot, onClose = { pickerSlot = null }, onCreate = {
            pickerSlot = null
            creating = true
        })
    }
    if (creating) CreateCharacterSheet(viewModel, onClose = { creating = false })
    if (menuOpen) AccountMenuSheet(viewModel, onNavigate, onDismiss = { menuOpen = false })
}

@Composable
private fun SessionLostCard(onReconnect: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text("Session expired", style = MaterialTheme.typography.titleSmall)
            Text("Party Console no longer recognises this device. Pair it again to reconnect.", style = MaterialTheme.typography.bodySmall)
            Button(onClick = onReconnect, modifier = Modifier.padding(top = 6.dp)) { Text("Pair again") }
        }
    }
}

/** party-workspace.tsx's two party-wide buttons: "Send party to town" and
 *  "Escape" (escape-control.tsx: needs one online warrior/mage/priest; the
 *  server owns the staged sequence, this triggers it and shows its stage). */
@Composable
private fun PartyControls(viewModel: PartyViewModel) {
    val escape by viewModel.escape.collectAsState()
    val escapeReadError by viewModel.escapeError.collectAsState()
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var townError by remember { mutableStateOf<String?>(null) }
    // escape-control.tsx: inside a dungeon, Escape exits the dungeon instead.
    val dungeon = com.partyconsole.companion.ui.dungeon.rememberDungeons(viewModel)
    val dungeonView by dungeon.view.collectAsState()
    val dungeonBusy by dungeon.busy.collectAsState()
    val dungeonError by dungeon.actionError.collectAsState()
    val inDungeon = dungeonView != null && dungeonView?.state?.phase !in setOf("idle", "held")

    val current = escape
    val running = current != null && current.stage !in listOf("complete", "failed-hold", "released")
    val failed = error != null || escapeReadError != null || (current != null && current.stage != "released" && (current.error != null || current.stage == "failed-hold"))
    // escape-control.tsx labels.
    val label = if (failed) "Escape - failed" else if (current?.stage == "complete") "Escape - success" else "Escape"

    Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(
                onClick = {
                    scope.launch {
                        townError = null
                        // use-party-console.tsx townParty: "Party town request failed".
                        (viewModel.api.sendPartyToTown() as? ApiResult.Failure)?.let { townError = it.message.ifBlank { "Party town request failed" } }
                    }
                },
                modifier = Modifier.weight(1f),
            ) { Text("Send party to town") }
            Button(
                onClick = {
                    scope.launch {
                        if (inDungeon) {
                            dungeon.action(mapOf("action" to "exit"))
                            return@launch
                        }
                        busy = true
                        error = null
                        (viewModel.api.triggerEscape() as? ApiResult.Failure)?.let { error = it.message }
                        viewModel.refreshDynamicStateNow()
                        busy = false
                    }
                },
                enabled = if (inDungeon) !dungeonBusy else !busy && !running,
                colors = if (failed) ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error) else ButtonDefaults.buttonColors(),
                modifier = Modifier.weight(1f),
            ) {
                if (if (inDungeon) dungeonBusy else busy || running) CircularProgressIndicator(modifier = Modifier.size(14.dp).padding(end = 6.dp).semantics { contentDescription = "Escape in progress" }, strokeWidth = 2.dp)
                Text(if (inDungeon) "Escape — exit dungeon" else label)
            }
        }
        (townError ?: error)?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        if (inDungeon && dungeonError.isNotEmpty()) Text(dungeonError, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun CharacterRow(viewModel: PartyViewModel, name: String, state: CharacterState, bestiary: List<BestiaryMonster>, onClick: () -> Unit) {
    val details by viewModel.characterDetails.collectAsState()
    val seenAt = details[name]?.seenAt ?: 0L
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)) {
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            val (icon, color) = classLook(state.vitals?.ctype ?: "")
            Box(modifier = Modifier.size(36.dp).background(color.copy(alpha = 0.2f), CircleShape), contentAlignment = Alignment.Center) {
                Icon(icon, contentDescription = state.vitals?.ctype, tint = color, modifier = Modifier.size(20.dp))
            }
            Column(modifier = Modifier.padding(start = 12.dp).fillMaxWidth()) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(name, style = MaterialTheme.typography.titleMedium)
                    state.vitals?.let { Text("Lv ${it.level} ${it.ctype}", style = MaterialTheme.typography.bodyMedium) }
                }
                val vitals = state.vitals
                if (vitals == null) {
                    // connected-character-card.tsx: connected, but no status yet.
                    Text("awaiting status", style = MaterialTheme.typography.bodySmall)
                } else {
                    Text(
                        activityLine(vitals, bestiary),
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 1,
                        color = if (vitals.rip) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("HP ${vitals.hp}/${vitals.maxHp}", style = MaterialTheme.typography.labelMedium)
                        Text("MP ${vitals.mp}/${vitals.maxMp}", style = MaterialTheme.typography.labelMedium)
                        Text("${"%,d".format(vitals.gold)}g", style = MaterialTheme.typography.labelMedium)
                    }
                    // Not on the dashboard: shows a character that stopped reporting (possibly hung).
                    if (seenAt > 0) FreshnessBadge(viewModel, seenAt, modifier = Modifier.padding(top = 4.dp))
                }
            }
        }
    }
}

/** pending-character-cards.tsx: a character that's loading, waiting or
 *  lost, with its portrait, class, hosting and status. */
@Composable
private fun PendingCharacterCard(viewModel: PartyViewModel, entry: PendingCharacter) {
    val state by viewModel.dynamicState.collectAsState()
    val roster by viewModel.roster.collectAsState()
    val look = state.characterAppearances[entry.name]
    val headless = state.activeSlots.any { it.character == entry.name && it.kind == "headless" }
    val sprite = look?.characterSprite?.let { runCatching { Json { ignoreUnknownKeys = true }.decodeFromJsonElement(Sprite.serializer(), it) }.getOrNull() }
    Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)) {
        Row(modifier = Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            CharacterPortrait(look?.characterDollHtml, sprite, look?.skin, modifier = Modifier.size(width = 48.dp, height = 64.dp))
            Column {
                Text(entry.name, style = MaterialTheme.typography.titleSmall)
                Text(
                    "${roster[entry.name]?.ctype.orEmpty()} · ${if (headless) "Headless character" else if (entry.primary) "Steam primary" else "Steam companion"}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    if (entry.status == "waiting") "Waiting for your character to connect…" else PENDING_LABELS[entry.status] ?: entry.status,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(top = 4.dp),
                )
                entry.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                if (entry.delayed) Text(pendingHelp(entry.status), color = Color(0xFFF59E0B), style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

/** debug-browser.tsx DebugBrowserBanner: on a debug instance, a banner with the game client link. */
@Composable
private fun DebugBrowserBanner(viewModel: PartyViewModel) {
    val debug by viewModel.debugBrowser.collectAsState()
    if (!debug) return
    val context = androidx.compose.ui.platform.LocalContext.current
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Debug instance · god party · unlimited Cave visits", style = MaterialTheme.typography.bodySmall, color = androidx.compose.ui.graphics.Color(0xFFCFFAFE))
        OutlinedButton(onClick = { runCatching { context.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(viewModel.debugGameUrl))) } }) { Text("Open game client") }
        Text("View and control the running browser. Closing its viewer keeps the party running.", style = MaterialTheme.typography.labelSmall, color = androidx.compose.ui.graphics.Color(0xFFCBD5E1))
    }
}
