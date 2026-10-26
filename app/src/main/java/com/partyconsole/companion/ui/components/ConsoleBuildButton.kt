package com.partyconsole.companion.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedIconButton
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.partyconsole.companion.domain.BuildSummary
import com.partyconsole.companion.domain.ConsoleBuildStatus
import com.partyconsole.companion.domain.DeploymentJournal
import com.partyconsole.companion.domain.changedComponents
import com.partyconsole.companion.domain.deploymentPending
import com.partyconsole.companion.domain.pendingBuildCount
import com.partyconsole.companion.domain.readyBuild
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.AppForeground
import com.partyconsole.companion.ui.PartyViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json

private val buildJson = Json { ignoreUnknownKeys = true; coerceInputValues = true }

/** GET /console-build every 3 s while the app is in the foreground, like
 *  the console updates. A console without managed builds answers 503 and
 *  the button stays hidden. */
@Composable
private fun rememberConsoleBuilds(viewModel: PartyViewModel): Pair<ConsoleBuildStatus?, (ConsoleBuildStatus) -> Unit> {
    var status by remember { mutableStateOf<ConsoleBuildStatus?>(null) }
    val visible by AppForeground.visible.collectAsState()
    LaunchedEffect(viewModel, visible) {
        if (!visible) return@LaunchedEffect
        while (true) {
            status = when (val result = viewModel.api.consoleBuilds()) {
                is ApiResult.Failure -> null
                is ApiResult.Success -> runCatching { buildJson.decodeFromString(ConsoleBuildStatus.serializer(), result.value) }.getOrNull()
            }
            delay(3_000)
        }
    }
    return status to { next: ConsoleBuildStatus -> status = next }
}

/** The header's "Deploy new console build" control, from Ryan's
 *  console-build-control.tsx: Load now (after a confirm), Load when safe
 *  and Load at Main, the last two disabled during a Cave run.
 *  PWA: ConsoleBuildButton.tsx. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConsoleBuildButton(viewModel: PartyViewModel) {
    val scope = rememberCoroutineScope()
    val (status, setStatus) = rememberConsoleBuilds(viewModel)
    var menu by remember { mutableStateOf(false) }
    var confirming by remember { mutableStateOf<BuildSummary?>(null) }
    var submitting by remember { mutableStateOf(false) }
    val current = status ?: return
    val candidate = readyBuild(current)
    val active = current.builds.find { it.id == current.active }
    val operation = current.operation
    val busy = submitting || (operation != null && deploymentPending(operation.phase))
    if (candidate == null && !busy) return
    fun deploy(mode: String, build: BuildSummary? = candidate) {
        if (build == null || submitting) return
        scope.launch {
            submitting = true
            val (journal, _) = viewModel.api.deployConsoleBuild(build.id, mode)
            submitting = false
            journal?.let { raw -> runCatching { buildJson.decodeFromJsonElement(DeploymentJournal.serializer(), raw) }.getOrNull() }?.let { setStatus(current.copy(operation = it)) }
            confirming = null
            menu = false
        }
    }
    val count = pendingBuildCount(current)
    Box {
        OutlinedIconButton(onClick = { menu = true }, modifier = Modifier.size(32.dp).semantics { contentDescription = "Deploy new console build" }) {
            if (busy) SpinningRefresh() else Icon(Icons.Filled.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
        }
        Text(
            "$count",
            color = Color(0xFF6EE7B7),
            fontFamily = FontFamily.Monospace,
            fontSize = 10.sp,
            lineHeight = 12.sp,
            modifier = Modifier.align(Alignment.BottomStart).background(Color(0xD9000000), RoundedCornerShape(2.dp)).padding(horizontal = 2.dp)
                .semantics { contentDescription = "$count completed builds since deployment" },
        )
    }
    if (menu) {
        ModalBottomSheet(onDismissRequest = { menu = false }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                Text("Load console build", style = MaterialTheme.typography.titleMedium)
                Text(candidate?.let { "Build ${it.id} is ready." } ?: "A console build is loading.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (busy && operation != null) {
                    Text("${operation.phase.replace('-', ' ')} · ${isoTime(operation.phaseStartedAt ?: operation.startedAt)}", style = MaterialTheme.typography.labelSmall)
                }
                if (busy && !operation?.waiting.isNullOrEmpty()) Text("Waiting: ${operation!!.waiting!!.joinToString(", ")}", style = MaterialTheme.typography.labelSmall)
                operation?.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall) }
                OutlinedButton(enabled = !busy && candidate != null, onClick = { confirming = candidate; menu = false }, modifier = Modifier.fillMaxWidth()) { Text("Load now") }
                OutlinedButton(enabled = !busy && candidate != null && current.cave != true, onClick = { deploy("safe") }, modifier = Modifier.fillMaxWidth()) { Text("Load when safe") }
                OutlinedButton(enabled = !busy && candidate != null && current.cave != true, onClick = { deploy("main") }, modifier = Modifier.fillMaxWidth()) { Text("Load at Main") }
            }
        }
    }
    confirming?.let { build ->
        ModalBottomSheet(onDismissRequest = { if (!submitting) confirming = null }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                Text("Load console build now?", style = MaterialTheme.typography.titleMedium)
                Text(
                    "Loading now may interrupt combat and briefly disconnect headless characters. Characters could die while reconnecting. Load now anyway?",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text("Build: ${build.id}", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall)
                Text("Built: ${build.createdAt}", style = MaterialTheme.typography.bodySmall)
                Text("Changed components: ${changedComponents(build, active).joinToString(", ").ifEmpty { "none" }}", style = MaterialTheme.typography.bodySmall)
                Text("Source: ${build.sourceHash}", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall)
                build.commit?.takeIf { it.isNotEmpty() }?.let { Text("Revision: $it" + if (build.dirty == true) " (includes local changes)" else "", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall) }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End), modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                    OutlinedButton(enabled = !submitting, onClick = { confirming = null }) { Text("Cancel") }
                    Button(enabled = !busy, onClick = { deploy("now", build) }) { Text("Load now") }
                }
            }
        }
    }
}

// The spin runs only while a build loads, so an idle header never animates.
@Composable
private fun SpinningRefresh() {
    val turn by rememberInfiniteTransition(label = "build").animateFloat(0f, 360f, infiniteRepeatable(tween(1_000, easing = LinearEasing), RepeatMode.Restart), label = "spin")
    Icon(Icons.Filled.Refresh, contentDescription = null, modifier = Modifier.size(16.dp).rotate(turn))
}

/** An ISO timestamp as toLocaleTimeString writes it; the raw text when it does not parse. */
private fun isoTime(value: String): String =
    runCatching { com.partyconsole.companion.domain.localTime(java.time.Instant.parse(value).toEpochMilli()) }.getOrDefault(value)
