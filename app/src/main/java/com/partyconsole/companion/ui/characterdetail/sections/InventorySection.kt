package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.partyconsole.companion.domain.BannerAction
import com.partyconsole.companion.domain.BannerCandidate
import com.partyconsole.companion.domain.ItemActionBanner
import com.partyconsole.companion.domain.aggregateSlotTracking
import com.partyconsole.companion.domain.automaticCommerceRuleKey
import com.partyconsole.companion.domain.compactInventory
import com.partyconsole.companion.domain.itemActionBanner
import com.partyconsole.companion.domain.luckySlotSearch
import com.partyconsole.companion.domain.normalizeSlotTracking
import com.partyconsole.companion.domain.physicalInventory
import com.partyconsole.companion.domain.validLuckySlot
import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.model.InventoryEntry
import com.partyconsole.companion.model.PartyStateDynamic
import com.partyconsole.companion.model.markedIn
import com.partyconsole.companion.model.sameMarkedItem
import com.partyconsole.companion.ui.components.BannerStrip
import com.partyconsole.companion.ui.components.ItemOperationOverlay
import com.partyconsole.companion.ui.components.ItemTile
import com.partyconsole.companion.ui.components.LevelLabel
import com.partyconsole.companion.ui.components.MluckClover
import com.partyconsole.companion.ui.components.StatBadge
import com.partyconsole.companion.ui.components.SuggestedPriceDetails
import com.partyconsole.companion.ui.components.bannerColors
import com.partyconsole.companion.ui.components.luckySlotOutline
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import com.partyconsole.companion.ui.itempanel.TapRow
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import java.text.DateFormat
import java.util.Date

private class TileDetails(val entry: InventoryEntry, val lucky: Boolean, val banner: ItemActionBanner?, val deconstruction: String?, val npcSaleDetails: String?)

/** The inventory grid: a collapsible header with the occupied/total counter,
 *  the merchant's physical 42-slot layout (with the lucky upgrade slot
 *  outlined) or a compact grid for everyone else, and per tile the sprite,
 *  operation overlay, +level, stat badge, quantity, mluck clover and the one
 *  item- action banner. A long press shows the dashboard tooltip's details. */
