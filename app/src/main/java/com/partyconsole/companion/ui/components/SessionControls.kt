package com.partyconsole.companion.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Dns
import androidx.compose.material.icons.filled.Monitor
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilledTonalIconToggleButton
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.Color
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import kotlinx.coroutines.launch

/** What the session looked like when a confirmation opened - any change
 *  while it is open refuses the action (character-session-controls.tsx). */
private data class SessionSnapshot(val action: String, val slot: Int, val kind: String, val state: String, val primary: String?, val isPrimary: Boolean)

/** character-session-controls.tsx: Steam (become primary / join Steam),
 *  Headless (leave Steam, keep running) and Log out - each confirmed. */
@Composable
fun SessionControls(viewModel: PartyViewModel, name: String) {
    val state by viewModel.dynamicState.collectAsState()
    val scope = rememberCoroutineScope()
    val slot = state.activeSlots.find { it.character == name }
    val primaryCharacter = state.activeSlots.find { it.primary }?.character
    val pending = state.steamSwitch?.phase?.let { it != "complete" } == true
    var confirmation by remember(name) { mutableStateOf<SessionSnapshot?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val native = slot?.kind == "native"
    val disabled = slot == null || pending || busy
    val current = confirmation
    val changed = slot == null || current == null || slot.index != current.slot || slot.kind != current.kind || slot.state != current.state ||
        primaryCharacter != current.primary || slot.primary != current.isPrimary
    val destination = if (native) "Become Steam primary" else if (primaryCharacter != null) "Join Steam in the background" else "Join Steam as primary"

    fun ask(action: String) {
        if (slot == null || disabled) return
        error = null
        confirmation = SessionSnapshot(action, slot.index, slot.kind, slot.state, primaryCharacter, slot.primary)
    }

    Row {
        FilledTonalIconToggleButton(checked = native, enabled = !disabled, onCheckedChange = { if (slot?.primary != true) ask("steam") }) {
            Icon(Icons.Filled.Monitor, contentDescription = if (slot?.primary == true) "$name is Steam primary" else "$destination: $name")
        }
        FilledTonalIconToggleButton(checked = slot != null && !native, enabled = !disabled, onCheckedChange = { if (native) ask("headless") }) {
            Icon(Icons.Filled.Dns, contentDescription = "Run $name headless")
        }
        FilledTonalIconToggleButton(checked = false, enabled = !disabled, onCheckedChange = { ask("logout") }) {
            Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = "Log out $name")
        }
    }

    if (current != null) {
        val action = current.action
        val title = when (action) {
            "logout" -> "Log out $name?"
            "headless" -> "Run $name headless?"
            else -> "$destination: $name?"
        }
        AlertDialog(
            onDismissRequest = { if (!busy) confirmation = null },
            title = { Text(title) },
            text = {
                Column {
                    Text(
                        when {
                            action == "logout" -> "This stops the character and its automation. It will not continue running headless."
                            action == "headless" -> "This logs the character out of Steam and keeps it running through caracAL."
                            native -> "$name will become the primary Steam view. Other Steam characters briefly reconnect, then continue in Steam."
                            primaryCharacter != null -> "$name will join Steam in the background. $primaryCharacter remains primary."
                            else -> "$name will join Steam as the primary view."
                        },
                    )
                    if (changed) Text("The character's session or Steam primary changed. Cancel and choose the action again.", color = Color(0xFFF59E0B), style = MaterialTheme.typography.bodySmall)
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                }
            },
            dismissButton = { TextButton(enabled = !busy, onClick = { confirmation = null }) { Text("Cancel") } },
            confirmButton = {
                TextButton(enabled = !disabled && !changed, onClick = {
                    val target = slot ?: return@TextButton
                    scope.launch {
                        busy = true
                        error = null
                        // use-party-console.tsx logout / moveSteamToHeadless / joinOrPromoteSteam.
                        val result = when (action) {
                            "logout" -> if (native) viewModel.api.steamAction(target.character, "logout") else viewModel.api.logoutSlot(target.index)
                            "headless" -> viewModel.api.steamAction(name, "headless")
                            else -> viewModel.api.steamAction(name, if (native) "primary" else "login")
                        }
                        busy = false
                        if (result is ApiResult.Failure) error = result.message else confirmation = null
                    }
                }) { Text(if (busy) "Working…" else when (action) { "logout" -> "Log out"; "headless" -> "Go headless"; else -> destination }) }
            },
        )
    }
}
