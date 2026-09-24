package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
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
import com.partyconsole.companion.ui.PartyViewModel
import kotlinx.coroutines.launch

/** There is no manual "withdraw gold from the bank" action anywhere in
 *  party-console - gold moves automatically during the merchant's normal
 *  bank errands, toward whatever target each character is set to carry
 *  (POST /party-api/command type "gold-target"). This is that real
 *  mechanism, not a placeholder for a feature that doesn't exist. */
@Composable
fun GoldTargetSection(characterName: String, serverTarget: Long, viewModel: PartyViewModel) {
    var dirty by remember(characterName) { mutableStateOf(false) }
    var value by remember(characterName) { mutableStateOf(serverTarget.toString()) }
    var saving by remember(characterName) { mutableStateOf(false) }

    LaunchedEffect(serverTarget) {
        if (!dirty) value = serverTarget.toString()
    }
    val scope = rememberCoroutineScope()

    SectionCard(title = "Gold target") {
        Text(
            "The merchant's bank errands automatically move gold to keep this character at this amount.",
            style = MaterialTheme.typography.labelSmall,
        )
        Row(modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
            OutlinedTextField(
                value = value,
                onValueChange = { new -> if (new.all { it.isDigit() }) { value = new; dirty = true } },
                label = { Text("Gold to carry") },
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
            Button(
                enabled = dirty && !saving,
                modifier = Modifier.padding(start = 8.dp),
                onClick = {
                    scope.launch {
                        saving = true
                        viewModel.api.sendCommand(characterName, mapOf("type" to "gold-target", "amount" to (value.toLongOrNull() ?: 0L)))
                        viewModel.refreshDynamicStateNow()
                        dirty = false
                        saving = false
                    }
                },
            ) { Text(if (saving) "Saving..." else "Save") }
        }
    }
}
