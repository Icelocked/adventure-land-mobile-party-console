package com.partyconsole.companion.ui.account

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import com.partyconsole.companion.domain.eventTimeLabel
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.components.rememberClock
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.text.DateFormat
import java.util.Date

private fun JsonElement?.obj() = this as? JsonObject
private fun JsonObject?.str(key: String) = (this?.get(key) as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content
private fun JsonObject?.num(key: String) = this.str(key)?.toDoubleOrNull()

private val Pink200 = Color(0xFFFBCFE8)
private val Pink300 = Color(0xFFF9A8D4)
private val Amber200 = Color(0xFFFDE68A)
private val Amber300 = Color(0xFFFCD34D)
private val Cyan200 = Color(0xFFA5F3FC)
private val Cyan300 = Color(0xFF67E8F9)
private val Emerald300 = Color(0xFF6EE7B7)
private val Rose300 = Color(0xFFFDA4AF)
private val Slate300 = Color(0xFFCBD5E1)
private val Slate400 = Color(0xFF94A3B8)

// Rewards green, failures red, routine bookkeeping neutral.
private fun activityColor(level: String?, message: String): Color = when {
    Regex("\\band received [^·]+ Slice$", RegexOption.IGNORE_CASE).containsMatchIn(message) -> Emerald300
    level == "error" -> Rose300
    Regex("\\bkissed\\b", RegexOption.IGNORE_CASE).containsMatchIn(message) -> Rose300
    level == "featured" -> Amber300
    else -> Slate300
}

private fun clockText(ms: Long) = "${ms / 60000}:${((ms / 1000) % 60).toString().padStart(2, '0')}"
private fun coordinate(value: Double?) = value?.let { if (it == Math.floor(it)) it.toLong().toString() else it.toString() } ?: "undefined"

@Composable
private fun Panel(label: String, border: Color, content: @Composable () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().border(1.dp, border, RoundedCornerShape(4.dp)).padding(12.dp).semantics { contentDescription = label }) { content() }
}

/** The anniversary event, opened from the event's settings button: the chat
 *  toggle, the live round / next round with the farming-return failsafe and
 *  each character's ticket stage, cake slices, the chat advertisement, and
 *  the activity log. */
