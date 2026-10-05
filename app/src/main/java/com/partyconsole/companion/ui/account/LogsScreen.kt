package com.partyconsole.companion.ui.account

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.data.Domain
import com.partyconsole.companion.ui.DomainInterest
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.components.rememberClock
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.text.DateFormat
import java.util.Date

/** Game-log category filters; keep in sync with the PWA's lib/gameLogFilters.ts. */
data class LogFilter(val id: String, val label: String, val pattern: Regex, val enabled: Boolean)

val LOG_FILTERS = listOf(
    LogFilter("kills", "Kills", Regex("killed|slain", RegexOption.IGNORE_CASE), false),
    LogFilter("gold", "Gold", Regex("\\bgold\\b", RegexOption.IGNORE_CASE), true),
    LogFilter("party", "Party", Regex("party", RegexOption.IGNORE_CASE), true),
    LogFilter("items", "Items", Regex("found", RegexOption.IGNORE_CASE), true),
    LogFilter("upgrade", "Upgr.", Regex("upgrade|combination|compound", RegexOption.IGNORE_CASE), true),
    LogFilter(
        "errors",
        "Errors",
        Regex("\\b\\w*error\\b|\\bexception\\b|\\bfailed\\b|route rejected|collisions detected|falling back to native|\\b(?:line|column)\\s*:?\\s*\\d+", RegexOption.IGNORE_CASE),
        true,
    ),
    LogFilter("info", "Info", Regex("$^"), true),
)
val DEFAULT_LOG_FILTERS: Map<String, Boolean> = LOG_FILTERS.associate { it.id to it.enabled }

fun classifyGameLog(message: String): String {
    if (LOG_FILTERS[5].pattern.containsMatchIn(message)) return "errors"
    return LOG_FILTERS.find { it.pattern.containsMatchIn(message) }?.id ?: "info"
}

fun showGameLog(category: String, filters: Map<String, Boolean>): Boolean = filters[if (category == "other") "info" else category] != false

private const val FILTERS_KEY = "party-log-filters"
private val HEX_COLOR = Regex("^#[0-9a-f]{3,8}$", RegexOption.IGNORE_CASE)

private data class LogRow(val key: String, val at: Long, val message: String, val name: String, val source: String, val category: String, val color: String)

private fun parseColor(hex: String): Color? = runCatching {
    val digits = hex.removePrefix("#")
    val full = when (digits.length) {
        3, 4 -> digits.map { "$it$it" }.joinToString("")
        else -> digits
    }
    when (full.length) {
        6 -> Color(("FF$full").toLong(16))
        8 -> Color(("${full.substring(6)}${full.substring(0, 6)}").toLong(16))
        else -> null
    }
}.getOrNull()

