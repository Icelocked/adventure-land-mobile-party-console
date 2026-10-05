package com.partyconsole.companion.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.partyconsole.companion.domain.BannerAction
import com.partyconsole.companion.domain.BannerCandidate
import com.partyconsole.companion.domain.automaticCommerceRuleKey
import com.partyconsole.companion.domain.itemActionBanner
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.ItemMeta
import com.partyconsole.companion.model.Sprite
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.network.CommandResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.itemdetail.itemMaximumLevel
import com.partyconsole.companion.ui.itemdetail.upgradeRuleTiers
import com.partyconsole.companion.ui.itempanel.CompoundTierPicker
import com.partyconsole.companion.ui.itempanel.TapRow
import com.partyconsole.companion.ui.itempanel.UpgradeTierPicker
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

data class ExchangeMarkMode(val action: String, val targetLevel: Int? = null) // bank | stand | npc | upgrade

private val MARK_BORDERS = mapOf("bank" to Color(0xFFFACC15), "stand" to Color(0xFF38BDF8), "upgrade" to Color(0xFFA78BFA), "npc" to Color(0xFFFB7185))

/** Bulk exchange mark controls, with the dashboard's labels and gating. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ExchangeMarkControls(enabled: Boolean, mode: ExchangeMarkMode?, saving: Boolean, onMode: (ExchangeMarkMode) -> Unit) {
    var levelMenu by remember { mutableStateOf(false) }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        for (action in listOf("bank", "stand", "upgrade", "npc")) {
            val muted = !enabled || (mode != null && mode.action != action)
            OutlinedButton(
                enabled = enabled && !saving,
                onClick = { onMode(ExchangeMarkMode(action, if (action == "upgrade") mode?.targetLevel ?: 1 else null)) },
                border = androidx.compose.foundation.BorderStroke(1.dp, if (muted) Color(0xFF334155) else MARK_BORDERS.getValue(action)),
                modifier = Modifier.semantics { contentDescription = if (action == "npc") "NPC" else action.replaceFirstChar { it.uppercase() } },
            ) { Text(if (action == "npc") "NPC" else action.replaceFirstChar { it.uppercase() }, color = if (muted) Color(0xFF64748B) else Color.Unspecified) }
        }
        if (enabled && mode?.action == "upgrade") {
            Box {
                OutlinedButton(onClick = { levelMenu = true }, modifier = Modifier.semantics { contentDescription = "Bulk upgrade target level" }) { Text("Target level +${mode.targetLevel}") }
                DropdownMenu(expanded = levelMenu, onDismissRequest = { levelMenu = false }) {
                    for (level in 1..13) DropdownMenuItem(text = { Text("+$level") }, onClick = { levelMenu = false; onMode(ExchangeMarkMode("upgrade", level)) })
                }
            }
        }
    }
}

data class ExchangeRewardTileData(
    val id: String,
    val level: Int,
    val name: String,
    val quantity: Int,
    val sprite: Sprite?,
    val detail: String,
    val onInspect: () -> Unit,
    val kind: String? = null,
    val marking: Boolean = false,
    val markMode: ExchangeMarkMode? = null,
    val stagedMode: ExchangeMarkMode? = null,
    val saving: Boolean = false,
    val onStage: ((ExchangeRewardTileData, ExchangeMarkMode) -> Unit)? = null,
)

private val PASSIVE_KINDS = setOf("empty", "gold", "shells", "cx", "cxbundle", "open")

/** -1 unless the rule carries a safe-integer quantity. */
private fun upgradeRuleQuantity(rule: kotlinx.serialization.json.JsonElement?): Int =
    ((rule as? JsonObject)?.get("quantity") as? JsonPrimitive)?.content?.toDoubleOrNull()?.takeIf { it == Math.floor(it) }?.toInt() ?: -1