@Composable
fun InventorySection(
    characterName: String,
    isMerchant: Boolean,
    items: List<InventoryEntry?>,
    inventorySize: Int?,
    loaded: Boolean,
    state: PartyStateDynamic,
    catalogFor: (String) -> CatalogItem?,
    onItemTap: (InventoryEntry, Boolean) -> Unit,
    onLuckySlotData: () -> Unit = {},
    localLucky: JsonElement? = null,
) {
    var open by remember { mutableStateOf(true) }
    var details by remember { mutableStateOf<TileDetails?>(null) }
    var luckyMenu by remember { mutableStateOf<Int?>(null) }

    // Missing inventory is still loading, not an empty bag.
    if (!loaded) {
        SectionCard(title = "Inventory") { Text("Loading inventory…", style = MaterialTheme.typography.bodySmall) }
        return
    }

    val merchant = state.merchantCharacter
    val sharedRules = state.merchantRules != null
    val ruleName = if (sharedRules) merchant.toString() else characterName
    val autoItemMarks = state.autoItemMarks[ruleName].orEmpty()
    val autoDeconstruction = state.autoDeconstruction[ruleName].orEmpty()
    val autoCompoundMarks = state.autoCompounds[ruleName].orEmpty()
    val bankMarked = state.marked[characterName].orEmpty()
    val merchantMarked = state.merchantMarked[characterName].orEmpty()
    val upgradeMarks = state.upgrades[characterName].orEmpty()
    val statScrollMarks = state.statScrolls[characterName].orEmpty()
    val compoundGroups = state.compounds[characterName].orEmpty()
    val occupied = items.count { it != null }
    val total = inventorySize ?: items.size
    val free = maxOf(0, total - occupied)
    val capacityColor = when {
        free < 5 -> Color(0xFFFB7185)
        free <= 10 -> Color(0xFFFB923C)
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    val verifiedLucky = state.luckyUpgradeSlots[characterName]
    val nextUpgradeSlot = if (validLuckySlot(verifiedLucky)) verifiedLucky!! else
        luckySlotSearch(aggregateSlotTracking(state.luckySlotTracking[characterName].orEmpty(), localLucky?.let { normalizeSlotTracking(it) })).nextSlot
    val luckySlotLabel = if (validLuckySlot(verifiedLucky)) "Verified lucky upgrade slot" else "Next upgrade will test for lucky upgrade"
    val grid = if (isMerchant) physicalInventory(items, { it.slot }) else compactInventory(items, total)

    Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth().clickable { open = !open }.padding(bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text((if (open) "▾ " else "▸ ") + "Inventory", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                Text("$occupied/$total", color = capacityColor, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall)
            }
            if (open) {
                for (row in grid.withIndex().chunked(5)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(bottom = 6.dp)) {
                        for ((i, entry) in row) {
                            val lucky = isMerchant && i == nextUpgradeSlot
                            if (entry == null) {
                                if (lucky) {
                                    Box(
                                        modifier = Modifier.size(60.dp).luckySlotOutline().clickable { luckyMenu = i }
                                            .semantics { contentDescription = "$luckySlotLabel, slot $i. Open lucky slot options" },
                                    )
                                } else {
                                    Box(modifier = Modifier.size(60.dp).border(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f), RoundedCornerShape(6.dp)))
                                }
                                continue
                            }
                            val catalog = catalogFor(entry.item.name)
                            val meta = entry.meta ?: catalog?.meta
                            val sprite = meta?.sprite ?: catalog?.sprite
                            val itemName = (meta?.definition?.get("name") as? JsonPrimitive)?.content ?: catalog?.name ?: entry.item.name
                            val level = entry.item.level ?: 0
                            val autoRuleKey = "${entry.item.name}@+${maxOf(0, level)}"
                            // Name-only rules are from older builds and apply only to +0 items.
                            val autoMarkMode = autoItemMarks[autoRuleKey] ?: if (level == 0) autoItemMarks[entry.item.name] else null
                            val deliveryTarget = if (isMerchant) state.merchantDeliveries.entries.find { (_, list) -> list.any { it.slot == entry.slot && sameMarkedItem(it.item, entry.item) } }?.key else null
                            val standMarked = isMerchant && state.standListings.any { it.bankPack == null && it.slot == entry.slot && sameMarkedItem(it.item, entry.item) }
                            val weaponMarked = isMerchant && state.merchantWeapon?.item?.let { sameMarkedItem(it, entry.item) } == true
                            val upgradeMark = if (meta?.upgradeable == true) upgradeMarks.find { !it.equipped && it.slot.slotInt() == entry.slot && sameMarkedItem(it.item, entry.item) } else null
                            val statScrollMark = if (isMerchant) statScrollMarks.find { !it.equipped && it.slot.slotInt() == entry.slot && sameMarkedItem(it.item, entry.item) } else null
                            val compoundGroup = compoundGroups.find { group -> group.items.any { it.slot.slotInt() == entry.slot && sameMarkedItem(it.item, entry.item) } }
                            val autoCompound = autoCompoundMarks.find { it.name == entry.item.name }
                            val autoCompoundPending = autoCompound != null && level < autoCompound.targetTier && autoCompound.quantity != 0
                            val autoExchangeMarked = isMerchant && state.autoExchanges.containsKey("${entry.item.name}@$level")
                            val saleKey = automaticCommerceRuleKey(entry.item)
                            val autoNpcSaleMarked = state.autoNpcSales.containsKey(if (sharedRules || isMerchant) saleKey else kotlinx.serialization.json.JsonArray(listOf(JsonPrimitive(characterName), JsonPrimitive(saleKey))).toString())
                            val npcSale = state.npcSaleMarks.find {
                                (if (isMerchant) it.source == "merchant" else it.source == "character" && it.character == characterName) && it.slot == entry.slot && automaticCommerceRuleKey(it.item) == saleKey
                            }
                            val npcSaleDetails = npcSale?.let { mark ->
                                listOfNotNull("NPC sale: ${mark.state ?: "queued"}", mark.error, mark.retryAt?.let { "Retry after ${DateFormat.getTimeInstance().format(Date(it))}" }).joinToString(" · ")
                            }
                            val deconstruction = state.deconstructionMarks.find { it.owner == characterName && it.slot == entry.slot && it.state != "complete" && sameMarkedItem(entry.item, it.item) }
                            val autoDeconstruct = autoDeconstruction.containsKey(saleKey)
                            val autoStandMarked = isMerchant && state.autoStandMarks.containsKey(saleKey)
                            val upgradeLevel = upgradeMark?.item?.level ?: 0
                            val upgradeTarget = upgradeLevel + (upgradeMark?.tiers ?: 1)
                            val banner = itemActionBanner(
                                listOf(
                                    deconstruction?.let { BannerCandidate(BannerAction.DECONSTRUCTION, "Deconstruction") },
                                    npcSale?.let { BannerCandidate(BannerAction.NPC, "NPC sale", automatic = it.auto, title = npcSaleDetails) },
                                    statScrollMark?.let { BannerCandidate(BannerAction.STAT, "Stat scroll") },
                                    upgradeMark?.let { BannerCandidate(BannerAction.UPGRADE, if (it.auto) "Auto → +$upgradeTarget" else "+$upgradeLevel → +$upgradeTarget", automatic = it.auto) },
                                    compoundGroup?.let { BannerCandidate(BannerAction.COMPOUND, "+$level → +${level + 1}") },
                                    if (standMarked) BannerCandidate(BannerAction.STAND, "Stand sale") else null,
                                    if (autoCompoundPending) BannerCandidate(BannerAction.COMPOUND, "Auto compound → +${autoCompound!!.targetTier}", automatic = true) else null,
                                    if (autoDeconstruct) BannerCandidate(BannerAction.DECONSTRUCTION, "Auto deconstruction", automatic = true) else null,
                                    if (autoNpcSaleMarked) BannerCandidate(BannerAction.NPC, "NPC sale", automatic = true, title = npcSaleDetails ?: "Auto NPC sale") else null,
                                    if (autoStandMarked) BannerCandidate(BannerAction.STAND, "Auto stand", automatic = true) else null,
                                    if (autoExchangeMarked) BannerCandidate(BannerAction.EXCHANGE, "Auto exchange", automatic = true) else null,
                                    deliveryTarget?.let { BannerCandidate(BannerAction.DELIVERY, "To $it") },
                                    if (autoMarkMode == "bank" || markedIn(bankMarked, entry)) BannerCandidate(BannerAction.BANK, if (autoMarkMode == "bank") "Auto bank" else "Bank") else null,
                                    if (autoMarkMode == "merchant" || markedIn(merchantMarked, entry)) BannerCandidate(BannerAction.MERCHANT, if (autoMarkMode == "merchant") "Auto merchant" else "Mark for merchant") else null,
                                    if (weaponMarked) BannerCandidate(BannerAction.WEAPON, "Merchant weapon") else null,
                                ),
                                isMerchant,
                            )
                            val tileDetails = if (isMerchant || banner?.title != null) {
                                TileDetails(
                                    entry.copy(meta = meta),
                                    lucky,
                                    banner,
                                    if (deconstruction != null || autoDeconstruct) "Deconstruction" + (if (autoDeconstruct) " · automatic" else "") + (deconstruction?.let { " · ${it.state}" } ?: "") else null,
                                    npcSaleDetails,
                                )
                            } else {
                                null
                            }
                            Box(modifier = if (lucky) Modifier.luckySlotOutline() else Modifier) {
                                ItemTile(
                                    label = itemName,
                                    border = banner?.let { bannerColors(it.action).border } ?: MaterialTheme.colorScheme.outlineVariant,
                                    // Tap opens the item menu; on the lucky slot it also offers the lucky slot data.
                                    onTap = { onItemTap(entry, lucky) },
                                    onLongPress = tileDetails?.let { { details = it } },
                                ) {
                                    if (sprite != null) SpriteIcon(sprite, size = 58.dp) else Text(entry.item.name, fontFamily = FontFamily.Monospace, fontSize = 10.sp, maxLines = 2, modifier = Modifier.padding(2.dp))
                                    val operation = entry.operation
                                    if (operation != null) ItemOperationOverlay(operation, 58.dp) else LevelLabel(entry.item.level)
                                    StatBadge(entry.item.statType)
                                    entry.item.q?.takeIf { it > 1 }?.let {
                                        Text("$it", color = Color(0xFFFCD34D), fontSize = 10.sp, modifier = Modifier.align(Alignment.BottomEnd).padding(2.dp))
                                    }
                                    MluckClover(entry.item, modifier = Modifier.align(Alignment.CenterEnd))
                                    BannerStrip(banner)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    luckyMenu?.let { slot ->
        ModalBottomSheet(onDismissRequest = { luckyMenu = null }) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("$luckySlotLabel · slot $slot", style = MaterialTheme.typography.labelSmall)
                TapRow("Show lucky slot data") {
                    luckyMenu = null
                    onLuckySlotData()
                }
            }
        }
    }

    details?.let { tile ->
        ModalBottomSheet(onDismissRequest = { details = null }) {
            Column(modifier = Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
                if (tile.lucky) Text("$luckySlotLabel · slot $nextUpgradeSlot.", color = Color(0xFFF59E0B), style = MaterialTheme.typography.labelSmall)
                if (!isMerchant) tile.banner?.title?.let { Text("${tile.banner.label}: $it", style = MaterialTheme.typography.labelSmall) }
                if (isMerchant) {
                    SuggestedPriceDetails(tile.entry, state.merchantCatalog?.buyable.orEmpty(), state.standPriceHistory[tile.entry.item.name])
                    tile.deconstruction?.let { Text(it, color = Color(0xFFFB923C), style = MaterialTheme.typography.labelSmall) }
                    tile.npcSaleDetails?.let { Text(it, color = Color(0xFFFB7185), style = MaterialTheme.typography.labelSmall) }
                    if (tile.npcSaleDetails == null) tile.banner?.title?.let { Text("${tile.banner.label}: $it", style = MaterialTheme.typography.labelSmall) }
                }
            }
        }
    }
}

/** A mark's `slot` is a bag index (or an equip-slot name for equipped marks). */
internal fun JsonElement?.slotInt(): Int? = (this as? JsonPrimitive)?.content?.toIntOrNull()
