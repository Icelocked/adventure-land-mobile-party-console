package com.partyconsole.companion.ui.account

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.BossChaseState
import com.partyconsole.companion.model.RealmOption
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.network.CommandResult
import com.partyconsole.companion.ui.PartyViewModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import java.text.DateFormat
import java.util.Date
import kotlin.math.roundToLong

// Console 1.4 boss-chase-setting.tsx and realm-hop-blacklist-setting.tsx,
// shown under the realm panel as on the dashboard.
// PWA: web/src/screens/account/RealmChaseSettings.tsx.

private fun realmLabel(realm: String) = realm.removePrefix("SR_").replaceFirst(Regex("(US|EU|ASIA)"), "$1 ")
private fun timeLabel(at: Long) = DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(at))
private val BOSS_LABELS = mapOf(
    "franky" to "Franky", "icegolem" to "Ice Golem", "crabxx" to "Giga Crab",
    "mrpumpkin" to "Mr. Pumpkin", "mrgreen" to "Mr. Green", "dragold" to "Dragold", "grinch" to "Grinch",
)
private fun bossLabel(boss: String) = BOSS_LABELS[boss] ?: boss

/** One POST at a time per setting (the console's usePartyAction): the
 *  setting disables while it runs, and the server's error shows until the
 *  next send. */
private class RealmAction(private val scope: CoroutineScope, private val viewModel: PartyViewModel) {
    var pending by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
    fun run(send: suspend () -> ApiResult<CommandResult>) = scope.launch {
        error = null
        pending = true
        val result = send()
        pending = false
        if (result is ApiResult.Failure) error = result.message else viewModel.refreshDynamicStateNow()
    }
}

@Composable
private fun rememberRealmAction(viewModel: PartyViewModel): RealmAction {
    val scope = rememberCoroutineScope()
    return remember(viewModel) { RealmAction(scope, viewModel) }
}

private fun Modifier.settingBox(label: String) = fillMaxWidth().padding(top = 4.dp)
    .border(1.dp, Color(0xFF334155), RoundedCornerShape(6.dp))
    .padding(12.dp)
    .semantics { contentDescription = label }

/** Chase event bosses across realms: the On/Off toggle, the minimum ETA
 *  before a hop, the current trip, live sightings and known respawns. */
