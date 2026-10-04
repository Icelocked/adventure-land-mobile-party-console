package com.partyconsole.companion.ui.components

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MonetizationOn
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.partyconsole.companion.domain.BannerAction
import com.partyconsole.companion.domain.ItemActionBanner
import com.partyconsole.companion.domain.abbreviatedGold
import com.partyconsole.companion.domain.exactLevelPrice
import com.partyconsole.companion.domain.suggestedItemValue
import com.partyconsole.companion.model.InventoryEntry
import com.partyconsole.companion.model.ItemOperation
import com.partyconsole.companion.model.MerchantBuyItem
import com.partyconsole.companion.model.StandPriceHistory
import com.partyconsole.companion.ui.itemicon.SpriteIcon

/** item-action-banner.ts palette: banner background, text and tile border. */
data class BannerColors(val background: Color, val text: Color, val border: Color)

fun bannerColors(action: BannerAction): BannerColors = when (action) {
    BannerAction.CONFLICT -> BannerColors(Color(0xFF450A0A), Color(0xFFFEE2E2), Color(0xFFF87171))
    BannerAction.UPGRADE -> BannerColors(Color(0xFF2E1065), Color(0xFFDDD6FE), Color(0xFFA78BFA))
    BannerAction.COMPOUND -> BannerColors(Color(0xFF4A044E), Color(0xFFF5D0FE), Color(0xFFE879F9))
    BannerAction.NPC -> BannerColors(Color(0xFF4C0519), Color(0xFFFECDD3), Color(0xFFFB7185))
    BannerAction.STAND -> BannerColors(Color(0xFF451A03), Color(0xFFFDE68A), Color(0xFFFBBF24))
    BannerAction.EXCHANGE -> BannerColors(Color(0xFF083344), Color(0xFFA5F3FC), Color(0xFF22D3EE))
    BannerAction.DECONSTRUCTION -> BannerColors(Color(0xFF431407), Color(0xFFFED7AA), Color(0xFFFB923C))
    BannerAction.DELIVERY, BannerAction.STAT -> BannerColors(Color(0xFF082F49), Color(0xFFBAE6FD), Color(0xFF38BDF8))
    BannerAction.BANK -> BannerColors(Color(0xFF422006), Color(0xFFFEF08A), Color(0xFFFACC15))
    BannerAction.MERCHANT -> BannerColors(Color(0xFF3B0764), Color(0xFFE9D5FF), Color(0xFFC084FC))
    BannerAction.WEAPON -> BannerColors(Color(0xFF022C22), Color(0xFFA7F3D0), Color(0xFF34D399))
}

/** stat-badge-class.tsx: background and text per stat. */
fun statBadgeColors(statType: String?): Pair<Color, Color> = when (statType?.lowercase()) {
    "int" -> Color(0xE6172554) to Color(0xFFBFDBFE)
    "str" -> Color(0xE6450A0A) to Color(0xFFFECACA)
    "dex" -> Color(0xE6052E16) to Color(0xFFBBF7D0)
    "vit" -> Color(0xE6451A03) to Color(0xFFFDE68A)
    else -> Color(0xE6020617) to Color(0xFFE2E8F0)
}

private val LevelGreen = Color(0xFF6EE7B7)

/** One item tile (the PWA's ItemTile): tap opens the item's options; a long
 *  press opens the tooltip details. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ItemTile(label: String, border: Color, onTap: () -> Unit, onLongPress: (() -> Unit)? = null, size: Dp = 60.dp, content: @Composable BoxScope.() -> Unit) {
    Box(
        modifier = Modifier.size(size).background(MaterialTheme.colorScheme.background, RoundedCornerShape(6.dp)).border(1.dp, border, RoundedCornerShape(6.dp))
            .semantics { contentDescription = label }
            .combinedClickable(onClick = onTap, onLongClick = onLongPress),
        content = content,
    )
}

@Composable
fun BoxScope.StatBadge(statType: String?) {
    statType ?: return
    val (background, text) = statBadgeColors(statType)
    Text(statType, color = text, fontSize = 9.sp, fontFamily = FontFamily.Monospace, modifier = Modifier.align(Alignment.TopStart).padding(2.dp).background(background, RoundedCornerShape(3.dp)).padding(horizontal = 2.dp))
}

@Composable
fun BoxScope.LevelLabel(level: Int?) {
    if ((level ?: 0) > 0) Text("+$level", color = LevelGreen, fontSize = 10.sp, modifier = Modifier.align(Alignment.BottomStart).padding(start = 3.dp, bottom = 2.dp))
}

@Composable
fun BoxScope.BannerStrip(banner: ItemActionBanner?) {
    banner ?: return
    val colors = bannerColors(banner.action)
    Text(
        banner.label,
        color = colors.text,
        fontSize = 8.sp,
        lineHeight = 9.sp,
        textAlign = TextAlign.Center,
        modifier = Modifier.align(Alignment.TopCenter).fillMaxWidth().background(colors.background).padding(horizontal = 1.dp),
    )
}

/** item-operation-overlay.tsx: an upgrade/compound in progress - the pulsing
 *  result sprite, success %, and +from → +to. */
