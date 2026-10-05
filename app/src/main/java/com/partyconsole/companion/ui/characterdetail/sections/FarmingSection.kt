package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.domain.FOLLOWER_ROUTE_MESSAGE
import com.partyconsole.companion.domain.canRouteToMonster
import com.partyconsole.companion.domain.durationLabel
import com.partyconsole.companion.model.BestiaryMonster
import com.partyconsole.companion.model.FarmAreaState
import com.partyconsole.companion.model.HuntBlacklistEntry
import com.partyconsole.companion.model.MapLocation
import com.partyconsole.companion.model.MonsterChoice
import com.partyconsole.companion.model.MonsterHuntCycle
import com.partyconsole.companion.model.MonsterHuntStatus
import com.partyconsole.companion.model.Sprite
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.components.FarmingAreaPicker
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.roundToInt

private val Cyan = Color(0xFF22D3EE)
private val AmberText = Color(0xFFF59E0B)

/** The monster focus picker's trigger label: what's selected right now. */
fun focusSummary(monsterFocus: List<String>, bestiaryCatalog: List<BestiaryMonster>): String = when {
    "all" in monsterFocus -> "All monsters"
    monsterFocus.isEmpty() -> "No monsters selected"
    else -> monsterFocus.joinToString(", ") { id -> bestiaryCatalog.find { it.id == id }?.name ?: id }
}

private data class Mode(val id: String, val label: String, val description: String)

private val MODES = listOf(
    Mode("auto", "Auto", "Default, switching to scatter when learned conditions allow it"),
    Mode("default", "Default", "Force the normal party formation"),
    Mode("scatter", "Scatter", "Force one-shot scatter farming"),
    Mode("hunt", "Hunt", "One quest at a time: leader first, then the next member if its monster is blacklisted"),
)

