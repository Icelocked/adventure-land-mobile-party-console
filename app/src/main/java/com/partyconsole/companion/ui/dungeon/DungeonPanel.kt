package com.partyconsole.companion.ui.dungeon

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedIconButton
import androidx.compose.material3.Surface
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.partyconsole.companion.data.dungeonCountdown
import com.partyconsole.companion.model.CaveChoice
import com.partyconsole.companion.model.CaveState
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.components.rememberClock
import com.partyconsole.companion.ui.itemdetail.ItemDetailBrowser
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import com.partyconsole.companion.ui.itemicon.rememberCatalogLookup
import kotlinx.coroutines.launch

internal val PanelBackground = Color(0xFF101C1A)
internal val Emerald50 = Color(0xFFECFDF5)
private val Red = Color(0xFFEF4444)
private val Green = Color(0xFF22C55E)
private val Orange = Color(0xFFF97316)

private data class Vote(val choice: String, val option: String, val cost: Long, val amber: Long)

private val RECOVERY_LABELS = mapOf(
    "idle" to "Preparing priest recovery",
    "healing" to "Healing gravestone",
    "waiting" to "Waiting for priest recovery",
    "ready" to "Preparing Revive",
    "dispatched" to "Revive sent - awaiting confirmation",
    "reviving" to "Reviving",
    "uncertain" to "Revive outcome unknown - awaiting confirmation",
    "failed" to "Priest revival failed - use Nera",
    "complete" to "Revival complete",
)

@Composable
internal fun DungeonButton(label: String, enabled: Boolean = true, border: Color = Color(0xFF64748B), modifier: Modifier = Modifier, onClick: () -> Unit) {
    OutlinedButton(enabled = enabled, onClick = onClick, border = BorderStroke(if (border == Color(0xFF64748B)) 1.dp else 2.dp, border), modifier = modifier) {
        Text(label, color = Emerald50)
    }
}

