package com.partyconsole.companion.ui.account

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedIconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.partyconsole.companion.data.Domain
import com.partyconsole.companion.domain.automaticCommerceRuleKey
import com.partyconsole.companion.domain.upgradeEstimate
import com.partyconsole.companion.model.CraftMaterial
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.MerchantBuyItem
import com.partyconsole.companion.model.MerchantCraftRecipe
import com.partyconsole.companion.model.MerchantExchangeItem
import com.partyconsole.companion.model.MerchantExchangeLine
import com.partyconsole.companion.model.MerchantOrderBuyLine
import com.partyconsole.companion.model.MerchantOrderCraftLine
import com.partyconsole.companion.model.Sprite
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.network.CommandResult
import com.partyconsole.companion.ui.DomainInterest
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.components.ExchangeMarkControls
import com.partyconsole.companion.ui.components.ExchangeMarkMode
import com.partyconsole.companion.ui.components.ExchangeRewardTile
import com.partyconsole.companion.ui.components.ExchangeRewardTileData
import com.partyconsole.companion.ui.itemdetail.ExchangeAdd
import com.partyconsole.companion.ui.itemdetail.ItemDetailBrowser
import com.partyconsole.companion.ui.itemdetail.inventoryCounts
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

private val MODES = listOf("buy", "craft", "exchange")

// merchant-commerce-dialog.tsx: quantities are capped at 9999.
private fun capQuantity(value: String): Int = minOf(9999, value.filter(Char::isDigit).take(6).toIntOrNull() ?: 0)

/** merchant-commerce-dialog.tsx submit's catch: the message plus each 409 `missing` entry. */
private fun orderError(result: ApiResult.Failure): String {
    val missing = (result.body?.get("missing") as? JsonArray)?.mapNotNull { it as? JsonObject }.orEmpty()
    fun s(o: JsonObject, k: String) = (o[k] as? JsonPrimitive)?.content
    return result.message.ifEmpty { "Could not queue order" } +
        missing.joinToString("") { " · ${s(it, "id")} +${s(it, "level")?.toDoubleOrNull()?.toInt() ?: 0}: ${s(it, "required")} required, ${s(it, "available")} available" }
}

private data class BuyLine(val quantity: Int, val level: Int)
// party-merchant-commerce-dialog.tsx: the item-details header's source.
private data class Inspecting(val id: String, val level: Int, val exchangeAdd: ExchangeAdd? = null, val source: String = "Exchange catalog")

/** merchant-commerce-dialog.tsx (the PWA's MerchantCommerceScreen.tsx) as
 *  its own screen: Buy (cart with target levels and the 90%-confidence
 *  budget), Craft (materials owned / to buy, the recipe preview, the
 *  aggregate availability gate) and Exchange (currency choices grouped,
 *  box/table results as reward tiles with their automatic rules, "Mark
 *  multiple"). */
