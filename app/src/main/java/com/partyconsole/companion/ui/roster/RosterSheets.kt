package com.partyconsole.companion.ui.roster

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.components.CharacterPortrait
import kotlinx.coroutines.launch

/** roster-picker.tsx + party-roster-picker.tsx: choose who to load into an
 *  empty slot (headless or Steam), or - for slot 0 - switch the Steam
 *  character. Offline, inactive roster members only, plus Create character. */
@Composable
fun RosterPickerSheet(viewModel: PartyViewModel, slot: Int, onClose: () -> Unit, onCreate: () -> Unit) {
    val state by viewModel.dynamicState.collectAsState()
    val roster by viewModel.roster.collectAsState()
    val scope = rememberCoroutineScope()
    var hosting by remember { mutableStateOf("headless") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val active = state.activeSlots.mapNotNull { it.character }.toSet()
    val choices = roster.values.filter { slot == 0 || (it.name !in active && !it.online) }

    fun choose(name: String) {
        scope.launch {
            busy = true
            error = null
            // use-party-console.tsx: slot 0 switches the Steam primary; otherwise
            // load headless (slot spawn) or into Steam.
            val result = when {
                slot == 0 -> viewModel.api.steamAction(name, "primary")
                hosting == "steam" -> viewModel.api.steamAction(name, "login")
                else -> viewModel.api.spawnSlot(slot, name)
            }
            busy = false
            if (result is ApiResult.Failure) error = result.message else onClose()
        }
    }

    ModalBottomSheet(onDismissRequest = onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp)) {
            Text(if (slot == 0) "Switch Steam character" else "Choose a roster member", style = MaterialTheme.typography.titleMedium)
            Text(
                if (slot == 0) "The Steam bridge changes the primary view and restores the other Steam characters afterward."
                else "Choose an offline character, or create a new character.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (slot != 0) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
                    for ((value, label) in listOf("headless" to "Headless", "steam" to "Steam")) {
                        FilterChip(selected = hosting == value, onClick = { hosting = value }, label = { Text(label) })
                    }
                }
                Text(
                    (if (hosting == "headless") "Runs on the computer hosting Party Console, without a game window." else "Runs in your connected Adventure Land Steam client.") +
                        " Characters already online elsewhere are hidden; stop them there before loading them here.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Column(modifier = Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                for (member in choices) {
                    Row(
                        modifier = Modifier.fillMaxWidth()
                            .border(BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), RoundedCornerShape(6.dp))
                            .clickable(enabled = !busy) { choose(member.name) }
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column {
                            Text(member.name, style = MaterialTheme.typography.bodyMedium)
                            Text("LV ${member.level} ${member.ctype.uppercase()}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Icon(Icons.Filled.Add, contentDescription = "Load ${member.name}", tint = MaterialTheme.colorScheme.primary)
                    }
                }
                if (choices.isEmpty()) Text("No available roster members.", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(vertical = 24.dp))
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            OutlinedButton(onClick = onCreate, modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("Create character")
            }
        }
    }
}

private val NAME = Regex("^[A-Za-z0-9_]{4,12}$")

/** create-character.tsx + use-party-console.tsx createCharacter: name
 *  (4-12 letters, numbers, underscores), class, one of the class's
 *  official starting looks, then create and spawn. */
@Composable
fun CreateCharacterSheet(viewModel: PartyViewModel, onClose: () -> Unit) {
    val state by viewModel.dynamicState.collectAsState()
    val scope = rememberCoroutineScope()
    val classes = state.classChoices
    var name by remember { mutableStateOf("") }
    var ctype by remember { mutableStateOf("ranger") }
    var look by remember { mutableIntStateOf(0) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var classMenu by remember { mutableStateOf(false) }
    val appearances = state.appearanceChoices[ctype].orEmpty()

    ModalBottomSheet(onDismissRequest = { if (!busy) onClose() }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp)) {
            Text("Create character", style = MaterialTheme.typography.titleMedium)
            Text(
                "Choose the class and one of its official starting appearances. The companion will never spend Shells.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedTextField(
                value = name,
                onValueChange = { name = it.filter { c -> c.isLetterOrDigit() || c == '_' }.take(12) },
                label = { Text("Name") },
                placeholder = { Text("NewRanger") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            )
            ExposedDropdownMenuBox(expanded = classMenu, onExpandedChange = { classMenu = it }, modifier = Modifier.padding(top = 8.dp)) {
                OutlinedTextField(
                    value = ctype.replaceFirstChar { it.uppercase() },
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Class") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = classMenu) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable),
                )
                ExposedDropdownMenu(expanded = classMenu, onDismissRequest = { classMenu = false }) {
                    for (value in classes) {
                        DropdownMenuItem(text = { Text(value.replaceFirstChar { it.uppercase() }) }, onClick = {
                            ctype = value
                            look = 0
                            classMenu = false
                        })
                    }
                }
            }
            Text("Appearance", style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 12.dp, bottom = 6.dp))
            for (row in appearances.chunked(4)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 8.dp)) {
                    for (choice in row) {
                        val selected = look == choice.index
                        Box(
                            modifier = Modifier.weight(1f).height(96.dp)
                                .border(BorderStroke(if (selected) 2.dp else 1.dp, if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant), RoundedCornerShape(6.dp))
                                .clickable { look = choice.index },
                            contentAlignment = Alignment.Center,
                        ) {
                            if (choice.html != null) CharacterPortrait(choice.html, null, null, modifier = Modifier.fillMaxWidth().height(92.dp))
                            else Text("Loading preview…", style = MaterialTheme.typography.labelSmall)
                        }
                    }
                    repeat(4 - row.size) { Box(modifier = Modifier.weight(1f)) }
                }
            }
            if (appearances.isEmpty()) Text("Waiting for an active character to provide current appearance data…", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.tertiary)
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            Row(modifier = Modifier.fillMaxWidth().padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)) {
                OutlinedButton(enabled = !busy, onClick = onClose) { Text("Cancel") }
                Button(enabled = !busy && name.length >= 4 && appearances.isNotEmpty(), onClick = {
                    error = null
                    if (!NAME.matches(name)) {
                        error = "Name must be 4-12 letters, numbers, or underscores"
                        return@Button
                    }
                    scope.launch {
                        busy = true
                        val result = viewModel.api.createCharacter(name, ctype, look)
                        busy = false
                        if (result is ApiResult.Failure) error = result.message else onClose()
                    }
                }) { Text(if (busy) "Creating…" else "Create and spawn") }
            }
        }
    }
}
