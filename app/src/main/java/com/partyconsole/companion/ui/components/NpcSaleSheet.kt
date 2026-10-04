package com.partyconsole.companion.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.ItemMeta
import com.partyconsole.companion.ui.itemdetail.npcSaleValue
import kotlinx.coroutines.launch
import java.text.NumberFormat

/** npc-sale.ts: upgraded, stat-scrolled or shiny gear is destroyed by an
 *  NPC sale, and the server refuses it without `acknowledged`. */
fun isModifiedItem(item: Item): Boolean = (item.level ?: 0) > 0 || item.statType != null || item.p != null

/** party-management-panels.tsx's "Sell to NPC?" dialog + use-party-
 *  console.tsx confirmNpcSale's checks (the PWA's NpcSaleSheet): the
 *  quantity defaults to the whole stack (fixed for "sell all"), "You will
 *  receive" shows the proceeds, modified gear needs the acknowledgement,
 *  and nothing is sent until Sell is pressed. [onConfirm] returns an error
 *  message, or null on success. */
@Composable
fun NpcSaleSheet(
    item: Item,
    meta: ItemMeta?,
    location: String,
    available: Int,
    all: Boolean = false,
    onConfirm: suspend (quantity: Int, acknowledged: Boolean) -> String?,
    onCancel: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var quantity by remember(item, available) { mutableStateOf(available.toString()) }
    var acknowledged by remember(item) { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val each = npcSaleValue(item.level ?: 0, item.gift == true, item.expires, meta)
    val modified = isModifiedItem(item)
    val format = NumberFormat.getIntegerInstance()

    Card(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(if (all) "Sell all matching bank items to NPC?" else "Sell to NPC?", style = MaterialTheme.typography.titleSmall)
            Text("$location. Once sold, the sale cannot be undone.", style = MaterialTheme.typography.labelSmall)
            OutlinedTextField(
                value = quantity,
                enabled = !busy && !all,
                onValueChange = { new -> quantity = new.filter { it.isDigit() } },
                label = { Text("Quantity") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Text(
                "You will receive: ${format.format(each * (quantity.toLongOrNull() ?: 0L))}g (${format.format(each)}g each)",
                style = MaterialTheme.typography.bodySmall,
            )
            if (modified) {
                Row(verticalAlignment = Alignment.Top) {
                    Checkbox(checked = acknowledged, onCheckedChange = { acknowledged = it })
                    Text(
                        "I understand this is modified gear and selling it will permanently destroy it.",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                }
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    enabled = !busy,
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                    onClick = {
                        error = null
                        val n = quantity.toIntOrNull()
                        if (n == null || n < 1 || n > available) {
                            error = "Enter a quantity from 1 to $available"
                            return@Button
                        }
                        if (modified && !acknowledged) {
                            error = "Confirm the modified-item warning"
                            return@Button
                        }
                        scope.launch {
                            busy = true
                            error = onConfirm(n, acknowledged)
                            busy = false
                        }
                    },
                ) { Text(if (busy) "Queueing…" else if (all) "Sell all to NPC" else "Sell to NPC") }
                OutlinedButton(enabled = !busy, onClick = onCancel) { Text("Cancel") }
            }
        }
    }
}