@Composable
fun MerchantCommerceScreen(viewModel: PartyViewModel, initialMode: String, onBack: () -> Unit) {
    var mode by remember { mutableStateOf(if (initialMode in MODES) initialMode else "buy") }
    val state by viewModel.dynamicState.collectAsState()
    val characters by viewModel.characters.collectAsState()
    val scope = rememberCoroutineScope()
    val catalog = state.merchantCatalog
    // party-merchant-commerce-dialog.tsx: usePanelModel(base, { inventory: true, bank: true }).
    DomainInterest(viewModel, Domain.BANK)

    var search by remember { mutableStateOf("") }
    var buyCart by remember { mutableStateOf<Map<String, BuyLine>>(emptyMap()) }
    var craftCart by remember { mutableStateOf<Map<String, Int>>(emptyMap()) }
    var exchangeCart by remember { mutableStateOf<Map<String, Int>>(emptyMap()) }
    var submitting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var inspecting by remember { mutableStateOf<Inspecting?>(null) }

    val owned = remember(characters, state.bank, state.bankbois) { inventoryCounts(characters, state.bank, byLevel = true, bankbois = state.bankbois) }
    val buyableById = remember(catalog) { catalog?.buyable.orEmpty().associateBy { it.id } }
    fun setMode(next: String) {
        // merchant-commerce-dialog.tsx: switching mode clears the search.
        if (next != mode) search = ""
        mode = next
    }
    fun submit(action: suspend () -> ApiResult<CommandResult>, clear: () -> Unit) = scope.launch {
        submitting = true
        error = null
        val result = action()
        submitting = false
        when (result) {
            is ApiResult.Failure -> error = orderError(result)
            is ApiResult.Success -> {
                clear()
                viewModel.refreshDynamicStateNow()
                onBack()
            }
        }
    }

    val title = when (mode) { "craft" -> "Merchant crafting"; "exchange" -> "Exchange"; else -> "Merchant shopping" }
    AccountScreenScaffold(title, onBack) {
        Column(modifier = Modifier.fillMaxSize()) {
            Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState())) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(start = 12.dp, end = 12.dp, top = 4.dp, bottom = 8.dp)) {
                    for (m in MODES) FilterChip(selected = mode == m, onClick = { setMode(m) }, label = { Text(m.replaceFirstChar { it.uppercase() }) })
                }
                Text(
                    when (mode) {
                        "craft" -> "Recipes account for materials held by the active party and in the latest bank snapshot."
                        "exchange" -> "Choose exchange operations backed by the merchant inventory and latest bank snapshot."
                        else -> "Choose anything sold for gold."
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 12.dp),
                )
                OutlinedTextField(search, { search = it }, placeholder = { Text("Search items...") }, singleLine = true, modifier = Modifier.fillMaxWidth().padding(12.dp))
                when (mode) {
                    "buy" -> BuyContent(catalog?.buyable.orEmpty(), search, buyCart, { buyCart = it }) { inspecting = Inspecting(it, 0, source = "Merchant catalog") }
                    "craft" -> CraftContent(catalog?.craftable.orEmpty(), buyableById, owned, search, craftCart, { craftCart = it }) { inspecting = Inspecting(it, 0, source = "Crafting catalog") }
                    else -> ExchangeContent(viewModel, catalog?.exchangeable.orEmpty(), search, exchangeCart, { exchangeCart = it }) { inspecting = it }
                }
            }
            // The sticky submit bar.
            Column(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(bottom = 8.dp)) }
                when (mode) {
                    "buy" -> {
                        val selected = catalog?.buyable.orEmpty().filter { (buyCart[it.id]?.quantity ?: 0) > 0 }
                        Button(enabled = selected.isNotEmpty() && !submitting, modifier = Modifier.fillMaxWidth(), onClick = {
                            val lines = selected.map { item ->
                                val line = buyCart.getValue(item.id)
                                val estimate = upgradeEstimate(item, line.quantity, line.level)
                                MerchantOrderBuyLine(
                                    id = item.id,
                                    quantity = line.quantity,
                                    level = line.level.takeIf { it != 0 },
                                    budget = if (item.upgradeable) estimate.gold else null,
                                    maxAttempts = if (item.upgradeable) estimate.attempts else null,
                                )
                            }
                            submit({ viewModel.api.submitMerchantOrder(lines, emptyList()) }) { buyCart = emptyMap() }
                        }) { Text(if (submitting) "Queuing..." else "Buy all") }
                    }
                    "craft" -> {
                        val recipes = catalog?.craftable.orEmpty()
                        val requirements = craftRequirements(recipes, craftCart)
                        val available = requirements.all { (key, req) -> req.second <= (owned[key] ?: 0) || canPurchaseMaterial(req.first, buyableById) }
                        val selected = recipes.filter { (craftCart[it.id] ?: 0) > 0 }
                        Button(enabled = selected.isNotEmpty() && available && !submitting, modifier = Modifier.fillMaxWidth(), onClick = {
                            val lines = craftCart.filterValues { it > 0 }.map { (id, quantity) -> MerchantOrderCraftLine(id, quantity) }
                            submit({ viewModel.api.submitMerchantOrder(emptyList(), lines) }) { craftCart = emptyMap() }
                        }) { Text(if (submitting) "Queuing..." else "Craft") }
                    }
                    else -> {
                        val exchangeable = catalog?.exchangeable.orEmpty()
                        val exchangeOwned = inventoryCounts(characters.filterValues { it.vitals?.ctype == "merchant" }, state.bank, byLevel = true, bankbois = state.bankbois)
                        val selected = exchangeable.filter { (exchangeCart[it.key] ?: 0) > 0 }
                        val available = selected.all { item -> exchangeRequired(exchangeable, exchangeCart, item.id, item.level) <= (exchangeOwned["${item.id}@${item.level}"] ?: 0) }
                        Button(enabled = selected.isNotEmpty() && available && !submitting, modifier = Modifier.fillMaxWidth(), onClick = {
                            val byKey = exchangeable.associateBy { it.key }
                            val lines = exchangeCart.filterValues { it > 0 }.map { (key, quantity) ->
                                val item = byKey[key]
                                MerchantExchangeLine(id = item?.id ?: key, quantity = quantity, level = item?.level ?: 0, reward = item?.reward)
                            }
                            submit({ viewModel.api.submitExchangeOrder(lines) }) { exchangeCart = emptyMap() }
                        }) { Text(if (submitting) "Queuing..." else "Exchange all") }
                    }
                }
            }
        }
    }
    inspecting?.let { target ->
        InspectSheet(viewModel, target) { inspecting = null }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun InspectSheet(viewModel: PartyViewModel, target: Inspecting, onClose: () -> Unit) {
    val state by viewModel.dynamicState.collectAsState()
    ModalBottomSheet(onDismissRequest = onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp)) {
            ItemDetailBrowser(
                rootItemId = target.id,
                rootLevel = target.level,
                catalog = state.merchantCatalog,
                monsters = state.bestiaryCatalog,
                viewModel = viewModel,
                context = com.partyconsole.companion.ui.itemdetail.ItemDetailContext(target.source, -1),
                exchangeAdd = target.exchangeAdd?.let { add -> ExchangeAdd(add.enabled) { add.onAdd(); onClose() } },
            )
        }
    }
}

