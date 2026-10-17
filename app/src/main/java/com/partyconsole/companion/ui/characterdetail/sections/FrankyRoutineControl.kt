package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.PartyStateDynamic
import com.partyconsole.companion.model.encounterRoutine
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import kotlinx.coroutines.launch
import kotlin.math.roundToLong

private data class FrankyMode(val id: String, val label: String, val description: String, val border: Color, val background: Color, val text: Color)

private val FRANKY_MODES = listOf(
    FrankyMode("auto", "Auto", "Try Tank first; switch to Off-tank for good after too many deaths (below)", Color(0xFF0891B2), Color(0xFF083344), Color(0xFFCFFAFE)),
    FrankyMode("offtank", "Off-tank", "Stack on whoever else has aggro; leave the room if Franky targets you", Color(0xFF059669), Color(0xFF022C22), Color(0xFFD1FAE5)),
    FrankyMode("tank", "Tank", "Engage Franky directly and hold at weapon range, like normal combat", Color(0xFFD97706), Color(0xFF451A03), Color(0xFFFEF3C7)),
)

/** The console's Franky routine dialog as an inline group under Franky's
 *  event settings. A follower shows its leader's routine read-only; the
 *  server refuses its edits with 409 "following leader settings"
 *  (http/farming-scope.ts). PWA: FrankyRoutineControl.tsx. */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun FrankyRoutineControl(name: String, state: PartyStateDynamic, viewModel: PartyViewModel) {
    val scope = rememberCoroutineScope()
    val routine = state.encounterRoutine(name)
    val inherited = routine.followingLeader != null
    var busy by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var limitDraft by remember { mutableStateOf(routine.autoDeathLimit.toString()) }
    var limitBusy by remember { mutableStateOf(false) }
    var limitError by remember { mutableStateOf<String?>(null) }
    // A saved limit replaces the draft, as the console's dialog does on each new limit.
    var shownLimit by remember { mutableStateOf(routine.autoDeathLimit) }
    if (shownLimit != routine.autoDeathLimit) {
        shownLimit = routine.autoDeathLimit
        limitDraft = routine.autoDeathLimit.toString()
    }
    fun select(mode: String) = scope.launch {
        busy = mode
        error = null
        when (val result = viewModel.api.setEncounterMode(name, "franky", mode)) {
            is ApiResult.Failure -> error = result.message.ifEmpty { "Could not save franky routine" }
            is ApiResult.Success -> viewModel.refreshDynamicStateNow()
        }
        busy = null
    }
    fun saveLimit() {
        // JavaScript Math.round(Number(text)): blank is 0.
        val value = limitDraft.trim().ifEmpty { "0" }.toDoubleOrNull()?.takeIf { it.isFinite() }?.let { Math.floor(it + 0.5) }
        if (value == null || value < 0) {
            limitError = "Enter 0 or a positive number of deaths."
            return
        }
        scope.launch {
            limitBusy = true
            limitError = null
            when (val result = viewModel.api.setEncounterAutoLimit(name, "franky", value.roundToLong())) {
                is ApiResult.Failure -> limitError = result.message.ifEmpty { "Could not save the death limit" }
                is ApiResult.Success -> viewModel.refreshDynamicStateNow()
            }
            limitBusy = false
        }
    }
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Column(
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
            .border(1.dp, Color(0xFF92400E), RoundedCornerShape(4.dp))
            .padding(12.dp)
            .semantics { contentDescription = "Franky routine" },
    ) {
        Text("Franky routine · $name", color = Color(0xFFFDE68A), style = MaterialTheme.typography.titleSmall)
        Text("Choose how this character reacts to Franky's aggro once it's live.", color = muted, style = MaterialTheme.typography.labelSmall)
        if (inherited) Text("Inherited from the leader.", color = Color(0xFFCFFAFE), style = MaterialTheme.typography.labelSmall)
        for (mode in FRANKY_MODES) {
            val chosen = routine.mode == mode.id
            OutlinedButton(
                onClick = { select(mode.id) },
                enabled = !inherited && busy == null,
                shape = RoundedCornerShape(4.dp),
                border = androidx.compose.foundation.BorderStroke(if (chosen) 2.dp else 1.dp, if (chosen) Color.White.copy(alpha = 0.7f) else mode.border),
                colors = ButtonDefaults.outlinedButtonColors(containerColor = mode.background, contentColor = mode.text),
                modifier = Modifier.fillMaxWidth().semantics { selected = chosen },
            ) {
                Column(modifier = Modifier.fillMaxWidth()) {
                    Text(if (busy == mode.id) "Saving…" else mode.label, style = MaterialTheme.typography.labelLarge)
                    Text(mode.description, style = MaterialTheme.typography.labelSmall)
                }
            }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        Column(
            modifier = Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(4.dp)).padding(12.dp),
        ) {
            Text(
                "In Auto mode, this character tries Tank first. After this many deaths to Franky while auto-tanking, Auto switches to Off-tank for good. Set to 0 to skip Tank entirely in Auto mode. Raising the limit later lets it try Tank again.",
                color = muted,
                style = MaterialTheme.typography.labelSmall,
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.Center, modifier = Modifier.padding(top = 8.dp)) {
                OutlinedTextField(
                    value = limitDraft,
                    onValueChange = { limitDraft = it },
                    enabled = !inherited && !limitBusy,
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { saveLimit() }),
                    modifier = Modifier.width(96.dp).semantics { contentDescription = "Auto-tank death limit" },
                )
                OutlinedButton(onClick = { saveLimit() }, enabled = !inherited && !limitBusy, modifier = Modifier.align(Alignment.CenterVertically)) {
                    Text(if (limitBusy) "Saving…" else "Set")
                }
                Text(
                    "Deaths while auto-tanking: ${routine.autoDeaths}" + if (routine.autoDeathLimit > 0) "/${routine.autoDeathLimit}" else "",
                    color = Color(0xFFFDE68A),
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.align(Alignment.CenterVertically),
                )
            }
            limitError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp)) }
        }
    }
}
