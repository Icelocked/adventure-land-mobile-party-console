package com.partyconsole.companion.ui.components

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedIconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.partyconsole.companion.domain.MonsterAchievement
import com.partyconsole.companion.domain.aggregateMonsterAchievements
import com.partyconsole.companion.domain.displayValue
import com.partyconsole.companion.model.BestiaryMonster
import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.model.ItemDropSource
import com.partyconsole.companion.model.MapLocation
import com.partyconsole.companion.model.Sprite
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.itemdetail.durationStat
import com.partyconsole.companion.ui.itemdetail.formatDropRate
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** definition-grid.tsx: a raw definition as label / value rows (durations formatted). */
@Composable
fun DefinitionGrid(value: JsonObject?, omit: Set<String> = emptySet()) {
    val entries = value.orEmpty().filter { (key, field) -> key !in omit && field !is JsonNull && !(field is JsonPrimitive && field.isString && field.content.isEmpty()) }
    val definitionType = (value?.get("type") as? JsonPrimitive)?.takeIf { it.isString }?.content
    fun display(field: JsonElement): String = when {
        field is JsonPrimitive && !field.isString && field.content in setOf("true", "false") -> if (field.content == "true") "Yes" else "No"
        field is JsonObject || field is JsonArray -> field.toString()
        else -> displayValue(field)
    }
    Column {
        for ((key, field) in entries) {
            val number = (field as? JsonPrimitive)?.takeIf { !it.isString }?.content?.toDoubleOrNull()
            Row(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(key.replace('_', ' ').replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    number?.let { durationStat(key, it, definitionType) } ?: display(field),
                    fontFamily = FontFamily.Monospace,
                    style = MaterialTheme.typography.labelSmall,
                    color = Color(0xFFA7F3D0),
                    textAlign = TextAlign.End,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

/** monster-details-dialog.tsx (the PWA's MonsterDetail.tsx): header with the
 *  G.monsters id and Navigate, achievements, recorded spawns, the
 *  definition grid and drops. */
@Composable
fun MonsterDetail(viewModel: PartyViewModel, monster: BestiaryMonster, onInspectDrop: (String) -> Unit, onNavigated: (() -> Unit)? = null) {
    val state by viewModel.dynamicState.collectAsState()
    val diagnostics by viewModel.characterDetails.collectAsState()
    val achievements = remember(diagnostics) { aggregateMonsterAchievements(diagnostics) }
    var navigating by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SpriteIcon(monster.sprite, size = 56.dp)
            Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
                Text(monster.name, fontWeight = FontWeight.SemiBold)
                Text("G.monsters.${monster.id}", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            OutlinedIconButton(
                enabled = monster.id != "tinyp",
                onClick = { navigating = true },
                modifier = Modifier.semantics { contentDescription = "Navigate to ${monster.name}" },
            ) { Icon(Icons.Filled.Place, contentDescription = null, tint = Color(0xFFA5F3FC)) }
        }
        MonsterAchievementProgress(monster, if (achievements.isNotEmpty()) achievements[monster.id] else null)
        MonsterSpawns(monster.spawnRecords)
        DefinitionGrid(monster.definition, omit = setOf("name", "skin", "achievements"))
        Column(modifier = Modifier.fillMaxWidth().border(1.dp, Color(0xCC78350F), RoundedCornerShape(4.dp)).padding(12.dp)) {
            BestiaryDrops(monster, state.merchantCatalog?.allItems.orEmpty(), onInspectDrop)
        }
    }
    if (navigating) {
        MonsterNavigatePicker(viewModel, monster, onClose = { navigating = false }, onNavigated = {
            navigating = false
            onNavigated?.invoke()
        })
    }
}

/** party-workspace.tsx's FarmingAreaPicker for a monster navigation: the
 *  leader's position and waypoint, override on, then POST
 *  /navigate-to-monster (startFarmingArea). */
@Composable
private fun MonsterNavigatePicker(viewModel: PartyViewModel, monster: BestiaryMonster, onClose: () -> Unit, onNavigated: () -> Unit) {
    val state by viewModel.dynamicState.collectAsState()
    val characters by viewModel.characters.collectAsState()
    var busy by remember { mutableStateOf(false) }
    val leader = state.leader.orEmpty()
    val vitals = characters[leader]?.vitals
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(modifier = Modifier.fillMaxSize()) {
            Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp).semantics { contentDescription = "Navigate to ${monster.name}" }) {
                FarmingAreaPicker(
                    catalog = state.monsterChoices,
                    bestiaryCatalog = state.bestiaryCatalog,
                    ids = listOf(monster.id),
                    character = vitals?.let { MapLocation(it.map, it.x, it.y) },
                    waypoint = state.characterLocations[leader] ?: state.partyLocation,
                    override = true,
                    radius = state.monsterSearchRadiusByCharacter[leader]?.takeIf { it != 0 } ?: 400,
                    busy = busy,
                    savedPhoenixOrder = state.phoenixRouteOrder,
                    onCancel = onClose,
                    onStart = { area, phoenixOrder ->
                        busy = true
                        try {
                            val result = if (phoenixOrder != null) viewModel.api.navigateToMonster("phoenix", area.map, area.x, area.y, phoenixOrder)
                            else viewModel.api.navigateToMonster(monster.id, area.map, area.x, area.y)
                            if (result is ApiResult.Failure) throw IllegalStateException(result.message)
                            viewModel.refreshDynamicStateNow()
                            onNavigated()
                        } finally {
                            busy = false
                        }
                    },
                )
            }
        }
    }
}

/** monster-achievement-progress.tsx. */
@Composable
private fun MonsterAchievementProgress(monster: BestiaryMonster, achievement: MonsterAchievement?) {
    val list = (monster.definition?.get("achievements") as? JsonArray)?.mapNotNull { it as? JsonArray }.orEmpty()
    if (list.isEmpty()) return
    fun reward(entry: JsonArray): String {
        val kind = displayValue(entry.getOrNull(1) ?: JsonPrimitive("reward")).ifEmpty { "reward" }
        val stat = displayValue(entry.getOrNull(2) ?: JsonPrimitive("")).replace('_', ' ').uppercase()
        val amount = (entry.getOrNull(3) as? JsonPrimitive)?.content?.toDoubleOrNull()
        if (kind == "stat" && stat.isNotEmpty() && amount != null) return "${if (amount >= 0) "+" else ""}${localeAmount(amount)} $stat"
        return entry.drop(1).joinToString(" · ") { displayValue(it) }
    }
    val kills = achievement?.score
    val unlocked = if (kills == null) 0 else list.count { kills >= ((it.firstOrNull() as? JsonPrimitive)?.content?.toDoubleOrNull() ?: 0.0) }
    Column(modifier = Modifier.fillMaxWidth().border(1.dp, Color(0xCC4C1D95), RoundedCornerShape(4.dp)).padding(12.dp).semantics { contentDescription = "Monster achievements" }) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 8.dp)) {
            Text("MONSTER ACHIEVEMENTS", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Color(0xFFC4B5FD), modifier = Modifier.weight(1f))
            Text(
                if (kills == null) "Tracktrix data unavailable" else "$unlocked/${list.size} unlocked · ${localeAmount(kills)} score" + (achievement.owner?.let { " · $it" } ?: ""),
                fontFamily = FontFamily.Monospace,
                style = MaterialTheme.typography.labelSmall,
                color = Color(0xBFA7F3D0),
            )
        }
        for (entry in list) {
            val required = maxOf(0.0, (entry.firstOrNull() as? JsonPrimitive)?.content?.toDoubleOrNull() ?: 0.0)
            val complete = kills != null && kills >= required
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp).border(1.dp, if (complete) Color(0xB3047857) else Color(0xFF1E293B), RoundedCornerShape(4.dp)).padding(horizontal = 10.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("${if (complete) "✓ Unlocked" else "○ Locked"} · ${reward(entry)}", color = if (complete) Color(0xFF6EE7B7) else Color(0xFF94A3B8), style = MaterialTheme.typography.labelSmall, modifier = Modifier.weight(1f))
                Text("${localeAmount(required)} score", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Color(0xCCFDE68A))
            }
        }
    }
}

