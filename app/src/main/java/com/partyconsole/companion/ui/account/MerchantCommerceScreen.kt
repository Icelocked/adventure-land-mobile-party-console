package com.partyconsole.companion.ui.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
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
import com.partyconsole.companion.model.CraftMaterial
import com.partyconsole.companion.model.MerchantBuyItem
import com.partyconsole.companion.model.MerchantCraftRecipe
import com.partyconsole.companion.model.MerchantExchangeItem
import com.partyconsole.companion.model.MerchantExchangeLine
import com.partyconsole.companion.model.MerchantOrderBuyLine
import com.partyconsole.companion.model.MerchantOrderCraftLine
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.itemdetail.inventoryCounts
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import kotlinx.coroutines.launch

private enum class CommerceMode { BUY, CRAFT, EXCHANGE }

/** merchant-commerce-dialog.tsx ported as its own screen (a dialog with a
 *  cart doesn't fit a phone the way it fits a desktop popup) - Buy/Craft/
 *  Exchange were entirely unbuilt before this (this screen used to say
 *  "coming soon" here). One deliberate scope cut from the dashboard
 *  version: the per-item "90% budget" upgrade-scroll cost estimate is a
 *  3000-iteration Monte Carlo simulation the server re-runs and
 *  OVERWRITES anyway before queuing an upgradeable buy (runtime/
 *  coordinator/http/merchant-order.ts's estimate()) - so it's display-
 *  only on the dashboard, and skipping it here costs no real
 *  functionality, just a preview number. Buy-mode cost below is a simple
 *  cost×quantity total instead. */
