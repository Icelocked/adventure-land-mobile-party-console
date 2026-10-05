package com.partyconsole.companion.ui.account

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.network.CommandResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.components.AUTO_STAND_EXPLANATION
import com.partyconsole.companion.ui.components.WtbPreference
import com.partyconsole.companion.ui.components.rememberClock
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.ceil
import kotlin.math.max

private const val BLACKLIST_EXPLANATION =
    "Adds a strike when the merchant reaches an advertised seller but the seller is not visible or their stand stays closed during the bounded wait. Retries pause for 1, 2, 4, 8... minutes after successive strikes. Changed or sold listings and unreachable routes do not cause strikes. Disabling this ignores automatic strikes and stops new ones; manual blocks still apply."

/** JavaScript Number(text) as JSON: blank is 0, anything unparseable is null. */
private fun minutesValue(text: String): JsonElement = when {
    text.isEmpty() -> JsonPrimitive(0)
    text.toLongOrNull() != null -> JsonPrimitive(text.toLong())
    else -> kotlinx.serialization.json.JsonNull
}

/** Marketplace settings: auto-fill empty stand slots with the highest
 *  priority buy order, the merchant blacklist toggle, a manual block
 *  (minutes, -1 = forever), every strike record with Clear, and a two-step
 *  Clear all. */
@Composable
fun MarketplaceSettingsScreen(viewModel: PartyViewModel, onBack: () -> Unit) {
    val state by viewModel.dynamicState.collectAsState()
    val scope = rememberCoroutineScope()
    val now = rememberClock()
    var name by remember { mutableStateOf("") }
    var minutes by remember { mutableStateOf("60") }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var confirmClear by remember { mutableStateOf(false) }
    val records = state.merchantBlacklist.entries.sortedByDescending { it.value.updatedAt ?: 0 }

    suspend fun save(action: suspend () -> ApiResult<CommandResult>): Boolean {
        saving = true
        error = ""
        val result = action()
        saving = false
        if (result is ApiResult.Failure) {
            error = result.message.ifEmpty { "Could not save marketplace settings" }
            return false
        }
        viewModel.refreshDynamicStateNow()
        return true
    }
    suspend fun blacklist(vararg payload: Pair<String, JsonElement>) = save { viewModel.api.post("merchant/blacklist", JsonObject(mapOf(*payload))) }

    AccountScreenScaffold("Marketplace settings", onBack, onRefresh = { scope.launch { viewModel.refreshDynamicStateNow() } }) {
        Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text(
                "Automatic strikes never expire or reset on success. Retry cooldowns are 1, 2, 4, 8… minutes; only Clear removes a strike record. Manual entries can use -1 for forever.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Column(modifier = Modifier.fillMaxWidth().border(1.dp, Color(0xFF6D28D9), RoundedCornerShape(4.dp)).padding(12.dp)) {
                Text("Stand buy orders", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
                WtbPreference(
                    "Automatically fill empty stand slots with highest priority buy order",
                    AUTO_STAND_EXPLANATION,
                    state.autoStandBuys,
                    { enabled -> scope.launch { save { viewModel.api.post("merchant/native-stand", JsonObject(mapOf("action" to JsonPrimitive("configure"), "enabled" to JsonPrimitive(enabled)))) } } },
                    enabled = !saving,
                )
            }
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Marketplace merchant blacklist", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
                WtbPreference(
                    "Enable blacklisting unavailable merchants",
                    BLACKLIST_EXPLANATION,
                    state.autoBlacklistMerchants,
                    { enabled -> scope.launch { blacklist("action" to JsonPrimitive("configure"), "enabled" to JsonPrimitive(enabled)) } },
                    enabled = !saving,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(name, { name = it }, placeholder = { Text("Merchant name") }, singleLine = true, modifier = Modifier.weight(1f).semantics { contentDescription = "Merchant name" })
                    OutlinedTextField(minutes, { minutes = it.filter { c -> c.isDigit() || c == '-' } }, placeholder = { Text("Minutes / -1") }, singleLine = true, modifier = Modifier.width(112.dp).semantics { contentDescription = "Minutes" })
                    Button(enabled = !saving, onClick = {
                        scope.launch {
                            if (blacklist("action" to JsonPrimitive("add"), "seller" to JsonPrimitive(name.trim()), "minutes" to minutesValue(minutes))) name = ""
                        }
                    }) { Text("Add") }
                }
                if (records.isEmpty()) Text("No merchant strike records.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                for ((key, entry) in records) {
                    val until = entry.until ?: Double.NaN
                    val coolingDown = until == -1.0 || until > now
                    Row(
                        modifier = Modifier.fillMaxWidth().border(1.dp, if (coolingDown) Color(0xFF9F1239) else Color(0xFF92400E), RoundedCornerShape(4.dp)).padding(8.dp)
                            .semantics { contentDescription = "Strike ${entry.seller}" },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(entry.seller.orEmpty(), fontWeight = FontWeight.SemiBold, color = if (coolingDown) Color(0xFFFB7185) else Color(0xFFF59E0B))
                            Text(
                                "${entry.serverRegion?.ifEmpty { null } ?: "all regions"} ${entry.serverIdentifier?.ifEmpty { null } ?: "all servers"} · ${entry.reason?.ifEmpty { null } ?: "manual"} · ${entry.failures ?: 0} strikes · " +
                                    when {
                                        until == -1.0 -> "blocked forever"
                                        coolingDown -> "${max(1L, ceil((until - now) / 60000).toLong())}m until retry"
                                        else -> "eligible for retry"
                                    },
                                fontFamily = FontFamily.Monospace,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        OutlinedButton(enabled = !saving, onClick = { scope.launch { blacklist("action" to JsonPrimitive("clear"), "key" to JsonPrimitive(key)) } }) { Text("Clear") }
                    }
                }
            }
            if (error.isNotEmpty()) Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            OutlinedButton(
                enabled = records.isNotEmpty() && !saving,
                onClick = {
                    if (confirmClear) {
                        confirmClear = false
                        scope.launch { blacklist("action" to JsonPrimitive("clear")) }
                    } else confirmClear = true
                },
            ) { Text(if (confirmClear) "Really clear all?" else "Clear all") }
        }
    }
}
