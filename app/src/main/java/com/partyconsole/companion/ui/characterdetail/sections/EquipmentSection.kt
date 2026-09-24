package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.model.EquippedEntry
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import com.partyconsole.companion.ui.itemicon.displayName

/** Equipment grid - real sprite icons per slot (cross-referenced from the
 *  merchant catalog by item id), matching the web dashboard's own
 *  equipment.tsx look. [onSlotTap] opens the bottom item-action panel. */
@Composable
fun EquipmentSection(
    slots: Map<String, EquippedEntry?>,
    catalogFor: (String) -> CatalogItem? = { null },
    onSlotTap: (String, EquippedEntry?) -> Unit = { _, _ -> },
) {
    SectionCard(title = "Equipment") {
        if (slots.isEmpty()) {
            Text("No equipment data yet.", style = MaterialTheme.typography.bodySmall)
            return@SectionCard
        }
        LazyVerticalGrid(
            columns = GridCells.Fixed(2),
            contentPadding = PaddingValues(4.dp),
            modifier = Modifier.fillMaxWidth().height(88.dp * ((slots.size + 1) / 2)),
        ) {
            items(slots.entries.toList()) { (slotName, entry) ->
                EquipmentCard(
                    slotName = slotName,
                    entry = entry,
                    catalogFor = catalogFor,
                    onClick = { onSlotTap(slotName, entry) },
                )
            }
        }
    }
}

@Composable
private fun EquipmentCard(slotName: String, entry: EquippedEntry?, catalogFor: (String) -> CatalogItem?, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth().padding(6.dp)) {
        Row(modifier = Modifier.padding(8.dp)) {
            SpriteIcon(entry?.let { catalogFor(it.item.name)?.sprite }, size = 40.dp)
            Column(modifier = Modifier.padding(start = 8.dp)) {
                Text(slotName, style = MaterialTheme.typography.labelMedium)
                if (entry == null) {
                    Text("empty", style = MaterialTheme.typography.bodySmall)
                } else {
                    Text(displayName(entry.item.name, catalogFor), style = MaterialTheme.typography.bodySmall, maxLines = 1)
                    entry.item.level?.let { Text("+$it", style = MaterialTheme.typography.bodySmall) }
                }
            }
        }
    }
}
