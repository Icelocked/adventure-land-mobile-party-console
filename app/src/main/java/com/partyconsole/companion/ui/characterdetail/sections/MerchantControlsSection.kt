package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.domain.abbreviatedGold
import com.partyconsole.companion.domain.merchantPartyGroups
import com.partyconsole.companion.model.GiveawayRealm
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.components.rememberClock
import com.partyconsole.companion.ui.merchant.MerchantSettings
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

private val Amber = Color(0xFFF59E0B)
private val Emerald = Color(0xFF10B981)
private val Violet = Color(0xFFA78BFA)

/** Merchant controls: Buy/Craft/Exchange, Force stand, Mining/Fishing with
 *  readiness, Routines, Send to party (group picker), Donate (XP preview),
 *  Join giveaway (realm then player), Merchant settings and Clear job queue.
 *  Merchant only. */
@Composable
fun MerchantControlsSection(viewModel: PartyViewModel, onOpenCommerce: (String) -> Unit, onOpenRoutines: () -> Unit) {
    val state by viewModel.dynamicState.collectAsState()
    val characters by viewModel.characters.collectAsState()
    val diagnostics by viewModel.characterDetails.collectAsState()
    val loaded by viewModel.stateLoaded.collectAsState()
    val scope = rememberCoroutineScope()
    val now = rememberClock()
    val merchant = state.merchantCharacter
    val merchantRaw = merchant?.let { diagnostics[it]?.raw }
    val groups = merchantPartyGroups(state, characters.keys.toList())
    // The merchant's own XP-per-gold rate, 3.2 until known.
    val xpPerGold = (merchantRaw?.get("donationXpPerGold") as? JsonPrimitive)?.content?.toDoubleOrNull()?.takeIf { it > 0 } ?: 3.2
    var expanded by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmingClear by remember { mutableStateOf(false) }
    var sendingToParty by remember { mutableStateOf(false) }
    fun toggle(key: String) { expanded = if (expanded == key) null else key }
    fun run(action: suspend () -> ApiResult<*>) {
        scope.launch {
            error = null
            when (val result = action()) {
                is ApiResult.Failure -> error = result.message.ifBlank { "Request failed" }
                is ApiResult.Success -> {
                    viewModel.refreshDynamicStateNow()
                    expanded = null
                }
            }
        }
    }
    // One request at a time; controls are disabled while it runs.
    fun sendToParty(group: String?) {
        if (sendingToParty) return
        sendingToParty = true
        scope.launch {
            error = null
            when (val result = viewModel.api.sendMerchantToParty(group)) {
                is ApiResult.Failure -> error = result.message.ifBlank { "Request failed" }
                is ApiResult.Success -> {
                    viewModel.refreshDynamicStateNow()
                    expanded = null
                }
            }
            sendingToParty = false
        }
    }
    // Readiness: the later of the merchant's and the party's cooldowns.
    fun readiness(mode: String): Pair<String, Color?> {
        val own = ((merchantRaw?.get("gatheringCooldowns") as? JsonObject)?.get(mode) as? JsonPrimitive)?.content?.toDoubleOrNull()?.toLong() ?: 0L
        val party = (if (mode == "fishing") state.gatheringCooldowns?.fishing else state.gatheringCooldowns?.mining) ?: 0L
        val remaining = maxOf(0L, maxOf(own, party) - now)
        if (remaining == 0L) return "✓ Ready" to Emerald
        val seconds = (remaining + 999) / 1000
        return "${seconds / 60}:${(seconds % 60).toString().padStart(2, '0')}" to null
    }

    SectionCard(title = "Merchant controls") {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedButton(onClick = { onOpenCommerce("buy") }) { Text("Buy") }
            OutlinedButton(onClick = { onOpenCommerce("craft") }) { Text("Craft") }
            OutlinedButton(onClick = { onOpenCommerce("exchange") }) { Text("Exchange") }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 8.dp)) {
            FilterChip(selected = state.merchantForceStand, enabled = loaded, onClick = { run { viewModel.api.setForceStand(!state.merchantForceStand) } }, label = { Text("Force stand · ${if (state.merchantForceStand) "On" else "Off"}") })
            for (mode in listOf("mining", "fishing")) {
                val on = state.gatheringModes.contains(mode)
                val (ready, readyColor) = if (state.gatheringNoTool[mode] == true && !on) "No tool" to Amber else readiness(mode)
                FilterChip(
                    selected = on,
                    enabled = loaded,
                    onClick = { run { viewModel.api.setGathering(mode, !on) } },
                    label = {
                        Row {
                            Text("${mode.replaceFirstChar { it.uppercase() }} · ${if (on) "On" else "Off"} · ")
                            Text(ready, color = readyColor ?: MaterialTheme.colorScheme.onSurface, fontFamily = if (readyColor == null) FontFamily.Monospace else null)
                        }
                    },
                )
            }
        }
        ConfigLoadingNote(loaded)
        Column(modifier = Modifier.padding(top = 6.dp)) {
            TextButton(onClick = onOpenRoutines) { Text("Routines") }
            TextButton(enabled = !sendingToParty, onClick = { if (groups.size <= 1) sendToParty(groups.firstOrNull()?.id) else toggle("party") }) {
                Text(if (sendingToParty) "Sending…" else "Send to party")
            }
            if (expanded == "party") {
                // Pick a party group when there's more than one.
                Column(modifier = Modifier.padding(start = 12.dp)) {
                    Text("Select party group", style = MaterialTheme.typography.labelSmall)
                    for (group in groups) {
                        OutlinedButton(enabled = !sendingToParty, onClick = { sendToParty(group.id) }, modifier = Modifier.fillMaxWidth()) { Text(group.members.joinToString(" · ")) }
                    }
                }
            }
            TextButton(onClick = { toggle("donate") }) { Text("Donate gold") }
            if (expanded == "donate") DonateForm(merchant, xpPerGold) { amount -> run { viewModel.api.donateGold(amount) } }
            TextButton(onClick = { toggle("giveaway") }) { Text("Join giveaway") }
            if (expanded == "giveaway") {
                // The merchant's current realm, else the first.
                val currentRealm = merchant?.let { characters[it]?.vitals?.server }
                GiveawayForm(
                    initialRealm = currentRealm?.let { "SR_$it" } ?: state.giveawayRealms.firstOrNull()?.key.orEmpty(),
                    realms = state.giveawayRealms,
                    players = state.giveawayPlayers,
                ) { realm, seller -> run { viewModel.api.joinGiveaway(seller, realm) } }
            }
            TextButton(onClick = { toggle("settings") }) { Text("Merchant settings") }
            if (expanded == "settings") {
                if (loaded) MerchantSettings(viewModel) else ConfigLoadingNote(false)
            }
            if (confirmingClear) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Really clear the entire job queue?", color = MaterialTheme.colorScheme.error, modifier = Modifier.weight(1f))
                    Button(onClick = { confirmingClear = false; run { viewModel.api.clearMerchantQueue() } }, colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)) { Text("Clear") }
                    TextButton(onClick = { confirmingClear = false }) { Text("Cancel") }
                }
            } else {
                TextButton(onClick = { confirmingClear = true }) { Text("Clear job queue", color = MaterialTheme.colorScheme.error) }
            }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    }
}