/** The Cave of Many Dreams run controls at the top of the party screen while
 *  a visit is underway - exit with confirmation, retry / recover, floor,
 *  timer, funds, members, automatic exploration, priest recovery and "Call
 *  Nera", room moves, the encounter vote (paid votes confirmed), the cave
 *  shop and the full floor map (CaveMap.kt). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DungeonPanel(viewModel: PartyViewModel) {
    val query = rememberDungeons(viewModel)
    val view by query.view.collectAsState()
    val busy by query.busy.collectAsState()
    val actionError by query.actionError.collectAsState()
    val state by viewModel.dynamicState.collectAsState()
    val catalogFor = rememberCatalogLookup(state.merchantCatalog)
    val now = rememberClock()
    val scope = rememberCoroutineScope()
    var vote by remember { mutableStateOf<Vote?>(null) }
    var purchase by remember { mutableStateOf<String?>(null) }
    var inspectedChoice by remember { mutableStateOf<String?>(null) }
    var requestedRoom by remember { mutableStateOf<String?>(null) }
    var exitConfirm by remember { mutableStateOf(false) }
    var itemInspection by remember { mutableStateOf<String?>(null) }
    val current = view ?: return
    if (current.state.phase in setOf("idle", "held")) return
    val cave = current.members.find { it.fresh && it.observation?.cave != null }?.observation?.cave
    val choice = cave?.choice
    val recovery = current.state.priestRecovery
    val priest = current.members.find { it.name == recovery?.priest }
    val report = if (priest?.fresh == true && priest.observation?.recovery?.id == recovery?.id) priest.observation?.recovery else null
    val channel = current.members.any { it.observation?.recovery?.actor?.c?.get("revival") != null }
    val recoveryBusy = (recovery?.authorized == true && (report == null || report.phase !in setOf("failed", "complete"))) || channel
    val recoveryLabel = report?.reason ?: RECOVERY_LABELS[report?.phase ?: "idle"]
    fun action(vararg body: Pair<String, Any?>) = scope.launch { query.action(mapOf("run" to cave?.run) + body) }
    val shopItem = choice?.shop?.name?.let { catalogFor(it) }
    val travelling = current.state.progress?.enabled == true || current.state.travel != null || current.state.commands.values.any { it.action == "move" }
    val choiceOpen = choice != null && (!choice.resolved || inspectedChoice == choice.id || (choice.shop?.nearby == true && requestedRoom == choice.shop.room))
    val anyDead = current.members.any { it.observation?.alive == false }

    @Composable
    fun ExitControls() {
        Column(horizontalAlignment = Alignment.End, modifier = Modifier.fillMaxWidth()) {
            DungeonButton("Exit dungeon", enabled = !busy && current.state.phase != "exiting", border = Red) { exitConfirm = true }
            if (exitConfirm) {
                Column(modifier = Modifier.fillMaxWidth().padding(top = 8.dp).border(1.dp, Color(0xFF64748B), RoundedCornerShape(4.dp)).padding(12.dp).semantics { contentDescription = "Exit the dungeon?" }) {
                    Text("Exit the dungeon?", fontWeight = FontWeight.SemiBold, color = Emerald50)
                    Text("The whole party will leave the cave and stop outside. Leave now?", color = Slate300, style = MaterialTheme.typography.bodySmall)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.align(Alignment.End).padding(top = 8.dp)) {
                        DungeonButton("Stay in dungeon") { exitConfirm = false }
                        DungeonButton("Confirm exit", enabled = !busy, border = Red) {
                            exitConfirm = false
                            action("action" to "exit")
                        }
                    }
                }
            }
        }
    }

    Column(
        modifier = Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, top = 12.dp).border(1.dp, Color(0xFF64748B), RoundedCornerShape(4.dp))
            .background(PanelBackground).padding(12.dp).semantics { contentDescription = "Cave of Many Dreams controls" },
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (!choiceOpen) ExitControls()
        if (current.state.error != null) DungeonButton("Retry failed preparation", enabled = !busy) { action("action" to "retry") }
        if (current.members.any { it.fresh && it.observation?.cave == null && it.observation?.visit?.resume != null }) {
            DungeonButton("Return missing participants", enabled = !busy) { action("action" to "recover") }
        }
        Text("Cave of Many Dreams", fontWeight = FontWeight.SemiBold, color = Emerald50)
        Text(
            if (cave != null) "Floor ${cave.floor + 1} · ${dungeonCountdown(if (cave.paused) now + cave.remainingMs else cave.expires, now)} remaining" +
                (if (cave.paused) " (paused" + (if (choice != null && !choice.resolved) " for ${choice.title}" else "") + ")" else "") +
                " · ${cave.gold} gold · ${cave.amber} Amber"
            else current.state.phase,
            color = Emerald50,
            style = MaterialTheme.typography.bodySmall,
        )
        Text(current.members.joinToString(" · ") { it.name + if (it.fresh) "" else " — awaiting connection" }, color = Slate300, style = MaterialTheme.typography.bodySmall)
        if (cave != null) androidx.compose.runtime.key(cave.run + ":" + cave.floor) {
            CaveMap(viewModel, current.state.participants, cave, actionError) { body -> query.action(mapOf("run" to cave.run) + body) }
        }
        if (current.state.phase == "active") {
            Text(current.state.progress?.message ?: "Continue through the cave toward the next floor.", color = Color(0xFFE2E8F0), style = MaterialTheme.typography.bodySmall)
            DungeonButton(if (travelling) "Stop travel" else "Start automatic exploration", enabled = !busy && cave?.paused != true) { action("action" to "progress", "enabled" to !travelling) }
            Text("Choose a room below to travel there. Automatic exploration visits required rooms and stairs. Stopping travel still allows defensive combat and healing.", color = Slate300, style = MaterialTheme.typography.labelSmall)
        }
        if (recovery != null) Text("${recovery.priest} reviving ${recovery.target}: $recoveryLabel", color = Color(0xFFD1FAE5), style = MaterialTheme.typography.bodySmall)
        if (recovery == null && anyDead) {
            Text(if (current.state.manualRecovery) "Nera recovery requested" else "Waiting for an available priest with an Essence of Life. Call Nera if needed.", color = Color(0xFFE2E8F0), style = MaterialTheme.typography.bodySmall)
        }
        if (anyDead) {
            DungeonButton("Call Nera — revival choices", enabled = !busy && current.state.phase == "active" && !recoveryBusy && (choice == null || choice.resolved)) { action("action" to "revival") }
        }
        cave?.points?.filter { !it.exit }?.chunked(2)?.forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for (p in row) {
                    DungeonButton(
                        p.label + (if (p.map != "zone_${cave.run}_${cave.floor}") " — different floor" else "") + (if (p.locked) " — locked" else if (p.done) " — complete" else ""),
                        enabled = !busy && !cave.paused && !p.locked && !p.done && current.state.phase == "active",
                        border = if (p.done) Green else if (p.required) Orange else Color(0xFF64748B),
                        modifier = Modifier.weight(1f),
                    ) {
                        requestedRoom = p.room
                        if (choice?.shop?.nearby == true && p.room == choice.shop.room) inspectedChoice = choice.id
                        else action("action" to "move", "target" to p.id)
                    }
                }
                if (row.size == 1) Box(modifier = Modifier.weight(1f))
            }
        }
        if (choice?.resolved == true) DungeonButton("View encounter — ${choice.title}") { inspectedChoice = choice.id }
        (actionError.ifEmpty { null } ?: current.state.error)?.let { Text(it, color = Rose200, style = MaterialTheme.typography.bodySmall) }
    }

    if (choice != null && cave != null && choiceOpen) {
        Dialog(onDismissRequest = { if (choice.resolved) { inspectedChoice = null; requestedRoom = null } }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
            Surface(modifier = Modifier.fillMaxSize(), color = PanelBackground) {
                ChoiceContent(
                    choice, cave, now, busy, actionError, vote, purchase,
                    shopName = shopItem?.name ?: choice.shop?.name.orEmpty(),
                    shopSprite = shopItem?.sprite,
                    onClose = { inspectedChoice = null; requestedRoom = null },
                    onVote = { option ->
                        if ((option.cost ?: 0) != 0L || (option.amber ?: 0) != 0L) vote = Vote(choice.id, option.id, option.cost ?: 0, option.amber ?: 0)
                        else action("action" to "vote", "choice" to choice.id, "option" to option.id)
                    },
                    onConfirmVote = { v ->
                        action("action" to "vote", "choice" to v.choice, "option" to v.option, "cost" to v.cost, "amber" to v.amber, "confirmed" to true)
                        vote = null
                    },
                    onCancelVote = { vote = null },
                    onInspectShop = { itemInspection = choice.shop?.name },
                    onBuy = { purchase = choice.id },
                    onConfirmPurchase = {
                        purchase = null
                        action("action" to "buy", "choice" to choice.id, "cost" to choice.shop!!.price, "confirmed" to true)
                    },
                    onCancelPurchase = { purchase = null },
                    exitControls = { ExitControls() },
                )
            }
        }
    }
    itemInspection?.let { id ->
        ModalBottomSheet(onDismissRequest = { itemInspection = null }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
            Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp)) {
                ItemDetailBrowser(rootItemId = id, rootLevel = 0, catalog = state.merchantCatalog, monsters = state.bestiaryCatalog, viewModel = viewModel, context = com.partyconsole.companion.ui.itemdetail.ItemDetailContext(view?.members?.firstOrNull()?.name.orEmpty(), -1))
            }
        }
    }
}

@Composable
private fun ChoiceContent(
    choice: CaveChoice,
    cave: CaveState,
    now: Long,
    busy: Boolean,
    actionError: String,
    vote: Vote?,
    purchase: String?,
    shopName: String,
    shopSprite: com.partyconsole.companion.model.Sprite?,
    onClose: () -> Unit,
    onVote: (com.partyconsole.companion.model.CaveChoiceOption) -> Unit,
    onConfirmVote: (Vote) -> Unit,
    onCancelVote: () -> Unit,
    onInspectShop: () -> Unit,
    onBuy: () -> Unit,
    onConfirmPurchase: () -> Unit,
    onCancelPurchase: () -> Unit,
    exitControls: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp).semantics { contentDescription = "Cave choice" },
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Column(modifier = Modifier.weight(1f)) {
                Text(choice.title, fontWeight = FontWeight.SemiBold, color = Emerald50)
                Text("Party funds: ${"%,d".format(cave.gold)} gold · ${"%,d".format(cave.amber)} Amber", fontWeight = FontWeight.SemiBold, color = Amber200, style = MaterialTheme.typography.bodySmall)
                Text(if (choice.resolved) "Encounter result" else "The cave timer and route are paused until the party answers.", color = Slate300, style = MaterialTheme.typography.bodySmall)
            }
            if (choice.resolved) {
                OutlinedIconButton(onClick = onClose, modifier = Modifier.semantics { contentDescription = "Close encounter" }) { Icon(Icons.Filled.Close, contentDescription = null, tint = Emerald50) }
            }
        }
        Text(choice.text, color = Emerald50, style = MaterialTheme.typography.bodySmall)
        if (choice.resolved) Text("${choice.resultLabel ?: "This choice has ended."} ${choice.summary.orEmpty().joinToString(" ")}", color = Amber200, style = MaterialTheme.typography.bodySmall)
        if (!choice.resolved) {
            Text("Vote closes in ${dungeonCountdown(choice.deadline, now)}", color = Emerald50, style = MaterialTheme.typography.bodySmall)
            Text("The cave offers two replies for each encounter. Other gifts or replies mentioned in the story may not be offered on this visit.", color = Slate300, style = MaterialTheme.typography.labelSmall)
            choice.options.chunked(2).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (o in row) {
                        OutlinedButton(
                            enabled = !busy && !choice.resolved && now < choice.deadline && o.unavailable == null,
                            onClick = { onVote(o) },
                            modifier = Modifier.weight(1f),
                        ) {
                            Column {
                                Text(
                                    o.label + (o.cost?.takeIf { it != 0L }?.let { " — $it shared gold" } ?: "") + (o.amber?.takeIf { it != 0L }?.let { " — $it Amber" } ?: "") + (o.unavailable?.let { " — $it" } ?: ""),
                                    color = Emerald50,
                                )
                                Text(choice.votes.filterValues { it == o.id }.keys.joinToString(", "), style = MaterialTheme.typography.labelSmall, color = Emerald50)
                            }
                        }
                    }
                    if (row.size == 1) Box(modifier = Modifier.weight(1f))
                }
            }
        }
        if (vote?.choice == choice.id && !choice.resolved) {
            Column(modifier = Modifier.semantics { contentDescription = "Confirm paid dungeon choice" }, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Spend ${vote.cost} shared gold and ${vote.amber} Amber if this choice wins?", color = Emerald50, style = MaterialTheme.typography.bodySmall)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    DungeonButton("Confirm vote", enabled = !busy) { onConfirmVote(vote) }
                    DungeonButton("Cancel") { onCancelVote() }
                }
            }
        }
        val shop = choice.shop
        if (shop != null) {
            Text("$shopName — ${shop.price} shared gold" + if (shop.sold) " — sold" else "", color = Emerald50, style = MaterialTheme.typography.bodySmall)
            OutlinedButton(onClick = onInspectShop, modifier = Modifier.semantics { contentDescription = "Inspect cave shop item" }) {
                Box(modifier = Modifier.background(Color.Black)) { SpriteIcon(shopSprite, size = 48.dp) }
                Text("$shopName — view details", color = Emerald50, modifier = Modifier.padding(start = 12.dp))
            }
            DungeonButton("Buy…", enabled = !busy && !shop.sold && choice.resolved && shop.nearby && cave.gold >= shop.price) { onBuy() }
            if (purchase == choice.id) {
                Column(modifier = Modifier.semantics { contentDescription = "Confirm dungeon purchase" }, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Spend ${shop.price} shared gold on $shopName?", color = Emerald50, style = MaterialTheme.typography.bodySmall)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        DungeonButton("Confirm purchase") { onConfirmPurchase() }
                        DungeonButton("Cancel") { onCancelPurchase() }
                    }
                }
            }
        }
        if (actionError.isNotEmpty()) Text(actionError, color = Rose200, style = MaterialTheme.typography.bodySmall)
        exitControls()
    }
}
