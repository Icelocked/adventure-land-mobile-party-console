package com.partyconsole.companion.ui.merchant

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
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
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** One merchant setting's busy/error state - each dashboard setting is its
 *  own mutation with its own inline error. */
private class Setting {
    var busy by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
}

@Composable
private fun rememberSetting(viewModel: PartyViewModel): Pair<Setting, (suspend () -> ApiResult<*>, () -> Unit) -> Unit> {
    val setting = remember { Setting() }
    val scope = rememberCoroutineScope()
    return setting to { request, onSuccess ->
        scope.launch {
            setting.busy = true
            setting.error = null
            val result = request()
            setting.busy = false
            if (result is ApiResult.Failure) setting.error = result.message.ifBlank { "Request failed" } else {
                viewModel.refreshDynamicStateNow()
                onSuccess()
            }
        }
    }
}

@Composable
private fun SettingBox(title: String? = null, error: String?, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().border(BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), RoundedCornerShape(6.dp)).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        title?.let { Text(it.uppercase(), style = MaterialTheme.typography.labelMedium) }
        content()
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    }
}

@Composable
private fun Help(text: String) = Text(text, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

/** Merchant settings: bank sorting, upgrade buy batch, stand location,
 *  delivery/withdrawal trips, and the gold and item collection thresholds. */
@Composable
fun MerchantSettings(viewModel: PartyViewModel) {
    Column(modifier = Modifier.padding(start = 12.dp, top = 4.dp, bottom = 4.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        BankSortSetting(viewModel)
        BuyUpgradeBatchSetting(viewModel)
        StandLocationSetting(viewModel)
        TripSetting(viewModel, "deliveries")
        TripSetting(viewModel, "withdrawals")
        ThresholdSettings(viewModel)
    }
}

/** Bank sorting (settings mode). */
@Composable
private fun BankSortSetting(viewModel: PartyViewModel) {
    val state by viewModel.dynamicState.collectAsState()
    val (setting, run) = rememberSetting(viewModel)
    val mode = state.bankSortMode ?: "automatic"
    SettingBox("Bank sorting", setting.error) {
        for ((value, label) in listOf("automatic" to "Sort every bank visit", "request" to "Request sorting in bank window")) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                RadioButton(selected = mode == value, enabled = !setting.busy, onClick = { run({ viewModel.api.setBankSortMode(value) }, {}) })
                Text(label, style = MaterialTheme.typography.bodySmall)
            }
        }
        Help("Compatible stacks are always combined during bank visits. This setting controls item ordering.")
    }
}

/** Upgrade buy batch. */
@Composable
private fun BuyUpgradeBatchSetting(viewModel: PartyViewModel) {
    val state by viewModel.dynamicState.collectAsState()
    val value = state.buyUpgradeBatchSize ?: 1
    var draft by remember { mutableStateOf(value.toString()) }
    LaunchedEffect(value) { draft = value.toString() }
    val (setting, run) = rememberSetting(viewModel)
    val count = draft.toIntOrNull()
    val valid = count != null && count in 1..42
    SettingBox(null, setting.error) {
        Text("Maximum number to buy at once for upgrading", style = MaterialTheme.typography.bodySmall)
        Help(
            "Default: 1. Buys up to this many items and their starting-tier scrolls per batch, within available space and order limits. " +
                "Higher-tier scrolls are bought as needed. Every purchased item is finished, so a batch can produce extra target-level items.",
        )
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(value = draft, onValueChange = { draft = it }, singleLine = true, modifier = Modifier.weight(1f))
            Button(enabled = valid && !setting.busy, onClick = { run({ viewModel.api.post("config", JsonObject(mapOf("buyUpgradeBatchSize" to JsonPrimitive(count!!)))) }, {}) }) { Text("Apply") }
        }
    }
}

/** Stand location. */
@Composable
private fun StandLocationSetting(viewModel: PartyViewModel) {
    val state by viewModel.dynamicState.collectAsState()
    val location = state.merchantStandLocation
    fun format(value: Double?) = value?.let { if (it % 1.0 == 0.0) it.toLong().toString() else it.toString() }.orEmpty()
    var x by remember { mutableStateOf(format(location?.x)) }
    var y by remember { mutableStateOf(format(location?.y)) }
    LaunchedEffect(location?.x, location?.y) {
        x = format(location?.x)
        y = format(location?.y)
    }
    val (setting, run) = rememberSetting(viewModel)
    val valid = x.toDoubleOrNull()?.isFinite() == true && y.toDoubleOrNull()?.isFinite() == true
    SettingBox("Merchant stand location", setting.error) {
        Help("Main map coordinates to return to when opening the stand. The saved position is checked against map obstacles.")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(value = x, onValueChange = { x = it }, label = { Text("Stand X") }, singleLine = true, modifier = Modifier.weight(1f))
            OutlinedTextField(value = y, onValueChange = { y = it }, label = { Text("Stand Y") }, singleLine = true, modifier = Modifier.weight(1f))
        }
        Button(enabled = valid && !setting.busy, onClick = {
            run({
                viewModel.api.post("merchant/stand-location", JsonObject(mapOf("map" to JsonPrimitive("main"), "x" to JsonPrimitive(x.toDouble()), "y" to JsonPrimitive(y.toDouble()))))
            }, {})
        }) { Text("Save stand location") }
    }
}

