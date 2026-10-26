package com.partyconsole.companion.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.domain.EMPTY_MARKET_FILTER
import com.partyconsole.companion.domain.MarketFilter
import com.partyconsole.companion.domain.MarketSort
import com.partyconsole.companion.domain.marketFilterJson
import com.partyconsole.companion.domain.parseMarketFilter

private val SORT_LABELS = listOf(MarketSort.NEWEST to "Newest listed", MarketSort.PRICE to "Price, low to high", MarketSort.LEVEL to "Level, high to low")

private data class BoundField(val label: String, val placeholder: String, val get: (MarketFilter) -> Double?, val set: (MarketFilter, Double?) -> MarketFilter)

private val FIELDS = listOf(
    BoundField("Minimum level", "Level from", { it.minLevel }) { f, v -> f.copy(minLevel = v) },
    BoundField("Maximum level", "Level to", { it.maxLevel }) { f, v -> f.copy(maxLevel = v) },
    BoundField("Minimum price", "Price from", { it.minPrice }) { f, v -> f.copy(minPrice = v) },
    BoundField("Maximum price", "Price to", { it.maxPrice }) { f, v -> f.copy(maxPrice = v) },
    BoundField("Minimum tier", "Tier from", { it.minTier }) { f, v -> f.copy(minTier = v) },
    BoundField("Maximum tier", "Tier to", { it.maxTier }) { f, v -> f.copy(maxTier = v) },
)

private fun numberField(value: String): Double? = value.trim().takeIf { it.isNotEmpty() }?.toDoubleOrNull()?.takeIf { it.isFinite() }
private fun numberText(value: Double?): String = value?.let { if (it == Math.floor(it)) it.toLong().toString() else it.toString() }.orEmpty()

/** A per-viewer filter for each tab, kept on this device like the console's
 *  (market-filter-bar.tsx useStoredMarketFilter, key party-market-filter-<tab>).
 *  PWA: web/src/lib/marketRows.ts useStoredMarketFilter. */
@Composable
fun rememberStoredMarketFilter(tab: String): Pair<MarketFilter, (MarketFilter) -> Unit> {
    val prefs = LocalContext.current.getSharedPreferences("ui", android.content.Context.MODE_PRIVATE)
    val filters = remember { mutableStateMapOf<String, MarketFilter>() }
    val filter = filters[tab] ?: runCatching { parseMarketFilter(prefs.getString("party-market-filter-$tab", null)) }.getOrDefault(EMPTY_MARKET_FILTER)
    return filter to { next: MarketFilter ->
        filters[tab] = next
        runCatching { prefs.edit().putString("party-market-filter-$tab", marketFilterJson(next)).apply() }
        Unit
    }
}

/** Keywords, the level, price and tier bounds, the server and the sort.
 *  [servers] lists the realms in the tab's data (serverOptions); All is
 *  always first. PWA: MarketFilterBar.tsx. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MarketFilterBar(filter: MarketFilter, onChange: (MarketFilter) -> Unit, servers: List<String> = emptyList()) {
    // Typed text stays as entered while it parses to the filter's bound.
    val typed = remember { mutableStateMapOf<String, String>() }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        OutlinedTextField(
            value = filter.keywords,
            onValueChange = { onChange(filter.copy(keywords = it)) },
            placeholder = { Text("Keywords") },
            singleLine = true,
            textStyle = MaterialTheme.typography.bodySmall,
            modifier = Modifier.width(160.dp).semantics { contentDescription = "Keywords" },
        )
        for (field in FIELDS) {
            val bound = field.get(filter)
            val text = typed[field.label]?.takeIf { numberField(it) == bound } ?: numberText(bound)
            OutlinedTextField(
                value = text,
                onValueChange = { value ->
                    typed[field.label] = value
                    onChange(field.set(filter, numberField(value)))
                },
                placeholder = { Text(field.placeholder) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                textStyle = MaterialTheme.typography.bodySmall,
                modifier = Modifier.width(110.dp).semantics { contentDescription = field.label },
            )
        }
        Choice("Server", filter.server ?: "All servers", listOf<Pair<String?, String>>(null to "All servers") + servers.map { it to it }) { onChange(filter.copy(server = it)) }
        Choice("Sort market", SORT_LABELS.first { it.first == filter.sort }.second, SORT_LABELS) { onChange(filter.copy(sort = it)) }
        OutlinedButton(onClick = { typed.clear(); onChange(EMPTY_MARKET_FILTER) }) { Text("Clear filter") }
    }
}

/** A select: the current label, opening a menu of the choices. */
@Composable
private fun <T> Choice(label: String, current: String, choices: List<Pair<T, String>>, onSelect: (T) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { open = true }, modifier = Modifier.semantics { contentDescription = "$label: $current" }) { Text("$current ▾", style = MaterialTheme.typography.bodySmall) }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            for ((value, text) in choices) DropdownMenuItem(text = { Text(text) }, onClick = { open = false; onSelect(value) })
        }
    }
}
