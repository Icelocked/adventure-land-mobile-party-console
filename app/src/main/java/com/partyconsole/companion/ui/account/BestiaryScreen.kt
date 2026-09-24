package com.partyconsole.companion.ui.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.BestiaryDrop
import com.partyconsole.companion.model.BestiaryMonster
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import kotlinx.coroutines.launch

/** Monster reference list (bestiary-dialog.tsx) - tap a monster to expand
 *  its drop table (item, drop rate, quantity), the concrete data this
 *  screen exists for beyond just HP/attack/XP. */
@Composable
fun BestiaryScreen(viewModel: PartyViewModel, onBack: () -> Unit) {
    val state by viewModel.dynamicState.collectAsState()
    var expandedId by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    AccountScreenScaffold("Bestiary", onBack, onRefresh = { scope.launch { viewModel.refreshDynamicStateNow() } }) {
        if (state.bestiaryCatalog.isEmpty()) {
            EmptyState("No bestiary data yet.")
        } else {
            LazyColumn(contentPadding = PaddingValues(12.dp)) {
                items(state.bestiaryCatalog, key = { it.id }) { monster ->
                    MonsterRow(
                        monster,
                        expanded = expandedId == monster.id,
                        onToggle = { expandedId = if (expandedId == monster.id) null else monster.id },
                    )
                }
            }
        }
    }
}

@Composable
private fun MonsterRow(monster: BestiaryMonster, expanded: Boolean, onToggle: () -> Unit) {
    Card(onClick = onToggle, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    SpriteIcon(monster.sprite, size = 28.dp)
                    Text(monster.name, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(start = 6.dp))
                }
                Text(
                    "HP ${monster.hp} · ATK ${monster.attack} · XP ${monster.xp}",
                    style = MaterialTheme.typography.labelSmall,
                )
            }
            if (expanded) {
                if (monster.drops.isEmpty()) {
                    Text("No known drops.", style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 6.dp))
                } else {
                    Text("Drops", style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 8.dp, bottom = 4.dp))
                    for (drop in monster.drops.sortedByDescending { it.rate }) {
                        DropRow(drop)
                    }
                }
            }
        }
    }
}

@Composable
private fun DropRow(drop: BestiaryDrop) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SpriteIcon(drop.sprite, size = 28.dp)
            Text(
                drop.name + if (drop.quantity > 1) " x${drop.quantity}" else "",
                modifier = Modifier.padding(start = 6.dp),
                style = MaterialTheme.typography.bodySmall,
            )
        }
        Text("${"%.4f".format(drop.rate * 100)}%", style = MaterialTheme.typography.labelSmall)
    }
}
