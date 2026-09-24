package com.partyconsole.companion.ui.itempanel

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.model.EquippedEntry
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.ItemMeta
import com.partyconsole.companion.model.Sprite
import com.partyconsole.companion.ui.itemdetail.ITEM_DETAIL_PROPERTY_RANK
import com.partyconsole.companion.ui.itemdetail.STAT_SCROLLS
import com.partyconsole.companion.ui.itemdetail.comparisonSlotsFor
import com.partyconsole.companion.ui.itemdetail.formatStatValue
import com.partyconsole.companion.ui.itemdetail.itemMaximumLevel
import com.partyconsole.companion.ui.itemdetail.previewProperties
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import com.partyconsole.companion.ui.itemicon.displayName
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.abs
import kotlin.math.roundToInt

/** gear-comparison-dialog.tsx ported at ITEM-stat scope only: the dashboard's full version
 *  projects the character's own totals (HP/attack/armor/etc, from str/int/dex + set bonuses),
 *  but that needs base character stats (str/int/dex/vit, combatStats) this app's live vitals
 *  stream never sends (confirmed against a live capture: only hp/mp/gold/map/x/y/xp/conditions/
 *  inventorySize arrive) - dashboard-only `statuses[name]` presentation data this app doesn't
 *  poll. Comparing each side's own item-stat block (previewProperties, the same math behind
 *  the Overview tab) instead of full character totals is honest about what's actually known
 *  here, and still answers the real question: what does swapping this item change. */
@Composable
fun GearComparisonSheet(
    item: Item,
    meta: ItemMeta?,
    characterCtype: String,
    equippedSlots: Map<String, EquippedEntry?>,
    catalogFor: (String) -> CatalogItem?,
    onClose: () -> Unit,
) {
    val candidates = comparisonSlotsFor(meta, characterCtype).ifEmpty {
        listOf((meta?.definition?.get("type") as? JsonPrimitive)?.content ?: "")
    }
    val replacementSlot = candidates.find { equippedSlots[it]?.item?.name == item.name }
        ?: candidates.find { equippedSlots[it] == null }
        ?: candidates.firstOrNull()
    val equipped = replacementSlot?.let { equippedSlots[it] }
    val equippedMeta = equipped?.let { catalogFor(it.item.name)?.meta }

    var leftLevel by remember { mutableStateOf(maxOf(0, equipped?.item?.level ?: 0)) }
    var rightLevel by remember { mutableStateOf(maxOf(0, item.level ?: 0)) }
    var leftStatType by remember { mutableStateOf(equipped?.item?.statType ?: "none") }
    var rightStatType by remember { mutableStateOf(item.statType ?: "none") }

    val leftProps = previewProperties(equippedMeta, equipped?.item?.level ?: 0, leftLevel, leftStatType.takeIf { it != "none" })
    val rightProps = previewProperties(meta, item.level ?: 0, rightLevel, rightStatType.takeIf { it != "none" })
    val rows = (leftProps.keys + rightProps.keys).toList().sortedWith(
        compareBy({ ITEM_DETAIL_PROPERTY_RANK[it] ?: Int.MAX_VALUE }, { it }),
    )

    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(modifier = Modifier.fillMaxSize()) {
            Column(modifier = Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Column {
                        Text("Compare with equipped", style = MaterialTheme.typography.titleSmall)
                        Text(
                            "Move either slider or stat-scroll choice independently. Item stats only - nothing in inventory changes.",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    TextButton(onClick = onClose) { Text("Close") }
                }

                ComparisonPanel(
                    label = if (equipped != null) "${displayName(equipped.item.name, catalogFor)} +$leftLevel" else "Empty slot",
                    detail = replacementSlot ?: "",
                    sprite = equipped?.let { catalogFor(it.item.name)?.sprite },
                    meta = equippedMeta,
                    level = leftLevel,
                    onLevelChange = { leftLevel = it },
                    statType = leftStatType,
                    onStatTypeChange = { leftStatType = it },
                    props = leftProps,
                    otherProps = null,
                    rows = rows,
                )
                ComparisonPanel(
                    label = "${displayName(item.name, catalogFor)} +$rightLevel",
                    detail = "Replaces ${replacementSlot ?: ""}",
                    sprite = catalogFor(item.name)?.sprite,
                    meta = meta,
                    level = rightLevel,
                    onLevelChange = { rightLevel = it },
                    statType = rightStatType,
                    onStatTypeChange = { rightStatType = it },
                    props = rightProps,
                    otherProps = leftProps,
                    rows = rows,
                )
            }
        }
    }
}

@Composable
private fun ComparisonPanel(
    label: String,
    detail: String,
    sprite: Sprite?,
    meta: ItemMeta?,
    level: Int,
    onLevelChange: (Int) -> Unit,
    statType: String,
    onStatTypeChange: (String) -> Unit,
    props: Map<String, Double>,
    otherProps: Map<String, Double>?,
    rows: List<String>,
) {
    val maxLevel = itemMaximumLevel(meta)
    val hasStatScroll = meta?.definition?.get("stat") != null

    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                SpriteIcon(sprite, size = 32.dp)
                Column(modifier = Modifier.padding(start = 8.dp)) {
                    Text(label, style = MaterialTheme.typography.bodyMedium)
                    Text(detail, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }

            if (hasStatScroll) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp).horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    val choices = listOf("none" to "No stat") + STAT_SCROLLS.map { it.stat to it.label }
                    for ((stat, label2) in choices) {
                        val selected = statType == stat
                        TextButton(onClick = { onStatTypeChange(stat) }) {
                            Text(
                                label2,
                                style = MaterialTheme.typography.labelSmall,
                                color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }

            if (maxLevel > 0) {
                Column(modifier = Modifier.padding(top = 8.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Preview level", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("+$level", style = MaterialTheme.typography.labelSmall)
                    }
                    Slider(
                        value = level.toFloat(),
                        onValueChange = { onLevelChange(it.roundToInt()) },
                        valueRange = 0f..maxLevel.toFloat(),
                        steps = (maxLevel - 1).coerceAtLeast(0),
                    )
                }
            }

            Column(modifier = Modifier.padding(top = 4.dp)) {
                for (key in rows) {
                    val value = props[key] ?: 0.0
                    val original = otherProps?.get(key) ?: value
                    val change = if (otherProps != null) value - original else 0.0
                    val changed = otherProps != null && abs(change) > 0.0001
                    if (value == 0.0 && !changed) continue
                    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(key.replace('_', ' '), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Row {
                            Text(
                                formatStatValue(key, JsonPrimitive(value), meta?.definition?.get("type")?.let { (it as? JsonPrimitive)?.content }),
                                style = MaterialTheme.typography.bodySmall,
                                color = if (changed && change > 0) MaterialTheme.colorScheme.tertiary else if (changed && change < 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                            )
                            if (changed) {
                                Text(
                                    " (${if (change > 0) "+" else ""}${formatStatValue(key, JsonPrimitive(change), null)})",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = if (change > 0) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.error,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