@Composable
fun MerchantCommerceScreen(viewModel: PartyViewModel, initialMode: String, onBack: () -> Unit) {
    var mode by remember { mutableStateOf(if (initialMode == "craft") CommerceMode.CRAFT else if (initialMode == "exchange") CommerceMode.EXCHANGE else CommerceMode.BUY) }
    val dynamicState by viewModel.dynamicState.collectAsState()
    val characters by viewModel.characters.collectAsState()
    val scope = rememberCoroutineScope()
    val catalog = dynamicState.merchantCatalog

    var search by remember { mutableStateOf("") }
    var buyCart by remember { mutableStateOf<Map<String, Pair<Int, Int>>>(emptyMap()) } // id -> (quantity, level)
    var craftCart by remember { mutableStateOf<Map<String, Int>>(emptyMap()) }
    var exchangeCart by remember { mutableStateOf<Map<String, Int>>(emptyMap()) }
    var choosing by remember { mutableStateOf<GroupedExchangeItem?>(null) }
    var submitting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val owned = remember(characters, dynamicState.bank) { inventoryCounts(characters, dynamicState.bank, byLevel = true) }
    val buyableById = remember(catalog) { (catalog?.buyable ?: emptyList()).associateBy { it.id } }

    val title = when (mode) {
        CommerceMode.BUY -> "Merchant shopping"
        CommerceMode.CRAFT -> "Merchant crafting"
        CommerceMode.EXCHANGE -> "Merchant exchanges"
    }

    AccountScreenScaffold(title, onBack, onRefresh = { scope.launch { viewModel.refreshDynamicStateNow() } }) {
      // AccountScreenScaffold's `content` lambda has no ColumnScope of its
      // own (it's `@Composable () -> Unit`, not `ColumnScope.() -> Unit`) -
      // an explicit Column here is what makes `Modifier.weight(1f)` below
      // (on the LazyColumn, so the search bar/tabs above it and the
      // SubmitBar below it don't get pushed off-screen) resolve at all.
      Column(modifier = Modifier.fillMaxSize()) {
        Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(selected = mode == CommerceMode.BUY, onClick = { mode = CommerceMode.BUY }, label = { Text("Buy") })
            FilterChip(selected = mode == CommerceMode.CRAFT, onClick = { mode = CommerceMode.CRAFT }, label = { Text("Craft") })
            FilterChip(selected = mode == CommerceMode.EXCHANGE, onClick = { mode = CommerceMode.EXCHANGE }, label = { Text("Exchange") })
        }
        OutlinedTextField(
            value = search,
            onValueChange = { search = it },
            label = { Text("Search items...") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
        )

        when (mode) {
            CommerceMode.BUY -> {
                val filtered = (catalog?.buyable ?: emptyList()).filter { "${it.name} ${it.id}".contains(search, ignoreCase = true) }
                val selected = (catalog?.buyable ?: emptyList()).filter { (buyCart[it.id]?.first ?: 0) > 0 }
                val goldTotal = selected.sumOf { it.cost * (buyCart[it.id]?.first ?: 0) }
                LazyColumn(modifier = Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 12.dp)) {
                    items(filtered) { item ->
                        ItemRow(item.name, item.sprite, "${"%,d".format(item.cost)}g") {
                            val current = buyCart[item.id] ?: (0 to 0)
                            buyCart = buyCart + (item.id to (current.first + 1 to current.second))
                        }
                    }
                    if (selected.isNotEmpty()) {
                        item {
                            Text("Cart", style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 12.dp))
                        }
                        items(selected) { item ->
                            val (quantity, level) = buyCart[item.id] ?: (0 to 0)
                            BuyCartRow(item, quantity, level,
                                onQuantity = { q -> buyCart = buyCart + (item.id to (q to level)) },
                                onLevel = { l -> buyCart = buyCart + (item.id to (quantity to l)) },
                                onRemove = { buyCart = buyCart - item.id },
                            )
                        }
                        item {
                            Text("Gold: ${"%,d".format(goldTotal)}g", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                }
                SubmitBar("Buy all", selected.isEmpty(), submitting, error) {
                    scope.launch {
                        submitting = true
                        error = null
                        val lines = selected.map { item ->
                            val (quantity, level) = buyCart[item.id] ?: (0 to 0)
                            MerchantOrderBuyLine(item.id, quantity, if (level > 0) level else null)
                        }
                        when (val result = viewModel.api.submitMerchantOrder(lines, emptyList())) {
                            is ApiResult.Failure -> error = result.message
                            is ApiResult.Success -> {
                                buyCart = emptyMap()
                                viewModel.refreshDynamicStateNow()
                                onBack()
                            }
                        }
                        submitting = false
                    }
                }
            }
            CommerceMode.CRAFT -> {
                val recipes = catalog?.craftable ?: emptyList()
                val filtered = recipes.filter { "${it.name} ${it.id}".contains(search, ignoreCase = true) }
                fun canPurchaseMaterial(material: CraftMaterial) = material.level == 0 && buyableById.containsKey(material.id)
                val requirements = remember(craftCart, recipes) {
                    val required = linkedMapOf<String, Pair<CraftMaterial, Int>>()
                    recipes.forEach { recipe ->
                        val quantity = craftCart[recipe.id] ?: 0
                        if (quantity <= 0) return@forEach
                        recipe.materials.forEach { material ->
                            val key = "${material.id}@${material.level}"
                            val (existingMaterial, existingQuantity) = required[key] ?: (material to 0)
                            required[key] = existingMaterial to (existingQuantity + material.quantity * quantity)
                        }
                    }
                    required
                }
                fun canAddRecipe(recipe: MerchantCraftRecipe): Boolean = recipe.materials.all { material ->
                    val key = "${material.id}@${material.level}"
                    val needed = (requirements[key]?.second ?: 0) + material.quantity
                    needed <= (owned[key] ?: 0) || canPurchaseMaterial(material)
                }
                val selected = recipes.filter { (craftCart[it.id] ?: 0) > 0 }
                LazyColumn(modifier = Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 12.dp)) {
                    item {
                        Text(
                            "Recipes account for materials held by the active party and the latest bank snapshot.",
                            style = MaterialTheme.typography.labelSmall,
                        )
                    }
                    items(filtered) { recipe ->
                        val enabled = canAddRecipe(recipe)
                        ItemRow(recipe.name, recipe.sprite, "${"%,d".format(recipe.cost)}g + materials", enabled = enabled) {
                            craftCart = craftCart + (recipe.id to ((craftCart[recipe.id] ?: 0) + 1))
                        }
                    }
                    if (selected.isNotEmpty()) {
                        item { Text("Craft list", style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 12.dp)) }
                        items(selected) { recipe ->
                            CraftCartRow(recipe, craftCart[recipe.id] ?: 0,
                                onQuantity = { q -> craftCart = craftCart + (recipe.id to q) },
                                onRemove = { craftCart = craftCart - recipe.id },
                            )
                        }
                        item {
                            Text("Ingredient totals", style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 8.dp))
                            Column {
                                requirements.forEach { (key, pair) ->
                                    val (material, quantity) = pair
                                    val available = owned[key] ?: 0
                                    val ok = quantity <= available || canPurchaseMaterial(material)
                                    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                                        SpriteIcon(material.sprite, size = 22.dp)
                                        Text(
                                            "${material.name}${if (material.level > 0) " +${material.level}" else ""}",
                                            style = MaterialTheme.typography.bodySmall,
                                            modifier = Modifier.weight(1f).padding(start = 6.dp),
                                            maxLines = 1,
                                        )
                                        Text(
                                            "$quantity needed · $available owned${if (quantity > available && canPurchaseMaterial(material)) " · buy ${quantity - available}" else ""}",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = if (ok) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.error,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
                SubmitBar("Craft", selected.isEmpty(), submitting, error) {
                    scope.launch {
                        submitting = true
                        error = null
                        val lines = selected.map { MerchantOrderCraftLine(it.id, craftCart[it.id] ?: 0) }
                        when (val result = viewModel.api.submitMerchantOrder(emptyList(), lines)) {
                            is ApiResult.Failure -> error = result.message
                            is ApiResult.Success -> {
                                craftCart = emptyMap()
                                viewModel.refreshDynamicStateNow()
                                onBack()
                            }
                        }
                        submitting = false
                    }
                }
            }
            CommerceMode.EXCHANGE -> {
                val exchangeable = catalog?.exchangeable ?: emptyList()
                val merchantOnly = remember(characters) { characters.filterValues { it.vitals?.ctype == "merchant" } }
                val exchangeOwned = remember(merchantOnly, dynamicState.bank) { inventoryCounts(merchantOnly, dynamicState.bank, byLevel = true) }
                val grouped = remember(exchangeable) { groupExchangeItems(exchangeable) }
                val filtered = grouped.filter { "${it.name} ${it.id}".contains(search, ignoreCase = true) }
                val byKey = remember(exchangeable) { exchangeable.associateBy { it.key } }
                val selected = exchangeCart.keys.mapNotNull { byKey[it] }.filter { (exchangeCart[it.key] ?: 0) > 0 }
                fun exchangeRequired(id: String, level: Int): Int = exchangeable.sumOf { if (it.id == id && it.level == level) it.required * (exchangeCart[it.key] ?: 0) else 0 }

                LazyColumn(modifier = Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 12.dp)) {
                    item {
                        Text(
                            "Backed by the merchant's own inventory and the latest bank snapshot.",
                            style = MaterialTheme.typography.labelSmall,
                        )
                    }
                    items(filtered) { item ->
                        val isChoice = item.choices != null
                        val ownedCount = exchangeOwned["${item.id}@${item.level}"] ?: 0
                        val enabled = isChoice || ownedCount >= item.required * ((exchangeCart[item.key] ?: 0) + 1)
                        ItemRow(
                            item.name,
                            item.sprite,
                            if (isChoice) "$ownedCount owned" else "${item.required} required · $ownedCount owned",
                            enabled = enabled,
                            addLabel = if (isChoice) "Choose" else "Add",
                        ) {
                            if (isChoice) choosing = item else exchangeCart = exchangeCart + (item.key to ((exchangeCart[item.key] ?: 0) + 1))
                        }
                    }
                    if (selected.isNotEmpty()) {
                        item { Text("Exchange cart", style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 12.dp)) }
                        items(selected) { item ->
                            ExchangeCartRow(item, exchangeCart[item.key] ?: 0,
                                onQuantity = { q -> exchangeCart = exchangeCart + (item.key to q) },
                                onRemove = { exchangeCart = exchangeCart - item.key },
                            )
                        }
                    }
                }
                SubmitBar("Exchange all", selected.isEmpty(), submitting, error) {
                    scope.launch {
                        submitting = true
                        error = null
                        val lines = selected.map { MerchantExchangeLine(it.id, exchangeCart[it.key] ?: 0, it.level, it.reward) }
                        when (val result = viewModel.api.submitExchangeOrder(lines)) {
                            is ApiResult.Failure -> error = result.message
                            is ApiResult.Success -> {
                                exchangeCart = emptyMap()
                                viewModel.refreshDynamicStateNow()
                                onBack()
                            }
                        }
                        submitting = false
                    }
                }

                choosing?.let { item ->
                    ExchangeChoiceOverlay(
                        item = item,
                        exchangeOwned = exchangeOwned,
                        exchangeRequired = ::exchangeRequired,
                        onClose = { choosing = null },
                        onAdd = { key ->
                            exchangeCart = exchangeCart + (key to ((exchangeCart[key] ?: 0) + 1))
                            choosing = null
                        },
                    )
                }
            }
        }
      }
    }
}

@Composable
private fun ItemRow(name: String, sprite: com.partyconsole.companion.model.Sprite?, subtitle: String, enabled: Boolean = true, addLabel: String = "Add", onAdd: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
        Row(modifier = Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            SpriteIcon(sprite, size = 36.dp)
            Column(modifier = Modifier.weight(1f).padding(start = 10.dp)) {
                Text(name, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
                Text(subtitle, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Button(onClick = onAdd, enabled = enabled) { Text(addLabel) }
        }
    }
}

@Composable
private fun BuyCartRow(item: MerchantBuyItem, quantity: Int, level: Int, onQuantity: (Int) -> Unit, onLevel: (Int) -> Unit, onRemove: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        SpriteIcon(item.sprite, size = 28.dp)
        Text(item.name, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f).padding(start = 6.dp), maxLines = 1)
        OutlinedTextField(
            value = quantity.toString(),
            onValueChange = { new -> new.toIntOrNull()?.let { onQuantity(it.coerceAtLeast(0)) } },
            singleLine = true,
            modifier = Modifier.width(64.dp),
        )
        if (item.upgradeable) {
            OutlinedTextField(
                value = "+$level",
                onValueChange = { new -> new.removePrefix("+").toIntOrNull()?.let { onLevel(it.coerceIn(0, 13)) } },
                singleLine = true,
                modifier = Modifier.width(64.dp).padding(start = 4.dp),
            )
        }
        IconButton(onClick = onRemove) { Icon(Icons.Filled.Close, contentDescription = "Remove") }
    }
}

@Composable
private fun CraftCartRow(recipe: MerchantCraftRecipe, quantity: Int, onQuantity: (Int) -> Unit, onRemove: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        SpriteIcon(recipe.sprite, size = 28.dp)
        Text(recipe.name, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f).padding(start = 6.dp), maxLines = 1)
        OutlinedTextField(
            value = quantity.toString(),
            onValueChange = { new -> new.toIntOrNull()?.let { onQuantity(it.coerceAtLeast(0)) } },
            singleLine = true,
            modifier = Modifier.width(64.dp),
        )
        IconButton(onClick = onRemove) { Icon(Icons.Filled.Close, contentDescription = "Remove") }
    }
}

