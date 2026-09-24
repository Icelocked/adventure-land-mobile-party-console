package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.IconButton
import androidx.compose.material3.Icon
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.MerchantJob
import com.partyconsole.companion.ui.PartyViewModel
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Ports merchant-card-controls.tsx's "Merchant logistics" widget -
 *  current job + queued jobs, each cancellable. Only ever rendered for
 *  the merchant character (see CharacterDetailScreen). */
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
                        IconButton(onClick = {
                            scope.launch {
                                viewModel.api.post(
                                    "merchant/job/cancel",
                                    JsonObject(mapOf("id" to JsonPrimitive(job.id ?: ""))),
                                )
                                viewModel.refreshDynamicStateNow()
                            }
                        }) {
                            Icon(Icons.Filled.Close, contentDescription = "Cancel job")
                        }
                    }
                }
            }
        }
    }
}

/** A short v1 label from routine/reason - not a full port of party-
 *  console's merchantJobLabel lookup table, just enough to be readable. */
private fun jobLabel(job: MerchantJob): String = job.routine ?: job.reason