/** Delivery / withdrawal trips. */
@Composable
private fun TripSetting(viewModel: PartyViewModel, kind: String) {
    val state by viewModel.dynamicState.collectAsState()
    val enabled = state.merchantAutomations[kind] != false
    var pendingChecked by remember { mutableStateOf<Boolean?>(null) }
    val (setting, run) = rememberSetting(viewModel)
    SettingBox(null, setting.error) {
        val checked = if (kind == "withdrawals") pendingChecked ?: enabled else enabled
        fun change(next: Boolean) {
            if (kind == "withdrawals") pendingChecked = next
            run({ viewModel.api.saveRoutinePriorities(emptyMap(), mapOf(kind to next)) }, { pendingChecked = null })
        }
        // The label toggles too.
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.toggleable(value = checked, enabled = !setting.busy, role = Role.Checkbox, onValueChange = ::change),
        ) {
            Checkbox(checked = checked, enabled = !setting.busy, onCheckedChange = null)
            Text(if (kind == "deliveries") "Marked deliveries create merchant jobs" else "Marked withdrawals create merchant jobs", style = MaterialTheme.typography.bodySmall)
        }
        Help(
            if (kind == "deliveries") {
                "When disabled, the merchant completes marked deliveries when visiting the party for another reason, such as item collection. " +
                    "It will not make a trip for deliveries alone unless you use Send to party or send the merchant to a specific character."
            } else {
                "When disabled, marked withdrawals wait until the merchant visits the bank for another reason. " +
                    "When enabled, pending withdrawal marks create a bank trip at the Marked withdrawals routine priority."
            },
        )
        if (setting.error != null) pendingChecked = null
    }
}

/** The gold and item collection thresholds, validated and re-synced from the
 *  server while untouched. */
@Composable
private fun ThresholdSettings(viewModel: PartyViewModel) {
    val state by viewModel.dynamicState.collectAsState()
    var gold by remember { mutableStateOf(state.threshold.toString()) }
    var slots by remember { mutableStateOf(state.itemCollectionThreshold.toString()) }
    var goldDirty by remember { mutableStateOf(false) }
    var slotsDirty by remember { mutableStateOf(false) }
    LaunchedEffect(state.threshold) { if (!goldDirty) gold = state.threshold.toString() }
    LaunchedEffect(state.itemCollectionThreshold) { if (!slotsDirty) slots = state.itemCollectionThreshold.toString() }
    val (goldSetting, runGold) = rememberSetting(viewModel)
    val (slotsSetting, runSlots) = rememberSetting(viewModel)
    SettingBox("Automatic gold collection", goldSetting.error) {
        Help("Send the merchant when any active character carries more than this amount.")
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(value = gold, onValueChange = { goldDirty = true; gold = it.filter(Char::isDigit) }, label = { Text("Collect above (gold)") }, singleLine = true, modifier = Modifier.weight(1f))
            Button(enabled = !goldSetting.busy, onClick = {
                val n = gold.toLongOrNull()
                if (n == null || n < 0) goldSetting.error = "Enter a non-negative whole number"
                else runGold({ viewModel.api.setThresholds(n, null) }, { goldDirty = false })
            }) { Text("Apply") }
        }
    }
    SettingBox("Automatic item collection", slotsSetting.error) {
        Help(
            "Start a collection trip when one party member has this many marked inventory slots. Smaller pickups run only while the merchant is within 200 units. " +
                "Queued pickups and retries recheck this rule. NPC-sale marks count toward this threshold. Manual visits and other merchant jobs still collect immediately.",
        )
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(value = slots, onValueChange = { slotsDirty = true; slots = it.filter(Char::isDigit) }, label = { Text("Marked slots required (1-42)") }, singleLine = true, modifier = Modifier.weight(1f))
            Button(enabled = !slotsSetting.busy, onClick = {
                val value = slots.toIntOrNull()
                if (value == null || value !in 1..42) slotsSetting.error = "Use an item-slot threshold from 1 to 42"
                else runSlots({ viewModel.api.setThresholds(null, value) }, { slotsDirty = false })
            }) { Text("Apply") }
        }
    }
}
