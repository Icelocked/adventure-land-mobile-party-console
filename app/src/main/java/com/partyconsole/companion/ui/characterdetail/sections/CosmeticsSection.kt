package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.partyconsole.companion.model.CosmeticJar
import com.partyconsole.companion.model.Sprite
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import kotlinx.coroutines.launch
import kotlin.math.roundToLong

private fun jarState(jar: CosmeticJar) = when {
    jar.kind == "empty" -> "Empty"
    jar.locked -> "Locked"
    jar.kind == "unknown" -> "Unknown cosmetic"
    else -> "Usable"
}

private fun seconds(ms: Long) = if (ms >= 60_000) "${(ms / 60_000.0).roundToLong()}m" else "${(ms / 1000.0).roundToLong()}s"

/** The cosmetic's own sprite layer, or an emote's skill icon; an empty box
 *  when the game has no art for it. */
@Composable
private fun Preview(sprite: Sprite?, label: String) {
    Box(
        modifier = Modifier.size(32.dp).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(4.dp))
            .semantics { contentDescription = if (sprite != null) "$label preview" else "$label has no preview" },
    ) { sprite?.let { SpriteIcon(it, size = 32.dp) } }
}

@Composable
private fun CosmeticRow(content: @Composable () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(6.dp)).padding(horizontal = 8.dp, vertical = 4.dp),
    ) { content() }
}

