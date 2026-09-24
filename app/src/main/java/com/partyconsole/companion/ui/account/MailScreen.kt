package com.partyconsole.companion.ui.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.model.ReceivedMail
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.itemicon.displayName
import com.partyconsole.companion.ui.itemicon.rememberCatalogLookup
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull

/** Mail inbox (GET /party-api/mail) plus compose and attachment collection
 *  - the two actions send-mail-dialog.tsx exposes that weren't wired in
 *  the first pass. No item/gold attachment on send yet: that needs a
 *  "which character's inventory" picker this screen has no natural
 *  context for, called out as its own remaining gap rather than silently
 *  dropped. */
@Composable
fun MailScreen(viewModel: PartyViewModel, onBack: () -> Unit) {
    val mail by viewModel.mail.collectAsState()
    val dynamicState by viewModel.dynamicState.collectAsState()
    val catalogFor = rememberCatalogLookup(dynamicState.merchantCatalog)
    val scope = rememberCoroutineScope()
    var composing by remember { mutableStateOf(false) }
    var recipient by remember { mutableStateOf("") }
    var subject by remember { mutableStateOf("") }
    var body by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    AccountScreenScaffold("Mail (${mail.count})", onBack, onRefresh = { scope.launch { viewModel.refreshDynamicStateNow() } }) {
        Row(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
            Button(onClick = { composing = !composing }) {
                Text(if (composing) "Cancel" else "Compose")
            }
        }
        if (composing) {
            Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
                OutlinedTextField(recipient, { recipient = it }, label = { Text("To (character name)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(subject, { subject = it }, label = { Text("Subject") }, singleLine = true, modifier = Modifier.fillMaxWidth().padding(top = 6.dp))
                OutlinedTextField(body, { body = it }, label = { Text("Message") }, modifier = Modifier.fillMaxWidth().padding(top = 6.dp))
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                Button(
                    modifier = Modifier.padding(top = 8.dp),
                    onClick = {
                        scope.launch {
                            when (val result = viewModel.api.sendMail(recipient.trim(), subject.trim(), body)) {
                                is ApiResult.Failure -> error = result.message
                                is ApiResult.Success -> {
                                    composing = false; recipient = ""; subject = ""; body = ""; error = null
                                    viewModel.refreshDynamicStateNow()
                                }
                            }
                        }
                    },
                ) { Text("Send") }
            }
        }
        if (mail.messages.isEmpty()) {
            EmptyState("No mail.")
        } else {
            LazyColumn(contentPadding = PaddingValues(12.dp)) {
                items(mail.messages, key = { it.id ?: it.hashCode().toString() }) { MailRow(it, catalogFor, viewModel) }
            }
        }
    }
}

@Composable
private fun MailRow(mail: ReceivedMail, catalogFor: (String) -> CatalogItem?, viewModel: PartyViewModel) {
    val scope = rememberCoroutineScope()
    val taken = (mail.taken as? JsonPrimitive)?.let {
        it.booleanOrNull == true || it.contentOrNull == "pending"
    } ?: false
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text("${mail.subject ?: "(no subject)"} — from ${mail.from ?: "unknown"}", style = MaterialTheme.typography.titleSmall)
            mail.message?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
            mail.item?.let { item ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Attached: ${displayName(item.name, catalogFor)}", style = MaterialTheme.typography.labelSmall)
                    if (!taken && mail.id != null) {
                        TextButton(onClick = { scope.launch { viewModel.api.collectMail(mail.id) } }) {
                            Text("Collect")
                        }
                    } else if (taken) {
                        Text("(collected)", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            mail.sent?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}
