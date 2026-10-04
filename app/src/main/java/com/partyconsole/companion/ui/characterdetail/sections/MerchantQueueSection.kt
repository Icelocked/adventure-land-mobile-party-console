package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.partyconsole.companion.model.MerchantJob
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.account.AUTOMATIC_ROUTINE_KEYS
import com.partyconsole.companion.ui.account.ROUTINE_LABELS
import com.partyconsole.companion.ui.account.routineFor
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Ports merchant-card-controls.tsx's "Merchant logistics" widget -
 *  current job + queued jobs. Only queued jobs (never the current one, and
 *  never fishing/mining) can be cancelled. Only ever rendered for the
 *  merchant character (see CharacterDetailScreen). */
@Composable
fun MerchantQueueSection(current: MerchantJob?, queue: List<MerchantJob>, viewModel: PartyViewModel) {
    if (current == null && queue.isEmpty()) return
    val scope = rememberCoroutineScope()

    SectionCard(title = "Merchant logistics · ${queue.size} queued") {
        current?.let {
            Text("Now: ${jobLabel(it)} → ${it.target}", style = MaterialTheme.typography.bodyMedium)
        }
        Column {
            for (job in queue) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        "${jobLabel(job)} → ${job.target}${job.realmBlockedReason?.let { " ($it)" } ?: ""}",
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 1,
                        modifier = Modifier.weight(1f),
                    )
                    Row {
                        if (job.realmBlockedReason != null) {
                            IconButton(onClick = {
                                scope.launch {
                                    job.id?.let { viewModel.api.retryMerchantJob(it) }
                                    viewModel.refreshDynamicStateNow()
                                }
                            }) {
                                Icon(Icons.Filled.Refresh, contentDescription = "Retry job")
                            }
                        }
                        if (job.reason != "fishing" && job.reason != "mining") CancelJobControl(job, viewModel)
                    }
                }
            }
        }
    }
}

/** merchant-cancel-job-control.tsx: cancelling an automatic routine's job
 *  also switches that routine off server-side (merchant-control.ts), so it
 *  asks first; a manual job cancels (and undoes its pending intent) at once. */
@Composable
private fun CancelJobControl(job: MerchantJob, viewModel: PartyViewModel) {
    val scope = rememberCoroutineScope()
    val reason = routineFor(job)
    val disablesRoutine = reason in AUTOMATIC_ROUTINE_KEYS
    var confirming by remember(job.id) { mutableStateOf(false) }
    var pending by remember(job.id) { mutableStateOf(false) }
    var error by remember(job.id) { mutableStateOf<String?>(null) }

    fun cancelJob() {
        val id = job.id ?: return
        if (pending) return
        pending = true
        error = null
        scope.launch {
            when (val result = viewModel.api.post("merchant/job/cancel", JsonObject(mapOf("id" to JsonPrimitive(id))))) {
                is ApiResult.Failure -> error = result.message
                is ApiResult.Success -> {
                    confirming = false
                    viewModel.refreshDynamicStateNow()
                }
            }
            pending = false
        }
    }

    IconButton(enabled = job.id != null && !pending, onClick = { if (disablesRoutine) { error = null; confirming = true } else cancelJob() }) {
        Icon(Icons.Filled.Close, contentDescription = if (disablesRoutine) "Cancel job and disable routine" else "Cancel and undo pending intent")
    }
    if (!confirming) error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall) }
    if (confirming) {
        val label = ROUTINE_LABELS[reason] ?: reason
        AlertDialog(
            onDismissRequest = { if (!pending) confirming = false },
            title = { Text("Cancel $label?") },
            text = {
                Column {
                    Text("Canceling this job will also disable this routine until you re-enable it in Routines.")
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                }
            },
            confirmButton = { TextButton(enabled = !pending, onClick = { cancelJob() }) { Text(if (pending) "Canceling…" else "Confirm") } },
            dismissButton = { TextButton(enabled = !pending, onClick = { confirming = false }) { Text("Cancel") } },
        )
    }
}

/** The routine's dashboard label, falling back to the raw reason. */
private fun jobLabel(job: MerchantJob): String = ROUTINE_LABELS[routineFor(job)] ?: job.routine ?: job.reason
