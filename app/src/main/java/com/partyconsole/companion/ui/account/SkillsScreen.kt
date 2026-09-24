package com.partyconsole.companion.ui.account

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
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.SkillClass
import com.partyconsole.companion.model.SkillEntry
import com.partyconsole.companion.ui.PartyViewModel
import kotlinx.coroutines.launch

/** Skill reference by class (skills-dialog.tsx) - tap a class to expand
 *  its skills, tap a skill to expand its real definition (range, mp cost,
 *  cooldown, explanation) instead of just a name list. */
@Composable
fun SkillsScreen(viewModel: PartyViewModel, onBack: () -> Unit) {
    val state by viewModel.dynamicState.collectAsState()
    var expandedClass by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    AccountScreenScaffold("Skills", onBack, onRefresh = { scope.launch { viewModel.refreshDynamicStateNow() } }) {
        if (state.skillCatalog.isEmpty()) {
            EmptyState("No skill data yet.")
        } else {
            LazyColumn(contentPadding = PaddingValues(12.dp)) {
                items(state.skillCatalog, key = { it.id }) { classSkills ->
                    ClassSkillsCard(
                        classSkills,
                        expanded = expandedClass == classSkills.id,
                        onToggle = { expandedClass = if (expandedClass == classSkills.id) null else classSkills.id },
                    )
                }
            }
        }
    }
}

@Composable
private fun ClassSkillsCard(classSkills: SkillClass, expanded: Boolean, onToggle: () -> Unit) {
    Card(onClick = onToggle, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(classSkills.name, style = MaterialTheme.typography.titleSmall)
            if (!expanded) {
                Text(
                    classSkills.skills.joinToString(", ") { it.name },
                    style = MaterialTheme.typography.bodySmall,
                )
            } else {
                for (skill in classSkills.skills) {
                    SkillRow(skill)
                }
            }
        }
    }
}

@Composable
private fun SkillRow(skill: SkillEntry) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(skill.name, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(bottom = 2.dp))
        skill.definition?.explanation?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        val def = skill.definition
        if (def != null && (def.range != null || def.mp != null || def.cooldown != null)) {
            Text(
                buildString {
                    def.range?.let { append("Range $it ") }
                    def.mp?.let { append("· MP $it ") }
                    def.cooldown?.let { append("· CD ${it / 1000.0}s") }
                },
                style = MaterialTheme.typography.labelSmall,
            )
        }
    }
}