@Composable
private fun DonateForm(merchant: String?, xpPerGold: Double, onDonate: (Long) -> Unit) {
    var amount by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    Column(modifier = Modifier.padding(start = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Donate gold for merchant XP", style = MaterialTheme.typography.bodySmall, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold)
        Text("${merchant ?: "The merchant"} will withdraw any shortage, travel to the XP frog, and donate this amount.", style = MaterialTheme.typography.labelSmall)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(value = amount, onValueChange = { amount = it.filter(Char::isDigit) }, label = { Text("Donation amount") }, singleLine = true, modifier = Modifier.weight(1f))
            Button(onClick = {
                val value = amount.toLongOrNull()
                if (value == null || value < 1) error = "Enter a positive whole-number donation" else { error = null; onDonate(value) }
            }) { Text("Donate") }
        }
        Text(
            "Preview: ${abbreviatedGold(((amount.toLongOrNull() ?: 0L) * xpPerGold).toLong())} XP ($xpPerGold XP/gold)",
            color = Violet,
            fontFamily = FontFamily.Monospace,
            style = MaterialTheme.typography.labelSmall,
        )
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall) }
    }
}

/** "Join giveaway": pick a realm, then a player online there (searchable). */
@Composable
private fun GiveawayForm(initialRealm: String, realms: List<GiveawayRealm>, players: Map<String, List<String>>, onJoin: (String, String) -> Unit) {
    var realm by remember { mutableStateOf(initialRealm) }
    var seller by remember { mutableStateOf("") }
    var search by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var realmMenu by remember { mutableStateOf(false) }
    val online = players[realm].orEmpty()
    val matches = online.filter { it.lowercase().contains(search.trim().lowercase()) }
    Column(modifier = Modifier.padding(start = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("The merchant will switch realms, travel to the main market, find this player, and enter every active giveaway they are hosting.", style = MaterialTheme.typography.labelSmall)
        ExposedDropdownMenuBox(expanded = realmMenu, onExpandedChange = { realmMenu = it }) {
            OutlinedTextField(
                value = realms.find { it.key == realm }?.label ?: if (realm.isEmpty()) "Select a realm" else realm,
                onValueChange = {},
                readOnly = true,
                label = { Text("Server realm") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = realmMenu) },
                modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable),
            )
            ExposedDropdownMenu(expanded = realmMenu, onDismissRequest = { realmMenu = false }) {
                for (option in realms) DropdownMenuItem(text = { Text(option.label) }, onClick = { realm = option.key; seller = ""; realmMenu = false })
            }
        }
        OutlinedTextField(
            value = seller.ifEmpty { search },
            enabled = realm.isNotEmpty(),
            onValueChange = { seller = ""; search = it },
            label = { Text("Merchant name") },
            placeholder = { Text(if (realm.isNotEmpty()) "Search player name…" else "Select a realm first") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        if (realm.isNotEmpty() && seller.isEmpty()) {
            Column(modifier = Modifier.heightIn(max = 160.dp).verticalScroll(rememberScrollState())) {
                for (name in matches) Text(name, modifier = Modifier.fillMaxWidth().clickable { seller = name }.padding(8.dp))
                if (matches.isEmpty()) Text("No online players loaded for this realm.", style = MaterialTheme.typography.labelSmall)
            }
        }
        Text("${online.size} online players loaded", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall)
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall) }
        Button(onClick = {
            if (realm.isBlank() || seller.isBlank()) error = "Enter both a server realm and merchant name" else { error = null; onJoin(realm.trim(), seller.trim()) }
        }) { Text("Join") }
    }
}
