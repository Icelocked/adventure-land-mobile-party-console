package com.partyconsole.companion.ui.account

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.data.Domain
import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.model.InventoryEntry
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.ReceivedMail
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.DomainInterest
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.itemdetail.ItemDetailBrowser
import com.partyconsole.companion.ui.itemicon.SpriteIcon
import com.partyconsole.companion.ui.itemicon.displayName
import com.partyconsole.companion.ui.itemicon.rememberCatalogLookup
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.text.DateFormat
import java.time.Instant
import java.util.Date

private val Amber = Color(0xFFF59E0B)

/** A prefilled compose draft, e.g. from ALData's "Prepare mail". */
data class MailDraft(val recipient: String, val subject: String, val message: String)

/** " +N" for anything that has levels. */
private fun attachmentLevel(item: Item, info: CatalogItem?): String {
    val definition = info?.meta?.definition
    val levelled = item.level != null || info?.upgradeable == true || info?.compoundable == true || definition?.get("upgrade") != null || definition?.get("compound") != null
    return if (levelled) " +${item.level ?: 0}" else ""
}

private fun sentAt(sent: String?) = sent?.let { runCatching { DateFormat.getDateTimeInstance().format(Date.from(Instant.parse(it))) }.getOrDefault(it) }.orEmpty()
private fun ReceivedMail.takenState(): String? = (taken as? JsonPrimitive)?.content
private fun ReceivedMail.collectionState(): String = (collection as? JsonPrimitive)?.content.orEmpty()

/** Mail: the received-mail list (Refresh / Write message), a message's detail
 *  sheet (attachment collect, two-step delete, reply), and the compose form -
 *  attachments from the merchant's inventory, every bank pack and each
 *  bankboi, postage, and a two-step send. */