@Composable
fun BossChaseSetting(viewModel: PartyViewModel, chase: BossChaseState?) {
    val action = rememberRealmAction(viewModel)
    // An unsaved edit overrides the coordinator value; clearing it follows the server again.
    var draft by remember { mutableStateOf<String?>(null) }
    val saved = chase?.minEtaMinutes ?: 15.0
    val minEta = draft ?: if (saved == Math.floor(saved)) saved.roundToLong().toString() else saved.toString()
    val enabled = chase?.enabled == true
    val typed = minEta.trim().toDoubleOrNull()
    val validEta = typed != null && typed.isFinite() && typed >= 0
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.settingBox("Event boss realm chase")) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Chase event bosses across realms", fontWeight = FontWeight.Medium, style = MaterialTheme.typography.bodySmall)
                Text(
                    "When an event boss (Franky, Ice Golem, Giga Crab, or a seasonal boss) isn't live here, move the party to a realm where one is, then return home once it's gone. Only bosses whose event is selected are chased.",
                    color = muted,
                    style = MaterialTheme.typography.labelSmall,
                )
            }
            val toggle = Modifier.semantics { contentDescription = "Chase event bosses across realms"; selected = enabled }
            if (enabled) {
                Button(enabled = !action.pending, onClick = { action.run { viewModel.api.setBossChase(enabled = false) } }, modifier = toggle) { Text("On") }
            } else {
                OutlinedButton(enabled = !action.pending, onClick = { action.run { viewModel.api.setBossChase(enabled = true) } }, modifier = toggle) { Text("Off") }
            }
        }
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = minEta,
                onValueChange = { draft = it },
                enabled = !action.pending,
                singleLine = true,
                label = { Text("Only hop if at least this many minutes remain") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.weight(1f).semantics { contentDescription = "Only hop if at least this many minutes remain" },
            )
            OutlinedButton(
                enabled = !action.pending && validEta && typed != chase?.minEtaMinutes,
                onClick = {
                    val value = typed ?: return@OutlinedButton
                    action.run { viewModel.api.setBossChase(minEtaMinutes = value) }
                    draft = null
                },
            ) { Text("Save") }
        }
        Text("Hop Sickness lasts 12 minutes; the remaining time is estimated from each boss's observed HP drain.", color = muted, style = MaterialTheme.typography.labelSmall)
        chase?.trip?.let { trip ->
            val where = if (trip.arrived) (if (trip.respawnAt != null) "waiting for respawn on " else "fighting on ") else "moving to "
            Text(
                "${bossLabel(trip.boss)} · $where${realmLabel(trip.realm)}" + (trip.respawnAt?.let { " at ${timeLabel(it)}" } ?: "") + (trip.returnRealm?.let { " · returns to ${realmLabel(it)}" } ?: ""),
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f), RoundedCornerShape(6.dp)).padding(8.dp),
            )
        }
        if (enabled) {
            if (chase?.sightings?.isNotEmpty() == true) {
                for (sighting in chase.sightings) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("${bossLabel(sighting.boss)} · ${realmLabel(sighting.realm)}" + (sighting.target?.let { " · $it" } ?: ""), style = MaterialTheme.typography.labelSmall, modifier = Modifier.weight(1f))
                        Text(
                            "${"%.1f".format(java.util.Locale.US, sighting.hp / 1e6)}M HP · " + (sighting.etaMinutes?.let { "~${Math.round(it)} min" } ?: "estimating…"),
                            fontFamily = FontFamily.Monospace,
                            style = MaterialTheme.typography.labelSmall,
                        )
                    }
                }
            } else {
                Text(if (chase?.checkedAt?.let { it > 0 } == true) "No live bosses reported." else "Waiting for the first check…", color = muted, style = MaterialTheme.typography.labelSmall)
            }
            for (entry in chase?.respawns.orEmpty()) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("${bossLabel(entry.boss)} · ${realmLabel(entry.realm)}", color = muted, style = MaterialTheme.typography.labelSmall, modifier = Modifier.weight(1f))
                    Text("respawns ${timeLabel(entry.respawnAt)}", color = muted, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall)
                }
            }
        }
        chase?.lastError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall) }
        action.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall) }
    }
}

/** Realms boss chase never hops to. Manual realm changes are unaffected,
 *  and PVP realms are always skipped. Each toggle posts the whole list. */
@Composable
fun RealmHopBlacklistSetting(viewModel: PartyViewModel, realms: List<RealmOption>, blacklist: List<String>) {
    val action = rememberRealmAction(viewModel)
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.settingBox("Realm hopping blacklist")) {
        Text("Never hop to these realms", fontWeight = FontWeight.Medium, style = MaterialTheme.typography.bodySmall)
        Text("Boss chase skips checked realms, e.g. ones whose ping cripples DPS. Changing realm by hand still works. PVP realms are always skipped.", color = muted, style = MaterialTheme.typography.labelSmall)
        if (realms.isEmpty()) {
            Text("Waiting for the realm list…", color = muted, style = MaterialTheme.typography.labelSmall)
        } else {
            for (realm in realms) {
                val blocked = realm.pvp || realm.key in blacklist
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth().border(1.dp, Color(0xFF334155), RoundedCornerShape(6.dp)).padding(horizontal = 4.dp),
                ) {
                    Checkbox(
                        checked = blocked,
                        enabled = !realm.pvp && !action.pending,
                        onCheckedChange = { checked -> action.run { viewModel.api.setRealmHopBlacklist(if (checked) blacklist + realm.key else blacklist - realm.key) } },
                        modifier = Modifier.semantics { contentDescription = "Never hop to ${realmLabel(realm.key)}" },
                    )
                    Text(realmLabel(realm.key), style = MaterialTheme.typography.labelSmall, modifier = Modifier.weight(1f))
                    Text(if (realm.pvp) "PVP · always skipped" else "${"%,d".format(realm.players)} players", color = muted, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(end = 8.dp))
                }
            }
        }
        action.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall) }
    }
}