@Composable
fun AnniversaryScreen(viewModel: PartyViewModel, onBack: () -> Unit) {
    val state by viewModel.dynamicState.collectAsState()
    val diagnostics by viewModel.characterDetails.collectAsState()
    val configLoaded by viewModel.stateLoaded.collectAsState()
    val now = rememberClock()
    val scope = rememberCoroutineScope()
    var settingsError by remember { mutableStateOf("") }
    var sendingChat by remember { mutableStateOf(false) }
    var chatError by remember { mutableStateOf("") }
    val anniversary = state.anniversary.obj()
    val merchant = state.merchantCharacter
    val live = anniversary?.get("live").obj()
    val schedule = anniversary?.get("schedule").obj()
    val deadline = live.num("expires")?.takeIf { it != 0.0 } ?: schedule.num("next") ?: 0.0
    val normalizedDeadline = if (deadline > 0 && deadline < 1e12) (deadline * 1000).toLong() else deadline.toLong()
    val countdownText = if (normalizedDeadline != 0L) clockText(maxOf(0L, normalizedDeadline - now)) else null
    val cycle = anniversary?.get("eventCycle").obj()
    val returnDispatched = cycle.num("returnDispatchedAt")?.takeIf { it != 0.0 }
    val failsafeText = if (cycle != null && returnDispatched == null) clockText(maxOf(0L, (cycle.num("endsAt") ?: 0.0).toLong() - now)) else null
    val slices = (anniversary?.get("slices") as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.content }.orEmpty()
    val labels = anniversary?.get("labels").obj()
    val counts = anniversary?.get("counts").obj()
    val chatMessage = anniversary.str("chatMessage")?.ifEmpty { null }
    val queued = anniversary?.get("chatAdvertisement")?.let { it !is JsonNull } == true
    val activity = (anniversary?.get("activity") as? JsonArray)?.mapNotNull { it as? JsonObject }.orEmpty()
    val time = remember { DateFormat.getTimeInstance(DateFormat.MEDIUM) }

    AccountScreenScaffold("10 Years of Adventure", onBack) {
        Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Automated featured-player visits and protected slice trading.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(4.dp)).clickable(enabled = configLoaded) {}.padding(4.dp),
            ) {
                Checkbox(
                    checked = state.anniversaryAutoChat,
                    enabled = configLoaded,
                    onCheckedChange = { checked ->
                        scope.launch {
                            settingsError = ""
                            if (viewModel.api.setAnniversaryAutoChat(checked) is ApiResult.Failure) settingsError = "Could not save anniversary settings"
                            else viewModel.refreshDynamicStateNow()
                        }
                    },
                    modifier = Modifier.semantics { contentDescription = "Send chat advertisement when receiving cake from a kiss" },
                )
                Text("Send chat advertisement when receiving cake from a kiss", style = MaterialTheme.typography.bodySmall)
            }
            if (settingsError.isNotEmpty()) Text(settingsError, color = Rose300, style = MaterialTheme.typography.bodySmall)

            Panel("Anniversary round", Color(0xFF831843)) {
                Text(if (live != null) "LIVE · ${live.str("target")}" else "Waiting for the next round", fontWeight = FontWeight.SemiBold, color = Pink200)
                Text(
                    when {
                        live != null -> "Expires in ${countdownText ?: "unknown"} · ${live.str("map")} [${coordinate(live.num("x"))}, ${coordinate(live.num("y"))}]"
                        countdownText != null -> "Next round: ${eventTimeLabel(normalizedDeadline.toDouble(), now)} · Depart ${eventTimeLabel((normalizedDeadline - 90000).toDouble(), now)}"
                        else -> "Next round time unavailable"
                    },
                    fontFamily = FontFamily.Monospace,
                    style = MaterialTheme.typography.labelSmall,
                    color = Pink300,
                    modifier = Modifier.padding(top = 4.dp),
                )
                if (cycle != null) {
                    Text(
                        if (returnDispatched != null) "Return dispatched · ${cycle.str("returnReason") ?: "anniversary complete"}"
                        else "Farming return failsafe in $failsafeText · ${cycle["destination"].obj().str("label") ?: "saved location"}",
                        fontFamily = FontFamily.Monospace,
                        style = MaterialTheme.typography.labelSmall,
                        color = Cyan300,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
                Column(modifier = Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    for ((name, char) in diagnostics) {
                        val stage = char.anniversaryState.obj().str("stage")
                        val ticket = char.anniversaryVisit != null && char.anniversaryVisit !is JsonNull
                        Row(modifier = Modifier.fillMaxWidth()) {
                            Text(name, style = MaterialTheme.typography.labelSmall, modifier = Modifier.weight(1f))
                            Text(
                                if (ticket) stage ?: "ticket ready" else stage ?: "no ticket",
                                style = MaterialTheme.typography.labelSmall,
                                color = if (ticket) Pink300 else if (stage == "kiss confirmed") Emerald300 else Slate400,
                            )
                        }
                    }
                }
            }

            Panel("Cake slices", Color(0xFF78350F)) {
                Text("Cake slices · ${anniversary.num("completeSets")?.toLong() ?: 0} complete set(s)", fontWeight = FontWeight.SemiBold, color = Amber200)
                for (row in slices.chunked(2)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
                        for (id in row) {
                            Row(modifier = Modifier.weight(1f).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 4.dp)) {
                                Text(labels.str(id) ?: id, style = MaterialTheme.typography.labelSmall, modifier = Modifier.weight(1f))
                                Text("${counts.num(id)?.toLong() ?: 0}", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Amber300)
                            }
                        }
                        if (row.size == 1) Box(modifier = Modifier.weight(1f))
                    }
                }
                Text("Tradable native surplus: ${anniversary.num("tradableNative")?.toLong() ?: 0}", color = Color(0xFFC4B5FD), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 8.dp))
            }

            Panel("Chat advertisement", Color(0xFF155E75)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Chat advertisement", fontWeight = FontWeight.SemiBold, color = Cyan200, modifier = Modifier.weight(1f))
                    OutlinedButton(
                        enabled = chatMessage != null && !sendingChat && !queued,
                        onClick = {
                            scope.launch {
                                sendingChat = true
                                chatError = ""
                                when (val result = viewModel.api.sendAnniversaryChatAdvertisement()) {
                                    is ApiResult.Failure -> chatError = result.message
                                    is ApiResult.Success -> viewModel.refreshDynamicStateNow()
                                }
                                sendingChat = false
                            }
                        },
                    ) { Text(if (queued) "Queued for ${merchant ?: "merchant"}" else if (sendingChat) "Queueing…" else "Send in game chat") }
                }
                Text(chatMessage ?: "No safe chat advertisement is currently available.", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Color(0xCCCFFAFE), modifier = Modifier.padding(top = 8.dp))
                if (chatError.isNotEmpty()) Text(chatError, color = Rose300, style = MaterialTheme.typography.bodySmall)
            }

            Panel("Anniversary activity", MaterialTheme.colorScheme.outlineVariant) {
                Text("Anniversary activity", fontWeight = FontWeight.SemiBold)
                Column(modifier = Modifier.heightIn(max = 208.dp).verticalScroll(rememberScrollState()).padding(top = 8.dp)) {
                    if (activity.isEmpty()) Text("No anniversary activity yet.", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Color(0xFF64748B))
                    for (entry in activity.reversed()) {
                        val message = entry.str("message").orEmpty()
                        Text(
                            "${time.format(Date((entry.num("at") ?: 0.0).toLong()))} · $message",
                            fontFamily = FontFamily.Monospace,
                            style = MaterialTheme.typography.labelSmall,
                            color = activityColor(entry.str("level"), message),
                        )
                    }
                }
            }
        }
    }
}
