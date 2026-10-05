package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.domain.LuckySlotSearchResult
import com.partyconsole.companion.domain.aggregateSlotTracking
import com.partyconsole.companion.domain.luckySlotSearch
import com.partyconsole.companion.domain.normalizeSlotTracking
import com.partyconsole.companion.model.LuckySlotTracking
import com.partyconsole.companion.model.SlotRollStatistics
import kotlinx.serialization.json.JsonElement

private fun nextLine(verified: Int?, nextSlot: Int) =
    if (verified != null) "Verified slot: $verified." else "Next upgrade will test for lucky upgrade · slot $nextSlot (inventory position ${nextSlot + 1})."

/** Lucky slot tracking: where the merchant's automatic upgrades are testing
 *  for the lucky inventory slot, and the per-slot evidence sheet. [open] is
 *  controlled so the inventory's lucky slot can open it too ("Show lucky slot
 *  data"). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LuckySlotSection(
    characterName: String,
    streams: Map<String, LuckySlotTracking>,
    verified: Int?,
    open: Boolean,
    onOpenChange: (Boolean) -> Unit,
    localLucky: JsonElement?,
) {
    val tracking = aggregateSlotTracking(streams, localLucky?.let { normalizeSlotTracking(it) })
    val search = luckySlotSearch(tracking)
    val nextSlot = verified ?: search.nextSlot

    SectionCard(title = "Lucky upgrade slot") {
        Text(nextLine(verified, nextSlot), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        TextButton(onClick = { onOpenChange(true) }) { Text("Show lucky slot data") }
    }
    if (open) {
        ModalBottomSheet(onDismissRequest = { onOpenChange(false) }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
            LuckySlotStatistics(characterName, tracking, search, nextSlot, verified)
        }
    }
}

@Composable
private fun LuckySlotStatistics(characterName: String, tracking: LuckySlotTracking, search: LuckySlotSearchResult, nextSlot: Int, verified: Int?) {
    val rows = (0 until 42).map { slot -> slot to (tracking.slots[slot.toString()] ?: SlotRollStatistics()) }
    val sampled = rows.count { it.second.totalRolls > 0 }
    Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Text("Lucky slots · $characterName", fontWeight = FontWeight.SemiBold)
        Text("Upgrade evidence saved per character in coordinator state, with a local copy for reconnects.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 6.dp))
        Text(
            nextLine(verified, nextSlot),
            color = Color(0xFFFDE68A),
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.fillMaxWidth().border(1.dp, Color(0xFFD97706), RoundedCornerShape(6.dp)).background(Color(0x66451A03), RoundedCornerShape(6.dp)).padding(10.dp),
        )
        Text("${search.total} recorded upgrade rolls · $sampled/42 slots sampled.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
        Text(
            if (search.slot == null) "No evidence yet. Testing starts at slot 0."
            else "${if (search.inferred) "Statistically inferred" else "Leading candidate"}: slot ${search.slot} · ${"%.2f".format(search.confidence * 100)}% model confidence · ${search.samples} rolls in that slot.",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )
        Text(
            "Normal upgrade jobs rotate through the least-sampled slots and restore inventory afterward. Once a slot is statistically inferred, upgrades use it while evidence continues to accumulate. No extra upgrades are queued. Slot numbers start at 0.",
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(top = 4.dp),
        )
        Text("Inference requires at least 100 rolls in the leading slot and 99.9% confidence under the published server model. New evidence can change the selected slot.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 4.dp))
        Column(modifier = Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(6.dp))) {
            TableRow(listOf("Slot", "Rolls", "Average", "> 0.963", "Zero rolls", "Status"), header = true)
            for ((slot, stats) in rows) {
                HorizontalDivider()
                val total = stats.totalRolls
                TableRow(
                    listOf(
                        "$slot",
                        "$total",
                        if (total > 0) "%.4f".format(stats.sumRolls / total) else "—",
                        "${stats.rollsAbove96_3} (${if (total > 0) "%.1f".format(100.0 * stats.rollsAbove96_3 / total) else "0.0"}%)",
                        "${stats.perfectRolls} (${if (total > 0) "%.2f".format(100.0 * stats.perfectRolls / total) else "0.00"}%)",
                        if (slot == nextSlot) "Next upgrade" else if (total > 0) "Sampled" else "Untested",
                    ),
                    highlighted = slot == nextSlot,
                )
            }
        }
    }
}

@Composable
private fun TableRow(cells: List<String>, header: Boolean = false, highlighted: Boolean = false) {
    Row(
        modifier = Modifier.fillMaxWidth().background(if (highlighted) Color(0x66451A03) else Color.Transparent).padding(horizontal = 4.dp, vertical = 6.dp)
            .semantics { if (!header) contentDescription = "Slot ${cells[0]}" },
    ) {
        cells.forEachIndexed { index, cell ->
            Text(
                cell,
                modifier = Modifier.weight(if (index == 3 || index == 4) 1.4f else 1f),
                textAlign = if (index == 0) TextAlign.Start else TextAlign.End,
                fontFamily = if (header) null else FontFamily.Monospace,
                style = MaterialTheme.typography.labelSmall,
                color = when {
                    header -> MaterialTheme.colorScheme.onSurfaceVariant
                    index == 0 -> Color(0xFFFBBF24)
                    index == 5 -> MaterialTheme.colorScheme.onSurfaceVariant
                    else -> Color.Unspecified
                },
            )
        }
    }
}