@Composable
private fun ItemRow(name: String, sprite: Sprite?, subtitle: String, onInspect: (() -> Unit)?, disabled: Boolean = false, addLabel: String = "Add", subtitleColor: Color = Color.Unspecified, onAdd: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 3.dp).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(6.dp)).padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier.weight(1f).alpha(if (disabled) 0.4f else 1f).clickable(enabled = onInspect != null) { onInspect?.invoke() }.semantics { contentDescription = "Inspect $name" },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SpriteIcon(sprite, size = 36.dp)
            Column(modifier = Modifier.padding(start = 12.dp)) {
                Text(name, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, maxLines = 1)
                Text(subtitle, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = if (subtitleColor == Color.Unspecified) MaterialTheme.colorScheme.onSurfaceVariant else subtitleColor)
            }
        }
        Button(enabled = !disabled, onClick = onAdd) { Text(addLabel) }
    }
}

@Composable
private fun QuantityField(label: String, value: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value, onChange, singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        textStyle = MaterialTheme.typography.labelSmall,
        modifier = Modifier.width(72.dp).semantics { contentDescription = label },
    )
}

@Composable
private fun CartTitle(text: String) {
    Text(text.uppercase(), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 12.dp, top = 12.dp, bottom = 4.dp))
}

// ---------------------------------------------------------------- Buy ----

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BuyContent(catalog: List<MerchantBuyItem>, search: String, cart: Map<String, BuyLine>, setCart: (Map<String, BuyLine>) -> Unit, onInspect: (String) -> Unit) {
    val filtered = catalog.filter { "${it.name} ${it.id}".lowercase().contains(search.lowercase()) }
    val selected = catalog.filter { (cart[it.id]?.quantity ?: 0) > 0 }
    // merchant-commerce-dialog.tsx: estimates, hasEstimatedGold and goldTotal.
    val estimates = selected.associate { it.id to upgradeEstimate(it, cart.getValue(it.id).quantity, cart.getValue(it.id).level) }
    val hasEstimatedGold = selected.any { cart.getValue(it.id).level > 0 && it.upgradeable }
    val goldTotal = selected.sumOf { estimates.getValue(it.id).gold }
    if (filtered.isEmpty()) EmptyState("No buyable items found.")
    for (item in filtered) {
        ItemRow(item.name, item.sprite, "${"%,d".format(item.cost)}g", { onInspect(item.id) }) {
            val old = cart[item.id]
            setCart(cart + (item.id to BuyLine((old?.quantity ?: 0) + 1, old?.level ?: 0)))
        }
    }
    // merchant-commerce-dialog.tsx: the cart panel is always shown.
    CartTitle("Cart")
    Column(modifier = Modifier.padding(horizontal = 12.dp)) {
        if (selected.isEmpty()) Text("Nothing selected.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        for (item in selected) {
            val line = cart.getValue(item.id)
            FlowRow(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SpriteIcon(item.sprite, size = 28.dp)
                Text(item.name, style = MaterialTheme.typography.labelSmall, modifier = Modifier.align(Alignment.CenterVertically))
                QuantityField("${item.name} quantity", line.quantity.toString()) { setCart(cart + (item.id to line.copy(quantity = capQuantity(it)))) }
                if (item.upgradeable) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("TARGET", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(end = 4.dp))
                        QuantityField("${item.name} target level", "+${line.level}") { text ->
                            setCart(cart + (item.id to line.copy(level = (text.filter(Char::isDigit).take(3).toIntOrNull() ?: 0).coerceIn(0, 13))))
                        }
                    }
                }
                TextButton(onClick = { setCart(cart + (item.id to BuyLine(0, 0))) }) { Text("Remove", color = MaterialTheme.colorScheme.error) }
                if (line.level > 0 && item.upgradeable) {
                    val estimate = estimates.getValue(item.id)
                    Text(
                        "90% budget: ${estimate.attempts} base items · " + estimate.scrolls.withIndex().filter { it.value != 0L }.joinToString(" · ") { "${it.value} scroll${it.index}" },
                        color = Color(0xFFC4B5FD),
                        fontFamily = FontFamily.Monospace,
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.fillMaxWidth().padding(start = 36.dp),
                    )
                }
            }
        }
        Text("Gold${if (hasEstimatedGold) " (est)" else ""}: ${"%,d".format(Math.round(goldTotal))}g", color = MaterialTheme.colorScheme.primary, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(top = 8.dp))
    }
}

