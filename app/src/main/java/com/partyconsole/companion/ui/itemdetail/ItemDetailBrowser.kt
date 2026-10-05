package com.partyconsole.companion.ui.itemdetail

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.domain.standIsFull
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.itempanel.GearComparisonSheet
import com.partyconsole.companion.ui.components.TracktrixBonusList
import kotlinx.serialization.json.JsonObject
import com.partyconsole.companion.model.BestiaryMonster
import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.model.ItemCraftUse
import com.partyconsole.companion.model.ItemMeta
import com.partyconsole.companion.model.ItemRecipe
import com.partyconsole.companion.model.ItemSetInfo
import com.partyconsole.companion.model.MerchantCatalog
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.roundToInt

/** Mobile take on party-console's "left-click an item" details dialog
 *  (item-details.tsx, the PWA's ItemDetailBrowser.tsx) - same underlying
 *  data (ItemMeta via the merchant catalog), as a header + a row of chips
 *  for only the sections that apply to THIS item. Tapping a related
 *  item/material/set-piece/exchange result or a drop's monster drills into
 *  ITS details with a back button, mirroring desktop's trail navigation. */
private sealed interface DetailTarget {
    data class ItemTarget(val id: String, val level: Int = 0) : DetailTarget
    data class MonsterTarget(val id: String) : DetailTarget
}

/** item-details.tsx's exchange "Add" (enabled when the merchant has enough). */
data class ExchangeAdd(val enabled: Boolean, val onAdd: () -> Unit)

/** item-details.tsx header: whose item and where ("Ranger1 · slot 3"). */
data class ItemDetailContext(val character: String, val slot: Int)

@Composable
fun ItemDetailBrowser(
    rootItemId: String,
    rootLevel: Int,
    catalog: MerchantCatalog?,
    monsters: List<BestiaryMonster>,
    modifier: Modifier = Modifier,
    rootStatType: String? = null,
    rootGift: Boolean = false,
    rootExpires: JsonElement? = null,
    // The live instance's meta, merged over the catalog's (use-party-console.tsx detailMeta).
    rootMeta: ItemMeta? = null,
    context: ItemDetailContext? = null,
    // item-details.tsx "Add to stand": only for the merchant's inventory or the bank.
    onAddStand: (() -> Unit)? = null,
    // Party state for Compare, the stand capacity and Tracktrix bonuses.
    viewModel: PartyViewModel? = null,
    // item-details.tsx: the exchange catalog's "Add" for the inspected exchange.
    exchangeAdd: ExchangeAdd? = null,
) {
    var trail by remember(rootItemId, rootLevel) {
        mutableStateOf(listOf<DetailTarget>(DetailTarget.ItemTarget(rootItemId, rootLevel)))
    }
    val current = trail.last()
    Column(modifier = modifier) {
        if (trail.size > 1) {
            TextButton(onClick = { trail = trail.dropLast(1) }, contentPadding = PaddingValues(vertical = 4.dp)) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, modifier = Modifier.height(16.dp))
                Spacer(Modifier.width(4.dp))
                Text("Back", style = MaterialTheme.typography.labelMedium)
            }
        }
        when (val target = current) {
            is DetailTarget.ItemTarget -> ItemDetailContent(
                target = target,
                catalog = catalog,
                isRoot = target.id == rootItemId && target.level == rootLevel && trail.size == 1,
                rootStatType = rootStatType,
                rootGift = rootGift,
                rootExpires = rootExpires,
                rootMeta = rootMeta,
                context = if (trail.size == 1) context else null,
                onAddStand = if (trail.size == 1) onAddStand else null,
                viewModel = viewModel,
                onNavigateItem = { id, level -> trail = trail + DetailTarget.ItemTarget(id, level) },
                onNavigateMonster = { id -> trail = trail + DetailTarget.MonsterTarget(id) },
            )
            is DetailTarget.MonsterTarget -> {
                val monster = monsters.find { it.id == target.id }
                if (monster != null && viewModel != null) {
                    com.partyconsole.companion.ui.components.MonsterDetail(viewModel, monster, onInspectDrop = { id -> trail = trail + DetailTarget.ItemTarget(id, 0) })
                } else MonsterDetailContent(monster = monster, onNavigateItem = { id, level -> trail = trail + DetailTarget.ItemTarget(id, level) })
            }
        }
        if (exchangeAdd != null && trail.size == 1) {
            androidx.compose.material3.Button(
                enabled = exchangeAdd.enabled,
                onClick = exchangeAdd.onAdd,
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
            ) { Text("Add") }
        }
    }
}