/** A prospective reward with its automatic-rule banner. Tapping opens its
 *  options list (Item details first, then the automatic actions the dashboard
 *  puts in the tile's context menu); while marking multiple, tapping stages
 *  the chosen bulk rule instead. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExchangeRewardTile(viewModel: PartyViewModel, reward: ExchangeRewardTileData) {
    val state by viewModel.dynamicState.collectAsState()
    val merchant = state.merchantCharacter
    var options by remember { mutableStateOf(false) }
    val passive = reward.kind != null && reward.kind in PASSIVE_KINDS
    val name = if (reward.kind == "empty") "No reward" else reward.name
    val item = Item(name = reward.id, level = reward.level)
    val meta = state.merchantCatalog?.allItems?.find { it.id == reward.id }?.meta
    val key = "${item.name}@+${reward.level}"
    val commerce = automaticCommerceRuleKey(item)
    val merchantMarks = state.autoItemMarks[merchant.toString()].orEmpty()
    val bank = merchantMarks[key] ?: if (reward.level == 0) merchantMarks[item.name] else null
    val upgradeRule = state.autoUpgradeMarks[merchant.toString()]?.get(key)
    val upgradeTiers = upgradeRuleTiers(upgradeRule)
    val upgradePending = upgradeTiers != 0 && upgradeRuleQuantity(upgradeRule) != 0
    val compound = state.autoCompounds[merchant.toString()]?.find { it.name == item.name }
    val npc = state.autoNpcSales.containsKey(commerce)
    val stand = state.autoStandMarks.containsKey(commerce)
    val exchange = state.autoExchanges.containsKey("${item.name}@${reward.level}")
    val bulkUnsupported = reward.markMode?.action == "upgrade" &&
        (meta?.upgradeable != true || (reward.markMode.targetLevel ?: 0) <= reward.level || (reward.markMode.targetLevel ?: 0) > itemMaximumLevel(meta))
    val staged = reward.stagedMode
    val banner = itemActionBanner(
        if (staged != null) listOf(
            BannerCandidate(
                when (staged.action) { "bank" -> BannerAction.BANK; "stand" -> BannerAction.STAND; "npc" -> BannerAction.NPC; else -> BannerAction.UPGRADE },
                when (staged.action) { "bank" -> "Auto bank"; "stand" -> "Auto stand"; "npc" -> "Auto sell to NPC"; else -> "Auto upgrade → +${staged.targetLevel}" },
                automatic = true,
            ),
        ) else listOf(
            if (exchange) BannerCandidate(BannerAction.EXCHANGE, "Auto exchange", automatic = true) else null,
            if (npc) BannerCandidate(BannerAction.NPC, "Auto sell to NPC", automatic = true) else null,
            if (stand) BannerCandidate(BannerAction.STAND, "Auto stand", automatic = true) else null,
            if (upgradePending) BannerCandidate(BannerAction.UPGRADE, "Auto upgrade → +${reward.level + upgradeTiers}", automatic = true) else null,
            if (compound != null && compound.quantity != 0 && reward.level < compound.targetTier) BannerCandidate(BannerAction.COMPOUND, "Auto compound → +${compound.targetTier}", automatic = true) else null,
            if (state.autoDeconstruction[merchant.toString()]?.containsKey(commerce) == true) BannerCandidate(BannerAction.DECONSTRUCTION, "Auto deconstruction", automatic = true) else null,
            BannerCandidate(BannerAction.BANK, if (bank == "bank") "Auto bank" else "Auto bank (default)"),
        ),
        true,
    )!!
    val colors = bannerColors(banner.action)
    val disabled = passive || reward.saving || (reward.marking && (reward.markMode == null || bulkUnsupported))
    fun clicked() {
        if (!reward.marking) { options = true; return }
        val mode = reward.markMode
        if (mode != null && merchant != null && !passive && !bulkUnsupported) reward.onStage?.invoke(reward, mode)
    }
    Column(
        modifier = Modifier.width(112.dp).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(4.dp))
            .clickable(enabled = !disabled) { clicked() }.alpha(if (disabled) 0.6f else 1f).padding(8.dp)
            .semantics { contentDescription = "Exchange reward: ${reward.id} +${reward.level}" },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Box(modifier = Modifier.size(56.dp).border(1.dp, if (passive) Color(0xFF475569) else colors.border, RoundedCornerShape(4.dp)).background(Color.Black, RoundedCornerShape(4.dp))) {
            if (reward.kind != "gold" && reward.kind != "empty") Box(modifier = Modifier.align(Alignment.Center)) { com.partyconsole.companion.ui.itemicon.SpriteIcon(reward.sprite, size = 46.dp) }
            if (!passive) Text(banner.label, color = colors.text, fontSize = 9.sp, lineHeight = 10.sp, textAlign = TextAlign.Center, modifier = Modifier.align(Alignment.TopCenter).fillMaxWidth().background(colors.background).padding(horizontal = 1.dp))
            if (reward.quantity > 1) Text("×${"%,d".format(reward.quantity)}", color = Color.White, fontSize = 9.sp, modifier = Modifier.align(Alignment.BottomEnd).background(Color.Black).padding(horizontal = 2.dp))
        }
        if (reward.marking) Text(if (staged != null) "Pending" else "", color = Color(0xFF7DD3FC), fontSize = 9.sp, modifier = Modifier.height(12.dp))
        Text(reward.detail, color = Color(0xFFFCD34D), fontFamily = FontFamily.Monospace, fontSize = 10.sp)
        Text(name + if (reward.level != 0) " +${reward.level}" else "", style = MaterialTheme.typography.labelSmall, textAlign = TextAlign.Center)
    }
    if (options) {
        ModalBottomSheet(onDismissRequest = { options = false }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
            Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp)) {
                Text(name + if (reward.level != 0) " +${reward.level}" else "", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                TapRow("Item details") { options = false; reward.onInspect() }
                if (merchant != null && !passive) {
                    AutomaticItemActions(
                        viewModel, merchant, item, meta,
                        bank = bank == "bank", npc = npc, stand = stand, exchange = exchange,
                        exchangeable = state.merchantCatalog?.exchangeable.orEmpty().any { it.reward == null && it.id == item.name && it.level == reward.level },
                        upgradeTiers = upgradeTiers,
                        compoundTier = compound?.targetTier,
                        onDone = { options = false },
                    )
                }
            }
        }
    }
}

/** Automatic item actions for a prospective reward (slot -1), as this app's
 *  options rows with inline sub-lists and confirmations. */