/** Farming: the live combat target, the mode selector with the saved / live
 *  mode badge, the active farming zone, Hunt status, the Hunt backup setup,
 *  and this character's monster focus (with priorities and radius), the
 *  route-to- monster farming-area picker, and Hunt settings. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FarmingSection(
    characterName: String,
    farmingPolicy: String,
    effectiveMode: String,
    followingLeader: String?,
    isLeader: Boolean,
    farmArea: FarmAreaState?,
    monsterFocus: List<String>,
    monsterSearchRadius: Int,
    monsterChoices: List<MonsterChoice>,
    bestiaryCatalog: List<BestiaryMonster>,
    phoenixRouteOrder: List<String>,
    position: MapLocation?,
    target: String?,
    resolvedTargetType: String?,
    monsterHunt: MonsterHuntCycle?,
    characterHunt: MonsterHuntStatus?,
    huntBlacklist: Map<String, HuntBlacklistEntry>,
    viewModel: PartyViewModel,
    onOpenHuntSettings: () -> Unit,
    // The mode control is for non-merchant classes, the monster focus picker
    // for everyone but the configured merchant.
    showModes: Boolean = true,
    showFocus: Boolean = true,
) {
    val scope = rememberCoroutineScope()
    val state by viewModel.dynamicState.collectAsState()
    val characters by viewModel.characters.collectAsState()
    val diagnostics by viewModel.characterDetails.collectAsState()
    val configLoaded by viewModel.stateLoaded.collectAsState()
    val api = viewModel.api
    val inherited = followingLeader != null
    // The live mode, not the saved policy.
    val liveMode = characters[characterName]?.vitals?.farmingMode?.ifEmpty { null }
        ?: (diagnostics[characterName]?.raw?.get("farmingMode") as? JsonPrimitive)?.content?.ifEmpty { null }
        ?: state.partyFarmingMode?.ifEmpty { null }
        ?: "default"
    // Only the leader or a non-follower can route.
    val canRoute = canRouteToMonster(state.leader, state.followers, characterName)
    val routeDescription = if (canRoute) "Find selected monster" else FOLLOWER_ROUTE_MESSAGE
    // The focus header shows the leader's (effective) radius.
    val effectiveRadius = state.monsterSearchRadiusByCharacter[state.leader ?: characterName]?.takeIf { it != 0 } ?: 400
    var focusOpen by remember(characterName) { mutableStateOf(false) }
    // The route button routes the picker's current (unsaved) selection.
    var focusDraft by remember(characterName) { mutableStateOf<List<String>?>(null) }
    val routeFocus = if (focusOpen) focusDraft ?: monsterFocus else monsterFocus
    var pickingBackup by remember(characterName) { mutableStateOf(false) }
    var backupFocus by remember(characterName) { mutableStateOf<List<String>>(emptyList()) }
    var pickingArea by remember(characterName) { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember(characterName) { mutableStateOf<String?>(null) }

    // Hunt needs a backup focus and location; without both the setup picker
    // opens before anything is posted.
    fun selectMode(mode: String) = scope.launch {
        error = null
        val profile = state.farmingProfiles[characterName]
        val selected = (profile?.monsterFocus as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.content }
            ?: state.monsterFocusByCharacter[characterName]
            ?: if (characterName == state.leader) state.monsterFocus.let { focus -> (focus as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.content } } else emptyList()
        val focus = selected.orEmpty().filter { it != "all" }
        val backup = if (profile?.farmingPolicy == "hunt") profile.monsterHunt?.returnLocation ?: profile.location
        else state.characterLocations[characterName] ?: profile?.location ?: if (characterName == state.leader) state.partyLocation else null
        if (mode == "hunt" && (backup == null || focus.isEmpty())) {
            backupFocus = focus
            pickingBackup = true
            return@launch
        }
        when (val result = api.setFarmingMode(mode, characterName)) {
            is ApiResult.Success -> viewModel.refreshDynamicStateNow()
            is ApiResult.Failure -> if (mode == "hunt" && Regex("backup farming", RegexOption.IGNORE_CASE).containsMatchIn(result.message)) {
                backupFocus = focus
                pickingBackup = true
            } else error = result.message
        }
    }

    SectionCard(title = "Farming") {
        LiveCombatStatus(target, resolvedTargetType, bestiaryCatalog)
        if (showModes) {
            // Badge: "Copy leader" or the saved policy, with the live mode.
            Row(modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("FARMING SETTINGS", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    ((if (inherited) "Copy leader" else farmingPolicy) + if (!inherited && (farmingPolicy == "auto" || farmingPolicy == "hunt")) " · $liveMode" else "").uppercase(),
                    color = Cyan,
                    fontFamily = FontFamily.Monospace,
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.border(1.dp, Color(0xFF0E7490), RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 2.dp),
                )
            }
            if (inherited) Text("Used when Follow is off.", color = Color(0xFF06B6D4), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(bottom = 6.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for (mode in MODES) {
                    FilterChip(
                        selected = farmingPolicy == mode.id,
                        enabled = configLoaded && !pickingBackup && !pickingArea,
                        onClick = { selectMode(mode.id) },
                        label = { Text(mode.label) },
                        modifier = Modifier.semantics { contentDescription = "${mode.label}: ${mode.description}" },
                    )
                }
            }
            ConfigLoadingNote(configLoaded)
            val active = farmArea?.active
            if (!inherited && active != null) {
                Text(
                    "Active farming zone: ${active.map} (${active.x.roundToInt()}, ${active.y.roundToInt()})" +
                        (farmArea.message?.takeIf { it.isNotEmpty() && !Regex("farming resumed", RegexOption.IGNORE_CASE).containsMatchIn(it) }?.let { " · $it" } ?: ""),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp)) }
            HuntStatusBlock(effectiveMode, monsterHunt, characterHunt, huntBlacklist)
        }

        if (pickingBackup) {
            FarmingAreaPicker(
                viewModel = viewModel,
                catalog = monsterChoices,
                bestiaryCatalog = bestiaryCatalog,
                ids = backupFocus,
                onIdsChange = { backupFocus = it },
                character = position,
                radius = monsterSearchRadius,
                busy = busy,
                preparation = true,
                onCancel = { pickingBackup = false },
                onStart = { area, _ ->
                    busy = true
                    try {
                        when (val result = api.setFarmingMode("hunt", characterName, backupFocus, area.map, area.x, area.y)) {
                            is ApiResult.Failure -> error = result.message
                            is ApiResult.Success -> {
                                pickingBackup = false
                                viewModel.refreshDynamicStateNow()
                            }
                        }
                    } finally {
                        busy = false
                    }
                },
            )
        }
        if (pickingArea) {
            val ids = routeFocus.filter { it != "all" }
            FarmingAreaPicker(
                viewModel = viewModel,
                catalog = monsterChoices,
                bestiaryCatalog = bestiaryCatalog,
                ids = ids,
                character = position,
                // Prefer the character's saved waypoint, else the party's.
                waypoint = state.characterLocations[characterName] ?: state.partyLocation,
                // The leader's radius when there is one.
                radius = effectiveRadius,
                busy = busy,
                savedPhoenixOrder = phoenixRouteOrder,
                onCancel = { pickingArea = false },
                onStart = { area, phoenixOrder ->
                    busy = true
                    try {
                        val result = if (phoenixOrder != null) api.navigateToMonster("phoenix", area.map, area.x, area.y, phoenixOrder)
                        else api.routeToFarmingArea(characterName, isLeader, area.map, area.x, area.y, ids.distinct(), "the selected farming area in ${area.mapName ?: area.map}")
                        when (result) {
                            is ApiResult.Failure -> error = result.message
                            is ApiResult.Success -> {
                                pickingArea = false
                                viewModel.refreshDynamicStateNow()
                            }
                        }
                    } finally {
                        busy = false
                    }
                },
            )
        }

        if (showFocus) {
            Text("MONSTER FOCUS - $effectiveRadius", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp, bottom = 4.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                val summary = focusSummary(routeFocus, bestiaryCatalog)
                OutlinedButton(
                    enabled = configLoaded,
                    onClick = {
                        if (focusOpen) focusDraft = null
                        focusOpen = !focusOpen
                    },
                    modifier = Modifier.weight(1f).semantics { contentDescription = summary },
                ) {
                    Text(summary, maxLines = 1, modifier = Modifier.weight(1f))
                    Text(
                        if ("all" in routeFocus) "ALL" else "${routeFocus.size}",
                        fontFamily = FontFamily.Monospace,
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(4.dp)).padding(horizontal = 6.dp)
                            .semantics { contentDescription = "Selected monster count" },
                    )
                }
                OutlinedButton(
                    enabled = !pickingBackup && !pickingArea,
                    onClick = { if (canRoute) pickingArea = true else error = FOLLOWER_ROUTE_MESSAGE },
                    modifier = Modifier.alpha(if (canRoute) 1f else 0.6f).semantics { contentDescription = routeDescription },
                ) { Icon(Icons.Filled.Place, contentDescription = null, modifier = Modifier.size(16.dp)) }
            }
            OutlinedButton(onClick = onOpenHuntSettings, modifier = Modifier.padding(top = 6.dp)) { Text("Hunt settings...") }
            if (focusOpen) {
                MonsterFocusForm(
                    characterName = characterName,
                    monsterFocus = monsterFocus,
                    monsterSearchRadius = monsterSearchRadius,
                    monsterChoices = monsterChoices,
                    priorities = state.monsterPrioritiesByCharacter[characterName].orEmpty(),
                    radiusContext = if (state.followers[characterName] == true && state.leader != null && state.leader != characterName) {
                        "Following ${state.leader}: effective radius ${state.monsterSearchRadiusByCharacter[state.leader]?.takeIf { it != 0 } ?: 400}. This input saves $characterName's own radius."
                    } else "Radius for Leader",
                    viewModel = viewModel,
                    onDraftChange = { focusDraft = it },
                    onClose = {
                        focusOpen = false
                        focusDraft = null
                    },
                )
            }
        }
    }
}

/** The character's current target ("Fighting X"). */
@Composable
private fun LiveCombatStatus(target: String?, resolvedTargetType: String?, bestiaryCatalog: List<BestiaryMonster>) {
    target ?: return
    val monster = bestiaryCatalog.find { it.id == (resolvedTargetType ?: target) }
    Row(
        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(6.dp)).padding(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SpriteIcon(monster?.sprite, size = 20.dp)
        Text(monster?.let { "Fighting ${it.name}" } ?: "Fighting", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(start = 6.dp))
    }
}