/** CX jars in the bag, emotes, what is worn and owned cosmetics; each action
 *  runs on the character's native client. Collapsed by default, and hidden
 *  until the character sends a cosmetics report. PWA: CosmeticsSection.tsx
 *  (console 1.4 cosmetics-panel.tsx). */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun CosmeticsSection(characterName: String, viewModel: PartyViewModel) {
    val diagnostics by viewModel.characterDetails.collectAsState()
    val cosmetics = diagnostics[characterName]?.cosmetics ?: return
    val scope = rememberCoroutineScope()
    var open by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val targets = remember { mutableStateMapOf<String, String>() }
    fun run(key: String, command: Map<String, Any?>) = scope.launch {
        busy = key
        error = null
        (viewModel.api.sendCommand(characterName, command) as? ApiResult.Failure)?.let { error = it.message }
        busy = null
    }
    val usable = cosmetics.jars.count { it.usable }
    val appearance = cosmetics.owned.filter { it.kind != "emote" }
    val emotes = cosmetics.owned.filter { it.kind == "emote" }
    val last = cosmetics.lastEmote
    val title = "Cosmetics · ${cosmetics.jars.size} CX jar${if (cosmetics.jars.size == 1) "" else "s"}${if (usable > 0) " ($usable usable)" else ""}" +
        if (emotes.isNotEmpty()) " · ${emotes.size} emote${if (emotes.size == 1) "" else "s"}" else ""
    @Composable
    fun Action(key: String, label: String, pending: String, description: String, command: Map<String, Any?>, disabled: Boolean = false) {
        OutlinedButton(
            enabled = busy == null && !disabled,
            onClick = { run(key, command) },
            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 0.dp),
            modifier = Modifier.height(32.dp).semantics { contentDescription = description },
        ) { Text(if (busy == key) pending else label, fontSize = 12.sp) }
    }
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val small = MaterialTheme.typography.labelSmall

    Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text((if (open) "▾ " else "▸ ") + title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.fillMaxWidth().clickable { open = !open })
            if (!open) return@Column
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("CX jars in inventory", fontWeight = FontWeight.SemiBold, style = small)
                if (cosmetics.jars.isEmpty()) Text("No CX jars.", color = muted, style = small)
                for (jar in cosmetics.jars) {
                    CosmeticRow {
                        val label = jar.label ?: jar.data ?: "empty"
                        Preview(jar.sprite, jar.label ?: jar.data ?: "empty jar")
                        Text(
                            "Slot ${jar.inventorySlot} · $label" + if (jar.kind == "emote") " · emote" else jar.slot?.let { " · $it" } ?: "",
                            style = small,
                            modifier = Modifier.weight(1f),
                        )
                        Text(jarState(jar), color = if (jar.usable) Color(0xFF10B981) else muted, style = small)
                        if (jar.usable) Action("jar${jar.inventorySlot}", "Open", "Opening…", "Open CX jar in slot ${jar.inventorySlot}", mapOf("type" to "cx-open-jar", "inventorySlot" to jar.inventorySlot))
                    }
                }
                Text("Opening adds the cosmetic to this character's collection and uses up the jar.", color = muted, style = small)
            }
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Emotes", fontWeight = FontWeight.SemiBold, style = small)
                if (emotes.isEmpty()) Text("No emotes unlocked.", color = muted, style = small)
                for (entry in emotes) {
                    val label = entry.label ?: entry.name
                    val range = entry.range
                    // Ranged emotes need a target: this character unless the emote
                    // forbids it, then nearby players within range.
                    val options = if (range == null) emptyList() else (if (entry.noSelf) emptyList() else listOf(characterName to 0.0)) +
                        cosmetics.nearbyPlayers.filter { it.distance <= range }.map { it.name to it.distance }
                    val target = if (range == null) null else targets[entry.name]?.takeIf { chosen -> options.any { it.first == chosen } } ?: options.firstOrNull()?.first
                    val cooling = (entry.cooldownLeftMs ?: 0) > 0
                    fun optionLabel(option: Pair<String, Double>) = if (option.first == characterName) "$characterName (self)" else "${option.first} · ${formatDistance(option.second)}"
                    CosmeticRow {
                        Preview(entry.sprite, label)
                        Column(modifier = Modifier.weight(1f)) {
                            Text(label, style = small)
                            Text(
                                (entry.explanation?.let { "$it · " } ?: "") + (entry.mp?.takeIf { it != 0.0 }?.let { "${formatDistance(it)} MP · " } ?: "") +
                                    "${seconds(entry.cooldownMs ?: 0)} cooldown" + (range?.let { " · range ${formatDistance(it)}" } ?: ""),
                                color = muted,
                                style = small,
                            )
                        }
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            if (range != null) {
                                var menu by remember { mutableStateOf(false) }
                                Box {
                                    OutlinedButton(
                                        enabled = options.isNotEmpty() && busy == null,
                                        onClick = { menu = true },
                                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp),
                                        modifier = Modifier.height(32.dp).semantics { contentDescription = "Target for $label" },
                                    ) { Text(options.find { it.first == target }?.let(::optionLabel) ?: "Nobody in range", fontSize = 12.sp) }
                                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                                        for (option in options) DropdownMenuItem(text = { Text(optionLabel(option)) }, onClick = { targets[entry.name] = option.first; menu = false })
                                    }
                                }
                            }
                            Action(
                                "emote${entry.name}",
                                if (cooling) "Ready in ${seconds(entry.cooldownLeftMs ?: 0)}" else "Use",
                                "Using…",
                                "Use $label",
                                mapOf("type" to "cx-emote", "name" to entry.name, "target" to target),
                                disabled = cooling || (range != null && target == null),
                            )
                        }
                    }
                }
                last?.let { emote ->
                    val lastLabel = emotes.find { it.name == emote.name }?.label ?: emote.name
                    Text(
                        "Last emote: $lastLabel" + (emote.target?.let { " → $it" } ?: "") + " · " +
                            when {
                                emote.ok -> "used"
                                emote.reason == "pending" -> "sending…"
                                else -> "refused: ${emote.reason}"
                            },
                        color = if (emote.ok) Color(0xFF10B981) else Color(0xFFF59E0B),
                        style = small,
                    )
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Worn", fontWeight = FontWeight.SemiBold, style = small)
                if (cosmetics.worn.isEmpty()) Text("Nothing worn.", color = muted, style = small)
                for ((slot, item) in cosmetics.worn) {
                    CosmeticRow {
                        Preview(cosmetics.owned.find { it.name == item }?.sprite, item)
                        Text("$slot · $item", style = small, modifier = Modifier.weight(1f))
                        if (slot != "skin") Action("remove$slot", "Remove", "Removing…", "Remove $item from $slot", mapOf("type" to "cx-remove", "slot" to slot))
                    }
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Owned", fontWeight = FontWeight.SemiBold, style = small)
                if (appearance.isEmpty()) Text("No owned cosmetics reported.", color = muted, style = small)
                for (entry in appearance) {
                    val wearing = entry.slot != null && cosmetics.worn[entry.slot] == entry.name
                    CosmeticRow {
                        Preview(entry.sprite, entry.label ?: entry.name)
                        Text(
                            (entry.label ?: entry.name) + (if (entry.count > 1) " ×${entry.count}" else "") + " · ${entry.slot ?: entry.kind}",
                            style = small,
                            modifier = Modifier.weight(1f),
                        )
                        if (entry.kind == "appearance" && entry.slot != null) {
                            val command = mapOf("type" to "cx-wear", "name" to entry.name, "slot" to entry.slot)
                            if (wearing) Action("wear${entry.name}", "Worn", "Worn", "Wear ${entry.name}", command, disabled = true)
                            else Action("wear${entry.name}", "Wear", "Wearing…", "Wear ${entry.name}", command)
                        }
                    }
                }
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = small) }
        }
    }
}

/** A JavaScript number as the dashboard prints it: whole values without ".0". */
private fun formatDistance(value: Double): String = if (value == Math.floor(value) && value.isFinite()) value.toLong().toString() else value.toString()
