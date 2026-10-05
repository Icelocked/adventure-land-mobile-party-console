package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.TravelPlace
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.components.rememberClock
import kotlinx.coroutines.launch

/** The "Send to..." / "Return to leader" (every character) and "Travel to
 *  place..." / "Go home" / "Send merchant to..." (merchant) controls. "Send
 *  to..." opens the travel form inline: a known area or exact coordinates. */
@Composable
fun TravelSection(
    characterName: String,
    isMerchant: Boolean,
    travelPlaces: List<TravelPlace>,
    viewModel: PartyViewModel,
) {
    val state by viewModel.dynamicState.collectAsState()
    val diagnostics by viewModel.characterDetails.collectAsState()
    val now = rememberClock()
    val scope = rememberCoroutineScope()
    var showPlaces by remember(characterName) { mutableStateOf(false) }
    var showVisits by remember(characterName) { mutableStateOf(false) }
    var visitMessage by remember(characterName) { mutableStateOf<String?>(null) }
    // "Queuing visit…" and no repeat sends while one is in flight.
    var queuingVisit by remember { mutableStateOf(false) }
    var error by remember(characterName) { mutableStateOf<String?>(null) }
    // Online (seen in the last 10s) non-merchant characters.
    val eligible = diagnostics.filter { (name, detail) -> name != state.merchantCharacter && detail.ctype != "merchant" && (detail.seenAt ?: 0) > 0 && now - (detail.seenAt ?: 0) < 10_000 }.keys.toList()
    // A different leader, seen recently.
    val leader = state.leader
    val leaderOnline = leader != null && leader != characterName && now - (diagnostics[leader]?.seenAt ?: 0) < 10_000
    fun report(action: suspend () -> ApiResult<*>) = scope.launch {
        error = null
        (action() as? ApiResult.Failure)?.let { error = it.message.ifEmpty { "Command failed" } }
    }

    SectionCard(title = "Travel") {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { showPlaces = !showPlaces }) { Text(if (isMerchant) "Travel to place…" else "Send to…") }
            if (isMerchant) {
                // Home spot and home realm.
                Button(onClick = { report { viewModel.api.goHome(characterName) } }) { Text("Go home") }
            } else {
                Button(enabled = leaderOnline, onClick = { report { viewModel.api.returnToLeader(characterName) } }) { Text("Return to leader") }
            }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp)) }
        if (isMerchant) {
            OutlinedButton(onClick = { showVisits = !showVisits }, modifier = Modifier.padding(top = 8.dp)) { Text("Send merchant to…") }
            visitMessage?.let { Text(it, color = Color(0xFFF59E0B), style = MaterialTheme.typography.labelSmall) }
            if (showVisits) {
                Column(modifier = Modifier.fillMaxWidth().padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    for (name in eligible) {
                        OutlinedButton(
                            enabled = !queuingVisit,
                            modifier = Modifier.fillMaxWidth(),
                            onClick = {
                                if (queuingVisit) return@OutlinedButton
                                queuingVisit = true
                                error = null
                                visitMessage = null
                                scope.launch {
                                    try {
                                        // Queue a merchant visit to that character.
                                        when (val result = viewModel.api.sendCommand(name, mapOf("type" to "bank"))) {
                                            is ApiResult.Failure -> error = result.message
                                            is ApiResult.Success -> {
                                                visitMessage = "Merchant visit queued for $name"
                                                showVisits = false
                                            }
                                        }
                                    } finally {
                                        queuingVisit = false
                                    }
                                }
                            },
                        ) { Text(name, modifier = Modifier.fillMaxWidth()) }
                    }
                    if (queuingVisit) Text("Queuing visit…", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (eligible.isEmpty()) Text("No other characters are online.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        if (showPlaces) CharacterTravelForm(characterName, travelPlaces, viewModel) { showPlaces = false }
    }
}

/** The travel form, inline: a known area fills the exact map and coordinates
 *  (default main -174, 121), which can also be typed; the label is the area's
 *  name or "map [x, y]", and errors stay in the form. */
@Composable
private fun CharacterTravelForm(characterName: String, places: List<TravelPlace>, viewModel: PartyViewModel, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    var destination by remember { mutableStateOf("") }
    var travelMap by remember { mutableStateOf("main") }
    var travelX by remember { mutableStateOf("-174") }
    var travelY by remember { mutableStateOf("121") }
    var error by remember { mutableStateOf<String?>(null) }
    var menu by remember { mutableStateOf(false) }
    fun edit(set: (String) -> Unit): (String) -> Unit = { value -> error = null; destination = ""; set(value) }
    fun jsNumber(text: String): Double? = if (text.isBlank()) 0.0 else text.trim().toDoubleOrNull()
    fun coordinate(value: Double) = if (value == Math.floor(value) && value.isFinite()) value.toLong().toString() else value.toString()

    Column(
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp).border(1.dp, Color(0xFF155E75), RoundedCornerShape(6.dp)).padding(10.dp)
            .semantics { contentDescription = "Send $characterName to…" },
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text("Send $characterName to…", fontWeight = FontWeight.Medium, style = MaterialTheme.typography.bodySmall)
        Text("Choose a known area, or enter an exact map and coordinate.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Box {
            OutlinedButton(onClick = { menu = true }, modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Known area" }) {
                Text(places.find { it.id == destination }?.name ?: "Travel → Places", modifier = Modifier.fillMaxWidth())
            }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                DropdownMenuItem(text = { Text("Travel → Places") }, onClick = { destination = ""; menu = false })
                for (place in places) {
                    DropdownMenuItem(text = { Text(place.name) }, onClick = {
                        error = null
                        destination = place.id
                        travelMap = place.id
                        travelX = coordinate(place.x)
                        travelY = coordinate(place.y)
                        menu = false
                    })
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(travelMap, edit { travelMap = it }, label = { Text("Map") }, singleLine = true, modifier = Modifier.weight(1f))
            OutlinedTextField(travelX, edit { travelX = it }, label = { Text("X") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.width(88.dp))
            OutlinedTextField(travelY, edit { travelY = it }, label = { Text("Y") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.width(88.dp))
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.align(Alignment.End)) {
            OutlinedButton(onClick = onClose) { Text("Cancel") }
            Button(onClick = {
                error = null
                val map = travelMap.trim()
                val x = jsNumber(travelX)
                val y = jsNumber(travelY)
                if (map.isEmpty() || x == null || y == null || !x.isFinite() || !y.isFinite()) {
                    error = "Enter a map and finite coordinates"
                    return@Button
                }
                val label = places.find { it.id == destination }?.name ?: "$map [${coordinate(x)}, ${coordinate(y)}]"
                scope.launch {
                    when (val result = viewModel.api.sendCharacterTo(characterName, map, x, y, label)) {
                        is ApiResult.Failure -> error = result.message.ifEmpty { "Travel command failed" }
                        is ApiResult.Success -> onClose()
                    }
                }
            }) { Text("Send character") }
        }
    }
}
