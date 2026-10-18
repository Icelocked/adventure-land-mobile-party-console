package com.partyconsole.companion.ui.account

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.NativePurchase
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.ui.PartyViewModel
import kotlinx.coroutines.launch

/** Console 1.4 wtb-unconfirmed-purchase.tsx: a purchase whose merchant job
 *  ended without confirming it pauses this WTB until the player says
 *  whether it was bought. PWA: WtbScreen.tsx WtbUnconfirmedPurchase. */
@Composable
fun WtbUnconfirmedPurchase(viewModel: PartyViewModel, itemId: String, name: String, purchases: Map<String, NativePurchase>) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    val (id, purchase) = purchases.entries.firstOrNull { it.value.item.name == itemId } ?: return
    val seller = id.split(":").getOrNull(1)?.ifEmpty { null }
    fun resolve(bought: Boolean) = scope.launch {
        busy = true
        error = ""
        val result = viewModel.api.resolveNativePurchase(id, bought)
        busy = false
        if (result is ApiResult.Failure) error = result.message else viewModel.refreshDynamicStateNow()
    }
    val amber = Color(0xFFFDE68A)
    Column(
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth().border(1.dp, Color(0xFFB45309), RoundedCornerShape(4.dp)).padding(8.dp)
            .semantics { contentDescription = "Unconfirmed purchase of $name" },
    ) {
        Text(
            "Purchase outcome unconfirmed: ${"%,d".format(purchase.quantity)} × $name at ${"%,d".format(purchase.item.price ?: 0L)}" +
                (seller?.let { " from $it" } ?: "") + ". The merchant job ended before reporting it, so this WTB is paused.",
            color = amber,
            style = MaterialTheme.typography.labelSmall,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(enabled = !busy, onClick = { resolve(true) }) { Text("It was bought") }
            OutlinedButton(enabled = !busy, onClick = { resolve(false) }) { Text("It wasn't bought") }
        }
        if (error.isNotEmpty()) Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall)
    }
}
