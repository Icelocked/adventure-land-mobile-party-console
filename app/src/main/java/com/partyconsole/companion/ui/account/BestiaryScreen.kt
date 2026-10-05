package com.partyconsole.companion.ui.account

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedIconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.domain.achievementMilestones
import com.partyconsole.companion.domain.aggregateMonsterAchievements
import com.partyconsole.companion.model.BestiaryMonster
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.components.MonsterDetail
import com.partyconsole.companion.ui.components.SharedTracktrixBonuses
import com.partyconsole.companion.ui.components.localeAmount
import com.partyconsole.companion.ui.itemdetail.ItemDetailBrowser
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import kotlinx.coroutines.launch
import kotlin.math.max

private val SORT_OPTIONS = listOf(
    "threat" to "Threat rate",
    "hp" to "HP",
    "attack" to "Attack",
    "xp" to "XP reward",
    "range" to "Attack range",
    "name" to "Name",
    "tracktrix" to "Tracktrix score",
    "next" to "Score to next",
)

/** The bestiary: map filter, search, sort with direction, Tracktrix bonuses
 *  and scores; a monster opens its details. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun BestiaryScreen(viewModel: PartyViewModel, onBack: () -> Unit) {
    val state by viewModel.dynamicState.collectAsState()
    val characters by viewModel.characters.collectAsState()
    val diagnostics by viewModel.characterDetails.collectAsState()
    val scope = rememberCoroutineScope()
    val aggregated = remember(diagnostics) { aggregateMonsterAchievements(diagnostics) }
    val achievements = aggregated.takeIf { it.isNotEmpty() }
    val monsters = state.bestiaryCatalog
    var search by remember { mutableStateOf("") }
    var sort by remember { mutableStateOf("threat") }
    var ascending by remember { mutableStateOf(true) }
    var selectedMap by remember { mutableStateOf("all") }
    var bonusesOpen by remember { mutableStateOf(false) }
    var sortMenu by remember { mutableStateOf(false) }
    var inspecting by remember { mutableStateOf<BestiaryMonster?>(null) }
    var drop by remember { mutableStateOf<String?>(null) }
    // A drop opened from a monster's details.
    var dropSource by remember { mutableStateOf("") }
    val maps = monsters.flatMap { m -> m.spawnRecords.map { it.map } }.distinct().sorted()
    fun score(monster: BestiaryMonster) = max(0.0, achievements?.get(monster.id)?.score ?: 0.0)
    fun scoreToNext(monster: BestiaryMonster): Double? {
        if (achievements == null) return null
        return achievementMilestones(monster).find { it > score(monster) }?.let { it - score(monster) }
    }
    val direction = if (ascending) 1 else -1
    val filtered = monsters
        .filter { m -> selectedMap == "all" || m.spawnRecords.any { it.map == selectedMap } }
        .filter { "${it.name} ${it.id}".lowercase().contains(search.lowercase()) }
        .sortedWith { a, b ->
            when (sort) {
                "name" -> direction * a.name.compareTo(b.name)
                "tracktrix" -> (direction * score(a).compareTo(score(b))).takeIf { it != 0 } ?: a.name.compareTo(b.name)
                "next" -> {
                    val ra = scoreToNext(a)
                    val rb = scoreToNext(b)
                    when {
                        ra == null && rb != null -> 1
                        rb == null && ra != null -> -1
                        else -> (direction * (ra ?: 0.0).compareTo(rb ?: 0.0)).takeIf { it != 0 } ?: a.name.compareTo(b.name)
                    }
                }
                else -> {
                    fun key(m: BestiaryMonster): Double = when (sort) {
                        "hp" -> m.hp.toDouble()
                        "attack" -> m.attack.toDouble()
                        "xp" -> m.xp.toDouble()
                        "range" -> m.range ?: 0.0
                        else -> m.threat
                    }
                    (direction * key(a).compareTo(key(b))).takeIf { it != 0 } ?: a.name.compareTo(b.name)
                }
            }
        }

    AccountScreenScaffold("Bestiary", onBack, onRefresh = { scope.launch { viewModel.refreshDynamicStateNow() } }) {
        Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Text("Compare monsters before choosing a farming target. Use the arrow to switch between lowest and highest first.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                OutlinedIconButton(onClick = { bonusesOpen = !bonusesOpen }, modifier = Modifier.semantics { contentDescription = "Current Tracktrix bonuses" }) {
                    Icon(Icons.Outlined.Info, contentDescription = null, tint = Color(0xFFFECDD3))
                }
            }
            if (bonusesOpen) SharedTracktrixBonuses(viewModel, characters.keys.toList())
            Text("Show monsters in", style = MaterialTheme.typography.bodySmall)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.heightIn(max = 112.dp).verticalScroll(rememberScrollState())) {
                for (map in listOf("all") + maps) FilterChip(selected = selectedMap == map, onClick = { selectedMap = map }, label = { Text(if (map == "all") "All" else map) })
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(search, { search = it }, placeholder = { Text("Search monsters…") }, singleLine = true, modifier = Modifier.weight(1f))
                Box {
                    OutlinedButton(onClick = { sortMenu = true }, modifier = Modifier.semantics { contentDescription = "Sort monsters" }) { Text(SORT_OPTIONS.first { it.first == sort }.second) }
                    DropdownMenu(expanded = sortMenu, onDismissRequest = { sortMenu = false }) {
                        for ((value, label) in SORT_OPTIONS) DropdownMenuItem(text = { Text(label) }, onClick = { sort = value; sortMenu = false })
                    }
                }
                OutlinedIconButton(onClick = { ascending = !ascending }, modifier = Modifier.semantics { contentDescription = if (ascending) "Sort highest first" else "Sort lowest first" }) {
                    Icon(if (ascending) Icons.Filled.ArrowDownward else Icons.Filled.ArrowUpward, contentDescription = null)
                }
            }
            if ((sort == "tracktrix" || sort == "next") && achievements == null) {
                Text("Tracktrix data unavailable; total scores use zero and score to next is unavailable.", color = Color(0xFFFDE68A), style = MaterialTheme.typography.labelSmall)
            }
            if (filtered.isEmpty()) Text("No monsters match this map and search.", style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp))
            for (row in filtered.chunked(2)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (monster in row) MonsterCard(monster, achievements, Modifier.weight(1f)) { inspecting = monster }
                    if (row.size == 1) Box(modifier = Modifier.weight(1f))
                }
            }
        }
    }
    inspecting?.let { monster ->
        ModalBottomSheet(onDismissRequest = { inspecting = null }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
            Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp)) {
                MonsterDetail(
                    viewModel, monster,
                    onInspectDrop = { itemId ->
                        if (state.merchantCatalog?.allItems?.any { it.id == itemId } == true) {
                            dropSource = "Dropped by ${monster.name}"
                            inspecting = null
                            drop = itemId
                        }
                    },
                    onNavigated = { inspecting = null },
                )
            }
        }
    }
    drop?.let { id ->
        ModalBottomSheet(onDismissRequest = { drop = null }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
            Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp)) {
                ItemDetailBrowser(rootItemId = id, rootLevel = 0, catalog = state.merchantCatalog, monsters = state.bestiaryCatalog, viewModel = viewModel, context = com.partyconsole.companion.ui.itemdetail.ItemDetailContext(dropSource, -1))
            }
        }
    }
}

@Composable
private fun MonsterCard(monster: BestiaryMonster, achievements: Map<String, com.partyconsole.companion.domain.MonsterAchievement>?, modifier: Modifier, onClick: () -> Unit) {
    val milestones = achievementMilestones(monster)
    val progress = achievements?.get(monster.id)
    val killed = max(0.0, progress?.score ?: 0.0)
    val finalMilestone = milestones.lastOrNull() ?: 0.0
    val nextMilestone = milestones.find { it > killed }
    val unlocked = milestones.count { it <= killed }
    Column(
        modifier = modifier.border(1.dp, Color(0xFF4C0519), RoundedCornerShape(4.dp)).clickable(onClick = onClick).padding(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        SpriteIcon(monster.sprite, size = 48.dp)
        Text(monster.name, style = MaterialTheme.typography.labelSmall, maxLines = 1, modifier = Modifier.padding(top = 4.dp))
        Text("${"%,d".format(monster.hp)} HP · ${"%,d".format(monster.xp)} XP", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("${"%,d".format(monster.attack)} ATK · ${"%.1f".format(monster.threat)} threat", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Color(0xBFFDA4AF))
        if (finalMilestone != 0.0 && achievements != null) {
            Text("${localeAmount(killed)} / ${localeAmount(finalMilestone)} score", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Color(0xCCFDE68A), modifier = Modifier.padding(top = 4.dp))
            progress?.owner?.let { Text("High score: $it", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Color(0xA6FEF3C7), maxLines = 1) }
            Text("$unlocked / ${milestones.size} achievements unlocked", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Color(0xCC6EE7B7))
            Text(nextMilestone?.let { "${localeAmount(it - killed)} score to next achievement" } ?: "All achievements complete", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Color(0xCCC4B5FD))
        }
        if (finalMilestone != 0.0 && achievements == null) {
            Text("Tracktrix required for score totals", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Color(0xB3FDE68A), modifier = Modifier.padding(top = 4.dp))
        }
    }
}
