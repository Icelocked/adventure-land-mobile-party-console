package com.partyconsole.companion.ui.account

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.itemdetail.ItemDetailBrowser
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import kotlinx.coroutines.launch

/** Equipment/item catalog browse (equipment-catalog-dialog.tsx) - tapping
 *  a row opens the same full item-details view (ui/itemdetail/
 *  ItemDetailBrowser.kt) inventory/equipment items use, read-only (no
 *  action list, since there's no live instance/slot to act on here). */
@Composable
fun CatalogScreen(viewModel: PartyViewModel, onBack: () -> Unit) {
    val state by viewModel.dynamicState.collectAsState()
    var query by remember { mutableStateOf("") }
    val items = state.merchantCatalog?.allItems.orEmpty()
        .filter { query.isBlank() || it.name.contains(query, ignoreCase = true) }
    val scope = rememberCoroutineScope()
    var inspecting by remember { mutableStateOf<CatalogItem?>(null) }

    AccountScreenScaffold("Catalog", onBack, onRefresh = { scope.launch { viewModel.refreshDynamicStateNow() } }) {
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            label = { Text("Search") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(12.dp),
        )
        if (items.isEmpty()) {
            EmptyState("No catalog data yet.")
        } else {
            LazyColumn(contentPadding = PaddingValues(horizontal = 12.dp)) {
                items(items, key = { it.id }) { CatalogRow(it, onClick = { inspecting = it }) }
            }
        }
    }

    inspecting?.let { item ->
        CatalogItemSheet(item = item, state.merchantCatalog, state.bestiaryCatalog, onDismiss = { inspecting = null })
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CatalogItemSheet(
    item: CatalogItem,
    catalog: com.partyconsole.companion.model.MerchantCatalog?,
    monsters: List<com.partyconsole.companion.model.BestiaryMonster>,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState()) {
        ItemDetailBrowser(
            rootItemId = item.id,
            rootLevel = 0,
            catalog = catalog,
            monsters = monsters,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).verticalScroll(rememberScrollState()),
        )
    }
}

@Composable
private fun CatalogRow(item: CatalogItem, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Row(modifier = Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            SpriteIcon(item.sprite, size = 32.dp)
            Text(item.name, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(start = 8.dp))
            item.maxLevel?.let {
                if (it > 0) Text(" (max +$it)", style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}
