package com.partyconsole.companion.ui.account

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.notify.ALERTS
import com.partyconsole.companion.notify.AlertNotifications
import com.partyconsole.companion.notify.Burst
import com.partyconsole.companion.notify.DevicePrefs
import com.partyconsole.companion.notify.Notice
import com.partyconsole.companion.notify.NotifierControl
import com.partyconsole.companion.notify.NotifierLimits
import com.partyconsole.companion.notify.NotifierStore
import com.partyconsole.companion.notify.QuietHours
import com.partyconsole.companion.notify.mergeLimits
import com.partyconsole.companion.ui.PartyViewModel

/** Same groups as the PWA's lib/pushNotifications.ts ALERT_GROUPS. */
private data class AlertInfo(val id: String, val label: String, val description: String)
private data class AlertGroup(val title: String, val note: String?, val alerts: List<AlertInfo>)

private val ALERT_GROUPS = listOf(
    AlertGroup("Character health", "These still arrive during quiet hours.", listOf(
        AlertInfo("stuck", "Stuck or offline", "No status report for a while, a lost connection or stopped CODE - and when it recovers."),
        AlertInfo("idle", "No actions", "No fighting, looting, logging or moving for a while (the merchant is excluded)."),
        AlertInfo("deaths", "Repeated deaths", "Dying again and again within a window."),
        AlertInfo("errors", "Error bursts", "Many errors within a window (game log errors, and the merchant’s errors)."),
    )),
    AlertGroup("Storage", null, listOf(
        AlertInfo("inventory", "Inventory full", "A character’s bag has no free slots - and again each time it fills back up."),
        AlertInfo("bank", "Bank full", "Every unlocked bank pack is out of free slots."),
    )),
    AlertGroup("Progress", null, listOf(
        AlertInfo("rules", "Auto-upgrade / auto-compound rule done", "A rule finished its last item (e.g. 1 bow reached +9)."),
        AlertInfo("orders", "Buy-and-upgrade order done", "A Buy order with a target level left the merchant’s queue."),
        AlertInfo("events", "Event completed", "An event one of your characters is signed up for ended."),
    )),
    AlertGroup("Loot", null, listOf(AlertInfo("rare", "Rare drops", "A looted item matches your rare-drop rule below."))),
    AlertGroup("Trading and mail", null, listOf(
        AlertInfo("trading", "Sales and orders filled", "Stand sales, WTB orders filled, Ponty and ALData purchases, completed sales."),
        AlertInfo("mail", "New mail", "A new message arrives in the mailbox."),
    )),
)

private val TIME = Regex("^\\d{1,2}:\\d{2}$")
private val Muted = Color(0xFF94A3B8)

/** A number field that saves each valid (≥ 1) value. */
@Composable
private fun LimitInput(label: String, value: Long, onSave: (Long) -> Unit, width: Dp = 72.dp) {
    var draft by remember(value) { mutableStateOf(value.toString()) }
    OutlinedTextField(
        value = draft,
        onValueChange = { text ->
            draft = text.filter { it.isDigit() }.take(13)
            draft.toLongOrNull()?.takeIf { it >= 1 && it != value }?.let(onSave)
        },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        textStyle = MaterialTheme.typography.bodySmall,
        modifier = Modifier.width(width).semantics { contentDescription = label },
    )
}

@Composable
private fun LimitRow(content: @Composable () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 4.dp)) { content() }
}

