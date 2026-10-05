package com.partyconsole.companion.ui.account

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
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
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.characterdetail.sections.ConfigLoadingNote
import kotlinx.coroutines.launch

/** Routine priorities. Reordering uses up/down taps instead of drag, but the
 *  same renumbering as the dashboard's arrow-key `move()`, so priorities
 *  after a reorder match what the dashboard would produce. */
@Composable
fun RoutinesScreen(viewModel: PartyViewModel, onBack: () -> Unit) {
    val dynamicState by viewModel.dynamicState.collectAsState()
    val loaded by viewModel.stateLoaded.collectAsState()
    val scope = rememberCoroutineScope()

    // Fishing/mining aren't automations; their switches mirror the standing
    // gathering modes.
    val priorities = dynamicState.merchantRoutinePriorities
    val enabled = dynamicState.merchantAutomations +
        mapOf("fishing" to dynamicState.gatheringModes.contains("fishing"), "mining" to dynamicState.gatheringModes.contains("mining"))
    var draft by remember { mutableStateOf(priorities) }
    var enabledDraft by remember { mutableStateOf(enabled) }
    var seeded by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    // Seed the draft from live state once, after the server's settings have
    // arrived - after that, only local edits and Save change it.
    LaunchedEffect(loaded) {
        if (!seeded && loaded) {
            draft = priorities
            enabledDraft = enabled
            seeded = true
        }
    }

    val sortedKeys = ROUTINE_LABELS.keys.sortedWith(
        compareByDescending<String> { draft[it] ?: 50 }.thenBy { ROUTINE_LABELS[it] ?: it },
    )
    // Deliveries/withdrawals are switched on in Merchant settings; while off
    // their rows are locked.
    fun disabledRoutine(key: String) = key in setOf("deliveries", "withdrawals") && enabled[key] == false
    val movableKeys = sortedKeys.filter { !disabledRoutine(it) }

    fun move(source: String, target: String, after: Boolean) {
        if (source == target || disabledRoutine(source) || disabledRoutine(target)) return
        val keys = movableKeys.filter { it != source }.toMutableList()
        val index = keys.indexOf(target) + (if (after) 1 else 0)
        keys.add(index, source)
        val next = draft.toMutableMap()
        next[source] = if (index != 0) (next[keys[index - 1]] ?: 50) - 1 else minOf(100, (next[keys[1]] ?: 50) + 1)
        for (i in 1 until keys.size) {
            next[keys[i]] = minOf(next[keys[i]] ?: 50, (next[keys[i - 1]] ?: 50) - 1)
        }
        if (keys.any { (next[it] ?: 0) < 0 }) keys.forEachIndexed { i, key -> next[key] = 100 - i }
        draft = next
    }

    val enabledCount = ROUTINE_LABELS.keys.count { !disabledRoutine(it) && (!hasEnableToggle(it) || enabledDraft[it] != false) }

    AccountScreenScaffold("Merchant routines · $enabledCount/${ROUTINE_LABELS.size} enabled", onBack) {
        Column(modifier = Modifier.fillMaxSize()) {
            Text(
                "Higher priorities run first. Equal priorities run oldest first. Enabled controls only automatic scheduling.",
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
            )
            LazyColumn(modifier = Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 12.dp)) {
                items(sortedKeys) { key ->
                    val locked = disabledRoutine(key)
                    val index = movableKeys.indexOf(key)
                    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                        Row(modifier = Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            if (hasEnableToggle(key)) {
                                Checkbox(
                                    checked = enabledDraft[key] != false,
                                    enabled = seeded,
                                    onCheckedChange = { checked -> enabledDraft = enabledDraft + (key to checked) },
                                )
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text(ROUTINE_LABELS[key] ?: key, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
                                if (locked) Text("Enable in Merchant settings", style = MaterialTheme.typography.labelSmall)
                            }
                            OutlinedTextField(
                                value = (if (locked) priorities[key] ?: 90 else draft[key] ?: priorities[key] ?: 50).toString(),
                                enabled = seeded && !locked,
                                onValueChange = { new ->
                                    val value = (new.filter { it.isDigit() }.toIntOrNull() ?: 0).coerceIn(0, 100)
                                    draft = draft + (key to value)
                                },
                                singleLine = true,
                                modifier = Modifier.width(64.dp),
                            )
                            IconButton(onClick = { move(key, movableKeys[index - 1], false) }, enabled = seeded && !locked && index > 0) {
                                Icon(Icons.Filled.ArrowUpward, contentDescription = "Move up")
                            }
                            IconButton(onClick = { move(key, movableKeys[index + 1], true) }, enabled = seeded && !locked && index >= 0 && index < movableKeys.size - 1) {
                                Icon(Icons.Filled.ArrowDownward, contentDescription = "Move down")
                            }
                        }
                    }
                }
            }
            Column(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(bottom = 6.dp)) }
                Button(
                    onClick = {
                        scope.launch {
                            saving = true
                            error = null
                            // Save the seeded server maps with the user's edits, never
                            // synthesised values.
                            val nextPriorities = draft.toMutableMap()
                            if (disabledRoutine("deliveries")) nextPriorities.remove("deliveries")
                            if (disabledRoutine("withdrawals")) nextPriorities.remove("withdrawals")
                            // Those two toggles belong to Merchant settings.
                            val nextEnabled = enabledDraft - setOf("deliveries", "withdrawals")
                            when (val result = viewModel.api.saveRoutinePriorities(nextPriorities, nextEnabled)) {
                                is ApiResult.Failure -> error = result.message
                                is ApiResult.Success -> {
                                    // A successful save closes the screen.
                                    viewModel.refreshDynamicStateNow()
                                    onBack()
                                }
                            }
                            saving = false
                        }
                    },
                    enabled = seeded && !saving,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (saving) "Saving..." else "Save routines")
                }
                OutlinedButton(onClick = onBack, enabled = !saving, modifier = Modifier.fillMaxWidth().padding(top = 6.dp)) { Text("Cancel") }
                ConfigLoadingNote(loaded)
            }
        }
    }
}
