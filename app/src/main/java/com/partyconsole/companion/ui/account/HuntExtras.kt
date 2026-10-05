package com.partyconsole.companion.ui.account

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.domain.Area
import com.partyconsole.companion.domain.CatalogMonster
import com.partyconsole.companion.domain.PassiveSettings
import com.partyconsole.companion.domain.defaultPassiveRule
import com.partyconsole.companion.domain.huntSpawnKey
import com.partyconsole.companion.domain.zones
import com.partyconsole.companion.model.MonsterChoice
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.network.CommandResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import com.partyconsole.companion.ui.map.FarmingAreaPreview
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// Hunt blacklist picker, spawn preferences and passive hunting settings.

private fun nameOf(monster: MonsterChoice) = monster.name?.ifEmpty { null } ?: monster.id
private val Bordered = Modifier.border(1.dp, androidx.compose.ui.graphics.Color(0x33FFFFFF), RoundedCornerShape(6.dp))

/** Any monster, searchable, added to this character's Hunt blacklist ("Added"
 *  once it is). The "Add" button that opens it sits in the screen's Hunt
 *  blacklist header. */
@Composable
fun HuntBlacklistPicker(
    catalog: List<MonsterChoice>,
    blacklist: Map<String, Any?>,
    disabled: Boolean,
    onAdd: suspend (String) -> ApiResult<CommandResult>,
    onInspect: (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var search by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    val rows = catalog
        .filter { it.id != "all" && "${nameOf(it)} ${it.id}".lowercase().contains(search.trim().lowercase()) }
        .sortedWith(compareBy<MonsterChoice> { nameOf(it).lowercase() }.thenBy { it.id })
    Column(modifier = Modifier.fillMaxWidth().padding(top = 8.dp).then(Bordered).padding(8.dp).semantics { contentDescription = "Add to Hunt blacklist" }) {
        Text("Add to Hunt blacklist", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
        Text("Choose any monster to skip its Hunt quests. Click a monster for details.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedTextField(
            value = search,
            onValueChange = { search = it },
            placeholder = { Text("Search monsters…") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(top = 6.dp).semantics { contentDescription = "Search blacklist monsters" },
        )
        Column(modifier = Modifier.heightIn(max = 288.dp).verticalScroll(rememberScrollState()).padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            for (monster in rows) {
                val added = blacklist[monster.id] != null
                Row(modifier = Modifier.fillMaxWidth().then(Bordered).padding(6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        modifier = Modifier.weight(1f).clickable { onInspect(monster.id) }.semantics { contentDescription = "Inspect ${nameOf(monster)}" },
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        if (monster.sprite != null) SpriteIcon(monster.sprite, size = 32.dp)
                        Column {
                            Text(nameOf(monster), style = MaterialTheme.typography.bodySmall)
                            Text(monster.id, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    OutlinedButton(
                        enabled = !disabled && !busy && !added,
                        modifier = Modifier.semantics { contentDescription = if (added) "${nameOf(monster)} is blacklisted" else "Add ${nameOf(monster)} to blacklist" },
                        onClick = {
                            scope.launch {
                                busy = true
                                error = ""
                                val result = onAdd(monster.id)
                                busy = false
                                if (result is ApiResult.Failure) error = result.message.ifEmpty { "Could not add monster to blacklist" }
                            }
                        },
                    ) { Text(if (added) "Added" else "Add to blacklist") }
                }
            }
            if (rows.isEmpty()) Text("No matching monsters.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (error.isNotEmpty()) Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp))
    }
}

/** For each monster with more than one spawn: Automatic (default) or a
 *  specific spawn, saved as preferredSpawns. */
@Composable
fun HuntSpawnSettings(
    viewModel: PartyViewModel,
    catalog: List<MonsterChoice>,
    preferred: Map<String, JsonElement>,
    disabled: Boolean,
    onSave: suspend (Map<String, JsonElement>) -> ApiResult<CommandResult>,
) {
    val scope = rememberCoroutineScope()
    var open by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var saved by remember { mutableStateOf("") }
    // The expanded monster's (or focused spawn's) area on the map.
    var preview by remember { mutableStateOf<Area?>(null) }
    var expanded by remember { mutableStateOf<String?>(null) }
    val monsters = remember(catalog, open) {
        if (!open) emptyList() else catalog
            .map { it to zones(listOf(CatalogMonster(it.id, it.locations)), listOf(it.id)) }
            .filter { (_, spawns) -> spawns.size > 1 }
            .sortedBy { (monster, _) -> nameOf(monster).lowercase() }
    }
    fun select(monster: String, key: String) {
        scope.launch {
            busy = true
            error = null
            saved = ""
            val result = onSave(mapOf("preferredSpawns" to JsonObject(mapOf(monster to JsonPrimitive(key)))))
            busy = false
            if (result is ApiResult.Failure) error = result.message.ifEmpty { "Could not save preferred spawn" }
            else saved = "Preference saved for future Monster Hunts."
        }
    }
    Column(modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Preferred hunt spawns" }, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(enabled = !disabled, onClick = { open = !open }) { Text("Set preferred hunt spawns") }
        if (!open) return@Column
        Column(modifier = Modifier.fillMaxWidth().then(Bordered).padding(8.dp)) {
            Text("Preferred hunt spawns", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            Text(
                "Choose where to hunt each monster. Changes apply to future Monster Hunt destinations only. Automatic prefers the nearest spawn on your leader’s map. Unavailable spawns use automatic selection.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 8.dp),
            )
            if (monsters.isEmpty()) Text("No monsters with multiple available spawns.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            for ((monster, spawns) in monsters) {
                val preference = (preferred[monster.id] as? JsonPrimitive)?.content
                val selected = if (spawns.any { huntSpawnKey(it) == preference }) preference.orEmpty() else ""
                val isOpen = expanded == monster.id
                Column(modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp).then(Bordered)) {
                    Row(
                        modifier = Modifier.fillMaxWidth().clickable {
                            expanded = if (isOpen) null else monster.id
                            if (!isOpen) preview = spawns.find { huntSpawnKey(it) == selected } ?: spawns.first()
                        }.padding(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        if (monster.sprite != null) SpriteIcon(monster.sprite, size = 24.dp)
                        Text(nameOf(monster), style = MaterialTheme.typography.bodySmall)
                        Text("· ${spawns.size} spawns${if (selected.isNotEmpty()) " · Custom" else " · Default"}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (isOpen) Column(modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp).semantics { contentDescription = "Preferred spawn for ${nameOf(monster)}" }) {
                        Row(
                            modifier = Modifier.fillMaxWidth().selectable(selected = selected.isEmpty(), enabled = !disabled && !busy) { select(monster.id, "") },
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(selected = selected.isEmpty(), onClick = null, enabled = !disabled && !busy)
                            Text("Automatic", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(start = 6.dp))
                            Text(" (default)", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        for (spawn in spawns) {
                            val key = huntSpawnKey(spawn)
                            Row(
                                modifier = Modifier.fillMaxWidth().selectable(selected = selected == key, enabled = !disabled && !busy) { preview = spawn; select(monster.id, key) },
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                RadioButton(selected = selected == key, onClick = null, enabled = !disabled && !busy)
                                Text(spawn.mapName ?: spawn.map, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(start = 6.dp))
                                Text(" (${Math.round(spawn.x)}, ${Math.round(spawn.y)})", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
            Column(modifier = Modifier.fillMaxWidth().padding(top = 8.dp).semantics { contentDescription = "Preferred hunt spawn map preview" }) {
                val area = preview
                if (area != null) FarmingAreaPreview(viewModel, area.copy(id = area.id ?: huntSpawnKey(area)), 400)
                else Text("Expand a monster to preview its spawn areas.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(20.dp))
            }
            if (busy) Text("Saving preference…", style = MaterialTheme.typography.bodySmall)
            if (saved.isNotEmpty()) Text(saved, style = MaterialTheme.typography.bodySmall)
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

/** Passive hunting: the field-generator toggle and the per-monster table
 *  (attack on sight, keep moving, max level -1 = any, priority 0–1000). */
@Composable
fun PassiveHuntingMenu(
    settings: PassiveSettings,
    catalog: List<MonsterChoice>,
    disabled: Boolean,
    onSave: suspend (JsonObject) -> ApiResult<CommandResult>,
    onInspect: (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var open by remember { mutableStateOf(false) }
    var about by remember { mutableStateOf(false) }
    var search by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val levelDrafts = remember { mutableStateMapOf<String, String>() }
    val drafts = remember { mutableStateMapOf<String, String>() }
    fun rule(id: String) = settings.rules[id] ?: defaultPassiveRule(id)
    fun save(patch: JsonObject) {
        if (busy) return
        scope.launch {
            busy = true
            error = null
            val result = onSave(patch)
            busy = false
            if (result is ApiResult.Failure) error = result.message.ifEmpty { "Could not save passive hunting settings" }
        }
    }
    fun rulePatch(id: String, key: String, value: JsonElement) = JsonObject(mapOf("rules" to JsonObject(mapOf(id to JsonObject(mapOf(key to value))))))
    fun commitLevel(id: String) {
        val draft = levelDrafts[id] ?: return
        val value = draft.trim().toIntOrNull()
        if (draft.isBlank() || value == null || (value != -1 && value <= 0)) { error = "Max level must be -1 (any level) or a positive whole number."; return }
        levelDrafts.remove(id)
        if (value != (rule(id).maxLevel ?: -1)) save(rulePatch(id, "maxLevel", JsonPrimitive(value)))
    }
    fun commit(id: String) {
        val draft = drafts[id] ?: return
        val value = draft.trim().toIntOrNull()
        if (draft.isBlank() || value == null || value < 0 || value > 1000) { error = "Priority must be a whole number from 0 to 1000."; return }
        drafts.remove(id)
        if (value != rule(id).priority) save(rulePatch(id, "priority", JsonPrimitive(value)))
    }
    val locked = disabled || busy
    Column(modifier = Modifier.fillMaxWidth().then(Bordered).padding(12.dp).semantics { contentDescription = "Passive hunting" }, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Monsters that are automatically attacked when spotted on the map", style = MaterialTheme.typography.bodySmall)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = settings.useFieldGenerators, enabled = !locked, onCheckedChange = { save(JsonObject(mapOf("useFieldGenerators" to JsonPrimitive(it)))) })
            Text("Use field generators when passively hunting fairy", style = MaterialTheme.typography.bodySmall)
        }
        OutlinedButton(onClick = { open = !open }) { Text("Open passive hunting menu") }
        if (open) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Passive hunting", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                IconButton(onClick = { about = !about }, modifier = Modifier.semantics { contentDescription = "About passive hunting" }) { Icon(Icons.Outlined.Info, contentDescription = null) }
            }
            if (about) Column(modifier = Modifier.fillMaxWidth().then(Bordered).padding(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("\"Keep moving to destination\" means characters will not stop to engage the sighted monster until death. They will only attack while in range, and will not chase, reposition, or start kiting behavior.", style = MaterialTheme.typography.labelSmall)
                Text("This setting also applies when the monster attacks back. Emergency escape and recovery still take precedence over this setting.", style = MaterialTheme.typography.labelSmall)
                Text("Priority affects both active and passive hunting targets - it is recommended to set a higher priority for passive targets.", style = MaterialTheme.typography.labelSmall)
            }
            Text("Select monsters to attack on sight. Settings apply to the party. Max level -1 allows any level; a positive number limits intentional passive attacks.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedTextField(
                value = search,
                onValueChange = { search = it },
                placeholder = { Text("Search monsters…") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Filter passive hunting monsters" },
            )
            val rows = catalog
                .filter { it.id != "all" && it.id != "fieldgen0" && "${nameOf(it)} ${it.id}".lowercase().contains(search.trim().lowercase()) }
                .sortedWith(compareByDescending<MonsterChoice> { if (rule(it.id).enabled) 1 else 0 }.thenBy { nameOf(it).lowercase() }.thenBy { it.id })
            Column(modifier = Modifier.heightIn(max = 480.dp).verticalScroll(rememberScrollState()).horizontalScroll(rememberScrollState())) {
                Row(modifier = Modifier.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("", modifier = Modifier.width(48.dp))
                    Text("Monster", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, modifier = Modifier.width(150.dp))
                    Text("Keep moving to destination", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, modifier = Modifier.width(100.dp))
                    Text("Max level", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, modifier = Modifier.width(84.dp))
                    Text("Priority", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, modifier = Modifier.width(84.dp))
                }
                for (monster in rows) {
                    val r = rule(monster.id)
                    val name = nameOf(monster)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(
                            checked = r.enabled,
                            enabled = !locked,
                            onCheckedChange = { save(rulePatch(monster.id, "enabled", JsonPrimitive(it))) },
                            modifier = Modifier.width(48.dp).semantics { contentDescription = "Passively hunt $name" },
                        )
                        Row(
                            modifier = Modifier.width(150.dp).clickable { onInspect(monster.id) }.semantics { contentDescription = "Inspect $name" },
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            if (monster.sprite != null) SpriteIcon(monster.sprite, size = 24.dp)
                            Text(name, style = MaterialTheme.typography.bodySmall)
                        }
                        Checkbox(
                            checked = r.keepMoving,
                            enabled = !locked,
                            onCheckedChange = { save(rulePatch(monster.id, "keepMoving", JsonPrimitive(it))) },
                            modifier = Modifier.width(100.dp).semantics { contentDescription = "Keep moving to destination for $name" },
                        )
                        OutlinedTextField(
                            value = levelDrafts[monster.id] ?: (r.maxLevel ?: -1).toString(),
                            enabled = !locked,
                            onValueChange = { levelDrafts[monster.id] = it },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            textStyle = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.width(80.dp).padding(end = 4.dp).semantics { contentDescription = "$name passive max level" }
                                .onFocusChanged { if (!it.isFocused) commitLevel(monster.id) },
                        )
                        OutlinedTextField(
                            value = drafts[monster.id] ?: r.priority.toString(),
                            enabled = !locked,
                            onValueChange = { drafts[monster.id] = it },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            textStyle = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.width(80.dp).semantics { contentDescription = "$name passive priority" }
                                .onFocusChanged { if (!it.isFocused) commit(monster.id) },
                        )
                    }
                }
                if (rows.isEmpty()) Text("No matching monsters.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(8.dp))
            }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    }
}
