package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.CharacterInventory
import com.partyconsole.companion.model.GearSetItem
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.PartyStateDynamic
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import kotlinx.coroutines.launch

// The sets the dashboard's control offers; "gold" exists only server-side.
private val GEAR_SETS = listOf(
    Triple("luck", "Luck", "Worn by the designated tank right before a kill"),
    Triple("tank", "Tank", "Restored after the kill"),
)

private fun member(item: Item?, wanted: GearSetItem) =
    item != null && item.name == wanted.name && item.level == wanted.level && item.p == wanted.p && item.statType == wanted.statType

private data class Completeness(val total: Int, val worn: Int, val carried: Int, val missing: List<String>)

/** Per slot: worn in that slot, carried in the bag (each copy counted once),
 *  or missing. Console: gear-set-control.tsx completeness(). */
private fun completeness(inventory: CharacterInventory, slots: Map<String, GearSetItem>): Completeness {
    val taken = mutableSetOf<Int>()
    val missing = mutableListOf<String>()
    var worn = 0
    var carried = 0
    for ((slot, wanted) in slots) {
        if (member(inventory.slots[slot]?.item, wanted)) {
            worn++
            continue
        }
        val index = inventory.items.withIndex().indexOfFirst { (i, entry) -> i !in taken && member(entry?.item, wanted) }
        if (index >= 0) {
            taken += index
            carried++
        } else {
            missing += slot
        }
    }
    return Completeness(slots.size, worn, carried, missing)
}

/** The console's "Gear sets (n)" popover as an inline group beside the
 *  Leader/Follow/Events chips. Saving captures the worn gear; the server
 *  refuses it (409) without a fresh equipment report, and refuses Equip
 *  (409) for a set that is not saved. PWA: GearSetControl.tsx. */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun GearSetControl(name: String, state: PartyStateDynamic, viewModel: PartyViewModel) {
    val scope = rememberCoroutineScope()
    val characters by viewModel.characters.collectAsState()
    val inventory = characters[name]?.inventory
    var open by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val sets = state.gearSets[name].orEmpty()
    val saved = GEAR_SETS.count { (id) -> sets[id] != null }
    fun update(set: String, action: String) = scope.launch {
        busy = true
        error = null
        when (val result = viewModel.api.gearSet(name, set, action)) {
            is ApiResult.Failure -> error = result.message
            is ApiResult.Success -> viewModel.refreshDynamicStateNow()
        }
        busy = false
    }
    FilterChip(selected = open, onClick = { open = !open }, label = { Text("Gear sets ($saved) ▾") })
    if (!open) return
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Column(
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(4.dp))
            .padding(12.dp)
            .semantics { contentDescription = "Gear sets" },
    ) {
        Text(
            "Sets are saved from the gear $name is wearing, every slot included. Equip wears a saved set from the bag (never the elixir) and pauses the tank's " +
                "automatic return to its tank set for 10 minutes, so you can adjust and save again. Set members are never taken by automatic compound, upgrade or " +
                "cleanout rules.",
            color = muted,
            style = MaterialTheme.typography.labelSmall,
        )
        for ((id, label, purpose) in GEAR_SETS) {
            val set = sets[id]
            val pieces = if (set != null && inventory != null) completeness(inventory, set.slots) else null
            Column(
                verticalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier.fillMaxWidth()
                    .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(4.dp))
                    .padding(8.dp)
                    .semantics { contentDescription = "$label gear set" },
            ) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(label, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelMedium)
                    Text(purpose, color = muted, style = MaterialTheme.typography.labelSmall)
                }
                Text(
                    when {
                        set == null -> "Not saved"
                        pieces == null -> "Loading inventory…"
                        else -> "${pieces.worn + pieces.carried}/${pieces.total} pieces available (${pieces.worn} worn, ${pieces.carried} in bag)" +
                            if (pieces.missing.isNotEmpty()) " · missing ${pieces.missing.joinToString(", ")}" else ""
                    },
                    style = MaterialTheme.typography.labelSmall,
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = { update(id, "save") },
                        enabled = !busy,
                        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF059669)),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFD1FAE5)),
                    ) { Text("Save current gear as $label") }
                    if (set != null) {
                        OutlinedButton(
                            onClick = { update(id, "equip") },
                            enabled = !busy,
                            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF0284C7)),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFE0F2FE)),
                        ) { Text("Equip $label") }
                        OutlinedButton(
                            onClick = { update(id, "clear") },
                            enabled = !busy,
                            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFBE123C)),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFFECDD3)),
                        ) { Text("Clear") }
                    }
                }
            }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    }
}
