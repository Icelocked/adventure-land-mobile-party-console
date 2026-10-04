package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.PartyStateDynamic
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import kotlinx.coroutines.launch

/** Ports party-workspace.tsx's leader RadioGroup + per-card follow
 *  Checkbox into two independent tap targets on POST /party-api/formation.
 *  "Leader" sends only {leader} (a radio - tapping the current leader does
 *  nothing, as on the dashboard); "Follow" sends only {character, follow}. */
@Composable
fun LeaderFollowerSection(characterName: String, dynamicState: PartyStateDynamic, viewModel: PartyViewModel) {
    val scope = rememberCoroutineScope()
    val loaded by viewModel.stateLoaded.collectAsState()
    val isLeader = dynamicState.leader == characterName
    val isFollowing = dynamicState.followers[characterName] == true
    var error by remember(characterName) { mutableStateOf<String?>(null) }

    SectionCard(title = "Formation") {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            FilterChip(
                selected = isLeader,
                enabled = loaded,
                onClick = {
                    if (!isLeader) {
                        scope.launch {
                            error = null
                            val result = viewModel.api.setLeader(characterName)
                            if (result is ApiResult.Failure) error = result.message.ifBlank { "Formation update failed" }
                            viewModel.refreshDynamicStateNow()
                        }
                    }
                },
                label = { Text("Leader") },
            )
            FilterChip(
                selected = isFollowing,
                enabled = loaded,
                onClick = {
                    scope.launch {
                        error = null
                        val result = viewModel.api.setFollow(characterName, !isFollowing)
                        if (result is ApiResult.Failure) error = result.message.ifBlank { "Formation update failed" }
                        viewModel.refreshDynamicStateNow()
                    }
                },
                label = { Text("Follow") },
            )
        }
        ConfigLoadingNote(loaded)
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp)) }
        if (!isLeader && dynamicState.leader != null) {
            Text(
                "Following ${dynamicState.leader}",
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(top = 6.dp),
            )
        }
    }
}