internal fun localeAmount(value: Double): String = java.text.DecimalFormat("#,##0.###", java.text.DecimalFormatSymbols(java.util.Locale.US)).format(value)

private data class DropCard(val id: String, val name: String, val rate: Double, val quantity: Int, val sprite: Sprite?, val sourceType: String? = null, val mapName: String? = null)

/** indirect-bestiary-drops.tsx, verbatim: zone and world loot rolls for this monster. */
private fun indirectBestiaryDrops(monster: BestiaryMonster, catalog: List<CatalogItem>): List<DropCard> {
    val drops = mutableListOf<DropCard>()
    val seen = mutableSetOf<String>()
    for (item in catalog) {
        for (source in item.meta?.world?.drops.orEmpty()) {
            if (source.monsterId != monster.id || (source.sourceType != "zone" && source.sourceType != "world")) continue
            val key = "${item.id}:${source.sourceType}:${source.mapId.orEmpty()}"
            if (!seen.add(key)) continue
            drops += DropCard(item.id, item.name, source.rate, source.quantity.takeIf { it != 0 } ?: 1, item.sprite, source.sourceType, source.mapName)
        }
    }
    return drops.sortedWith(compareByDescending<DropCard> { it.rate }.thenBy { it.name })
}

/** bestiary-drops.tsx: monster-specific drops in server order, then zone and world drops. */
@Composable
private fun BestiaryDrops(monster: BestiaryMonster, catalog: List<CatalogItem>, onInspectDrop: (String) -> Unit) {
    val otherDrops = remember(monster, catalog) { indirectBestiaryDrops(monster, catalog) }
    @Composable
    fun Cards(drops: List<DropCard>, indirect: Boolean) {
        if (drops.isEmpty()) {
            Text("None listed in the current game data.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            return
        }
        for (drop in drops) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp).border(1.dp, Color(0xFF451A03), RoundedCornerShape(4.dp)).clickable { onInspectDrop(drop.id) }.padding(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SpriteIcon(drop.sprite, size = 36.dp)
                Column(modifier = Modifier.padding(start = 8.dp)) {
                    Text(drop.name, style = MaterialTheme.typography.labelSmall, maxLines = 1)
                    Text(
                        formatDropRate(ItemDropSource(monsterId = monster.id, monsterName = monster.name, rate = drop.rate, quantity = drop.quantity, sourceType = drop.sourceType)),
                        fontFamily = FontFamily.Monospace,
                        style = MaterialTheme.typography.labelSmall,
                        color = Color(0xFFFCD34D),
                    )
                    if (indirect) Text(if (drop.sourceType == "world") "World drop" else "${drop.mapName ?: "Map"} zone drop", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Color(0xB367E8F9))
                }
            }
        }
    }
    Text("MONSTER-SPECIFIC DROPS (${monster.drops.size})", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Color(0xFFFCD34D), modifier = Modifier.padding(bottom = 8.dp))
    Cards(monster.drops.map { DropCard(it.id, it.name, it.rate, it.quantity, it.sprite) }, indirect = false)
    Text("ZONE & WORLD DROPS (${otherDrops.size})", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Color(0xFF67E8F9), modifier = Modifier.padding(top = 16.dp, bottom = 8.dp))
    Text("Shared loot-table rolls available while defeating this monster in the listed area.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(bottom = 8.dp))
    Cards(otherDrops, indirect = true)
}

