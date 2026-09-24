package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.PartyStateDynamic
import com.partyconsole.companion.ui.PartyViewModel
import kotlinx.coroutines.launch

/** Ports party-workspace.tsx's leader RadioGroup + per-card follow
 *  Checkbox into two independent tap targets - both call the same
 *  POST /party-api/formation the web version uses (see PartyApiClient.
 *  setFormation). Tapping "Leader" while already leader clears it
 *  (formation's leader field is name-or-null); tapping "Follow" just
 *  flips this character's own follow flag. */
@Composable
fun LeaderFollowerSection(characterName: String, dynamicState: PartyStateDynamic, viewModel: PartyViewModel) {
    val scope = rememberCoroutineScope()
    val isLeader = dynamicState.leader == characterName
    val isFollowing = dynamicState.followers[characterName] == true

    SectionCard(title = "Formation") {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            FilterChip(
                selected = isLeader,
                onClick = {
                    scope.launch {
                        viewModel.api.setFormation(
                            leader = if (isLeader) null else characterName,
                            character = characterName,
                            follow = isFollowing,
                        )
                        viewModel.refreshDynamicStateNow()
                    }
                },
                label = { Text("Leader") },
            )
            FilterChip(
                selected = isFollowing,
                onClick = {
                    scope.launch {
                        viewModel.api.setFormation(
                            leader = dynamicState.leader,
                            character = characterName,
                            follow = !isFollowing,
                        )
                        viewModel.refreshDynamicStateNow()
                    }
                },
                label = { Text("Follow") },
            )
        }
        if (!isLeader && dynamicState.leader != null) {
            Text(
                "Following ${dynamicState.leader}",
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(top = 6.dp),
            )
        }
    }
}