@Composable
private fun ExchangeCartRow(item: MerchantExchangeItem, quantity: Int, onQuantity: (Int) -> Unit, onRemove: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        SpriteIcon(item.sprite, size = 28.dp)
        Text(
            "${item.name}${if ((item.rewardQuantity ?: 1) > 1) " ×${item.rewardQuantity}" else ""} · uses ${item.required} ${item.currencyName ?: "ea."}",
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.weight(1f).padding(start = 6.dp),
            maxLines = 1,
        )
        OutlinedTextField(
            value = quantity.toString(),
            onValueChange = { new -> new.toIntOrNull()?.let { onQuantity(it.coerceAtLeast(0)) } },
            singleLine = true,
            modifier = Modifier.width(64.dp),
        )
        IconButton(onClick = onRemove) { Icon(Icons.Filled.Close, contentDescription = "Remove") }
    }
}

@Composable
private fun SubmitBar(label: String, disabled: Boolean, submitting: Boolean, error: String?, onSubmit: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(bottom = 6.dp)) }
        Button(onClick = onSubmit, enabled = !disabled && !submitting, modifier = Modifier.fillMaxWidth()) {
            Text(if (submitting) "Queuing..." else label)
        }
    }
}

/** The dashboard groups every exchangeable entry that has a `reward` (a
 *  straight "pay N of this currency, get Y back" exchange) under one
 *  synthetic "currency" tile keyed by the currency item's own id, so a
 *  currency with several possible rewards (shells, cx, anniversary
 *  tokens, ...) shows once with a "Choose" button instead of once per
 *  reward. Entries WITHOUT `reward` (box/table pulls with a `results`
 *  chance table) are never grouped - they're their own row. This grouping
 *  is UI-only, not part of the wire shape, hence the local wrapper class
 *  here rather than adding `choices` to the shared MerchantExchangeItem
 *  model. */