/** tracktrix-bonuses.tsx TracktrixBonusList: active / inactive / waiting, and
 *  the non-zero bonuses. */
@Composable
fun TracktrixBonusList(data: JsonObject?, title: String = "Current Tracktrix bonuses", rose: Boolean = false) {
    val active = (data?.get("active") as? JsonPrimitive)?.content == "true"
    val rawBonuses = data?.get("bonuses")
    val bonuses = (rawBonuses as? JsonObject)?.mapNotNull { (stat, value) -> (value as? JsonPrimitive)?.content?.toDoubleOrNull()?.takeIf { it.isFinite() && it != 0.0 }?.let { stat to it } }.orEmpty()
    Column(
        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp).border(1.dp, if (rose) Color(0xFF9F1239) else Color(0xFF6D28D9), RoundedCornerShape(4.dp)).padding(12.dp)
            .semantics { contentDescription = title },
    ) {
        Text(title, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = 8.dp))
        when {
            data == null || (active && (rawBonuses == null || rawBonuses is JsonNull)) -> Text("Waiting for Tracktrix data.", style = MaterialTheme.typography.bodySmall)
            !active -> Text("Inactive — this character is not receiving Tracktrix bonuses.", style = MaterialTheme.typography.bodySmall)
            bonuses.isEmpty() -> Text("No stat bonuses unlocked yet.", style = MaterialTheme.typography.bodySmall)
            else -> for ((stat, value) in bonuses) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(stat.replace('_', ' ').uppercase(), style = MaterialTheme.typography.bodySmall)
                    Text((if (value > 0) "+" else "") + localeAmount(value), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall, color = if (rose) Color(0xFFFECDD3) else Color(0xFF34D399))
                }
            }
        }
    }
}

/** tracktrix-bonuses.tsx SharedTracktrixBonuses: the newest active
 *  character's reported bonuses. */
@Composable
fun SharedTracktrixBonuses(viewModel: PartyViewModel, names: List<String>) {
    val diagnostics by viewModel.characterDetails.collectAsState()
    val data = names.mapNotNull { diagnostics[it] }.sortedByDescending { it.seenAt ?: 0 }
        .mapNotNull { it.tracktrix as? JsonObject }
        .find { (it["active"] as? JsonPrimitive)?.content == "true" && it["bonuses"] != null && it["bonuses"] !is JsonNull }
    TracktrixBonusList(data?.let { JsonObject(it + ("active" to JsonPrimitive(true))) }, title = "Current bonuses for holding a tracktrix", rose = true)
}