// -------------------------------------------------------------- Craft ----

private fun canPurchaseMaterial(material: CraftMaterial, buyableById: Map<String, MerchantBuyItem>) = (material.level ?: 0) == 0 && buyableById.containsKey(material.id)

/** material key -> (material, total needed) for the craft cart. */
private fun craftRequirements(recipes: List<MerchantCraftRecipe>, cart: Map<String, Int>): Map<String, Pair<CraftMaterial, Int>> {
    val required = linkedMapOf<String, Pair<CraftMaterial, Int>>()
    for (recipe in recipes) {
        val quantity = cart[recipe.id] ?: 0
        if (quantity <= 0) continue
        for (material in recipe.materials) {
            val key = "${material.id}@${material.level ?: 0}"
            val existing = required[key]
            required[key] = (existing?.first ?: material) to ((existing?.second ?: 0) + material.quantity * quantity)
        }
    }
    return required
}

@Composable
private fun CraftContent(recipes: List<MerchantCraftRecipe>, buyableById: Map<String, MerchantBuyItem>, owned: Map<String, Int>, search: String, cart: Map<String, Int>, setCart: (Map<String, Int>) -> Unit, onInspect: (String) -> Unit) {
    val filtered = recipes.filter { "${it.name} ${it.id}".lowercase().contains(search.lowercase()) }
    val requirements = craftRequirements(recipes, cart)
    fun canAddRecipe(recipe: MerchantCraftRecipe) = recipe.materials.all { material ->
        val key = "${material.id}@${material.level ?: 0}"
        (requirements[key]?.second ?: 0) + material.quantity <= (owned[key] ?: 0) || canPurchaseMaterial(material, buyableById)
    }
    // merchant-commerce-dialog.tsx: ingredientPurchaseCost and additionalRecipeCost.
    val ingredientPurchaseCost = requirements.entries.sumOf { (key, req) -> maxOf(0, req.second - (owned[key] ?: 0)).toLong() * (buyableById[req.first.id]?.cost ?: 0L) }
    fun additionalRecipeCost(recipe: MerchantCraftRecipe) = recipe.cost + recipe.materials.sumOf { material ->
        val key = "${material.id}@${material.level ?: 0}"
        val before = maxOf(0, (requirements[key]?.second ?: 0) - (owned[key] ?: 0))
        val after = maxOf(0, (requirements[key]?.second ?: 0) + material.quantity - (owned[key] ?: 0))
        (after - before).toLong() * (buyableById[material.id]?.cost ?: 0L)
    }
    var previewing by remember { mutableStateOf<String?>(null) }
    val selected = recipes.filter { (cart[it.id] ?: 0) > 0 }
    val goldTotal = selected.sumOf { it.cost * cart.getValue(it.id) } + ingredientPurchaseCost

    if (filtered.isEmpty()) EmptyState("No craftable recipes found.")
    for (recipe in filtered) {
        val open = previewing == recipe.id
        ItemRow(recipe.name, recipe.sprite, "${"%,d".format(recipe.cost)}g + materials", { onInspect(recipe.id) }, disabled = !canAddRecipe(recipe)) {
            setCart(cart + (recipe.id to (cart[recipe.id] ?: 0) + 1))
        }
        // The dashboard's hover preview; a phone has no hover, so it toggles inline.
        TextButton(onClick = { previewing = if (open) null else recipe.id }, modifier = Modifier.padding(start = 8.dp)) {
            Text(if (open) "Hide recipe" else "Complete recipe", color = Color(0xFFC4B5FD), style = MaterialTheme.typography.labelSmall)
        }
        if (open) {
            Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp).border(1.dp, Color(0xFF7C3AED), RoundedCornerShape(6.dp)).padding(10.dp).semantics { contentDescription = "${recipe.name} recipe" }) {
                Text(recipe.name, color = Color(0xFFDDD6FE), fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall)
                Text("COMPLETE RECIPE", color = Color(0xFFC4B5FD), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(bottom = 8.dp))
                for (material in recipe.materials) {
                    val available = owned["${material.id}@${material.level ?: 0}"] ?: 0
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 4.dp)) {
                        SpriteIcon(material.sprite, size = 28.dp)
                        Text("${material.quantity} × ${material.name}" + ((material.level ?: 0).takeIf { it > 0 }?.let { " +$it" } ?: ""), style = MaterialTheme.typography.labelSmall, modifier = Modifier.weight(1f).padding(start = 8.dp))
                        Text(
                            when {
                                available >= material.quantity -> "$available owned"
                                canPurchaseMaterial(material, buyableById) -> "$available owned · buy ${material.quantity - available}"
                                else -> "$available owned · missing"
                            },
                            fontFamily = FontFamily.Monospace,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Text("Next craft: ${"%,d".format(additionalRecipeCost(recipe))}g total", color = Color(0xFFFCD34D), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, modifier = Modifier.fillMaxWidth().padding(top = 8.dp), textAlign = androidx.compose.ui.text.style.TextAlign.End)
            }
        }
    }
    CartTitle("Craft list")
    Column(modifier = Modifier.padding(horizontal = 12.dp)) {
        if (selected.isEmpty()) Text("Nothing selected.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        for (item in selected) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 4.dp)) {
                SpriteIcon(item.sprite, size = 28.dp)
                Text(item.name, style = MaterialTheme.typography.labelSmall, modifier = Modifier.weight(1f))
                QuantityField("${item.name} quantity", cart.getValue(item.id).toString()) { setCart(cart + (item.id to capQuantity(it))) }
                TextButton(onClick = { setCart(cart + (item.id to 0)) }) { Text("Remove", color = MaterialTheme.colorScheme.error) }
            }
        }
        Text("INGREDIENT TOTALS", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
        for ((key, req) in requirements) {
            val available = owned[key] ?: 0
            val ok = req.second <= available || canPurchaseMaterial(req.first, buyableById)
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 4.dp)) {
                SpriteIcon(req.first.sprite, size = 22.dp)
                Text(req.first.name + ((req.first.level ?: 0).takeIf { it > 0 }?.let { " +$it" } ?: ""), style = MaterialTheme.typography.labelSmall, modifier = Modifier.weight(1f).padding(start = 8.dp))
                Text(
                    "${req.second} needed · $available owned" + if (req.second > available && canPurchaseMaterial(req.first, buyableById)) " · buy ${req.second - available}" else "",
                    fontFamily = FontFamily.Monospace,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (ok) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.error,
                )
            }
        }
        Text("Gold: ${"%,d".format(goldTotal)}g", color = MaterialTheme.colorScheme.primary, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(top = 8.dp))
    }
}

