package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.GpsFixed
import androidx.compose.material.icons.filled.Healing
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material.icons.filled.Whatshot
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.CharacterVitals
import com.partyconsole.companion.ui.activityLine

/** Class icon + color badge (per the "simple class icon, not a sprite"
 *  decision for v1 - see the mobile-redesign plan). Falls back to a
 *  generic person icon for any ctype not in this list rather than
 *  failing - new classes/typos should degrade, not crash. Shared with
 *  CharacterListScreen so the party overview gets the same class icons. */
fun classLook(ctype: String): Pair<ImageVector, Color> = when (ctype.lowercase()) {
    "warrior" -> Icons.Filled.Shield to Color(0xFFCC5555)
    "mage" -> Icons.Filled.AutoAwesome to Color(0xFF66CCFF)
    "priest" -> Icons.Filled.Healing to Color(0xFF7CFC00)
    "merchant" -> Icons.Filled.Storefront to Color(0xFFFFC966)
    "ranger" -> Icons.Filled.GpsFixed to Color(0xFF66FFB2)
    "rogue" -> Icons.Filled.Whatshot to Color(0xFF9E7BFF)
    "paladin" -> Icons.Filled.Shield to Color(0xFFFFE066)
    else -> Icons.Filled.Person to Color(0xFFAAAAAA)
}

/** The sticky, always-visible top of the character detail screen - kept
 *  out of the scrollable body per the mobile-redesign plan so vitals never
 *  scroll out of view while browsing equipment/inventory below. */
@Composable
fun VitalsHeader(name: String, vitals: CharacterVitals, accountGold: Long? = null) {
    val (icon, color) = classLook(vitals.ctype)
    Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                modifier = Modifier.size(48.dp).background(color.copy(alpha = 0.2f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = vitals.ctype, tint = color)
            }
            Column {
                Text(name, style = MaterialTheme.typography.titleLarge)
                Text(
                    buildString {
                        append("Lv ${vitals.level} ${vitals.ctype}")
                        vitals.primaryStat?.let { append(" $it") }
                        // server is real (merged from the roster - see
                        // PartyRepository); ping/latency has no confirmed
                        // source anywhere on the wire, so it's omitted
                        // entirely rather than shown as a fake "-ms".
                        append(" · ${vitals.server ?: "realm unknown"}")
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        if (vitals.maxXp != null && vitals.maxXp > 0) {
            val xp = vitals.xp ?: 0L
            val xpFraction = (xp.toFloat() / vitals.maxXp.toFloat()).coerceIn(0f, 1f)
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("XP", style = MaterialTheme.typography.labelSmall)
                Text(
                    "${"%,d".format(xp)} / ${"%,d".format(vitals.maxXp)} (${"%.1f".format(xpFraction * 100)}%)",
                    style = MaterialTheme.typography.labelSmall,
                )
            }
            LinearProgressIndicator(
                progress = { xpFraction },
                modifier = Modifier.fillMaxWidth(),
                color = Color(0xFFFFD54A),
            )
        }
        Text(
            "${vitals.map} (${vitals.x.toInt()}, ${vitals.y.toInt()})",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        VitalBar(label = "HP", current = vitals.hp, max = vitals.maxHp, color = Color(0xFFE05C5C))
        VitalBar(label = "MP", current = vitals.mp, max = vitals.maxMp, color = Color(0xFF5CA3E0))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Carrying ${"%,d".format(vitals.gold)}g", style = MaterialTheme.typography.labelSmall)
            accountGold?.let { Text("Account total ${"%,d".format(it)}g", style = MaterialTheme.typography.labelSmall) }
        }
        Text(
            activityLine(vitals),
            style = MaterialTheme.typography.bodyMedium,
            color = if (vitals.rip) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun VitalBar(label: String, current: Int, max: Int, color: Color) {
    Column {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, style = MaterialTheme.typography.labelSmall)
            Text("$current / $max", style = MaterialTheme.typography.labelSmall)
        }
        val fraction = if (max > 0) (current.toFloat() / max.toFloat()).coerceIn(0f, 1f) else 0f
        LinearProgressIndicator(progress = { fraction }, modifier = Modifier.fillMaxWidth(), color = color)
    }
}
