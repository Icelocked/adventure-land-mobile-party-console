package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.RestockPolicy
import com.partyconsole.companion.ui.PartyViewModel
import kotlinx.coroutines.launch

/** Ports restock-controls.tsx's HP/MP min/max fields + Save button. Keeps
 *  a local "dirty" copy once the user starts typing so an incoming poll
 *  refresh (PartyRepository polls /party-api/state every ~6s) can't
 *  clobber an in-progress edit - only resets from the server value while
 *  untouched, exactly like the web version's own dirty-tracking. */
@Composable
fun RestockSection(characterName: String, serverPolicy: RestockPolicy, viewModel: PartyViewModel) {
    var dirty by remember(characterName) { mutableStateOf(false) }
    var hpMin by remember(characterName) { mutableStateOf(serverPolicy.hp.min.toString()) }
    var hpMax by remember(characterName) { mutableStateOf(serverPolicy.hp.max.toString()) }
    var mpMin by remember(characterName) { mutableStateOf(serverPolicy.mp.min.toString()) }
    var mpMax by remember(characterName) { mutableStateOf(serverPolicy.mp.max.toString()) }
    var saving by remember(characterName) { mutableStateOf(false) }

    LaunchedEffect(serverPolicy) {
        if (!dirty) {
            hpMin = serverPolicy.hp.min.toString()
            hpMax = serverPolicy.hp.max.toString()
            mpMin = serverPolicy.mp.min.toString()
            mpMax = serverPolicy.mp.max.toString()
        }
    }

    val scope = rememberCoroutineScope()

    SectionCard(title = "Restock") {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            RestockField("HP min", hpMin, modifier = Modifier.weight(1f)) { hpMin = it; dirty = true }
            RestockField("HP max", hpMax, modifier = Modifier.weight(1f)) { hpMax = it; dirty = true }
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        ) {
            RestockField("MP min", mpMin, modifier = Modifier.weight(1f)) { mpMin = it; dirty = true }
            RestockField("MP max", mpMax, modifier = Modifier.weight(1f)) { mpMax = it; dirty = true }
        }
        Button(
            enabled = dirty && !saving,
            modifier = Modifier.padding(top = 8.dp),
            onClick = {
                scope.launch {
                    saving = true
                    viewModel.api.saveRestock(
                        character = characterName,
                        hpMin = hpMin.toIntOrNull() ?: 0,
                        hpMax = hpMax.toIntOrNull() ?: 0,
                        mpMin = mpMin.toIntOrNull() ?: 0,
                        mpMax = mpMax.toIntOrNull() ?: 0,
                    )
                    viewModel.refreshDynamicStateNow()
                    dirty = false
                    saving = false
                }
            },
        ) {
            Text(if (saving) "Saving..." else "Save")
        }
    }
}

@Composable
private fun RestockField(label: String, value: String, modifier: Modifier = Modifier, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = { new -> if (new.all { it.isDigit() }) onChange(new) },
        label = { Text(label) },
        singleLine = true,
        modifier = modifier,
    )
}
