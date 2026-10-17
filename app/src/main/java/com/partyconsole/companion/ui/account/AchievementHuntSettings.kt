package com.partyconsole.companion.ui.account

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.domain.AchievementMonster
import com.partyconsole.companion.domain.achievementMonsters
import com.partyconsole.companion.domain.aggregateMonsterAchievements
import com.partyconsole.companion.domain.nextStep
import com.partyconsole.companion.model.AchievementBlacklistEntry
import com.partyconsole.companion.model.AchievementHuntSettings
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.floor

private fun progress(monster: AchievementMonster, kills: Double): String {
    val step = nextStep(monster.ladder, kills)
    val count = "%,d".format(floor(kills).toLong())
    return if (step < 0) "$count kills · complete" else "$count / ${"%,d".format(monster.ladder[step].toLong())} · step ${step + 1}"
}

/** Achievement Hunt settings for one farming scope (upstream console PR
 *  #131, docs/achievement-hunt.md; Ryan's v1.4.0 has none), on the Farming
 *  settings screen below Hunt. Every request carries `character`; a
 *  follower sees the leader's settings read-only. The monster chooser opens
 *  inline. PWA: AchievementHuntSettings.tsx. */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun AchievementHuntSettingsBlock(
    viewModel: PartyViewModel,
    character: String,
    value: AchievementHuntSettings,
    blacklist: Map<String, AchievementBlacklistEntry>,
    editable: Boolean,
    onInspect: (String) -> Unit,
) {
    val state by viewModel.dynamicState.collectAsState()
    val diagnostics by viewModel.characterDetails.collectAsState()
    val scope = rememberCoroutineScope()
    val focus = LocalFocusManager.current
    // Server defaults (runtime/coordinator/hunt/achievement-settings.ts).
    val fillIdle = value.fillIdle != false
    val fillSelectedOnly = value.fillSelectedOnly != false
    val bossRecheckMinutes = value.bossRecheckMinutes ?: 10
    var choosing by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var deaths by remember { mutableStateOf(value.deathThreshold.toString()) }
    LaunchedEffect(value.deathThreshold) { deaths = value.deathThreshold.toString() }
    // A draft only while typing; otherwise the field shows the saved value.
    var recheckDraft by remember { mutableStateOf<String?>(null) }
    val recheck = recheckDraft ?: bossRecheckMinutes.toString()
    val monsters = remember(state.bestiaryCatalog, state.monsterChoices) { achievementMonsters(state.bestiaryCatalog, state.monsterChoices) }
    val achievements = remember(diagnostics) { aggregateMonsterAchievements(diagnostics) }
    val sprites = remember(state.bestiaryCatalog) { state.bestiaryCatalog.associate { it.id to it.sprite } }
    val regular = monsters.filter { !it.special }
    val special = monsters.filter { it.special }
    val selected = value.monsters.toSet()
    fun kills(id: String) = achievements[id]?.score ?: 0.0
    val entries = blacklist.values.sortedBy { it.monsterId }

    fun run(settings: Map<String, JsonElement>? = null, blacklistChange: JsonObject? = null) {
        if (!editable || busy) return
        scope.launch {
            busy = true
            error = null
            when (val result = viewModel.api.achievementHunt(character, settings, blacklistChange)) {
                is ApiResult.Failure -> error = result.message.ifEmpty { "Could not save Achievement Hunt settings" }
                is ApiResult.Success -> viewModel.refreshDynamicStateNow()
            }
            busy = false
        }
    }
    fun choose(ids: List<String>) = run(settings = mapOf("monsters" to JsonArray(ids.map { JsonPrimitive(it) })))
    fun toggle(id: String) = choose(if (id in selected) value.monsters - id else value.monsters + id)
    // Every regular monster from the weakest through this one; special picks are kept.
    fun upTo(index: Int) = choose(regular.take(index + 1).map { it.id } + special.filter { it.id in selected }.map { it.id })
    fun threshold() {
        val n = deaths.trim().toIntOrNull()
        if (n == null || n !in 1..100) {
            error = "The death threshold must be a whole number from 1 to 100."
            return
        }
        if (n != value.deathThreshold) run(settings = mapOf("deathThreshold" to JsonPrimitive(n)))
    }
    fun recheckMinutes() {
        val n = recheck.trim().toIntOrNull()
        if (n == null || n !in 1..120) {
            error = "The boss recheck time must be a whole number of minutes from 1 to 120."
            return
        }
        recheckDraft = null
        if (n != bossRecheckMinutes) run(settings = mapOf("bossRecheckMinutes" to JsonPrimitive(n)))
    }

    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val small = MaterialTheme.typography.labelSmall
    @Composable
    fun ToggleRow(label: String, checked: Boolean, enabled: Boolean, indent: Boolean = false, onChange: (Boolean) -> Unit) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().padding(start = if (indent) 24.dp else 0.dp)
                .toggleable(value = checked, enabled = enabled, role = Role.Checkbox, onValueChange = onChange)
                .semantics(mergeDescendants = true) { contentDescription = label },
        ) {
            Checkbox(checked = checked, onCheckedChange = null, enabled = enabled)
            Text(label, style = MaterialTheme.typography.bodySmall)
        }
    }
    @Composable
    fun MonsterRow(monster: AchievementMonster, index: Int?) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(6.dp)).padding(6.dp),
        ) {
            Checkbox(
                checked = monster.id in selected,
                enabled = editable && !busy,
                onCheckedChange = { toggle(monster.id) },
                modifier = Modifier.semantics { contentDescription = "Farm ${monster.name} for achievements" },
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.weight(1f).clickable { onInspect(monster.id) }.semantics { contentDescription = "Inspect ${monster.name}" },
            ) {
                SpriteIcon(sprites[monster.id], size = 28.dp)
                Column(modifier = Modifier.padding(start = 8.dp)) {
                    Text(monster.name, fontWeight = FontWeight.Medium, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                    Text(
                        progress(monster, kills(monster.id)) + (if (monster.rare) " · fought when seen" else "") + if (blacklist.containsKey(monster.id)) " · blacklisted" else "",
                        color = muted,
                        style = small,
                    )
                }
            }
            if (index != null) OutlinedButton(enabled = editable && !busy, onClick = { upTo(index) }) { Text("Up to here", style = small) }
        }
    }

    Column(
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp).semantics { contentDescription = "Achievement Hunt settings" },
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Achievement Hunt", style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
            OutlinedButton(onClick = { choosing = !choosing }) { Text("Monsters (${selected.size})") }
        }
        Text(
            "Farms the selected monsters for their kill achievements, weakest first. Every selected monster reaches its next milestone before any moves on to the one after. Selected rares, such as Phoenix or Dracul, are never a target: passive hunting fights them when a character sees one.",
            color = muted,
            style = small,
        )
        FlowRow(verticalArrangement = Arrangement.Center) {
            Checkbox(
                checked = value.blacklistDeaths,
                enabled = editable && !busy,
                onCheckedChange = { run(settings = mapOf("blacklistDeaths" to JsonPrimitive(it))) },
                modifier = Modifier.align(Alignment.CenterVertically).semantics { contentDescription = "Blacklist monsters after deaths" },
            )
            Text("Blacklist monsters after", style = MaterialTheme.typography.bodySmall, modifier = Modifier.align(Alignment.CenterVertically))
            OutlinedTextField(
                value = deaths,
                onValueChange = { deaths = it },
                enabled = editable && !busy && value.blacklistDeaths,
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { focus.clearFocus(); threshold() }),
                modifier = Modifier.width(72.dp).padding(horizontal = 6.dp)
                    .onFocusChanged { if (!it.isFocused && deaths != value.deathThreshold.toString()) threshold() }
                    .semantics { contentDescription = "Achievement Hunt deaths before blacklisting" },
            )
            Text("deaths", style = MaterialTheme.typography.bodySmall, modifier = Modifier.align(Alignment.CenterVertically))
        }
        ToggleRow("Fill respawn waits with nearby monsters", fillIdle, editable && !busy) { run(settings = mapOf("fillIdle" to JsonPrimitive(it))) }
        ToggleRow("Only selected monsters", fillSelectedOnly, editable && !busy && fillIdle, indent = true) { run(settings = mapOf("fillSelectedOnly" to JsonPrimitive(it))) }
        Text(
            "While the target respawns, the party fights weaker monsters that share its spawn ground: only the ones selected here, unless you turn that off. The target always comes first.",
            color = muted,
            style = small,
        )
        FlowRow(verticalArrangement = Arrangement.Center) {
            Text("When a boss attacks, farm another target and check back after", style = MaterialTheme.typography.bodySmall, modifier = Modifier.align(Alignment.CenterVertically))
            OutlinedTextField(
                value = recheck,
                onValueChange = { recheckDraft = it },
                enabled = editable && !busy,
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { focus.clearFocus(); recheckMinutes() }),
                modifier = Modifier.width(72.dp).padding(horizontal = 6.dp)
                    .onFocusChanged { if (!it.isFocused && recheckDraft != null) recheckMinutes() }
                    .semantics { contentDescription = "Minutes before checking a boss-held target again" },
            )
            Text("minutes", style = MaterialTheme.typography.bodySmall, modifier = Modifier.align(Alignment.CenterVertically))
        }
        Text(
            "Fighters keep new pulls away from a boss on the target's ground. A boss stays until someone kills it, so a shorter wait checks more often at the cost of more trips.",
            color = muted,
            style = small,
        )
        if (entries.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.semantics { contentDescription = "Achievement Hunt blacklist" }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Blacklisted", style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                    TextButton(enabled = editable && !busy, onClick = { run(blacklistChange = JsonObject(mapOf("action" to JsonPrimitive("clear")))) }) {
                        Text("Clear all", color = MaterialTheme.colorScheme.error)
                    }
                }
                for (entry in entries) {
                    val label = monsters.find { it.id == entry.monsterId }?.name ?: entry.monsterId
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(6.dp)).padding(8.dp),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.weight(1f).clickable { onInspect(entry.monsterId) }.semantics { contentDescription = "Inspect $label" },
                        ) {
                            SpriteIcon(sprites[entry.monsterId], size = 28.dp)
                            Column(modifier = Modifier.padding(start = 8.dp)) {
                                Text(label, fontWeight = FontWeight.Medium, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                                Text("${entry.reason} · ${java.text.DateFormat.getDateTimeInstance().format(java.util.Date(entry.at))}", color = muted, style = small)
                            }
                        }
                        OutlinedButton(
                            enabled = editable && !busy,
                            onClick = { run(blacklistChange = JsonObject(mapOf("action" to JsonPrimitive("remove"), "monsterId" to JsonPrimitive(entry.monsterId)))) },
                        ) { Text("Clear") }
                    }
                }
            }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        if (choosing) {
            Column(
                verticalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.fillMaxWidth().border(1.dp, Color(0xFF334155), RoundedCornerShape(6.dp)).padding(10.dp)
                    .semantics { contentDescription = "Achievement Hunt monsters" },
            ) {
                Text("Achievement Hunt monsters", style = MaterialTheme.typography.titleSmall)
                Text("Weakest first, by experience per kill. Up to here selects every monster above it. Tap a monster for details.", color = muted, style = small)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(enabled = editable && !busy, onClick = { choose(regular.map { it.id }) }) { Text("All regular", style = small) }
                    OutlinedButton(enabled = editable && !busy, onClick = { choose(emptyList()) }) { Text("None", style = small) }
                }
                Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.semantics { contentDescription = "Regular monsters" }) {
                    regular.forEachIndexed { index, monster -> MonsterRow(monster, index) }
                }
                Text("Special monsters", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
                Text(
                    "Bosses and boss-like monsters, event, cooperative and random-respawn monsters, training dummies, Cave of Many Dreams monsters, and any without a regular spawn. Up to here never selects them.",
                    color = muted,
                    style = small,
                )
                Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.semantics { contentDescription = "Special monsters" }) {
                    for (monster in special) MonsterRow(monster, null)
                }
            }
        }
    }
}
