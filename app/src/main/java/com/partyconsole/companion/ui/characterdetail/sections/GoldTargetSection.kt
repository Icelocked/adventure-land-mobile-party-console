package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.MonetizationOn
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.domain.abbreviatedGold
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import kotlinx.coroutines.launch

/** The merchant's gold: current gold, the gold target the merchant keeps on
 *  hand ("gold-target", saved when the field loses focus) and "Exchange gold
 *  and items with bank" - which saves the target first, then queues a bank
 *  run. Gold otherwise moves only during the merchant's bank errands. */
@Composable
fun GoldTargetSection(characterName: String, serverTarget: Long, gold: Long, viewModel: PartyViewModel) {
    val loaded by viewModel.stateLoaded.collectAsState()
    var editing by remember(characterName) { mutableStateOf(false) }
    var draft by remember(characterName) { mutableStateOf(serverTarget.toString()) }
    var busy by remember(characterName) { mutableStateOf(false) }
    var error by remember(characterName) { mutableStateOf<String?>(null) }
    LaunchedEffect(serverTarget) { if (!editing) draft = serverTarget.toString() }
    val scope = rememberCoroutineScope()

    // Only a valid amount is sent.
    suspend fun save(): String? {
        val amount = draft.toLongOrNull()?.takeIf { it >= 0 } ?: return null
        return (viewModel.api.sendCommand(characterName, mapOf("type" to "gold-target", "amount" to amount)) as? ApiResult.Failure)?.message?.ifBlank { "Command failed" }
    }

    SectionCard(title = "Merchant's pocket money") {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.semantics { contentDescription = "%,d gold".format(gold) }) {
                Icon(Icons.Filled.MonetizationOn, contentDescription = null, tint = Color(0xFFFCD34D), modifier = Modifier.size(16.dp))
                Text(abbreviatedGold(gold), fontFamily = FontFamily.Monospace, color = Color(0xFFFCD34D), style = MaterialTheme.typography.bodySmall)
            }
            OutlinedTextField(
                value = draft,
                enabled = loaded,
                onValueChange = { new -> draft = new.filter { it.isDigit() } },
                placeholder = { Text("Set target amount") },
                singleLine = true,
                textStyle = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                modifier = Modifier.weight(1f).semantics { contentDescription = "Merchant's pocket money" }.onFocusChanged { focus ->
                    if (focus.isFocused) editing = true
                    else if (editing) {
                        editing = false
                        scope.launch { error = save(); viewModel.refreshDynamicStateNow() }
                    }
                },
            )
        }
        OutlinedButton(
            enabled = loaded && !busy,
            modifier = Modifier.padding(top = 8.dp),
            onClick = {
                scope.launch {
                    busy = true
                    error = null
                    val failed = save()
                    val banked = if (failed != null) null else viewModel.api.sendCommand(characterName, mapOf("type" to "bank"))
                    error = failed ?: (banked as? ApiResult.Failure)?.message?.ifBlank { "Command failed" }
                    viewModel.refreshDynamicStateNow()
                    busy = false
                }
            },
        ) {
            Icon(Icons.Filled.AccountBalance, contentDescription = null, modifier = Modifier.size(16.dp).padding(end = 4.dp))
            Text("Exchange gold and items with bank")
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        ConfigLoadingNote(loaded)
    }
}