// ----------------------------------------------------------- Exchange ----

/** merchant-commerce-dialog.tsx displayedItems: every exchange with a fixed
 *  `reward` groups under one synthetic currency tile with `choices`; box
 *  and table pulls stay their own tiles. */
private data class GroupedExchange(val item: MerchantExchangeItem, val choices: List<MerchantExchangeItem>? = null)

private fun groupExchangeItems(items: List<MerchantExchangeItem>): List<GroupedExchange> {
    val rows = mutableListOf<GroupedExchange>()
    for (item in items) {
        if (item.reward == null) {
            rows += GroupedExchange(item)
            continue
        }
        val index = rows.indexOfFirst { it.choices != null && it.item.id == item.id }
        if (index < 0) {
            rows += GroupedExchange(
                item.copy(key = "${item.id}@choose", name = item.currencyName?.ifEmpty { null } ?: item.id, sprite = item.currencySprite, reward = null, required = 0),
                listOf(item),
            )
        } else {
            rows[index] = rows[index].copy(choices = rows[index].choices!! + item)
        }
    }
    return rows
}

private fun exchangeRequired(exchangeable: List<MerchantExchangeItem>, cart: Map<String, Int>, id: String, level: Int) =
    exchangeable.sumOf { if (it.id == id && it.level == level) it.required * (cart[it.key] ?: 0) else 0 }