/** Logs: Game logs (category toggles, persisted) and Dashboard logs (combat,
 *  merchant / coordinator, anniversary), a character filter, the status line,
 *  and the latest 1,000 matching entries in order, auto-following the end. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LogsScreen(viewModel: PartyViewModel, onBack: () -> Unit) {
    DomainInterest(viewModel, Domain.LOGS)
    val state by viewModel.dynamicState.collectAsState()
    val characters by viewModel.characters.collectAsState()
    val diagnostics by viewModel.characterDetails.collectAsState()
    val gameLogs by viewModel.gameLogs.collectAsState()
    val logsError by viewModel.logsError.collectAsState()
    val prefs = LocalContext.current.getSharedPreferences("ui", Context.MODE_PRIVATE)
    var tab by remember { mutableStateOf("game") }
    var character by remember { mutableStateOf("all") }
    var source by remember { mutableStateOf("all") }
    var sourceMenu by remember { mutableStateOf(false) }
    var characterMenu by remember { mutableStateOf(false) }
    var filters by remember {
        mutableStateOf(
            DEFAULT_LOG_FILTERS + runCatching {
                (kotlinx.serialization.json.Json.parseToJsonElement(prefs.getString(FILTERS_KEY, null) ?: "{}") as JsonObject)
                    .mapNotNull { (key, value) -> (value as? JsonPrimitive)?.content?.toBooleanStrictOrNull()?.let { key to it } }.toMap()
            }.getOrDefault(emptyMap()),
        )
    }
    val listState = rememberLazyListState()
    val time = remember { DateFormat.getTimeInstance(DateFormat.MEDIUM) }
    val game = remember(gameLogs) {
        gameLogs.flatMap { (name, events) -> events.map { LogRow(name + it.session + it.seq, it.at, it.message, name, "game", classifyGameLog(it.message), it.color.orEmpty()) } }
    }
    val combat = remember(state.combatLogs) {
        state.combatLogs.flatMap { (name, events) -> events.mapIndexed { i, e -> LogRow("combat:$name:${e.at}:$i", e.at, e.message, name, "combat", e.type.orEmpty(), "") } }
    }
    val merchant = remember(state.merchantActivity, state.merchantCharacter) {
        state.merchantActivity.mapIndexed { i, e -> LogRow("merchant:${e.at}:$i", e.at, e.message, state.merchantCharacter.orEmpty(), "merchant", e.level.orEmpty(), "") }
    }
    val anniversary = remember(state.anniversary) {
        ((state.anniversary as? JsonObject)?.get("activity") as? JsonArray)?.mapNotNull { it as? JsonObject }?.mapIndexed { i, e ->
            val at = (e["at"] as? JsonPrimitive)?.content?.toDoubleOrNull()?.toLong() ?: 0
            LogRow("anniversary:$at:$i", at, (e["message"] as? JsonPrimitive)?.content.orEmpty(), "", "anniversary", (e["level"] as? JsonPrimitive)?.content.orEmpty(), "")
        }.orEmpty()
    }
    val entries = (if (tab == "game") game else combat + merchant + anniversary)
        .filter { (character == "all" || it.name == character) && (if (tab == "game") showGameLog(it.category.ifEmpty { "other" }, filters) else source == "all" || source == it.source) }
        .sortedBy { it.at }
        .takeLast(1000)
    // Auto-follow the end while the list is at (or near) the bottom.
    val following = !listState.canScrollForward || listState.layoutInfo.totalItemsCount == 0
    LaunchedEffect(entries.size, entries.lastOrNull()?.key) {
        if (following && entries.isNotEmpty()) listState.scrollToItem(entries.size - 1)
    }
    val names = (characters.keys + gameLogs.keys + state.bankbois.map { it.name }).distinct()
    val now = rememberClock()
    val offline = character != "all" && now - (diagnostics[character]?.seenAt ?: 0) > 15000
    val sources = listOf("all" to "All sources", "combat" to "Combat", "merchant" to "Merchant / coordinator", "anniversary" to "Anniversary")

    AccountScreenScaffold("Live logs", onBack) {
        Column(modifier = Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = tab == "game", onClick = { tab = "game" }, label = { Text("Game logs") })
                FilterChip(selected = tab == "dashboard", onClick = { tab = "dashboard" }, label = { Text("Dashboard logs") })
            }
            if (tab == "game") {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    for (f in LOG_FILTERS) {
                        FilterChip(selected = filters[f.id] == true, onClick = {
                            val next = filters + (f.id to (filters[f.id] != true))
                            filters = next
                            runCatching { prefs.edit().putString(FILTERS_KEY, JsonObject(next.mapValues { JsonPrimitive(it.value) }).toString()).apply() }
                        }, label = { Text(f.label) })
                    }
                }
            } else {
                Box {
                    OutlinedButton(onClick = { sourceMenu = true }, modifier = Modifier.semantics { contentDescription = "Dashboard log source" }) { Text(sources.first { it.first == source }.second) }
                    DropdownMenu(expanded = sourceMenu, onDismissRequest = { sourceMenu = false }) {
                        for ((id, label) in sources) DropdownMenuItem(text = { Text(label) }, onClick = { source = id; sourceMenu = false })
                    }
                }
            }
            Box {
                OutlinedButton(onClick = { characterMenu = true }, modifier = Modifier.semantics { contentDescription = "Log character" }) { Text(if (character == "all") "All characters" else character) }
                DropdownMenu(expanded = characterMenu, onDismissRequest = { characterMenu = false }) {
                    DropdownMenuItem(text = { Text("All characters") }, onClick = { character = "all"; characterMenu = false })
                    for (n in names) DropdownMenuItem(text = { Text(n) }, onClick = { character = n; characterMenu = false })
                }
            }
            Text(
                if (logsError) "Disconnected — showing retained logs" else if (offline) "Character offline — showing retained logs" else "Live updates · latest 1,000 matching entries",
                style = MaterialTheme.typography.labelSmall,
                color = Color(0xFF94A3B8),
            )
            LazyColumn(state = listState, modifier = Modifier.fillMaxWidth().weight(1f).semantics { contentDescription = "Log entries" }, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(entries, key = { it.key }) { e ->
                    Text(
                        buildAnnotatedString {
                            withStyle(SpanStyle(color = Color(0xFF64748B))) { append("${time.format(Date(e.at))} ${if (e.name.isNotEmpty()) "[${e.name}]" else "[${e.source}]"} ") }
                            val color = if (HEX_COLOR.matches(e.color)) parseColor(e.color) else null
                            withStyle(SpanStyle(color = color ?: if (e.category == "errors" || e.category == "error") Color(0xFFFDA4AF) else Color(0xFFF1F5F9))) { append(e.message) }
                        },
                        fontFamily = FontFamily.Monospace,
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
                if (entries.isEmpty()) item { Text("No matching logs yet.", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Color(0xFF94A3B8)) }
            }
        }
    }
}