@Composable
fun BoxScope.ItemOperationOverlay(operation: ItemOperation, size: Dp) {
    operation.sprite?.let { Box(modifier = Modifier.alpha(0.7f)) { SpriteIcon(it, size = size) } }
    operation.chance?.let { chance ->
        val hue = (chance.coerceIn(0.0, 1.0) * 120).toFloat()
        Text(
            "${"%.2f".format(chance * 100)}%",
            color = Color.hsl(hue, 0.85f, 0.65f),
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace,
            modifier = Modifier.align(Alignment.Center),
        )
    }
    Row(modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(horizontal = 3.dp, vertical = 2.dp)) {
        Text("+${operation.fromLevel}", color = LevelGreen, fontSize = 10.sp)
        Text(" → ", color = LevelGreen, fontSize = 10.sp, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
        Text("+${operation.toLevel}", color = LevelGreen, fontSize = 10.sp)
    }
}

/** lucky-upgrade-slot.tsx LuckySlotOutline (a dashed amber ring). */
fun Modifier.luckySlotOutline(): Modifier = this.border(2.dp, Color(0xFFFCD34D), RoundedCornerShape(8.dp))

/** suggested-price-details.tsx: the merchant tile's price evidence. */
@Composable
fun SuggestedPriceDetails(entry: InventoryEntry, buyable: List<MerchantBuyItem>, observed: StandPriceHistory?) {
    val valuation = suggestedItemValue(entry, buyable)
    val itemLevel = entry.item.level ?: 0
    fun observedPrice(price: Double?, level: Int?, fallback: String) =
        exactLevelPrice(price, level, itemLevel)?.let { "${abbreviatedGold(it.toLong())} gold (+$itemLevel)" } ?: "$fallback for +$itemLevel"
    val cyan = Color(0xFF22D3EE)
    val amber = Color(0xFFF59E0B)
    Column {
        if (itemLevel == 0) Text("Default price: ${abbreviatedGold(valuation.defaultPrice.toLong())} gold", style = MaterialTheme.typography.labelSmall)
        Text("Lowest price seen: ${observedPrice(observed?.lowest, observed?.lowestLevel, "Not observed")}", color = cyan, style = MaterialTheme.typography.labelSmall)
        Text("Most recent price seen: ${observedPrice(observed?.recent, observed?.recentLevel, "Not observed")}", color = cyan.copy(alpha = 0.75f), style = MaterialTheme.typography.labelSmall)
        Text("Current market low: ${observedPrice(observed?.marketLow, observed?.marketLowLevel, "No fresh listing")}", color = cyan.copy(alpha = 0.75f), style = MaterialTheme.typography.labelSmall)
        Text("Highest public WTB: ${observedPrice(observed?.highestPublicWTB, observed?.highestPublicWTBLevel, "Not advertised")}", color = Color(0xCCA78BFA), style = MaterialTheme.typography.labelSmall)
        if (valuation.sources.isEmpty()) {
            Text("No repeatably farmable source", color = amber, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 8.dp))
        }
        for (source in valuation.sources) {
            Row(modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                Box(modifier = Modifier.size(32.dp), contentAlignment = Alignment.Center) {
                    when {
                        source.sprite != null -> SpriteIcon(source.sprite, size = 32.dp)
                        source.purchase -> Icon(Icons.Filled.MonetizationOn, contentDescription = null, tint = amber)
                    }
                }
                Column(modifier = Modifier.padding(start = 8.dp)) {
                    Text(
                        "Suggested price (${if (source.worldDrop) "world drop · ${source.monsterName}" else source.monsterName}): ${abbreviatedGold(source.suggested.toLong())} gold",
                        color = amber,
                        style = MaterialTheme.typography.labelSmall,
                    )
                    Text(
                        when {
                            source.purchase && itemLevel > 0 ->
                                "90% chance of producing +$itemLevel within this budget · approximately ${"%,d".format(source.attempts ?: 0)} base items · ${"%,d".format(source.scrolls.sum())} scrolls"
                            source.purchase -> "Guaranteed vendor purchase"
                            else -> "${"%,d".format(source.kills.toLong())} kills for 90% confidence · ${"%.3g".format(source.rate * 100)}% per kill" +
                                (source.luckMultiplier?.let { " at ${"%.0f".format(it * 100)}% Luck" } ?: "") + (source.mapName?.let { " · $it" } ?: "")
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (!source.purchase && source.paths.isNotEmpty()) Text("Via: ${source.paths.joinToString(" | ")}", color = Color(0xCCE879F9), style = MaterialTheme.typography.labelSmall, maxLines = 1)
                }
            }
        }
        if (itemLevel > 0 && entry.meta?.upgradeable == true) Text("Includes the +$itemLevel 90%-confidence replacement estimate.", color = Color(0xCCA78BFA), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 4.dp))
    }
}
