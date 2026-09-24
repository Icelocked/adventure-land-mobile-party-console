package com.partyconsole.companion.ui.itemdetail

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
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
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
 *  (item-details.tsx) - same underlying data (ItemMeta via the merchant
 *  catalog), redesigned for touch as a header + a row of chips for only
 *  the sections that apply to THIS item (a plain stat scroll has no
 *  "Craftable"/"Set bonus"/"Drops" chip at all) instead of one long
 *  scrolling dialog. Tapping a related item/material/set-piece/exchange
 *  result or a drop's monster drills into ITS details with a back button,
 *  mirroring desktop's own trail navigation. */
private sealed interface DetailTarget {
    data class ItemTarget(val id: String, val level: Int = 0) : DetailTarget
    data class MonsterTarget(val id: String) : DetailTarget
}

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
                onNavigateItem = { id, level -> trail = trail + DetailTarget.ItemTarget(id, level) },
                onNavigateMonster = { id -> trail = trail + DetailTarget.MonsterTarget(id) },
            )
            is DetailTarget.MonsterTarget -> MonsterDetailContent(
                monster = monsters.find { it.id == target.id },
                onNavigateItem = { id, level -> trail = trail + DetailTarget.ItemTarget(id, level) },
            )
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
    onNavigateItem: (String, Int) -> Unit,
    onNavigateMonster: (String) -> Unit,
) {
    val catalogItem = remember(catalog, target.id) { catalog?.allItems?.find { it.id == target.id } }
    if (catalogItem == null) {
        Text(
            "No catalog data for \"${target.id}\" yet.",
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(vertical = 16.dp),
        )
        return
    }
    val meta = catalogItem.meta
    val world = meta?.world
    val explanation = (meta?.definition?.get("explanation") as? JsonPrimitive)?.takeIf { it.isString }?.content
    var previewLevel by remember(target.id, target.level) { mutableStateOf(target.level) }
    val exchanges = remember(catalog, target.id, target.level) {
        exchangeSections(target.id, target.level, catalog?.exchangeable.orEmpty())
    }

    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp, bottom = 8.dp)) {
        SpriteIcon(catalogItem.sprite, size = 48.dp)
        Text(
            catalogItem.name + if (target.level > 0) " +${target.level}" else "",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(start = 10.dp),
        )
    }
    if (!explanation.isNullOrBlank()) {
        Text(explanation, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(bottom = 8.dp))
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
    if (selectedTab !in tabs) selectedTab = tabs.first()

    if (tabs.size > 1) {
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(bottom = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            for (tab in tabs) {
                FilterChip(selected = tab == selectedTab, onClick = { selectedTab = tab }, label = { Text(tab) })
            }
        }
    }

    when (selectedTab) {
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
        "Exchange" -> ExchangeSection(exchanges, onNavigateItem)
        "Drops" -> world?.drops?.let { DropsSection(it, onNavigateMonster) }
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

@Composable
private fun ExchangeSection(exchanges: ExchangeSections, onNavigateItem: (String, Int) -> Unit) {
    Column {
        if (exchanges.prices.isNotEmpty()) {
            Text("Exchange price", style = MaterialTheme.typography.titleSmall)
            for (entry in exchanges.prices) {
                RelatedItemRow(
                    name = "${entry.required} × ${entry.currencyName ?: entry.id}",
                    sprite = entry.currencySprite,
                    detail = "for ${entry.rewardQuantity ?: 1}",
                    onClick = { onNavigateItem(entry.id, entry.level) },
                )
            }
            Spacer(Modifier.height(8.dp))
        }
        if (exchanges.rewards.isNotEmpty()) {
            Text("Exchange reward", style = MaterialTheme.typography.titleSmall)
            for (entry in exchanges.rewards) {
                Text(
                    "Exchange ${entry.required} × ${entry.currencyName ?: entry.name}" + (entry.npc?.let { " · $it" } ?: ""),
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.padding(top = 4.dp, bottom = 2.dp),
                )
                if (entry.reward != null) {
                    RelatedItemRow(
                        name = entry.name,
                        sprite = entry.sprite,
                        detail = "100%",
                        onClick = { onNavigateItem(entry.id, entry.level) },
                    )
                } else {
                    for (result in entry.results) {
                        val inspectable = result.kind !in setOf("empty", "gold", "shells", "cx", "cxbundle")
                        RelatedItemRow(
                            name = "${result.quantity} × ${result.name}",
                            sprite = result.sprite,
                            detail = rewardPercentage(result.chance),
                            onClick = { if (inspectable) onNavigateItem(result.id, 0) },
                        )
                    }
                }
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
                    name = "${source.entry.required} × ${source.entry.name}",
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
    Column {
        Text("Monster drops", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(bottom = 6.dp))
        for (drop in drops.sortedByDescending { effectiveDropRate(it) }) {
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