@Composable
private fun AutomaticItemActions(
    viewModel: PartyViewModel,
    merchant: String,
    item: Item,
    meta: ItemMeta?,
    bank: Boolean,
    npc: Boolean,
    stand: Boolean,
    exchange: Boolean,
    exchangeable: Boolean,
    upgradeTiers: Int,
    compoundTier: Int?,
    onDone: () -> Unit,
) {
    val state by viewModel.dynamicState.collectAsState()
    val configLoaded by viewModel.stateLoaded.collectAsState()
    val scope = rememberCoroutineScope()
    val api = viewModel.api
    var expanded by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    fun toggle(key: String) { expanded = if (expanded == key) null else key }
    val level = item.level ?: 0
    val compoundMax = minOf(7, itemMaximumLevel(meta))
    suspend fun settle(result: ApiResult<CommandResult>): String? = when (result) {
        is ApiResult.Failure -> result.message
        is ApiResult.Success -> { viewModel.refreshDynamicStateNow(); onDone(); null }
    }
    fun command(type: String, slot: Int?, extra: Map<String, kotlinx.serialization.json.JsonElement>) = scope.launch {
        error = settle(api.itemCommand(type, merchant, item, slot?.let { JsonPrimitive(it) }, extra))
    }
    val commerce = automaticCommerceRuleKey(item)
    Column {
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        TapRow("Auto mark for bank", enabled = !bank) { command("auto-item-mark", null, mapOf("mode" to JsonPrimitive("bank"))) }
        TapRow(if (stand) "Update auto mark for stand…" else "Auto mark for stand…") { toggle("stand") }
        if (expanded == "stand") {
            val defaultPrice = maxOf(1L, (meta?.definition?.get("g") as? JsonPrimitive)?.content?.toDoubleOrNull()?.toLong() ?: 1L)
            StandListingForm(
                viewModel, item, meta, existingPrice = state.autoStandMarks[commerce]?.price?.takeIf { it > 0 } ?: defaultPrice, auto = true,
                onCancel = { expanded = null },
                onSubmit = { draft -> settle(api.autoStand(item, draft.price)) },
            )
        }
        if (exchangeable) TapRow("Auto exchange", enabled = configLoaded && !exchange) { command("auto-exchange", null, mapOf("slot" to JsonPrimitive(-1))) }
        if (meta?.upgradeable == true && itemMaximumLevel(meta) - level > 0) {
            TapRow("Auto mark for upgrade" + if (upgradeTiers != 0) " · $upgradeTiers tier${if (upgradeTiers == 1) "" else "s"}" else "") { toggle("upgrade") }
            if (expanded == "upgrade") {
                UpgradeTierPicker(meta, level, current = upgradeTiers) { tiers -> command("auto-upgrade-mark", null, mapOf("slot" to JsonPrimitive(-1), "tiers" to JsonPrimitive(tiers))) }
                // Rewards use the merchant's upgrade offerings.
                AddUpgradeRule(viewModel, merchant, item, meta)
            }
        }
        if (meta?.compoundable == true && level < compoundMax) {
            TapRow(compoundTier?.let { "Auto compound to +$it" } ?: "Auto compound") { toggle("compound") }
            if (expanded == "compound") CompoundTierPicker(meta, level, state.merchantCatalog?.buyable.orEmpty()) { target -> command("auto-compound-mark", null, mapOf("targetTier" to JsonPrimitive(target))) }
        }
        TapRow(if (npc) "Update auto sell to NPC…" else "Auto sell to NPC…") { toggle("npc") }
        if (expanded == "npc") {
            AutoNpcSaleConfirmation(item, meta, (meta?.definition?.get("name") as? JsonPrimitive)?.content ?: item.name, null, onCancel = { expanded = null },
                onConfirm = { settle(api.autoNpcSale(null, item)) })
        }
    }
}
