package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.partyconsole.companion.domain.BannerAction
import com.partyconsole.companion.domain.BannerCandidate
import com.partyconsole.companion.domain.EQUIPMENT_SLOTS
import com.partyconsole.companion.domain.itemActionBanner
import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.model.EquippedEntry
import com.partyconsole.companion.model.StatScrollMark
import com.partyconsole.companion.model.UpgradeMark
import com.partyconsole.companion.model.sameMarkedItem
import com.partyconsole.companion.ui.components.BannerStrip
import com.partyconsole.companion.ui.components.MluckClover
import com.partyconsole.companion.ui.components.StatBadge
import com.partyconsole.companion.ui.components.bannerColors
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import kotlinx.serialization.json.JsonPrimitive

private fun slotLabel(slot: String) = slot.replace(Regex("(\\d+)$"), " $1").replaceFirstChar { it.uppercase() }

/** equipment.tsx + equip-slot.tsx (the PWA's EquipmentSection.tsx): the 15
 *  fixed slots in the dashboard's order (then any other non-stand slot),
 *  "Empty" tiles, +level / stat / mluck badges, set progress current/total,
 *  and the upgrade / stat-scroll banner. A merchant's trade1..N slots are
 *  its stand, not gear. */
@Composable
fun EquipmentSection(
    slots: Map<String, EquippedEntry?>,
    upgradeMarks: List<UpgradeMark> = emptyList(),
    statScrollMarks: List<StatScrollMark> = emptyList(),
    isMerchant: Boolean,
    catalogFor: (String) -> CatalogItem?,
    onSlotTap: (String, EquippedEntry) -> Unit,
) {
    val known = EQUIPMENT_SLOTS.toSet()
    val entries = EQUIPMENT_SLOTS.map { it to slots[it] } + slots.filterKeys { it !in known && !it.startsWith("trade") }.toList()
    fun metaFor(entry: EquippedEntry) = entry.meta ?: catalogFor(entry.item.name)?.meta
    val setCounts = slots.filterKeys { !it.startsWith("trade") }.values.filterNotNull()
        .mapNotNull { metaFor(it)?.world?.set?.id }.groupingBy { it }.eachCount()

    SectionCard(title = "Equipment") {
        for (row in entries.chunked(2)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 8.dp)) {
                for ((slot, equipped) in row) {
                    val meta = equipped?.let { metaFor(it) }
                    val mark = equipped?.let { e -> upgradeMarks.find { it.equipped && (it.slot as? JsonPrimitive)?.content == slot && sameMarkedItem(it.item, e.item) } }
                    val statMark = equipped?.let { e -> statScrollMarks.find { (it.slot as? JsonPrimitive)?.content == slot && sameMarkedItem(it.item, e.item) } }
                    val set = meta?.world?.set
                    val banner = itemActionBanner(
                        listOf(
                            statMark?.let { BannerCandidate(BannerAction.STAT, "Stat scroll") },
                            mark?.let { BannerCandidate(BannerAction.UPGRADE, "${if (it.auto) "Auto" else "+${it.item.level ?: 0}"} → +${(it.item.level ?: 0) + (it.tiers ?: 1)}", automatic = it.auto) },
                        ),
                        isMerchant,
                    )
                    val name = equipped?.let { (meta?.definition?.get("name") as? JsonPrimitive)?.content ?: catalogFor(it.item.name)?.name ?: it.item.name }
                    val sprite = meta?.sprite ?: equipped?.let { catalogFor(it.item.name)?.sprite }
                    Box(
                        modifier = Modifier.weight(1f)
                            .alpha(if (equipped == null) 0.55f else 1f)
                            .border(BorderStroke(1.dp, banner?.let { bannerColors(it.action).border } ?: MaterialTheme.colorScheme.outlineVariant), RoundedCornerShape(6.dp))
                            .clickable(enabled = equipped != null) { equipped?.let { onSlotTap(slot, it) } }
                            .semantics { contentDescription = "${slotLabel(slot)}: ${name ?: "Empty"}" }
                            .padding(6.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(modifier = Modifier.size(40.dp).background(Color.Black, RoundedCornerShape(4.dp))) {
                                if (sprite != null) SpriteIcon(sprite, size = 40.dp)
                                if (equipped != null) {
                                    Text(
                                        "+${equipped.item.level ?: 0}",
                                        color = Color(0xFF6EE7B7),
                                        fontSize = 10.sp,
                                        fontFamily = FontFamily.Monospace,
                                        modifier = Modifier.align(Alignment.BottomEnd).background(Color(0xD9000000), RoundedCornerShape(3.dp)).padding(horizontal = 2.dp),
                                    )
                                }
                                StatBadge(equipped?.item?.statType)
                                BannerStrip(banner)
                                MluckClover(equipped?.item, modifier = Modifier.align(Alignment.CenterEnd))
                            }
                            Column(modifier = Modifier.padding(start = 8.dp)) {
                                Text(slotLabel(slot), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                                Text(name?.let { it + (equipped.item.level?.takeIf { l -> l > 0 }?.let { l -> " +$l" } ?: "") } ?: "Empty", style = MaterialTheme.typography.labelSmall, maxLines = 1)
                            }
                        }
                        if (set != null) {
                            Text(
                                "${setCounts[set.id] ?: 0}/${set.items.sumOf { maxOf(1, it.quantity) }}",
                                color = Color(0xFFFDE68A),
                                fontSize = 8.sp,
                                fontFamily = FontFamily.Monospace,
                                modifier = Modifier.align(Alignment.TopEnd).background(Color(0xF2451A03), RoundedCornerShape(3.dp)).padding(horizontal = 3.dp),
                            )
                        }
                    }
                }
                if (row.size == 1) Box(modifier = Modifier.weight(1f))
            }
        }
    }
}
