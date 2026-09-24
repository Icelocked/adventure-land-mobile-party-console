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
import kotlinx.coroutines.launch

/** routine-priorities-dialog.tsx ported as its own screen. The dashboard
 *  supports real pointer-drag reordering with live position animation -
 *  overkill for a touch list where up/down taps are just as fast and far
 *  simpler to get right. Ported the EXACT renumbering algorithm the
 *  dashboard's own arrow-key handler uses (its `move()` function), not a
 *  simplified version, so priorities after a reorder here match what the
 *  dashboard would have produced for the same move. */
@Composable
fun RoutinesScreen(viewModel: PartyViewModel, onBack: () -> Unit) {
    val dynamicState by viewModel.dynamicState.collectAsState()
    val scope = rememberCoroutineScope()

    var draft by remember { mutableStateOf<Map<String, Int>>(emptyMap()) }
    var enabledDraft by remember { mutableStateOf<Map<String, Boolean>>(emptyMap()) }
    var seeded by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(dynamicState.merchantRoutinePriorities) {
        if (!seeded && dynamicState.merchantRoutinePriorities.isNotEmpty()) {
            draft = dynamicState.merchantRoutinePriorities
            enabledDraft = dynamicState.merchantAutomations
            seeded = true
        }
    }

    val sortedKeys = ROUTINE_LABELS.keys.sortedWith(
        compareByDescending<String> { draft[it] ?: 50 }.thenBy { ROUTINE_LABELS[it] ?: it },
    )

    fun move(source: String, target: String, after: Boolean) {
        if (source == target) return
        val keys = sortedKeys.filter { it != source }.toMutableList()
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

    val enabledCount = ROUTINE_LABELS.keys.count { !hasEnableToggle(it) || enabledDraft[it] != false }

    AccountScreenScaffold("Merchant routines · $enabledCount/${ROUTINE_LABELS.size} enabled", onBack) {
        Column(modifier = Modifier.fillMaxSize()) {
            Text(
                "Higher priorities run first. Equal priorities run oldest first. Enabled controls only automatic scheduling.",
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
            )
            LazyColumn(modifier = Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 12.dp)) {
                items(sortedKeys) { key ->
                    val index = sortedKeys.indexOf(key)
                    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                        Row(modifier = Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            if (hasEnableToggle(key)) {
                                Checkbox(
                                    checked = enabledDraft[key] != false,
                                    onCheckedChange = { checked -> enabledDraft = enabledDraft + (key to checked) },
                                )
                            }
                            Text(ROUTINE_LABELS[key] ?: key, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f), maxLines = 1)
                            OutlinedTextField(
                                value = (draft[key] ?: 50).toString(),
                                onValueChange = { new -> new.toIntOrNull()?.let { draft = draft + (key to it.coerceIn(0, 100)) } },
                                singleLine = true,
                                modifier = Modifier.width(64.dp),
                            )
                            IconButton(onClick = { if (index > 0) move(key, sortedKeys[index - 1], false) }, enabled = index > 0) {
                                Icon(Icons.Filled.ArrowUpward, contentDescription = "Move up")
                            }
                            IconButton(onClick = { if (index < sortedKeys.size - 1) move(key, sortedKeys[index + 1], true) }, enabled = index < sortedKeys.size - 1) {
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
                            val priorities = ROUTINE_LABELS.keys.associateWith { draft[it] ?: 50 }
                            val enabled = (AUTOMATIC_ROUTINE_KEYS + setOf("fishing", "mining")).associateWith { enabledDraft[it] != false }
                            when (val result = viewModel.api.saveRoutinePriorities(priorities, enabled)) {
                                is ApiResult.Failure -> error = result.message
                                is ApiResult.Success -> viewModel.refreshDynamicStateNow()
                            }
                            saving = false
                        }
                    },
                    enabled = !saving,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (saving) "Saving..." else "Save routines")
                }
            }
        }
    }
}