@Composable
fun MailScreen(viewModel: PartyViewModel, onBack: () -> Unit, initialDraft: MailDraft? = null) {
    DomainInterest(viewModel, Domain.MAIL)
    val mail by viewModel.mail.collectAsState()
    val state by viewModel.dynamicState.collectAsState()
    val scope = rememberCoroutineScope()
    val catalogFor = rememberCatalogLookup(state.merchantCatalog)
    var selectedId by remember { mutableStateOf<String?>(null) }
    var composing by remember { mutableStateOf(initialDraft != null) }
    var draft by remember { mutableStateOf(initialDraft) }
    var draftKey by remember { mutableStateOf(0) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val selected = mail.messages.find { it.id != null && it.id == selectedId }

    fun mailAction(action: String, id: String? = null) {
        scope.launch {
            busy = true
            error = null
            val result = viewModel.api.mailAction(action, id)
            busy = false
            if (result is ApiResult.Failure) {
                error = result.message.ifBlank { "Mail action failed" }
                return@launch
            }
            if (action == "delete") selectedId = null
            viewModel.refreshDynamicStateNow()
        }
    }

    AccountScreenScaffold("Mail (${mail.count})", onBack, onRefresh = { scope.launch { viewModel.refreshDynamicStateNow() } }) {
        Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            Row(modifier = Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(enabled = !busy, onClick = { mailAction("refresh") }) { Text("Refresh") }
                Button(onClick = { selectedId = null; composing = true }) { Text("Write message") }
            }
            if (selected == null) error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 12.dp)) }
            if (composing) {
                androidx.compose.runtime.key(draftKey) {
                    ComposeSection(viewModel, draft, catalogFor) {
                        composing = false
                        draft = null
                    }
                }
            }
            mail.error?.let { Text("Mail may be out of date: $it", color = Amber, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(horizontal = 12.dp)) }
            if (mail.messages.isEmpty()) {
                Text(if (mail.updatedAt != null) "No received mail." else "Loading mail…", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(24.dp))
            } else {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (message in mail.messages) {
                        Column(
                            modifier = Modifier.fillMaxWidth().border(BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), RoundedCornerShape(6.dp))
                                .clickable { error = null; selectedId = message.id }.padding(12.dp),
                        ) {
                            Text(message.subject?.ifEmpty { null } ?: "(No subject)", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                            Text("From ${message.from.orEmpty()}", style = MaterialTheme.typography.labelSmall)
                            Text(sentAt(message.sent), style = MaterialTheme.typography.labelSmall)
                            if (message.item != null) {
                                Text(
                                    if (message.takenState() == "true") "Attachment collected" else message.collectionState().ifEmpty { "Attachment available" },
                                    color = Amber,
                                    style = MaterialTheme.typography.labelSmall,
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    selected?.let { message ->
        MailDetailSheet(viewModel, message, catalogFor, busy, error, onAction = ::mailAction, onReply = {
            selectedId = null
            draft = MailDraft(message.from.orEmpty(), "", "")
            draftKey++
            composing = true
        }, onClose = { selectedId = null; error = null })
    }
}

@Composable
private fun MailDetailSheet(
    viewModel: PartyViewModel,
    mail: ReceivedMail,
    catalogFor: (String) -> CatalogItem?,
    busy: Boolean,
    error: String?,
    onAction: (String, String?) -> Unit,
    onReply: () -> Unit,
    onClose: () -> Unit,
) {
    val state by viewModel.dynamicState.collectAsState()
    var confirmingDelete by remember { mutableStateOf(false) }
    var inspecting by remember { mutableStateOf(false) }
    val info = mail.item?.let { catalogFor(it.name) }
    val collection = mail.collectionState()
    val collectionActive = collection in setOf("queued", "collecting")
    val taken = mail.takenState()

    ModalBottomSheet(onDismissRequest = onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(mail.subject.orEmpty(), style = MaterialTheme.typography.titleMedium)
            Text("${mail.from.orEmpty()} → ${mail.to.orEmpty()} · ${sentAt(mail.sent)}", style = MaterialTheme.typography.labelSmall)
            Text(mail.message.orEmpty(), style = MaterialTheme.typography.bodyMedium)
            mail.item?.let { item ->
                Column(modifier = Modifier.fillMaxWidth().border(BorderStroke(1.dp, Amber.copy(alpha = 0.6f)), RoundedCornerShape(6.dp)).padding(10.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth().clickable { inspecting = true }.padding(4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        SpriteIcon(info?.sprite ?: info?.meta?.sprite, size = 40.dp)
                        Text("${info?.name ?: item.name}${attachmentLevel(item, info)} × ${item.q ?: 1}", style = MaterialTheme.typography.bodyMedium)
                    }
                    Text(
                        when (taken) {
                            "true" -> "Collected"
                            "pending" -> "Game is processing collection"
                            else -> collection.ifEmpty { "Unclaimed" }
                        } + (mail.collectionError?.let { ": $it" } ?: ""),
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                    Button(enabled = !busy && taken == "false" && !collectionActive, onClick = { onAction("collect", mail.id) }, modifier = Modifier.padding(top = 6.dp)) {
                        Text("Collect attachment")
                    }
                }
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                val deleteEnabled = !busy && !(mail.item != null && taken != "true") && !collectionActive
                if (confirmingDelete) {
                    Button(enabled = deleteEnabled, colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error), onClick = { onAction("delete", mail.id) }) { Text("Confirm permanent deletion") }
                    OutlinedButton(onClick = { confirmingDelete = false }) { Text("Cancel deletion") }
                } else {
                    OutlinedButton(enabled = deleteEnabled, onClick = { confirmingDelete = true }) { Text("Delete message") }
                }
                Row(modifier = Modifier.weight(1f), horizontalArrangement = Arrangement.End) {
                    OutlinedButton(enabled = !busy, onClick = onReply) { Text("Reply") }
                }
            }
        }
    }
    if (inspecting && mail.item != null) {
        ModalBottomSheet(onDismissRequest = { inspecting = false }) {
            Column(modifier = Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
                ItemDetailBrowser(rootItemId = mail.item.name, rootLevel = mail.item.level ?: 0, catalog = state.merchantCatalog, monsters = state.bestiaryCatalog, rootStatType = mail.item.statType, viewModel = viewModel, context = com.partyconsole.companion.ui.itemdetail.ItemDetailContext("Mail attachment", -1))
            }
        }
    }
}

private data class Attachment(val pack: String, val label: String, val entry: InventoryEntry)

@Composable
private fun ComposeSection(viewModel: PartyViewModel, draft: MailDraft?, catalogFor: (String) -> CatalogItem?, onClose: () -> Unit) {
    // The attachment sources include every bank pack and bankboi.
    DomainInterest(viewModel, Domain.BANK)
    val state by viewModel.dynamicState.collectAsState()
    val characters by viewModel.characters.collectAsState()
    val scope = rememberCoroutineScope()
    val merchant = state.merchantCharacter
    var recipient by remember { mutableStateOf(draft?.recipient.orEmpty()) }
    var subject by remember { mutableStateOf(draft?.subject.orEmpty()) }
    var message by remember { mutableStateOf(draft?.message.orEmpty()) }
    var attachment by remember { mutableStateOf<Attachment?>(null) }
    var quantity by remember { mutableStateOf("") }
    var search by remember { mutableStateOf("") }
    var confirming by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var postage by remember { mutableStateOf<Long?>(null) }
    var inspectingAttachment by remember { mutableStateOf(false) }

    // GET /mail/postage.
    LaunchedEffect(Unit) {
        (viewModel.api.get("mail/postage") as? ApiResult.Success)?.let { result ->
            runCatching { (Json.parseToJsonElement(result.value) as JsonObject)["gold"] as? JsonPrimitive }.getOrNull()?.content?.toDoubleOrNull()?.let { postage = it.toLong() }
        }
    }
    fun reset() { confirming = false; error = null }

    val sources = buildList {
        if (merchant != null) add(Triple("$merchant inventory", "merchant", characters[merchant]?.inventory?.items.orEmpty()))
        for ((pack, items) in state.bank?.packs.orEmpty()) add(Triple("Bank · $pack", pack, items))
        for (bankboi in state.bankbois) add(Triple("Bankboi · ${bankboi.name}", "bankboi:${bankboi.name}", bankboi.items))
    }
    val query = search.trim().lowercase()
    val filtered = sources.map { (label, pack, items) -> Triple(label, pack, items.filterNotNull().filter { "${it.item.name} ${catalogFor(it.item.name)?.name.orEmpty()}".lowercase().contains(query) }) }
        .filter { it.third.isNotEmpty() }
    val attachmentInfo = attachment?.let { catalogFor(it.entry.item.name) }
    val available = maxOf(1, attachment?.entry?.item?.q ?: 1)
    val stackSize = (attachmentInfo?.meta?.definition?.get("s") as? JsonPrimitive)?.content?.toDoubleOrNull() ?: 1.0
    val stackable = available > 1 || stackSize > 1
    val validQuantity = !stackable || quantity.toIntOrNull()?.let { it in 1..available } == true

    Column(
        modifier = Modifier.fillMaxWidth().padding(12.dp).border(BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), RoundedCornerShape(6.dp)).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text("Write message", style = MaterialTheme.typography.titleSmall)
        OutlinedTextField(value = recipient, onValueChange = { recipient = it; reset() }, label = { Text("Character name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(value = subject, onValueChange = { subject = it.take(74); reset() }, label = { Text("Subject") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(value = message, onValueChange = { message = it.take(1000); reset() }, label = { Text("Message") }, minLines = 4, modifier = Modifier.fillMaxWidth())

        val chosen = attachment
        if (chosen != null) {
            Column(modifier = Modifier.fillMaxWidth().border(BorderStroke(1.dp, Amber.copy(alpha = 0.6f)), RoundedCornerShape(6.dp)).padding(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    // The selected attachment opens its item details.
                    Row(modifier = Modifier.weight(1f).clickable { inspectingAttachment = true }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        SpriteIcon(attachmentInfo?.sprite ?: attachmentInfo?.meta?.sprite, size = 36.dp)
                        Column {
                            Text("${displayName(chosen.entry.item.name, catalogFor)}${attachmentLevel(chosen.entry.item, attachmentInfo)}", style = MaterialTheme.typography.bodyMedium)
                            Text("${chosen.label} · slot ${chosen.entry.slot}", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall)
                        }
                    }
                    OutlinedButton(enabled = !busy, onClick = { attachment = null; quantity = ""; reset() }) { Text("Clear attachment") }
                }
                if (stackable) {
                    OutlinedTextField(value = quantity, onValueChange = { quantity = it.filter(Char::isDigit); reset() }, label = { Text("Quantity (1–$available)") }, singleLine = true, modifier = Modifier.fillMaxWidth().padding(top = 6.dp))
                }
            }
            if (inspectingAttachment) {
                ModalBottomSheet(onDismissRequest = { inspectingAttachment = false }) {
                    Column(modifier = Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
                        ItemDetailBrowser(rootItemId = chosen.entry.item.name, rootLevel = chosen.entry.item.level ?: 0, catalog = state.merchantCatalog, monsters = state.bestiaryCatalog, rootStatType = chosen.entry.item.statType, viewModel = viewModel, context = com.partyconsole.companion.ui.itemdetail.ItemDetailContext("Mail attachment", chosen.entry.slot))
                    }
                }
            }
        } else {
            Text("Optional: select an attachment below.", style = MaterialTheme.typography.labelSmall)
        }

        Column(modifier = Modifier.fillMaxWidth().heightIn(max = 360.dp).border(BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), RoundedCornerShape(6.dp)).verticalScroll(rememberScrollState()).padding(8.dp)) {
            OutlinedTextField(value = search, onValueChange = { search = it }, label = { Text("Search items to attach…") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            if (filtered.isEmpty()) Text("No matching items.", style = MaterialTheme.typography.labelSmall)
            for ((label, pack, items) in filtered) {
                Text(label.uppercase(), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 8.dp))
                for (entry in items) {
                    val info = catalogFor(entry.item.name)
                    val picked = attachment?.pack == pack && attachment?.entry?.slot == entry.slot
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp)
                            .border(BorderStroke(1.dp, if (picked) Color(0xFFFBBF24) else MaterialTheme.colorScheme.outlineVariant), RoundedCornerShape(6.dp))
                            .clickable { attachment = Attachment(pack, label, entry); quantity = ""; reset() }.padding(6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        SpriteIcon(info?.sprite, size = 28.dp)
                        Text("${displayName(entry.item.name, catalogFor)}${attachmentLevel(entry.item, info)}${entry.item.q?.takeIf { it > 1 }?.let { " x$it" } ?: ""}", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }

        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        Text(
            (postage?.let { "Postage: ${"%,d".format(it)} gold per message, charged by Adventure Land." } ?: "Postage estimate unavailable. Sending mail spends your character’s gold.") +
                (if (attachment != null) " The attached items also leave your inventory." else ""),
            color = Amber,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.fillMaxWidth().border(BorderStroke(1.dp, Amber.copy(alpha = 0.6f)), RoundedCornerShape(6.dp)).padding(10.dp),
        )
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)) {
            OutlinedButton(enabled = !busy, onClick = onClose) { Text("Cancel") }
            Button(
                enabled = !busy && recipient.isNotBlank() && subject.isNotBlank() && (attachment == null || validQuantity),
                colors = if (confirming) ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error) else ButtonDefaults.buttonColors(),
                onClick = {
                    if (!confirming) {
                        confirming = true
                        return@Button
                    }
                    scope.launch {
                        busy = true
                        error = null
                        val source = attachment
                        val result = viewModel.api.sendMail(
                            recipient.trim(), subject.trim(), message,
                            quantity = if (stackable) quantity.toIntOrNull() ?: 1 else 1,
                            sourcePack = source?.pack, sourceSlot = source?.entry?.slot, sourceItem = source?.entry?.item,
                        )
                        busy = false
                        if (result is ApiResult.Failure) {
                            error = result.message.ifBlank { "Mail could not be queued" }
                            confirming = false
                        } else {
                            // The ALData auth mail starts the pending-auth poll.
                            if (recipient.trim() == "earthiverse" && subject.trim() == "aldata_auth") viewModel.aldataAuthPending.value = true
                            viewModel.refreshDynamicStateNow()
                            onClose()
                        }
                    }
                },
            ) { Text(if (busy) "Queuing…" else if (confirming) "Really send mail?" else "Send mail") }
        }
    }
}