private val REWARD_LEVEL = Regex("-(\\d+)$")

@Composable
private fun ExchangeContent(viewModel: PartyViewModel, exchangeable: List<MerchantExchangeItem>, search: String, cart: Map<String, Int>, setCart: (Map<String, Int>) -> Unit, onInspect: (Inspecting) -> Unit) {
    val state by viewModel.dynamicState.collectAsState()
    val characters by viewModel.characters.collectAsState()
    // merchant-commerce-dialog.tsx exchangeOwned: merchant-class characters, the bank and bankbois.
    val exchangeOwned = remember(characters, state.bank, state.bankbois) {
        inventoryCounts(characters.filterValues { it.vitals?.ctype == "merchant" }, state.bank, byLevel = true, bankbois = state.bankbois)
    }
    var selectedExchange by remember { mutableStateOf<GroupedExchange?>(null) }
    val grouped = remember(exchangeable) { groupExchangeItems(exchangeable) }
    val filtered = grouped.filter { "${it.item.name} ${it.item.id}".lowercase().contains(search.lowercase()) }
    val selected = exchangeable.filter { (cart[it.key] ?: 0) > 0 }
    fun add(key: String) = setCart(cart + (key to (cart[key] ?: 0) + 1))

    if (filtered.isEmpty()) EmptyState("No exchange operations available.")
    for (row in filtered) {
        val item = row.item
        val ownedCount = exchangeOwned["${item.id}@${item.level}"] ?: 0
        val enabled = row.choices != null || ownedCount >= item.required * ((cart[item.key] ?: 0) + 1)
        val addOrChoose = { if (row.choices != null) selectedExchange = row else add(item.key) }
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 3.dp).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(6.dp)).padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.weight(1f).clickable { onInspect(Inspecting(item.id, 0, ExchangeAdd(enabled, addOrChoose))) }.semantics { contentDescription = "Inspect ${item.name}" },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SpriteIcon(item.sprite, size = 36.dp)
                Column(modifier = Modifier.padding(start = 12.dp)) {
                    Text(item.name, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, maxLines = 1)
                    Text(if (row.choices != null) "$ownedCount owned" else "${item.required} required · $ownedCount owned", color = Color(0xFFFCD34D), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall)
                }
            }
            OutlinedIconButton(onClick = { selectedExchange = row }, modifier = Modifier.semantics { contentDescription = "Exchange rules for ${item.name}" }) {
                Icon(Icons.Filled.Settings, contentDescription = null)
            }
            Button(enabled = enabled, onClick = addOrChoose) { Text(if (row.choices != null) "Choose" else "Add") }
        }
    }
    // merchant-commerce-dialog.tsx: the cart panel is always shown.
    CartTitle("Exchange cart")
    Column(modifier = Modifier.padding(horizontal = 12.dp)) {
        if (selected.isEmpty()) Text("Nothing selected.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        for (item in selected) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 4.dp)) {
                SpriteIcon(item.sprite, size = 28.dp)
                Text(
                    "${item.name} ${if ((item.rewardQuantity ?: 1) > 1) "× ${item.rewardQuantity}" else ""} · uses ${item.required} ${item.currencyName?.ifEmpty { null } ?: "ea."}",
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.weight(1f),
                )
                QuantityField("${item.name} quantity", cart.getValue(item.key).toString()) { setCart(cart + (item.key to capQuantity(it))) }
                TextButton(onClick = { setCart(cart + (item.key to 0)) }) { Text("Remove", color = MaterialTheme.colorScheme.error) }
            }
        }
    }

    selectedExchange?.let { current ->
        ExchangeDetails(
            viewModel = viewModel,
            current = current,
            exchangeable = exchangeable,
            canAdd = { choice -> exchangeRequired(exchangeable, cart, choice.id, choice.level) + choice.required <= (exchangeOwned["${choice.id}@${choice.level}"] ?: 0) },
            onAdd = { add(it) },
            onSelect = { selectedExchange = it },
            onInspect = { id -> if (state.merchantCatalog?.allItems?.any { it.id == id } == true) onInspect(Inspecting(id, 0)) },
            onClose = { selectedExchange = null },
        )
    }
}

