package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import com.partyconsole.companion.domain.conflictingItems
import com.partyconsole.companion.domain.describeRule
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** With shared merchant rules, members' rules that disagree are paused until
 *  one owner's value is chosen; rules that would both act on the same item
 *  are flagged too. Shown on the merchant only, and only when there are any. */
@Composable
fun RuleConflictsSection(viewModel: PartyViewModel) {
    val state by viewModel.dynamicState.collectAsState()
    val scope = rememberCoroutineScope()
    var error by remember { mutableStateOf<String?>(null) }
    val conflicts = state.merchantRules?.conflicts.orEmpty().mapNotNull { it as? JsonObject }
    val incompatible = conflictingItems(state)
    if (conflicts.isEmpty() && incompatible.isEmpty()) return
    fun text(obj: JsonObject, key: String) = (obj[key] as? JsonPrimitive)?.content.orEmpty()

    SectionCard(title = "Automatic rules awaiting a choice") {
        for (conflict in conflicts) {
            Column(modifier = Modifier.padding(top = 8.dp)) {
                Text("${text(conflict, "family")} · ${text(conflict, "key")} · Paused", style = MaterialTheme.typography.bodySmall)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (choice in (conflict["choices"] as? JsonArray).orEmpty().mapNotNull { it as? JsonObject }) {
                        val owner = text(choice, "owner")
                        OutlinedButton(onClick = {
                            scope.launch {
                                error = null
                                val result = viewModel.api.post("merchant/rule-conflict", JsonObject(mapOf("id" to JsonPrimitive(text(conflict, "id")), "owner" to JsonPrimitive(owner))))
                                if (result is ApiResult.Failure) error = result.message
                            }
                        }) { Text("Use $owner: ${describeRule(choice["value"])}") }
                    }
                }
            }
        }
        for ((item, actions) in incompatible) {
            Text(
                "${item.name} +${item.level ?: 0} · ${actions.joinToString(" / ")} · Paused. Remove the unwanted rule from the sections above.",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    }
}
