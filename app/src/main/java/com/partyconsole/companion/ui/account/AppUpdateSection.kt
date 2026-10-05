package com.partyconsole.companion.ui.account

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Checkbox
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.update.AppUpdates
import com.partyconsole.companion.update.UpdateControl
import com.partyconsole.companion.update.UpdatePrefs
import com.partyconsole.companion.update.UpdateState
import kotlinx.coroutines.launch

private val Emerald200 = Color(0xFFA7F3D0)
private val Amber200 = Color(0xFFFDE68A)
private val Rose300 = Color(0xFFFDA4AF)
private val Slate300 = Color(0xFFCBD5E1)

/** This app's own updates, laid out like the console's update panel. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AppUpdateSection() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val state by AppUpdates.state.collectAsState()
    val prefs = remember { UpdatePrefs(context) }
    var automatic by remember { mutableStateOf(prefs.automaticChecks) }
    val installed = remember { AppUpdates.installedVersion(context) }
    val release = state.available
    val busy = state.phase != UpdateState.Phase.IDLE

    Column(
        modifier = Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(6.dp)).padding(16.dp).semantics { contentDescription = "App updates" },
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text("Party Console Companion", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall)
        Text("Installed version: ${installed.ifEmpty { "unknown" }}", style = MaterialTheme.typography.bodySmall)
        if (AppUpdates.isDevBuild(context)) {
            Text("Development build: it installs next to the release app and is updated by installing a newer build of your own.", color = Amber200, style = MaterialTheme.typography.labelSmall)
            return@Column
        }
        if (release != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("New release available: ${release.version}", color = Emerald200, style = MaterialTheme.typography.bodySmall)
                TextButton(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(release.notesUrl)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }) { Text("Release notes") }
            }
        }
        Text(
            when (state.phase) {
                UpdateState.Phase.CHECKING -> "Checking…"
                UpdateState.Phase.DOWNLOADING -> "Downloading… ${(state.progress * 100).toInt()}%"
                UpdateState.Phase.INSTALLING -> "Waiting for Android to install the update."
                UpdateState.Phase.IDLE -> when {
                    release != null -> "Update available."
                    state.checkedAt != null -> "Up to date."
                    else -> "Not checked yet."
                }
            },
            style = MaterialTheme.typography.bodySmall,
        )
        if (state.phase == UpdateState.Phase.DOWNLOADING) LinearProgressIndicator(progress = { state.progress }, modifier = Modifier.fillMaxWidth())
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(enabled = !busy, onClick = { scope.launch { AppUpdates.check(context) } }) { Text("Check now") }
            if (release != null) {
                OutlinedButton(enabled = !busy, onClick = {
                    if (!AppUpdates.canInstall(context)) context.startActivity(AppUpdates.installPermissionIntent(context))
                    else scope.launch { AppUpdates.downloadAndInstall(context, release) }
                }) { Text("Download and install update") }
            }
        }
        Row(verticalAlignment = Alignment.Top) {
            Checkbox(checked = automatic, onCheckedChange = {
                automatic = it
                prefs.automaticChecks = it
                UpdateControl.apply(context)
            })
            Text("Check for updates automatically and notify me", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 12.dp))
        }
        Text("Checks every 6 hours. Android asks you to confirm each install, and the first one needs \"Install unknown apps\" allowed for this app.", style = MaterialTheme.typography.labelSmall, color = Slate300)
        if (release != null && !AppUpdates.canInstall(context)) {
            Text("Download and install opens Android's \"Install unknown apps\" setting first.", color = Amber200, style = MaterialTheme.typography.labelSmall)
        }
        state.error?.let { Text(it, color = Rose300, style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Default) }
    }
}
