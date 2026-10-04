package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.data.Domain
import com.partyconsole.companion.domain.durationLabel
import com.partyconsole.companion.domain.merchantJobLabel
import com.partyconsole.companion.model.MerchantJob
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.DomainInterest
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.account.AUTOMATIC_ROUTINE_KEYS
import com.partyconsole.companion.ui.account.ROUTINE_LABELS
import com.partyconsole.companion.ui.account.routineFor
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.text.DateFormat
import java.util.Date

private val Amber = Color(0xFFF59E0B)
private val Emerald = Color(0xFF10B981)

// A handful of retries on the same error is normal (a realm hop, a brief
// inventory-full moment); past this it's a genuine stuck loop.
private const val STUCK_RECOVERY_ATTEMPTS = 5
private const val STUCK_AFTER_MS = 3 * 60_000L

private fun stuckReason(job: MerchantJob?, now: Long): String? {
    val reason = job?.lastDeferredReason ?: return null
    val byAttempts = (job.recoveryAttempts ?: 0) >= STUCK_RECOVERY_ATTEMPTS
    val byAge = job.firstDeferredAt != null && now - job.firstDeferredAt >= STUCK_AFTER_MS
    return if (byAttempts || byAge) reason else null
}

/** merchant-card-controls.tsx's "Merchant logistics" and "Activity" (the
 *  PWA's MerchantQueueSection.tsx): the current job and the queue
 *  (priority, label, target, status, cancel / retry), the Merchant's Luck
 *  upkeep line, and the activity log with its cleanup actions. Only ever
 *  rendered for the merchant. */
@Composable
fun MerchantQueueSection(viewModel: PartyViewModel) {
    val state by viewModel.dynamicState.collectAsState()
    val catalog = state.merchantCatalog?.allItems.orEmpty()
    val current = state.merchantCurrent
    val now = System.currentTimeMillis()
    val stuck = stuckReason(current, now)
    val report = current?.commandReport as? JsonObject
    val currentStatus = when {
        (report?.get("state") as? JsonPrimitive)?.content == "deferred" -> "Waiting: ${(report["reason"] as? JsonPrimitive)?.content?.ifEmpty { null } ?: "temporarily blocked"}"
        current?.reason == "marked items" && current.phase == "processing" -> "finishing collection"
        else -> current?.phase ?: "in progress"
    }
    val jobs = (if (current != null) listOf(current to currentStatus) else emptyList()) + state.merchantQueue.map { it to "queued" }
    val mluck = state.mluckSchedule

    SectionCard(title = "Merchant logistics · ${state.merchantQueue.size} queued") {
        stuck?.let {
            Text(
                "Stuck: $it${current?.recoveryAttempts?.let { n -> " · retried ${n}×" } ?: ""} — this needs manual attention in-game, not another retry. " +
                    "Cancelling the job below won't clear it if the cause is on the merchant's own character state.",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(bottom = 6.dp),
            )
        }
        if (jobs.isEmpty()) Text("No queued work", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        jobs.forEachIndexed { index, (job, status) ->
            val target = if (job.target.isNotEmpty() && job.reason != "join giveaway") " · ${job.target}" else ""
            val side = job.realmBlockedReason
                ?: job.retryAt?.takeIf { it > now }?.let { "Retry at ${DateFormat.getTimeInstance().format(Date(it))}" }
                ?: job.pauseReason ?: status
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (status == "queued" && job.reason != "fishing" && job.reason != "mining") CancelJobControl(job, viewModel)
                Text(
                    "P${job.priority ?: state.merchantRoutinePriorities[routineFor(job)] ?: 50} ${merchantJobLabel(job, catalog)}$target",
                    fontFamily = FontFamily.Monospace,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (index == 0 && current != null) Amber else MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Text(side, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 128.dp))
                if (job.realmRetryExhausted) RetryJobButton(job.id, viewModel)
            }
        }
        if (mluck != null && jobs.none { (job) -> job.reason == "merchant luck" && job.target == mluck.target }) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Merchant's Luck upkeep · ${mluck.target}", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall)
                Text(if (mluck.status == "scheduled") "dispatch in ${durationLabel(mluck.dispatchInMs)}" else mluck.status, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        MerchantActivity(viewModel)
    }
}

@Composable
private fun RetryJobButton(id: String?, viewModel: PartyViewModel) {
    val scope = rememberCoroutineScope()
    OutlinedButton(enabled = id != null, onClick = { id?.let { scope.launch { viewModel.api.retryMerchantJob(it) } } }) { Text("Retry") }
}

/** merchant-card-controls.tsx "Activity": collapsed until opened (logs poll
 *  fast while open); newest first, coloured by level, full date on tap,
 *  with Clear stale orders / Clear history and their results. */
@Composable
private fun MerchantActivity(viewModel: PartyViewModel) {
    var open by remember { mutableStateOf(false) }
    Text(
        (if (open) "▾ " else "▸ ") + "ACTIVITY",
        color = Amber,
        style = MaterialTheme.typography.labelMedium,
        modifier = Modifier.padding(top = 10.dp).clickable { open = !open },
    )
    if (!open) return
    DomainInterest(viewModel, Domain.LOGS)
    val state by viewModel.dynamicState.collectAsState()
    val scope = rememberCoroutineScope()
    var result by remember { mutableStateOf<String?>(null) }
    var expandedAt by remember { mutableStateOf<Long?>(null) }
    Row(modifier = Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(result.orEmpty(), color = Emerald, style = MaterialTheme.typography.labelSmall, modifier = Modifier.weight(1f))
        TextButton(onClick = {
            scope.launch {
                result = when (val response = viewModel.api.clearStaleOrders()) {
                    is ApiResult.Failure -> response.message.ifBlank { "Cleanup failed" }
                    is ApiResult.Success -> {
                        val data = response.value.data
                        fun count(key: String) = (data?.get(key) as? JsonPrimitive)?.content?.toDoubleOrNull()?.toLong() ?: 0
                        "Removed ${count("deliveriesRemoved")} deliveries, ${count("bankMarksRemoved")} bank marks"
                    }
                }
            }
        }) { Text("Clear stale orders", style = MaterialTheme.typography.labelSmall) }
        TextButton(onClick = {
            scope.launch {
                result = (viewModel.api.clearMerchantActivity() as? ApiResult.Failure)?.message?.ifBlank { "Cleanup failed" } ?: "Activity history cleared"
            }
        }) { Text("Clear history", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall) }
    }
    Column(modifier = Modifier.fillMaxWidth().heightIn(max = 192.dp).verticalScroll(rememberScrollState())) {
        for (entry in state.merchantActivity.asReversed()) {
            val color = when (entry.level) {
                "error" -> MaterialTheme.colorScheme.error
                "success" -> Emerald
                else -> MaterialTheme.colorScheme.onSurfaceVariant
            }
            val time = if (expandedAt == entry.at) DateFormat.getDateTimeInstance().format(Date(entry.at)) else DateFormat.getTimeInstance().format(Date(entry.at))
            val details = entry.details?.let { if (it is JsonPrimitive && it.isString) it.content else it.toString() }
            Text(
                "$time  ${entry.message}${details?.let { " — $it" } ?: ""}",
                color = color,
                fontFamily = FontFamily.Monospace,
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.clickable { expandedAt = if (expandedAt == entry.at) null else entry.at }.padding(vertical = 1.dp),
            )
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