/** Android notifications from this app's own polling (no push server):
 *  alerts, limits, quiet hours, muted characters, live alerts and a test
 *  notification. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun NotificationsSection(viewModel: PartyViewModel) {
    val context = LocalContext.current
    val store = remember { NotifierStore(context) }
    val characters by viewModel.characters.collectAsState()
    var enabled by remember { mutableStateOf(store.enabled) }
    var live by remember { mutableStateOf(store.live) }
    var prefs by remember { mutableStateOf(store.device) }
    var limits by remember { mutableStateOf(store.limits) }
    var paused by remember { mutableStateOf(store.watch.credentialFailed) }
    var error by remember { mutableStateOf<String?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }

    fun updatePrefs(next: DevicePrefs) { prefs = next; store.device = next }
    fun updateLimits(next: NotifierLimits) { limits = mergeLimits(limits, next); store.limits = limits }
    fun turnOn() {
        error = null
        store.enabled = true
        // Start fresh: the first check only marks where history ends.
        store.watch = com.partyconsole.companion.notify.WatchState()
        enabled = true
        paused = false
        NotifierControl.apply(context)
    }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) turnOn() else error = "Allow notifications for this app in Android settings to turn alerts on."
    }

    Column(
        modifier = Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(6.dp)).padding(16.dp).semantics { contentDescription = "Notifications" },
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text("Notifications", fontWeight = FontWeight.Medium, style = MaterialTheme.typography.bodySmall)
        Text("Get a phone notification when something needs your attention, even with the app closed.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        for (group in ALERT_GROUPS) {
            Text(group.title.uppercase(), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = Muted, modifier = Modifier.padding(top = 8.dp))
            group.note?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = Muted) }
            for (alert in group.alerts) {
                val on = alert.id in prefs.alerts
                Row(verticalAlignment = Alignment.Top) {
                    Checkbox(
                        checked = on,
                        onCheckedChange = { checked -> updatePrefs(prefs.copy(alerts = if (checked) ALERTS.filter { it in prefs.alerts || it == alert.id } else prefs.alerts - alert.id)) },
                        modifier = Modifier.semantics { contentDescription = alert.label },
                    )
                    Column(modifier = Modifier.padding(top = 12.dp)) {
                        Text(alert.label, style = MaterialTheme.typography.bodySmall)
                        Text(alert.description, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (on) LimitsFor(alert.id, limits, ::updateLimits)
                    }
                }
            }
        }
        Text("Limits, the rare-drop rule, the alerts you pick, quiet hours and muted characters are stored on this phone.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

        Text("QUIET HOURS", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = Muted, modifier = Modifier.padding(top = 8.dp))
        val quiet = prefs.quiet
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Checkbox(checked = quiet != null, onCheckedChange = { updatePrefs(prefs.copy(quiet = if (it) QuietHours("22:00", "07:00") else null)) }, modifier = Modifier.semantics { contentDescription = "Quiet hours" })
            Text("Silence notifications from", style = MaterialTheme.typography.labelSmall)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TimeField("Quiet hours start", quiet?.start ?: "22:00", quiet != null) { updatePrefs(prefs.copy(quiet = QuietHours(it, quiet?.end ?: "07:00"))) }
            Text("to", style = MaterialTheme.typography.labelSmall)
            TimeField("Quiet hours end", quiet?.end ?: "07:00", quiet != null) { updatePrefs(prefs.copy(quiet = QuietHours(quiet?.start ?: "22:00", it))) }
        }
        Text("Character health alerts still come through.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

        if (characters.isNotEmpty()) {
            Text("MUTE CHARACTERS", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = Muted, modifier = Modifier.padding(top = 8.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for (name in characters.keys) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = name in prefs.muted, onCheckedChange = { updatePrefs(prefs.copy(muted = if (it) prefs.muted + name else prefs.muted - name)) }, modifier = Modifier.semantics { contentDescription = "Mute $name" })
                        Text(name, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }

        // Android has no push server here: the app checks the console itself.
        Text("DELIVERY", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = Muted, modifier = Modifier.padding(top = 8.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Switch(checked = live, onCheckedChange = { live = it; store.live = it; NotifierControl.apply(context) }, modifier = Modifier.semantics { contentDescription = "Live alerts" })
            Column(modifier = Modifier.weight(1f)) {
                Text("Live alerts", style = MaterialTheme.typography.bodySmall)
                Text(
                    "Check every 15 seconds, with an ongoing notification while it runs. Off: Android checks about every 15 minutes.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 4.dp)) {
            if (enabled) {
                OutlinedButton(onClick = {
                    error = null
                    if (!AlertNotifications.permitted(context)) error = "Notifications are blocked for this app in Android settings."
                    else {
                        AlertNotifications.show(context, Notice("Party Console", "Notifications are working.", "notifier-test", "/settings"))
                        notice = "Test notification sent."
                    }
                }) { Text("Send test notification") }
                OutlinedButton(onClick = { store.enabled = false; enabled = false; notice = null; NotifierControl.apply(context) }) { Text("Turn off on this device") }
            } else {
                Button(enabled = prefs.alerts.isNotEmpty(), onClick = {
                    if (Build.VERSION.SDK_INT >= 33 && !AlertNotifications.permitted(context)) permission.launch(Manifest.permission.POST_NOTIFICATIONS) else turnOn()
                }) { Text("Enable notifications on this device") }
            }
        }
        Text(
            if (!enabled) "Off for this device." else if (paused) "On, but paused: pair this phone again to reconnect." else "On for this device.",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        notice?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = Color(0xFF6EE7B7)) }
        error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
    }
}

@Composable
private fun TimeField(label: String, value: String, enabled: Boolean, onSave: (String) -> Unit) {
    var draft by remember(value) { mutableStateOf(value) }
    OutlinedTextField(
        value = draft,
        enabled = enabled,
        onValueChange = { text ->
            draft = text.filter { it.isDigit() || it == ':' }.take(5)
            val parts = draft.split(":")
            if (TIME.matches(draft) && (parts[0].toIntOrNull() ?: 99) < 24 && (parts[1].toIntOrNull() ?: 99) < 60) onSave(draft)
        },
        singleLine = true,
        textStyle = MaterialTheme.typography.bodySmall,
        modifier = Modifier.width(88.dp).semantics { contentDescription = label },
    )
}

/** Inline limits under the alerts that have them. */
@Composable
private fun LimitsFor(id: String, limits: NotifierLimits, update: (NotifierLimits) -> Unit) {
    val small = MaterialTheme.typography.labelSmall
    when (id) {
        "stuck" -> LimitRow { Text("After", style = small); LimitInput("Stuck after minutes", limits.stuckMinutes.toLong(), { update(limits.copy(stuckMinutes = it.toInt())) }); Text("min without a report", style = small) }
        "idle" -> LimitRow { Text("After", style = small); LimitInput("No actions minutes", limits.idleMinutes.toLong(), { update(limits.copy(idleMinutes = it.toInt())) }); Text("min without actions", style = small) }
        "deaths" -> LimitRow {
            LimitInput("Deaths count", limits.deaths.count.toLong(), { update(limits.copy(deaths = Burst(it.toInt(), limits.deaths.minutes))) })
            Text("deaths within", style = small)
            LimitInput("Deaths window minutes", limits.deaths.minutes.toLong(), { update(limits.copy(deaths = Burst(limits.deaths.count, it.toInt()))) })
            Text("min", style = small)
        }
        "errors" -> LimitRow {
            LimitInput("Errors count", limits.errors.count.toLong(), { update(limits.copy(errors = Burst(it.toInt(), limits.errors.minutes))) })
            Text("errors within", style = small)
            LimitInput("Errors window minutes", limits.errors.minutes.toLong(), { update(limits.copy(errors = Burst(limits.errors.count, it.toInt()))) })
            Text("min", style = small)
        }
        "rare" -> Column(modifier = Modifier.semantics { contentDescription = "Rare drop rule" }) {
            val rare = limits.rare
            for ((mode, label) in listOf("chance" to "Drop chance under a threshold", "value" to "Worth at least a gold value", "both" to "Both (rare and valuable)")) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.selectable(selected = rare.mode == mode, onClick = { update(limits.copy(rare = rare.copy(mode = mode))) })) {
                    RadioButton(selected = rare.mode == mode, onClick = null)
                    Text(label, style = small, modifier = Modifier.padding(start = 6.dp))
                }
            }
            if (rare.mode != "value") LimitRow { Text("Drop chance under 1 in", style = small); LimitInput("Rare drop chance one in", rare.chanceOneIn, { update(limits.copy(rare = rare.copy(chanceOneIn = it))) }, 110.dp) }
            if (rare.mode != "chance") LimitRow { Text("Worth at least", style = small); LimitInput("Rare drop minimum gold", rare.minGold, { update(limits.copy(rare = rare.copy(minGold = it))) }, 130.dp); Text("gold", style = small) }
        }
    }
}