/** Monster focus and radius rules: "All monsters" is its own row (picking a
 *  monster drops it), an empty selection is saved as [] (never ['all']),
 *  Fairy can't be picked, the per-monster target priority (0-1000, default
 *  50), and the radius is only sent when changed. */
@Composable
private fun MonsterFocusForm(
    characterName: String,
    monsterFocus: List<String>,
    monsterSearchRadius: Int,
    monsterChoices: List<MonsterChoice>,
    priorities: Map<String, Int>,
    radiusContext: String,
    viewModel: PartyViewModel,
    onDraftChange: (List<String>) -> Unit,
    onClose: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var selected by remember { mutableStateOf(monsterFocus) }
    var dirty by remember { mutableStateOf(false) }
    var radius by remember { mutableStateOf(monsterSearchRadius.toString()) }
    var search by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var fairyExplanation by remember { mutableStateOf(false) }
    val priorityDrafts = remember { mutableStateMapOf<String, String>() }
    fun priorityOf(id: String) = priorityDrafts[id] ?: (priorities[id] ?: 50).toString()

    // An untouched draft follows the server's saved focus.
    LaunchedEffect(monsterFocus) { if (!dirty) selected = monsterFocus }

    fun choose(next: List<String>) {
        dirty = true
        selected = next
        onDraftChange(next)
    }
    fun toggle(id: String, checked: Boolean) {
        when (id) {
            "tinyp" -> fairyExplanation = true
            "all" -> choose(if (checked) listOf("all") else emptyList())
            else -> {
                val rest = selected.filter { it != "all" }
                choose(if (checked) rest + id else rest.filter { it != id })
            }
        }
    }

    val choices: List<Triple<String, String, Sprite?>> =
        listOf(Triple("all", "All monsters", null)) + monsterChoices.map { Triple(it.id, "${it.name ?: it.id} · ${it.id}", it.sprite) }
    val query = search.trim().lowercase()
    val filtered = if (query.isEmpty()) choices else choices.filter { (id, label) -> id.lowercase().contains(query) || label.lowercase().contains(query) }

    Column(modifier = Modifier.fillMaxWidth().padding(top = 8.dp).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(6.dp)).padding(8.dp).semantics { contentDescription = "Monster focus" }) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedTextField(value = search, onValueChange = { search = it }, placeholder = { Text("Search monsters…") }, singleLine = true, modifier = Modifier.weight(1f))
            OutlinedButton(onClick = { choose(emptyList()) }, modifier = Modifier.semantics { contentDescription = "Clear all monster focus" }) { Text("Clear all") }
        }
        Column(modifier = Modifier.fillMaxWidth().heightIn(max = 256.dp).verticalScroll(rememberScrollState())) {
            for ((id, label, sprite) in filtered) {
                if (id == "tinyp") {
                    Row(modifier = Modifier.fillMaxWidth().clickable { fairyExplanation = true }.padding(vertical = 10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("Disabled", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = id in selected, onCheckedChange = { checked -> toggle(id, checked) })
                        if (sprite != null) SpriteIcon(sprite, size = 24.dp) else Text("*", modifier = Modifier.size(24.dp))
                        Text(label, style = MaterialTheme.typography.bodySmall, maxLines = 1, modifier = Modifier.weight(1f).padding(start = 6.dp))
                        OutlinedTextField(
                            value = priorityOf(id),
                            onValueChange = { priorityDrafts[id] = it.filter { c -> c.isDigit() || c == '-' || c == '.' } },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            textStyle = MaterialTheme.typography.labelSmall.copy(fontFamily = FontFamily.Monospace),
                            modifier = Modifier.width(72.dp).semantics { contentDescription = "$label priority" },
                        )
                    }
                }
            }
            if (filtered.isEmpty()) Text("No matching monsters", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(vertical = 16.dp))
        }
        if (fairyExplanation) Text("Fairy has no verified regular spawn route. Enable “Passively hunt fairy” to attack on sight.", style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 8.dp))
        OutlinedTextField(
            value = radius,
            onValueChange = { radius = it },
            label = { Text("Monster search radius") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp).semantics { contentDescription = "Monster search radius" },
        )
        Text("$radiusContext Clearing monster focus resets this to 400.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Targets in the selected spawn zone come first. This radius allows nearby targets only when no eligible targets are visible inside that zone.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.align(Alignment.End).padding(top = 8.dp)) {
            OutlinedButton(onClick = onClose) { Text("Cancel") }
            Button(
                enabled = !saving,
                onClick = {
                    var nextRadius: Int? = null
                    if (radius != monsterSearchRadius.toString()) {
                        val value = radius.trim().toDoubleOrNull()?.let { Math.round(it) }
                        if (radius.isBlank() || value == null || value < 1 || value > 10_000) {
                            error = "Enter a radius from 1 to 10,000."
                            return@Button
                        }
                        nextRadius = value.toInt()
                    }
                    saving = true
                    error = null
                    val nextPriorities = if (priorityDrafts.isNotEmpty()) {
                        priorities + priorityDrafts.mapValues { (_, draft) ->
                            draft.trim().toDoubleOrNull()?.takeIf { it.isFinite() }?.let { Math.round(it).toInt().coerceIn(0, 1000) } ?: 50
                        }
                    } else null
                    scope.launch {
                        when (val result = viewModel.api.setFocus(characterName, selected, nextRadius, nextPriorities)) {
                            is ApiResult.Failure -> error = result.message
                            is ApiResult.Success -> {
                                viewModel.refreshDynamicStateNow()
                                onClose()
                            }
                        }
                        saving = false
                    }
                },
            ) { Text("Save") }
        }
    }
}