private data class GroupedExchangeItem(
    val key: String,
    val id: String,
    val level: Int,
    val name: String,
    val cost: Long,
    val required: Int,
    val sprite: com.partyconsole.companion.model.Sprite?,
    val results: List<com.partyconsole.companion.model.MerchantExchangeResult>,
    val reward: String?,
    val rewardQuantity: Int?,
    val currencyName: String?,
    val currencySprite: com.partyconsole.companion.model.Sprite?,
    val choices: List<MerchantExchangeItem>?,
)

private fun groupExchangeItems(items: List<MerchantExchangeItem>): List<GroupedExchangeItem> {
    val rows = mutableListOf<GroupedExchangeItem>()
    val currencyIndex = mutableMapOf<String, Int>()
    for (item in items) {
        if (item.reward == null) {
            rows.add(
                GroupedExchangeItem(
                    item.key, item.id, item.level, item.name, item.cost, item.required, item.sprite,
                    item.results, item.reward, item.rewardQuantity, item.currencyName, item.currencySprite, null,
                ),
            )
            continue
        }
        val index = currencyIndex[item.id]
        if (index == null) {
            currencyIndex[item.id] = rows.size
            rows.add(
                GroupedExchangeItem(
                    "${item.id}@choose", item.id, item.level, item.currencyName ?: item.id, item.cost, 0,
                    item.currencySprite, emptyList(), null, null, item.currencyName, item.currencySprite, mutableListOf(item),
                ),
            )
        } else {
            @Suppress("UNCHECKED_CAST")
            (rows[index].choices as MutableList<MerchantExchangeItem>).add(item)
        }
    }
    return rows
}

