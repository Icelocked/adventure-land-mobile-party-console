package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.domain.StatusDuration
import com.partyconsole.companion.domain.displayValue
import com.partyconsole.companion.domain.durationLabel
import com.partyconsole.companion.domain.durationSignature
import com.partyconsole.companion.domain.reconcileDurations
import com.partyconsole.companion.domain.statusRemaining
import com.partyconsole.companion.model.Condition
import com.partyconsole.companion.ui.components.rememberClock
import com.partyconsole.companion.ui.itemdetail.durationStat
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import kotlinx.serialization.json.JsonPrimitive

private val Cyan = Color(0xFF06B6D4)

/** A collapsible card header (the PWA's chevron + title + right-hand count). */
@Composable
internal fun CollapsibleCard(title: String, open: Boolean, onToggle: () -> Unit, trailing: String? = null, content: @Composable () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(8.dp)).padding(16.dp)
            .semantics { contentDescription = title },
    ) {
        Row(modifier = Modifier.fillMaxWidth().clickable(onClick = onToggle), verticalAlignment = Alignment.CenterVertically) {
            Icon(if (open) Icons.Filled.KeyboardArrowDown else Icons.Filled.KeyboardArrowRight, contentDescription = null, modifier = Modifier.size(16.dp))
            Text(title, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
            trailing?.let { Text(it, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        content()
    }
}

/** active-statuses.tsx (the PWA's StatusesSection.tsx): a collapsed "Active
 *  status" with the count; open, each status shows its sprite, a ticking
 *  countdown over a depleting bar, and stacks, and opens its Condition
 *  details. Shown for every class. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun StatusesSection(characterName: String, conditions: List<Condition>) {
    var open by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<Condition?>(null) }
    val now = rememberClock()
    var durations by remember { mutableStateOf<Map<String, StatusDuration?>>(emptyMap()) }
    val signature = durationSignature(conditions)
    // Anchor newly observed telemetry when it arrives (active-statuses.tsx).
    LaunchedEffect(signature) { durations = reconcileDurations(signature, durations, System.currentTimeMillis()) }

    CollapsibleCard("Active status", open, { open = !open }, trailing = "${conditions.size}") {
        if (open && conditions.isEmpty()) Text("No active effects", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
        if (open && conditions.isNotEmpty()) {
            FlowRow(modifier = Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                for (condition in conditions) {
                    val duration = durations[condition.id]
                    val remaining = statusRemaining(duration, now)
                    val fraction = if (duration != null && duration.total > 0) ((remaining ?: 0).toFloat() / duration.total).coerceIn(0f, 1f) else 0f
                    Box(modifier = Modifier.border(1.dp, Color(0xFF155E75), RoundedCornerShape(4.dp)).clickable { selected = condition }) {
                        Box(modifier = Modifier.matchParentSize()) {
                            Box(modifier = Modifier.fillMaxHeight().fillMaxWidth(fraction).background(Color(0xFF164E63)))
                        }
                        Row(modifier = Modifier.padding(6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(modifier = Modifier.size(32.dp).background(Color.Black, RoundedCornerShape(4.dp))) { condition.sprite?.let { SpriteIcon(it, size = 32.dp) } }
                            Column(modifier = Modifier.padding(start = 8.dp)) {
                                Text(condition.name, style = MaterialTheme.typography.labelSmall, maxLines = 1)
                                Text(
                                    durationLabel(remaining ?: condition.remainingMs) + (condition.stacks?.takeIf { it !is kotlinx.serialization.json.JsonNull }?.let { " · ${(it as? JsonPrimitive)?.content ?: it} stacks" } ?: ""),
                                    fontFamily = FontFamily.Monospace,
                                    style = MaterialTheme.typography.labelSmall,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
    selected?.let { ConditionDetailsSheet(characterName, it) { selected = null } }
}

/** condition-details.tsx: the status's name, owner and duration, its
 *  explanation, and every definition/live field (durations formatted). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ConditionDetailsSheet(characterName: String, condition: Condition, onClose: () -> Unit) {
    val merged = condition.definition.orEmpty() + condition.live.orEmpty()
    val ignored = setOf("name", "explanation", "skin", "ui")
    val details = merged.filterKeys { it !in ignored }
    val definitionType = (condition.definition?.get("type") as? JsonPrimitive)?.takeIf { it.isString }?.content
    ModalBottomSheet(onDismissRequest = onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp).semantics { contentDescription = "Condition details" }) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                condition.sprite?.let { Box(modifier = Modifier.size(56.dp).border(1.dp, Color(0xFF0E7490), RoundedCornerShape(4.dp)).background(Color.Black)) { SpriteIcon(it, size = 56.dp) } }
                Column(modifier = Modifier.padding(start = 16.dp)) {
                    Text(condition.name.ifEmpty { "Status effect" }, fontWeight = FontWeight.SemiBold)
                    Text("$characterName · ${durationLabel(condition.remainingMs)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            condition.explanation?.let { Text(it, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 12.dp)) }
            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
            for ((key, value) in details) {
                val number = (value as? JsonPrimitive)?.takeIf { !it.isString }?.content?.toDoubleOrNull()
                Row(modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(key.replace('_', ' ').replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text((number?.let { durationStat(key, it, definitionType) }) ?: displayValue(value), fontFamily = FontFamily.Monospace, color = Cyan, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}
