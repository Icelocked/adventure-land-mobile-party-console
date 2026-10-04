package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.TravelPlace
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import kotlinx.coroutines.launch

/** Ports the "Send to..." / "Return to leader" (every character) and
 *  "Send merchant to..." / "Go home" (merchant only) quick-travel buttons
 *  from inventory-panel.tsx. "Send to..." opens the preset location list
 *  (travelPlaces) rather than a raw map/x/y entry, matching what the web
 *  dashboard actually offers. */
@Composable
fun TravelSection(
    characterName: String,
    isMerchant: Boolean,
    isLeader: Boolean,
    travelPlaces: List<TravelPlace>,
    viewModel: PartyViewModel,
) {
    var showPlaces by remember { mutableStateOf(false) }
    var error by remember(characterName) { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    fun send(action: suspend () -> ApiResult<*>, after: () -> Unit = {}) {
        scope.launch {
            error = null
            when (val result = action()) {
                is ApiResult.Failure -> error = result.message
                is ApiResult.Success -> after()
            }
        }
    }

    SectionCard(title = "Travel") {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { showPlaces = !showPlaces }) {
                Text(if (isMerchant) "Send merchant to..." else "Send to...")
            }
            if (isMerchant) {
                // manual-commands.ts goHome: home spot and home realm (character-
                // travel to main would overwrite the saved location instead).
                Button(onClick = { send({ viewModel.api.goHome(characterName) }) }) {
                    Text("Go home")
                }
            } else if (!isLeader) {
                Button(onClick = { send({ viewModel.api.returnToLeader(characterName) }) }) {
                    Text("Return to leader")
                }
            }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        if (showPlaces) {
            Column(modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                for (place in travelPlaces) {
                    OutlinedButton(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                        onClick = { send({ viewModel.api.sendCharacterTo(characterName, place.id, place.x, place.y, place.name) }) { showPlaces = false } },
                    ) {
                        Text(place.name, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}