/** Hunt status: shown while Hunt is the effective policy or a Hunt (party or
 *  own) exists - stage and message, the backup batch countdown per member (or
 *  the quest owner), the Daisy turn-in wait, the target, and this character's
 *  own quest with its blacklist flag. */
@Composable
private fun HuntStatusBlock(effectivePolicy: String, hunt: MonsterHuntCycle?, characterHunt: MonsterHuntStatus?, blacklist: Map<String, HuntBlacklistEntry>) {
    if (!(effectivePolicy == "hunt" || hunt != null || characterHunt != null)) return
    @Composable
    fun line(text: String, color: Color = AmberText, weight: FontWeight = FontWeight.Normal, top: Boolean = false) =
        Text(text, color = color, fontWeight = weight, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, modifier = if (top) Modifier.padding(top = 4.dp) else Modifier)
    Column(modifier = Modifier.fillMaxWidth().padding(top = 8.dp).semantics { contentDescription = "Hunt status" }) {
        line((if (effectivePolicy == "hunt") "Hunt status" else "Last Hunt status") + (hunt?.stage?.takeIf { it.isNotEmpty() }?.let { " · $it" } ?: ""), weight = FontWeight.SemiBold)
        line(hunt?.message?.ifEmpty { null } ?: if (effectivePolicy == "hunt") "Preparing Monster Hunt cycle" else "Hunt mode is not active")
        if (effectivePolicy != "hunt") line("Current farming mode: $effectivePolicy. Selecting Hunt rechecks eligible quests; blacklisted quests remain skipped.")
        val backup = hunt?.backup
        if (backup != null) {
            line("Next batch after every blacklisted quest expires · ${durationLabel(maxOf(0L, backup.members.values.maxOfOrNull { it.remainingMs } ?: 0L))}", top = true)
            for ((name, member) in backup.members) {
                line("$name: " + when {
                    !member.fresh -> "waiting for fresh status"
                    member.ready -> "ready"
                    else -> "${member.target} · ${durationLabel(member.remainingMs)}"
                })
            }
        } else {
            line("Quest owner" + (hunt?.owner?.let { ": $it" } ?: "") + " · when complete or expired", top = true)
        }
        if (hunt?.turnIn != null && hunt.turnIn.phase != "complete") line("Events wait until Daisy reward claims finish.", top = true)
        hunt?.target?.let { line("Target: $it", top = true) }
        if (characterHunt != null) {
            line(
                "My quest: ${characterHunt.id} · ${characterHunt.count} left · ${durationLabel(characterHunt.remainingMs)}" +
                    if (characterHunt.id != null && blacklist.containsKey(characterHunt.id)) " · Blacklisted — skipped for Hunt" else "",
                color = Color(0xFF10B981),
                top = true,
            )
        }
    }
}
