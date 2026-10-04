package com.partyconsole.companion.ui.components

import android.annotation.SuppressLint
import android.graphics.Color as AndroidColor
import android.webkit.WebView
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MonetizationOn
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.partyconsole.companion.domain.FreshnessLevel
import com.partyconsole.companion.domain.abbreviatedGold
import com.partyconsole.companion.domain.freshness
import com.partyconsole.companion.domain.goldTotals
import com.partyconsole.companion.domain.partyGoldNames
import com.partyconsole.companion.model.Sprite
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import kotlinx.coroutines.delay
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

private val Amber = Color(0xFFF59E0B)
private val Emerald = Color(0xFF10B981)

/** party-gold.tsx: bank gold (abbreviated) and "(X total)" with what the
 *  active party carries; "—" while any balance is unknown. Tap for the exact
 *  figures (the dashboard's hover title). */
@Composable
fun PartyGold(viewModel: PartyViewModel) {
    val state by viewModel.dynamicState.collectAsState()
    val characters by viewModel.characters.collectAsState()
    var exactShown by remember { mutableStateOf(false) }
    val bankGold = state.bankGold
    val totals = goldTotals(bankGold, partyGoldNames(state.activeSlots, state.bankbois).map { characters[it]?.vitals?.gold })
    fun exact(value: Long?) = value?.let { "%,d".format(it) } ?: "unknown"
    Column(horizontalAlignment = Alignment.End, modifier = Modifier.clickable { exactShown = !exactShown }) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Icon(Icons.Filled.MonetizationOn, contentDescription = "Party gold", tint = Amber, modifier = Modifier.size(14.dp))
            Text(bankGold?.let(::abbreviatedGold) ?: "—", color = Amber, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall)
        }
        Text("(${totals.total?.let(::abbreviatedGold) ?: "—"} total)", color = Amber, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall)
        if (exactShown) {
            Text(
                "Bank: ${exact(bankGold)}; carried: ${exact(totals.carried)}; combined: ${exact(totals.total)} gold",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** The round trip of the smallest request - added after a session where lag
 *  made it impossible to tell "stuck" from "slow" (LatencyBadge.tsx). */
@Composable
fun LatencyBadge(viewModel: PartyViewModel) {
    val latency by viewModel.latencyMs.collectAsState()
    val ms = latency ?: return
    val color = when {
        ms < 300 -> Emerald
        ms < 1000 -> Amber
        else -> MaterialTheme.colorScheme.error
    }
    Text("${ms}ms", color = color, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall)
}

/** A ticking clock for relative times (lib/duration.ts useClock). */
@Composable
fun rememberClock(periodMs: Long = 1_000): Long {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(periodMs) {
        while (true) {
            delay(periodMs)
            now = System.currentTimeMillis()
        }
    }
    return now
}

/** A live/slow/stale marker for the last report at [at] (server clock). */
@Composable
fun FreshnessBadge(viewModel: PartyViewModel, at: Long, subject: String = "update", modifier: Modifier = Modifier) {
    val offset by viewModel.serverOffset.collectAsState()
    val state = freshness(rememberClock() + offset - at, subject)
    val color = when (state.level) {
        FreshnessLevel.LIVE -> Color(0xFF34D399)
        FreshnessLevel.SLOW -> Color(0xFFFCD34D)
        FreshnessLevel.STALE -> Color(0xFFFB7185)
    }
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(modifier = Modifier.size(8.dp).background(color, CircleShape))
        Text(state.label, color = color, style = MaterialTheme.typography.labelSmall)
    }
}

/** tools/update/contracts.ts UpdateStatus - the fields the app reads. */
@Serializable
data class ConsoleUpdateStatus(
    val current: String? = null,
    val displayVersion: String? = null,
    val available: kotlinx.serialization.json.JsonElement? = null, // the release's version, or false
    val notes: String? = null,
    val automatic: Boolean? = null,
    val managed: Boolean? = null,
    val phase: String? = null,
    val checkedAt: Long? = null,
    val error: String? = null,
) {
    val updateAvailable: Boolean get() = available?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.let { value -> value != "false" && value.isNotBlank() } } == true
}

/** console-updates.tsx useUpdates: the update service's status, re-read
 *  every 3s while shown. */
@Composable
fun rememberConsoleUpdates(viewModel: PartyViewModel): ConsoleUpdateStatus? {
    var status by remember { mutableStateOf<ConsoleUpdateStatus?>(null) }
    val json = remember { Json { ignoreUnknownKeys = true; coerceInputValues = true } }
    LaunchedEffect(viewModel) {
        while (true) {
            (viewModel.api.getRoot("console-update") as? ApiResult.Success)?.let { result ->
                runCatching { json.decodeFromString(ConsoleUpdateStatus.serializer(), result.value) }.getOrNull()?.let { status = it }
            }
            delay(3_000)
        }
    }
    return status
}

/** character-portrait.tsx: the coordinator's own rendered character doll
 *  (characterDollHtml), else the character sprite, else the skin name. */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun CharacterPortrait(html: String?, sprite: Sprite?, skin: String?, modifier: Modifier = Modifier) {
    when {
        !html.isNullOrBlank() -> AndroidView(
            modifier = modifier,
            factory = { context ->
                WebView(context).apply {
                    setBackgroundColor(AndroidColor.TRANSPARENT)
                    isClickable = false
                    isFocusable = false
                    isVerticalScrollBarEnabled = false
                    isHorizontalScrollBarEnabled = false
                }
            },
            update = { view ->
                val page = "<html><body style=\"margin:0;display:grid;place-items:center;height:100vh;overflow:hidden;background:transparent\">$html</body></html>"
                view.loadDataWithBaseURL("https://adventure.land/", page, "text/html", "utf-8", null)
            },
        )
        sprite != null -> Box(modifier = modifier, contentAlignment = Alignment.Center) { SpriteIcon(sprite, size = 48.dp) }
        else -> Box(modifier = modifier, contentAlignment = Alignment.Center) {
            Text(skin ?: "Character", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
