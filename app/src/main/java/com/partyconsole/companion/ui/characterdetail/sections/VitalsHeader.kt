package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
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

private val zoneMap = Regex("^zone_[a-f0-9]+_\\d+$")
private val portraitJson = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }

/** The sticky, always-visible top of the character detail screen (the
 *  PWA's VitalsHeader.tsx): the portrait (opens the character's stats, with
 *  the Tracktrix badge), online dot, level / class / primary stat / realm /
 *  ping, the banking flag, XP, map, HP/MP, gold, and the activity line. */
@Composable
fun VitalsHeader(
    name: String,
    vitals: CharacterVitals,
    accountGold: Long? = null,
    bestiaryCatalog: List<com.partyconsole.companion.model.BestiaryMonster> = emptyList(),
    resolvedTargetType: String? = null,
    diagnostics: com.partyconsole.companion.model.CharacterDiagnostics? = null,
    slots: Map<String, com.partyconsole.companion.model.EquippedEntry?> = emptyMap(),
    online: Boolean = true,
) {
    var statsOpen by remember { mutableStateOf(false) }
    val tracktrix = diagnostics?.tracktrix as? kotlinx.serialization.json.JsonObject
    val tracktrixSprite = tracktrix?.get("sprite")?.let { runCatching { portraitJson.decodeFromJsonElement(com.partyconsole.companion.model.Sprite.serializer(), it) }.getOrNull() }
    val tracktrixActive = (tracktrix?.get("active") as? kotlinx.serialization.json.JsonPrimitive)?.content == "true" && tracktrixSprite != null &&
        (tracktrix["bonuses"] as? kotlinx.serialization.json.JsonObject)?.values?.any { (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.toDoubleOrNull()?.let { v -> v != 0.0 } == true } == true
    val ping = vitals.ping ?: diagnostics?.ping
    // character-map-section.tsx: instanced caves get a readable name.
    val mapLabel = if (zoneMap.matches(vitals.map)) "Cave of Many Dreams" else vitals.map
    val portraitSprite = diagnostics?.characterSprite?.let { runCatching { portraitJson.decodeFromJsonElement(com.partyconsole.companion.model.Sprite.serializer(), it) }.getOrNull() }
    Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            // character-stats-trigger.tsx: the portrait opens the character's stats.
            Box(
                modifier = Modifier.size(width = 56.dp, height = 80.dp)
                    .border(1.dp, Color(0xCC065F46), androidx.compose.foundation.shape.RoundedCornerShape(8.dp))
                    .background(Color(0xFF07100F), androidx.compose.foundation.shape.RoundedCornerShape(8.dp))
                    .clickable { statsOpen = true }
                    .semantics { contentDescription = "View $name stats" },
            ) {
                com.partyconsole.companion.ui.components.CharacterPortrait(diagnostics?.characterDollHtml, portraitSprite, diagnostics?.skin, modifier = Modifier.fillMaxSize())
                if (tracktrixActive) {
                    Box(
                        modifier = Modifier.align(Alignment.TopEnd).padding(2.dp).size(20.dp)
                            .border(1.dp, Color(0xFF7C3AED), androidx.compose.foundation.shape.RoundedCornerShape(4.dp))
                            .background(Color(0xFF101724))
                            .semantics { contentDescription = "Tracktrix bonuses active" },
                    ) { com.partyconsole.companion.ui.itemicon.SpriteIcon(tracktrixSprite, size = 18.dp) }
                }
            }
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier.size(8.dp).background(if (online) Color(0xFF34D399) else Color(0xFF52525B), CircleShape)
                            .semantics { contentDescription = if (online) "Online" else "Offline" },
                    )
                    Text(name, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(start = 8.dp))
                }
                Text(
                    "Lv ${vitals.level} ${vitals.ctype}" + (vitals.primaryStat?.let { " $it" } ?: "") + " · ${vitals.server ?: "realm unknown"} · " +
                        if (online && ping != null && ping.isFinite() && ping >= 0) "${Math.round(ping)}ms" else "—ms",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                when {
                    vitals.banking -> Flag("BANKING", Color(0xFFFBBF24))
                    vitals.bankQueued -> Flag("BANK QUEUED", Color(0xFF22D3EE))
                    vitals.stocking -> Flag("STOCKING UP", Color(0xFFA78BFA))
                }
            }
        }
        if (statsOpen) com.partyconsole.companion.ui.characterdetail.CharacterStatsSheet(name, vitals, diagnostics, slots) { statsOpen = false }
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
            "$mapLabel (${vitals.x.toInt()}, ${vitals.y.toInt()})",
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
            activityLine(vitals, bestiaryCatalog, resolvedTargetType),
            style = MaterialTheme.typography.bodyMedium,
            color = if (vitals.rip) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun Flag(text: String, color: Color) {
    Text(
        text,
        color = color,
        fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
        style = MaterialTheme.typography.labelSmall,
        modifier = Modifier.background(color.copy(alpha = 0.1f), androidx.compose.foundation.shape.RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 2.dp),
    )
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