@Composable
private fun ExchangeChoiceOverlay(
    item: GroupedExchangeItem,
    exchangeOwned: Map<String, Int>,
    exchangeRequired: (String, Int) -> Int,
    onClose: () -> Unit,
    onAdd: (String) -> Unit,
) {
    // A plain Box/Column here would just be another element in the
    // enclosing screen's own linear layout (Compose has no CSS-style
    // `position: fixed`) - Dialog is what actually gets this drawn as a
    // real full-screen overlay above everything else, matching the web
    // version's `fixed inset-0` sub-view.
    androidx.compose.ui.window.Dialog(
        onDismissRequest = onClose,
        properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false),
    ) {
        androidx.compose.material3.Surface(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize().padding(12.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    SpriteIcon(item.sprite, size = 32.dp)
                    Text(item.name, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(start = 8.dp))
                }
                IconButton(onClick = onClose) { Icon(Icons.Filled.Close, contentDescription = "Close") }
            }
            Text("Available rewards", style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 12.dp, bottom = 4.dp))
            LazyColumn(modifier = Modifier.weight(1f)) {
                items(item.choices.orEmpty()) { choice ->
                    val disabled = exchangeRequired(choice.id, choice.level) + choice.required > (exchangeOwned["${choice.id}@${choice.level}"] ?: 0)
                    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                        Row(modifier = Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                            SpriteIcon(choice.sprite, size = 32.dp)
                            Text(
                                "${choice.name}${if ((choice.rewardQuantity ?: 1) > 1) " ×${choice.rewardQuantity}" else ""}",
                                style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier.weight(1f).padding(start = 8.dp),
                                maxLines = 1,
                            )
                            SpriteIcon(choice.currencySprite, size = 20.dp)
                            Text("× ${choice.required}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(end = 8.dp, start = 2.dp))
                            Button(onClick = { onAdd(choice.key) }, enabled = !disabled) { Text("Add") }
                        }
                    }
                }
            }
            if (item.results.isNotEmpty()) {
                Text("Potential results", style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 8.dp, bottom = 4.dp))
                LazyColumn(modifier = Modifier.weight(1f)) {
                    items(item.results) { result ->
                        Card(modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                            Row(modifier = Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                                SpriteIcon(result.sprite, size = 32.dp)
                                Column(modifier = Modifier.weight(1f).padding(start = 8.dp)) {
                                    Text("${result.name}${if (result.quantity > 1) " ×${result.quantity}" else ""}", style = MaterialTheme.typography.bodySmall, maxLines = 1)
                                    val chancePercent = result.chance * 100
                                    Text(
                                        if (chancePercent < 0.01) "%.4f%%".format(chancePercent) else "%.2f%%".format(chancePercent),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.primary,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
        }
    }
}
