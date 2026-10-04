package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** Shared shell for every scrollable-body section on the character detail
 *  screen (formation, equipment, inventory, restock, merchant queue) - one
 *  consistent title + card look instead of each section styling its own. */
@Composable
fun SectionCard(title: String, content: @Composable () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            androidx.compose.foundation.layout.Spacer(modifier = Modifier.padding(top = 4.dp))
            content()
        }
    }
}

/** "No data yet" for inside a [SectionCard] - the account screens' own
 *  EmptyState (bodyLarge + 24dp padding) is sized for a whole empty screen
 *  and looks out of place inside one card on an already-dense character
 *  detail screen; this is the shared, lighter equivalent for that context,
 *  used by EquipmentSection/InventorySection instead of each rolling its
 *  own near-identical Text call. */
@Composable
fun SectionEmptyState(message: String) {
    Text(message, style = MaterialTheme.typography.bodySmall)
}

/** Shown beside any control seeded from server settings until the first
 *  state arrives - the control stays disabled until then so it can't save
 *  defaults over the server's real values (the PWA's ConfigLoadingNote). */
@Composable
fun ConfigLoadingNote(loaded: Boolean) {
    if (!loaded) Text("Loading settings…", style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 4.dp))
}