@Composable
private fun ItemDetailContent(
    target: DetailTarget.ItemTarget,
    catalog: MerchantCatalog?,
    isRoot: Boolean,
    rootStatType: String?,
    rootGift: Boolean,
    rootExpires: JsonElement?,
    rootMeta: ItemMeta?,
    context: ItemDetailContext?,
    onAddStand: (() -> Unit)?,
    viewModel: PartyViewModel?,
    onNavigateItem: (String, Int) -> Unit,
    onNavigateMonster: (String) -> Unit,
) {
    val catalogItem = remember(catalog, target.id) { catalog?.allItems?.find { it.id == target.id } }
    // Reset per navigated item (the content isn't remounted on navigation).
    var previewLevel by remember(target.id, target.level) { mutableStateOf(target.level) }
    // item-details.tsx: the exchange sections follow the preview-level slider.
    val exchanges = remember(catalog, target.id, previewLevel) { exchangeSections(target.id, previewLevel, catalog?.exchangeable.orEmpty()) }
    if (catalogItem == null) {
        Text("No catalog data for \"${target.id}\" yet.", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(vertical = 16.dp))
        return
    }
    val meta = if (isRoot) detailMeta(catalogItem.meta, rootMeta) else catalogItem.meta
    val world = meta?.world
    val explanation = (meta?.definition?.get("explanation") as? JsonPrimitive)?.takeIf { it.isString }?.content
    val emptyState = remember { kotlinx.coroutines.flow.MutableStateFlow(com.partyconsole.companion.model.PartyStateDynamic()) }
    val state by (viewModel?.dynamicState ?: emptyState).collectAsState()
    val emptyCharacters = remember { kotlinx.coroutines.flow.MutableStateFlow(emptyMap<String, com.partyconsole.companion.model.CharacterState>()) }
    val characters by (viewModel?.characters ?: emptyCharacters).collectAsState()
    val emptyDiagnostics = remember { kotlinx.coroutines.flow.MutableStateFlow(emptyMap<String, com.partyconsole.companion.model.CharacterDiagnostics>()) }
    val diagnostics by (viewModel?.characterDetails ?: emptyDiagnostics).collectAsState()
    // stand-capacity.tsx standIsFull.
    val standFull = standIsFull(state.standListings, state.standBids)
    val partyNames = characters.keys.toList()
    val comparable = viewModel != null && isEquipment(meta?.definition)
    // null: closed; "": choosing a character; else choosing that character's slot.
    var comparePicker by remember(target.id) { mutableStateOf<String?>(null) }
    var comparing by remember(target.id) { mutableStateOf<Pair<String, String?>?>(null) }
    val tracktrixItem = target.id == "tracker" || target.id == "supercomputer"
    var addingWtb by remember(target.id) { mutableStateOf(false) }

    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp, bottom = 8.dp)) {
        SpriteIcon(catalogItem.sprite, size = 48.dp)
        Text(
            catalogItem.name + if (target.level > 0) " +${target.level}" else "",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(start = 10.dp),
        )
    }
    context?.let { Text("${it.character} · slot ${it.slot}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(bottom = 8.dp)) }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 8.dp)) {
        if (onAddStand != null && context != null && context.slot >= 0) {
            OutlinedButton(onClick = onAddStand, enabled = !standFull) { Text("Add to stand") }
        }
        if (viewModel != null) OutlinedButton(onClick = { addingWtb = true }) { Text("Add to WTB") }
    }
    if (context != null && tracktrixItem && characters[context.character] != null) {
        TracktrixBonusList(diagnostics[context.character]?.tracktrix as? JsonObject)
    }
    if (!explanation.isNullOrBlank()) {
        Text(explanation, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(bottom = 8.dp))
    }

    val tabs = buildList {
        add("Overview")
        if (world?.set != null) add("Set bonus")
        if (world?.recipe != null) add("Craftable")
        if (!world?.usedIn.isNullOrEmpty()) add("Ingredient in")
        if (exchanges.prices.isNotEmpty() || exchanges.rewards.isNotEmpty() || exchanges.sources.isNotEmpty()) add("Exchange")
        if (!world?.drops.isNullOrEmpty()) add("Drops")
    }
    var selectedTab by remember(target.id, target.level) { mutableStateOf(tabs.first()) }
    val activeTab = if (selectedTab in tabs) selectedTab else tabs.first()

    if (tabs.size > 1) {
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(bottom = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            for (tab in tabs) {
                FilterChip(selected = tab == activeTab, onClick = { selectedTab = tab }, label = { Text(tab) })
            }
        }
    }

    if (activeTab == "Overview" && comparable && (meta?.upgradeable == true || meta?.compoundable == true)) {
        OutlinedButton(onClick = { comparePicker = if (comparePicker == null) "" else null }) { Text("Compare") }
        val picking = comparePicker
        if (picking != null) {
            Column(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp).border(1.dp, Color(0xFF155E75), RoundedCornerShape(6.dp)).padding(8.dp)) {
                if (picking.isEmpty()) {
                    Text("COMPARE +$previewLevel FOR", style = MaterialTheme.typography.labelSmall, color = Color(0xFF22D3EE))
                    for (name in partyNames) {
                        val ctype = characters[name]?.vitals?.ctype.orEmpty()
                        Row(
                            modifier = Modifier.fillMaxWidth().clickable {
                                val slots = comparisonSlotsFor(meta, ctype)
                                if (slots.size > 1) comparePicker = name
                                else { comparePicker = null; comparing = name to slots.firstOrNull() }
                            }.padding(horizontal = 8.dp, vertical = 10.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(name, style = MaterialTheme.typography.bodySmall)
                            Text(ctype.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    // item-details.tsx "From catalog": this item at the preview level becomes A.
                    OutlinedButton(
                        onClick = {
                            comparePicker = null
                            val item = com.partyconsole.companion.model.Item(name = target.id, level = previewLevel, statType = if (isRoot) rootStatType?.ifEmpty { null } else null)
                            val properties = propertiesAtLevel(meta, item, previewLevel, item.statType).mapValues { kotlinx.serialization.json.JsonPrimitive(it.value) }
                            viewModel?.catalogComparison?.value = com.partyconsole.companion.domain.ComparisonSource(context?.slot ?: -1, item, meta?.copy(properties = properties))
                            viewModel?.navigate("account/catalog")
                        },
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    ) { Text("From catalog", color = Color(0xFFCFFAFE)) }
                } else {
                    TextButton(onClick = { comparePicker = "" }) { Text("← $picking · Choose equipment slot", style = MaterialTheme.typography.labelSmall) }
                    for (slot in comparisonSlotsFor(meta, characters[picking]?.vitals?.ctype.orEmpty())) {
                        val equipped = characters[picking]?.inventory?.slots?.get(slot)
                        Row(
                            modifier = Modifier.fillMaxWidth().clickable { comparing = picking to slot; comparePicker = null }.padding(horizontal = 8.dp, vertical = 10.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(comparisonSlotLabel(slot), style = MaterialTheme.typography.bodySmall)
                            Text(
                                equipped?.let { e -> (e.meta?.definition?.get("name") as? JsonPrimitive)?.content ?: catalog?.allItems?.find { it.id == e.item.name }?.name ?: e.item.name } ?: "Empty",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                            )
                        }
                    }
                }
            }
        }
    }

    when (activeTab) {
        "Overview" -> OverviewSection(
            meta = meta,
            actualLevel = target.level,
            previewLevel = previewLevel,
            onPreviewLevelChange = { previewLevel = it },
            statType = if (isRoot) rootStatType else null,
            gift = if (isRoot) rootGift else false,
            expires = if (isRoot) rootExpires else null,
        )
        "Set bonus" -> world?.set?.let { SetBonusSection(it, target.id, onNavigateItem) }
        "Craftable" -> world?.recipe?.let { CraftableSection(it, onNavigateItem) }
        "Ingredient in" -> world?.usedIn?.let { IngredientInSection(it, onNavigateItem) }
        "Exchange" -> ExchangeSection(
            target.id,
            box = (meta?.definition?.get("type") as? JsonPrimitive)?.content == "box" || target.id.contains("box", ignoreCase = true),
            exchanges = exchanges,
            onNavigateItem = onNavigateItem,
        )
        "Drops" -> world?.drops?.let { DropsSection(it, onNavigateMonster) }
    }

    if (addingWtb && viewModel != null) {
        val catalogLookup = { id: String -> catalog?.allItems?.find { it.id == id } }
        com.partyconsole.companion.ui.components.WtbDialog(
            viewModel,
            com.partyconsole.companion.model.Item(name = target.id, level = previewLevel),
            meta,
            catalogLookup,
            catalog?.buyable.orEmpty(),
            state.standPriceHistory[target.id],
            state.standBids[target.id],
            onClose = { addingWtb = false },
        )
    }
    val comparison = comparing
    if (comparison != null && viewModel != null) {
        GearComparisonSheet(
            item = com.partyconsole.companion.model.Item(name = target.id, level = previewLevel, statType = if (isRoot) rootStatType else null),
            meta = meta,
            characterName = comparison.first,
            viewModel = viewModel,
            slot = comparison.second,
            onClose = { comparing = null },
        )
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(top = 6.dp, bottom = 4.dp),
    )
}

@Composable
private fun PriceCard(label: String, value: String, modifier: Modifier = Modifier) {
    Card(modifier = modifier) {
        Column(modifier = Modifier.padding(10.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun OverviewSection(
    meta: ItemMeta?,
    actualLevel: Int,
    previewLevel: Int,
    onPreviewLevelChange: (Int) -> Unit,
    statType: String?,
    gift: Boolean,
    expires: JsonElement?,
) {
    Column {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp)) {
            val buyPrice = definitionNumber(meta, "g")
            PriceCard(
                label = "Buy from NPC",
                value = if (meta?.buyable == true && previewLevel == 0 && buyPrice != null) "${"%,d".format(buyPrice.toLong())}g" else "unavailable",
                modifier = Modifier.weight(1f),
            )
            PriceCard(
                label = "Sell to NPC",
                value = "${"%,d".format(npcSaleValue(previewLevel, gift, expires, meta))}g",
                modifier = Modifier.weight(1f),
            )
        }

        val classes = meta?.usage?.classes.orEmpty()
        if (classes.isNotEmpty()) {
            SectionLabel("Eligible classes")
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                for (cls in classes) {
                    AssistChip(onClick = {}, label = { Text(cls.name + (cls.hands?.let { " · ${it}H" } ?: "")) })
                }
            }
            val hands = meta?.usage?.hands.orEmpty()
            if (hands.isNotEmpty()) {
                Text(
                    "Hands required: ${hands.joinToString(" or ")}" + if (hands.size > 1) " depending on class" else "",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }

        val maxLevel = itemMaximumLevel(meta)
        if (maxLevel > 0) {
            SectionLabel("Level stat preview")
            Text(
                "Preview only - the item itself is unchanged.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Slider(
                value = previewLevel.toFloat(),
                onValueChange = { onPreviewLevelChange(it.roundToInt()) },
                valueRange = 0f..maxLevel.toFloat(),
                steps = (maxLevel - 1).coerceAtLeast(0),
            )
            Text(
                "+$previewLevel" + if (previewLevel == actualLevel) " · current" else "",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        }

        SectionLabel("Item stats")
        val defType = definitionString(meta, "type")
        val rows = buildStatRows(meta, actualLevel, previewLevel, statType)
        if (rows.isEmpty()) {
            Text("No stat data.", style = MaterialTheme.typography.bodySmall)
        } else {
            for (row in rows) {
                Row(modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(
                        row.key.replace('_', ' '),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(formatStatValue(row.key, row.value, defType), style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

private fun statSummary(stats: Map<String, JsonElement>): String = stats.entries.joinToString(" · ") { (key, value) ->
    val num = (value as? JsonPrimitive)?.content?.toDoubleOrNull()
    val text = if (num != null) (if (num > 0) "+" else "") + formatStatValue(key, value, null) else formatStatValue(key, value, null)
    "${key.replace('_', ' ')} $text"
}

@Composable
private fun RelatedItemRow(name: String, sprite: com.partyconsole.companion.model.Sprite?, detail: String, highlighted: Boolean = false, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
        colors = if (highlighted) {
            androidx.compose.material3.CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
        } else {
            androidx.compose.material3.CardDefaults.cardColors()
        },
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(8.dp)) {
            SpriteIcon(sprite, size = 32.dp)
            Column(modifier = Modifier.padding(start = 8.dp).weight(1f)) {
                Text(name, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                if (detail.isNotEmpty()) {
                    Text(detail, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun SetBonusSection(set: ItemSetInfo, currentId: String, onNavigateItem: (String, Int) -> Unit) {
    Column {
        Text("Set bonus · ${set.name}", style = MaterialTheme.typography.titleSmall)
        set.explanation?.takeIf { it.isNotBlank() }?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp, bottom = 8.dp))
        }
        for (item in set.items) {
            RelatedItemRow(
                name = (if (item.quantity > 1) "${item.quantity} × " else "") + item.name,
                sprite = item.sprite,
                detail = "",
                highlighted = item.id == currentId,
                onClick = { onNavigateItem(item.id, 0) },
            )
        }
        Spacer(Modifier.height(8.dp))
        for (bonus in set.bonuses) {
            Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Text(
                    "${bonus.pieces} pieces",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.width(80.dp),
                )
                Text(statSummary(bonus.stats), style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun CraftableSection(recipe: ItemRecipe, onNavigateItem: (String, Int) -> Unit) {
    Column {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Craftable", style = MaterialTheme.typography.titleSmall)
            Text("${"%,d".format(recipe.cost)}g fee", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
        }
        recipe.quest?.takeIf { it.isNotBlank() }?.let {
            Text("Requires quest: $it", style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 2.dp))
        }
        Spacer(Modifier.height(6.dp))
        for (material in recipe.materials) {
            RelatedItemRow(
                name = "${material.quantity} × ${material.name}" + if (material.level > 0) " +${material.level}" else "",
                sprite = material.sprite,
                detail = material.drops.joinToString(" · ") { "${it.monsterName} ${formatDropRate(it)}" },
                onClick = { onNavigateItem(material.id, material.level) },
            )
        }
    }
}

@Composable
private fun IngredientInSection(usedIn: List<ItemCraftUse>, onNavigateItem: (String, Int) -> Unit) {
    Column {
        Text("Ingredient in", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(bottom = 6.dp))
        for (use in usedIn) {
            RelatedItemRow(
                name = use.name,
                sprite = use.sprite,
                detail = "Uses ${use.quantity} ×" + (if (use.level > 0) " at +${use.level}" else "") + " · ${"%,d".format(use.cost)}g craft fee",
                onClick = { onNavigateItem(use.id, 0) },
            )
        }
    }
}

private val NON_INSPECTABLE_KINDS = setOf("empty", "gold", "shells", "cx", "cxbundle")

/** item-exchange-details.tsx: price, rewards and sources. */
@Composable
private fun ExchangeSection(id: String, box: Boolean, exchanges: ExchangeSections, onNavigateItem: (String, Int) -> Unit) {
    fun levelSuffix(level: Int) = if (level != 0) " +$level" else ""
    Column {
        if (exchanges.prices.isNotEmpty()) {
            Text("Exchange price", style = MaterialTheme.typography.titleSmall)
            for (entry in exchanges.prices) {
                RelatedItemRow(
                    name = "${"%,d".format(entry.required)} × ${entry.currencyName?.takeIf { it.isNotEmpty() } ?: entry.id}${levelSuffix(entry.level)}",
                    sprite = entry.currencySprite,
                    detail = "for ${entry.rewardQuantity?.takeIf { it != 0 } ?: 1}",
                    onClick = { onNavigateItem(entry.id, entry.level) },
                )
            }
            Spacer(Modifier.height(8.dp))
        }
        if (exchanges.rewards.isNotEmpty()) {
            Text(if (box) "Rewards" else "Exchange reward", style = MaterialTheme.typography.titleSmall)
            for (entry in exchanges.rewards) {
                Text(
                    "Exchange ${entry.required} × ${entry.currencyName?.takeIf { it.isNotEmpty() } ?: if (entry.reward != null) id else entry.name}" + (entry.npc?.let { " · $it" } ?: ""),
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.padding(top = 4.dp, bottom = 2.dp),
                )
                val reward = entry.reward
                if (reward != null) {
                    val (rewardId, rewardLevel) = exchangeTarget(reward)
                    RelatedItemRow(
                        name = (if ((entry.rewardQuantity ?: 1) > 1) "${entry.rewardQuantity} × " else "") + entry.name + levelSuffix(rewardLevel),
                        sprite = entry.sprite,
                        detail = "100%",
                        onClick = { onNavigateItem(rewardId, rewardLevel) },
                    )
                } else {
                    for (result in entry.results) {
                        RelatedItemRow(
                            name = (if (result.quantity > 1) "${"%,d".format(result.quantity)} × " else "") + if (result.kind == "empty") "No reward" else result.name,
                            sprite = result.sprite,
                            detail = rewardPercentage(result.chance),
                            onClick = { if (result.kind !in NON_INSPECTABLE_KINDS) onNavigateItem(result.id, 0) },
                        )
                    }
                }
            }
            if (id.startsWith("cosmo")) {
                Text("Base chances shown. Already-owned cosmetics change these odds.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
            }
            if (id == "sixcake") {
                Text("Table rewards shown; anniversary bonuses are awarded separately.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
            }
            Spacer(Modifier.height(8.dp))
        }
        if (exchanges.sources.isNotEmpty()) {
            Text("Reward in", style = MaterialTheme.typography.titleSmall)
            Text(
                "Chance per exchange using the quantity shown",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            for (source in exchanges.sources) {
                RelatedItemRow(
                    name = "${"%,d".format(source.entry.required)} × ${source.entry.name}${levelSuffix(source.entry.level)}",
                    sprite = source.entry.sprite,
                    detail = rewardPercentage(source.chance),
                    onClick = { onNavigateItem(source.entry.id, source.entry.level) },
                )
            }
        }
    }
}

@Composable
private fun DropsSection(drops: List<com.partyconsole.companion.model.ItemDropSource>, onNavigateMonster: (String) -> Unit) {
    // item-details.tsx: sort by percentage (default) or name; ties by name.
    var sortByName by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    val sorted = remember(drops, sortByName) {
        drops.sortedWith(compareBy<com.partyconsole.companion.model.ItemDropSource> { if (sortByName) 0.0 else -effectiveDropRate(it) }.thenBy { it.monsterName })
    }
    Column {
        Row(modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("Monster drops", style = MaterialTheme.typography.titleSmall)
            androidx.compose.foundation.layout.Box {
                TextButton(onClick = { menu = true }) { Text("Sort: ${if (sortByName) "Name" else "Percentage"}", style = MaterialTheme.typography.labelSmall) }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(text = { Text("Name") }, onClick = { sortByName = true; menu = false })
                    DropdownMenuItem(text = { Text("Percentage") }, onClick = { sortByName = false; menu = false })
                }
            }
        }
        for (drop in sorted) {
            RelatedItemRow(
                name = drop.monsterName,
                sprite = drop.sprite,
                detail = formatDropRate(drop),
                onClick = { onNavigateMonster(drop.monsterId) },
            )
        }
    }
}

@Composable
private fun MonsterDetailContent(monster: BestiaryMonster?, onNavigateItem: (String, Int) -> Unit) {
    if (monster == null) {
        Text("No bestiary data for this monster yet.", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(vertical = 16.dp))
        return
    }
    Column {
        Text(monster.name, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(bottom = 4.dp))
        Text(
            "HP ${"%,d".format(monster.hp)} · ATK ${"%,d".format(monster.attack)} · XP ${"%,d".format(monster.xp)}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 10.dp),
        )
        Text("Drops", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(bottom = 6.dp))
        if (monster.drops.isEmpty()) {
            Text("No known drops.", style = MaterialTheme.typography.bodySmall)
        } else {
            for (drop in monster.drops.sortedByDescending { it.rate }) {
                RelatedItemRow(
                    name = drop.name + if (drop.quantity > 1) " x${drop.quantity}" else "",
                    sprite = drop.sprite,
                    detail = "${"%.4f".format(drop.rate * 100)}%",
                    onClick = { onNavigateItem(drop.id, 0) },
                )
            }
        }
    }
}
