package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.BankMark
import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.model.InventoryEntry
import com.partyconsole.companion.model.Sprite
import com.partyconsole.companion.ui.itemicon.MarkBadgeOverlay
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import com.partyconsole.companion.ui.itemicon.markBadgeFor

/** Inventory grid - real sprite icons (cross-referenced from the merchant
 *  catalog by item id) with bank/merchant mark badges overlaid, matching
 *  the web dashboard's own inventory-panel.tsx look instead of a plain
 *  text list. [onItemTap] opens the bottom item-action panel. */
@Composable
fun InventorySection(
    items: List<InventoryEntry?>,
    merchantMarks: List<BankMark> = emptyList(),
    bankMarks: List<BankMark> = emptyList(),
    catalogFor: (String) -> CatalogItem? = { null },
    onItemTap: (Int, InventoryEntry?) -> Unit = { _, _ -> },
) {
    SectionCard(title = "Inventory") {
        if (items.isEmpty()) {
            Text("No inventory data yet.", style = MaterialTheme.typography.bodySmall)
            return@SectionCard
        }
        LazyVerticalGrid(
            columns = GridCells.Fixed(5),
            contentPadding = PaddingValues(4.dp),
            modifier = Modifier.fillMaxWidth().height(80.dp * ((items.size + 4) / 5)),
        ) {
            items(items.size) { index ->
                val entry = items[index]
                InventoryCell(
                    entry = entry,
                    sprite = entry?.let { catalogFor(it.item.name)?.sprite },
                    badge = markBadgeFor(index, merchantMarks, bankMarks),
                    onClick = { onItemTap(index, entry) },
                )
            }
        }
    }
}

@Composable
private fun InventoryCell(
    entry: InventoryEntry?,
    sprite: Sprite?,
    badge: com.partyconsole.companion.ui.itemicon.MarkBadgeInfo?,
    onClick: () -> Unit,
) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth().padding(2.dp)) {
        Box(modifier = Modifier.fillMaxWidth()) {
            SpriteIcon(sprite, size = 56.dp, modifier = Modifier.fillMaxWidth())
            entry?.item?.level?.let {
                Text(
                    "+$it",
                    modifier = Modifier.padding(2.dp),
                    style = MaterialTheme.typography.labelSmall,
                )
            }
            entry?.item?.q?.let {
                if (it > 1) Text(
                    "x$it",
                    modifier = Modifier.padding(2.dp).align(Alignment.TopEnd),
                    style = MaterialTheme.typography.labelSmall,
                )
            }
            badge?.let {
                MarkBadgeOverlay(it, modifier = Modifier.align(Alignment.BottomCenter))
            }
        }
    }
}
