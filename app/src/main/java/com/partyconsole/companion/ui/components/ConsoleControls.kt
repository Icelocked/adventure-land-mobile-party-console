package com.partyconsole.companion.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.PowerSettingsNew
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedIconButton
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.ConsoleControlAction
import com.partyconsole.companion.model.ConsoleControlState
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull

private val AmberBorder = Color(0xFFF59E0B)
private val AmberText = Color(0xFFFDE68A)
private val AmberBackground = Color(0xFF451A03)
private val EmeraldBorder = Color(0xFF34D399)
private val EmeraldText = Color(0xFFD1FAE5)
private val RoseBorder = Color(0xFFE11D48)
private val RoseText = Color(0xFFFECDD3)
private val controlJson = Json { ignoreUnknownKeys = true; coerceInputValues = true }

/** One composable's view of core's consoleControl. A POST reply stands in
 *  only until the next core poll replaces the polled object. Console:
 *  console-controls.tsx useConsoleControl; PWA: ConsoleControls.tsx. */
private class ConsoleControlHandle(
    val control: ConsoleControlState?,
    val busy: Boolean,
    val error: String?,
    val act: (ConsoleControlAction, Boolean) -> Unit,
)

@Composable
private fun rememberConsoleControl(viewModel: PartyViewModel): ConsoleControlHandle {
    val state by viewModel.dynamicState.collectAsState()
    val scope = rememberCoroutineScope()
    var reply by remember { mutableStateOf<Pair<ConsoleControlState, Long>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val generation by rememberUpdatedState(state.coreGeneration)
    val act = { action: ConsoleControlAction, force: Boolean ->
        scope.launch {
            busy = true
            error = null
            val basis = generation
            val result = viewModel.api.consoleControl(action, force)
            busy = false
            when (result) {
                is ApiResult.Failure -> error = result.message.ifBlank { "Console control failed" }
                is ApiResult.Success -> {
                    val data = result.value.data
                    if ((data?.get("paused") as? JsonPrimitive)?.booleanOrNull != null) {
                        runCatching { controlJson.decodeFromJsonElement(ConsoleControlState.serializer(), data!!) }.getOrNull()?.let { reply = it to basis }
                    }
                }
            }
        }
        Unit
    }
    val current = reply?.takeIf { it.second == state.coreGeneration }?.first ?: state.consoleControl
    return ConsoleControlHandle(current, busy, error, act)
}

/** "Paused", "Resuming" or "Safe to stop" beside the party title. */
@Composable
fun ConsolePausedIndicator(viewModel: PartyViewModel) {
    val control = rememberConsoleControl(viewModel).control
    if (control?.paused != true) return
    val label = when {
        control.resume != null -> "Resuming"
        control.shutdown?.phase == "safe" -> "Safe to stop"
        else -> "Paused"
    }
    Text(
        label.uppercase(),
        color = AmberText,
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.SemiBold,
        style = MaterialTheme.typography.labelSmall,
        modifier = Modifier.semantics { contentDescription = label }
            .border(1.dp, AmberBorder, RoundedCornerShape(4.dp))
            .background(AmberBackground, RoundedCornerShape(4.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

/** The header's Pause or Play button and the clean shutdown sheet. Pause
 *  holds every automated action; the characters still defend themselves.
 *  The sheet stays open for the whole shutdown, so its phase and the stop
 *  command stay in view. Console: console-controls.tsx ConsoleControls. */
@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun ConsoleControls(viewModel: PartyViewModel) {
    val handle = rememberConsoleControl(viewModel)
    val control = handle.control ?: return
    var dialog by remember { mutableStateOf(false) }
    var confirmForce by remember { mutableStateOf(false) }
    val shutdown = control.shutdown
    val open = dialog || shutdown != null
    val round = Modifier.size(32.dp)
    if (control.paused) {
        OutlinedIconButton(
            onClick = { handle.act(ConsoleControlAction.PLAY, false) },
            enabled = !handle.busy && shutdown == null,
            border = BorderStroke(1.dp, EmeraldBorder),
            colors = IconButtonDefaults.outlinedIconButtonColors(contentColor = EmeraldText),
            modifier = round,
        ) { Icon(Icons.Filled.PlayArrow, contentDescription = "Play: resume automated actions", modifier = Modifier.size(16.dp)) }
    } else {
        OutlinedIconButton(
            onClick = { handle.act(ConsoleControlAction.PAUSE, false) },
            enabled = !handle.busy && shutdown == null,
            border = BorderStroke(1.dp, AmberBorder),
            colors = IconButtonDefaults.outlinedIconButtonColors(contentColor = AmberText),
            modifier = round,
        ) { Icon(Icons.Filled.Pause, contentDescription = "Pause all automated actions", modifier = Modifier.size(16.dp)) }
    }
    OutlinedIconButton(
        onClick = { dialog = true },
        border = BorderStroke(1.dp, RoseBorder),
        colors = IconButtonDefaults.outlinedIconButtonColors(contentColor = RoseText),
        modifier = round,
    ) { Icon(Icons.Filled.PowerSettingsNew, contentDescription = "Clean shutdown", modifier = Modifier.size(16.dp)) }
    if (!open) return
    val running by rememberUpdatedState(shutdown != null)
    val close = {
        dialog = false
        confirmForce = false
    }
    // A running shutdown keeps the sheet open: neither a swipe nor a tap outside closes it.
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true, confirmValueChange = { it != SheetValue.Hidden || !running })
    ModalBottomSheet(onDismissRequest = { if (!running) close() }, sheetState = sheetState) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth().padding(16.dp)) {
            Text(if (shutdown?.phase == "safe") "Safe to stop" else "Clean shutdown", style = MaterialTheme.typography.titleMedium)
            val description = when (shutdown?.phase) {
                null -> "Pause every automated action, wait until the characters hold still, then save the state. The console resumes the same activity after its next start."
                "deferred" -> "Waiting for the fight to end: ${shutdown.hold}."
                "draining" -> "Pausing and saving the state."
                "safe" -> "Everything is saved. Stop the container now:"
                else -> ""
            }
            Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (shutdown?.phase == "draining") {
                Text("Waiting for: " + shutdown.waiting.ifEmpty { listOf("character acknowledgements") }.joinToString(", "), style = MaterialTheme.typography.bodySmall)
            }
            if (shutdown?.phase == "safe") {
                Text("In ${shutdown.directory}:", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                SelectionContainer {
                    Text(
                        shutdown.command,
                        color = Color(0xFFA7F3D0),
                        fontFamily = FontFamily.Monospace,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.fillMaxWidth()
                            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(4.dp))
                            .background(Color.Black, RoundedCornerShape(4.dp))
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
            }
            if (confirmForce) {
                Text("Stopping now pauses the characters in the middle of the fight. They only defend themselves until the console resumes.", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            handle.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            val destructive = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error, contentColor = MaterialTheme.colorScheme.onError)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp, androidx.compose.ui.Alignment.End), modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                if (shutdown == null) {
                    Button(enabled = !handle.busy, colors = destructive, onClick = {
                        dialog = false
                        handle.act(ConsoleControlAction.SHUTDOWN, false)
                    }) { Text("Start clean shutdown") }
                }
                if (shutdown?.phase == "deferred") {
                    if (confirmForce) {
                        Button(enabled = !handle.busy, colors = destructive, onClick = {
                            confirmForce = false
                            handle.act(ConsoleControlAction.SHUTDOWN, true)
                        }) { Text("Confirm: stop now") }
                    } else {
                        Button(enabled = !handle.busy, colors = destructive, onClick = { confirmForce = true }) { Text("Force shutdown") }
                    }
                }
                if (shutdown != null) {
                    OutlinedButton(enabled = !handle.busy, onClick = {
                        close()
                        handle.act(ConsoleControlAction.CANCEL_SHUTDOWN, false)
                    }) { Text("Cancel shutdown") }
                } else {
                    OutlinedButton(onClick = { dialog = false }) { Text("Close") }
                }
            }
        }
    }
}

/** Shown after a clean shutdown until the characters reconnect and Play runs. */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun ConsoleResumeBanner(viewModel: PartyViewModel) {
    val handle = rememberConsoleControl(viewModel)
    val resume = handle.control?.resume ?: return
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.Center,
        modifier = Modifier.padding(start = 12.dp, end = 12.dp, top = 12.dp).fillMaxWidth()
            .border(1.dp, AmberBorder, RoundedCornerShape(8.dp))
            .background(AmberBackground, RoundedCornerShape(8.dp))
            .padding(horizontal = 12.dp, vertical = 6.dp),
    ) {
        Text(
            "Resuming previous activity" + if (resume.waiting.isNotEmpty()) " · waiting for ${resume.waiting.joinToString(", ")}" else "",
            color = AmberText,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.align(androidx.compose.ui.Alignment.CenterVertically),
        )
        OutlinedButton(enabled = !handle.busy, onClick = { handle.act(ConsoleControlAction.CANCEL_RESUME, false) }) { Text("Cancel") }
    }
}