/** merchant-commerce-dialog.tsx's exchange details: the choices or potential
 *  results as reward tiles, "Mark multiple" with the bulk rule controls
 *  (staged drafts saved on Done, discarded on close), and nested drill-down. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ExchangeDetails(
    viewModel: PartyViewModel,
    current: GroupedExchange,
    exchangeable: List<MerchantExchangeItem>,
    canAdd: (MerchantExchangeItem) -> Boolean,
    onAdd: (String) -> Unit,
    onSelect: (GroupedExchange) -> Unit,
    onInspect: (String) -> Unit,
    onClose: () -> Unit,
) {
    val state by viewModel.dynamicState.collectAsState()
    val scope = rememberCoroutineScope()
    val api = viewModel.api
    var marking by remember(current) { mutableStateOf(false) }
    var markMode by remember(current) { mutableStateOf<ExchangeMarkMode?>(null) }
    var drafts by remember(current) { mutableStateOf<Map<String, Triple<String, Int, ExchangeMarkMode>>>(emptyMap()) }
    var savingMarks by remember { mutableStateOf(false) }
    var markError by remember(current) { mutableStateOf<String?>(null) }
    val item = current.item

    // party-merchant-commerce-dialog.tsx onSaveExchangeMarks.
    suspend fun saveDrafts(list: Collection<Triple<String, Int, ExchangeMarkMode>>) {
        val character = state.merchantCharacter ?: error("No merchant is assigned")
        for ((id, level, mode) in list) {
            val target = Item(name = id, level = level)
            val result = when (mode.action) {
                "bank" -> api.itemCommand("auto-item-mark", character, target, null, mapOf("mode" to JsonPrimitive("bank"), "action" to JsonPrimitive("set")))
                "upgrade" -> api.itemCommand("auto-upgrade-mark", character, target, JsonPrimitive(-1), mapOf("tiers" to JsonPrimitive((mode.targetLevel ?: 1) - level)))
                "npc" -> api.autoNpcSale(null, target)
                else -> {
                    val meta = state.merchantCatalog?.allItems?.find { it.id == id }?.meta
                    val price = state.autoStandMarks[automaticCommerceRuleKey(target)]?.price?.takeIf { it > 0 }
                        ?: maxOf(1L, (meta?.definition?.get("g") as? JsonPrimitive)?.content?.toDoubleOrNull()?.toLong() ?: 1L)
                    api.autoStand(target, price)
                }
            }
            if (result is ApiResult.Failure) error(result.message)
        }
        viewModel.refreshDynamicStateNow()
    }
    fun toggleMarking() {
        if (!marking) {
            marking = true
            markError = null
            return
        }
        savingMarks = true
        markError = null
        scope.launch {
            try {
                if (drafts.isNotEmpty()) saveDrafts(drafts.values)
                drafts = emptyMap()
                marking = false
                markMode = null
            } catch (e: Exception) {
                markError = e.message ?: "Could not save exchange rules"
            } finally {
                savingMarks = false
            }
        }
    }
    @Composable
    fun Reward(data: ExchangeRewardTileData) = ExchangeRewardTile(
        viewModel,
        data.copy(
            marking = marking,
            markMode = markMode,
            saving = savingMarks,
            stagedMode = drafts["${data.id}@${data.level}"]?.third,
            onStage = { reward, mode -> drafts = drafts + ("${reward.id}@${reward.level}" to Triple(reward.id, reward.level, mode)) },
        ),
    )

    Dialog(onDismissRequest = { if (!savingMarks) onClose() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        androidx.compose.material3.Surface(modifier = Modifier.fillMaxSize()) {
            Column(modifier = Modifier.fillMaxSize().padding(12.dp).semantics { contentDescription = "Exchange details" }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    SpriteIcon(item.sprite, size = 44.dp)
                    Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
                        Text(item.name, fontWeight = FontWeight.SemiBold, color = Color(0xFFCFFAFE), maxLines = 1)
                        Text((if (current.choices != null) "Choose a reward" else "${item.required} required per exchange").uppercase(), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Color(0xFF67E8F9))
                    }
                    OutlinedIconButton(enabled = !savingMarks, onClick = onClose, modifier = Modifier.semantics { contentDescription = "Close exchange details" }) {
                        Icon(Icons.Filled.Close, contentDescription = null, tint = Color(0xFFFDA4AF))
                    }
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 12.dp)) {
                    OutlinedButton(enabled = !savingMarks, onClick = { toggleMarking() }) { Text(if (marking) "Done" else "Mark multiple") }
                    ExchangeMarkControls(marking, markMode, savingMarks) { markMode = it }
                }
                if (marking) {
                    Text(
                        "${drafts.size} pending changes. Done saves; closing discards." + if (markMode?.action == "stand") " Existing prices are kept; new stand rules use the item gold value." else "",
                        color = Color(0xFFBAE6FD),
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                }
                markError?.let { Text(it, color = Color(0xFFFDA4AF), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp)) }
                Text((if (current.choices != null) "Available rewards" else "Potential results").uppercase(), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Color(0xFF6EE7B7), modifier = Modifier.padding(top = 16.dp))
                Column(modifier = Modifier.weight(1f).padding(top = 8.dp).verticalScroll(rememberScrollState())) {
                    val choices = current.choices
                    if (choices != null) {
                        for (choice in choices) {
                            val rewardId = choice.reward?.replace(REWARD_LEVEL, "") ?: choice.id
                            val rewardLevel = choice.reward?.let { REWARD_LEVEL.find(it)?.groupValues?.get(1)?.toIntOrNull() } ?: 0
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).border(1.dp, Color(0xFF155E75), RoundedCornerShape(4.dp)).padding(8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                Reward(ExchangeRewardTileData(rewardId, rewardLevel, choice.name, choice.rewardQuantity ?: 1, choice.sprite, "100%", { onInspect(rewardId) }))
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    SpriteIcon(choice.currencySprite, size = 24.dp)
                                    Text("× ${choice.required}", color = Color(0xFFFDE68A), style = MaterialTheme.typography.bodySmall)
                                }
                                Box(modifier = Modifier.weight(1f))
                                OutlinedButton(enabled = canAdd(choice), onClick = { onAdd(choice.key) }) { Text("Add") }
                            }
                        }
                    } else {
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            for (result in item.results) {
                                Reward(
                                    ExchangeRewardTileData(
                                        result.id, 0, result.name, result.quantity, result.sprite,
                                        "${java.math.BigDecimal(result.chance * 100).setScale(6, java.math.RoundingMode.HALF_UP).stripTrailingZeros().toPlainString()}%",
                                        {
                                            // Nested exchange drill-down: a result that is itself a box/table pull opens its own rules.
                                            val nested = exchangeable.find { it.reward == null && it.id == result.id && it.level == 0 }
                                            if (nested != null) onSelect(GroupedExchange(nested))
                                            else if (result.kind !in setOf("gold", "shells", "cx", "empty", "open")) onInspect(result.id)
                                        },
                                        kind = result.kind,
                                    ),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
