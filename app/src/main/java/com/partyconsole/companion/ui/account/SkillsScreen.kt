package com.partyconsole.companion.ui.account

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.domain.displayValue
import com.partyconsole.companion.model.SkillEntry
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.components.DefinitionGrid
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

private fun JsonElement?.truthy(): Boolean = when (this) {
    null, is JsonNull -> false
    is JsonPrimitive -> if (isString) content.isNotEmpty() else content != "false" && content.toDoubleOrNull() != 0.0
    else -> true
}

private fun jsNumber(value: Double) = if (value == Math.floor(value) && value.isFinite()) value.toLong().toString() else value.toString()

/** skill-range-label.tsx, verbatim. */
fun skillRangeLabel(skill: SkillEntry): String {
    val definition = skill.definition.orEmpty()
    if (definition["global"].truthy()) return "Global"
    val range = (definition["range"] as? JsonPrimitive)?.takeIf { !it.isString }?.content?.toDoubleOrNull()?.takeIf { it.isFinite() }
    val usesCharacterRange = definition["use_range"].truthy() || definition["target"].truthy()
    if (range == null && !usesCharacterRange) return "Not specified"
    val multiplier = (definition["range_multiplier"] as? JsonPrimitive)?.takeIf { !it.isString }?.content?.toDoubleOrNull() ?: 1.0
    val bonus = (definition["range_bonus"] as? JsonPrimitive)?.takeIf { !it.isString }?.content?.toDoubleOrNull() ?: 0.0
    var label = if (range != null) jsNumber(range * multiplier + bonus)
    else (if (multiplier != 1.0) "${jsNumber(multiplier)} × " else "") + "attack range" + if (bonus != 0.0) " ${if (bonus > 0) "+" else "−"} ${jsNumber(kotlin.math.abs(bonus))}" else ""
    if (skill.id == "throw") label += " + character level"
    return label
}

/** skills-dialog.tsx as a screen (the PWA's SkillsScreen.tsx): search across
 *  class and skill, a sprite grid per class, and the selected skill's full
 *  definition in a sheet. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SkillsScreen(viewModel: PartyViewModel, onBack: () -> Unit) {
    val state by viewModel.dynamicState.collectAsState()
    val scope = rememberCoroutineScope()
    var search by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<SkillEntry?>(null) }
    val filteredClasses = state.skillCatalog
        .map { entry -> entry.copy(skills = entry.skills.filter { "${it.name} ${it.id} ${entry.name}".lowercase().contains(search.lowercase()) }) }
        .filter { it.skills.isNotEmpty() }

    AccountScreenScaffold("Class skills", onBack, onRefresh = { scope.launch { viewModel.refreshDynamicStateNow() } }) {
        if (state.skillCatalog.isEmpty()) {
            EmptyState("No skill data yet.")
            return@AccountScreenScaffold
        }
        Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Browse every class-bound skill and the shared game actions. Click any skill for its complete definition.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedTextField(search, { search = it }, placeholder = { Text("Search classes or skills…") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            for (entry in filteredClasses) {
                Column(modifier = Modifier.semantics { contentDescription = entry.name }) {
                    Text(entry.name.uppercase(), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Color(0xFFC4B5FD), modifier = Modifier.padding(vertical = 8.dp))
                    HorizontalDivider(color = Color(0xFF4C1D95), modifier = Modifier.padding(bottom = 8.dp))
                    for (row in entry.skills.chunked(3)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 8.dp)) {
                            for (skill in row) {
                                Column(
                                    modifier = Modifier.weight(1f).border(1.dp, Color(0xFF5B21B6), RoundedCornerShape(4.dp)).clickable { selected = skill }.padding(8.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                ) {
                                    SpriteIcon(skill.sprite, size = 44.dp)
                                    Text(skill.name, style = MaterialTheme.typography.labelSmall, maxLines = 1, modifier = Modifier.padding(top = 4.dp))
                                    Text(skill.id, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                                    Text("Range: ${skillRangeLabel(skill)}", style = MaterialTheme.typography.labelSmall, color = Color(0xFFDDD6FE), modifier = Modifier.padding(top = 8.dp))
                                }
                            }
                            repeat(3 - row.size) { Box(modifier = Modifier.weight(1f)) }
                        }
                    }
                }
            }
        }
    }
    selected?.let { skill ->
        ModalBottomSheet(onDismissRequest = { selected = null }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
            Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp).semantics { contentDescription = "Skill details" }) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 12.dp)) {
                    SpriteIcon(skill.sprite, size = 48.dp)
                    Column(modifier = Modifier.padding(start = 12.dp)) {
                        Text(skill.name, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.titleMedium)
                        Text("G.skills.${skill.id}", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Color(0xFFC4B5FD))
                    }
                }
                skill.definition?.get("explanation")?.takeIf { it.truthy() }?.let { Text(displayValue(it), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(bottom = 16.dp)) }
                Column(modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp).border(1.dp, Color(0xFF5B21B6), RoundedCornerShape(4.dp)).padding(12.dp)) {
                    Text("Range: ${skillRangeLabel(skill)}", style = MaterialTheme.typography.bodySmall, color = Color(0xFFEDE9FE), fontWeight = FontWeight.SemiBold)
                    Text("Base range in game distance units. Attack range depends on the character’s equipment. “Not specified” means the game definition does not supply a range.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
                }
                DefinitionGrid(skill.definition, omit = setOf("name", "skin", "explanation"))
            }
        }
    }
}
