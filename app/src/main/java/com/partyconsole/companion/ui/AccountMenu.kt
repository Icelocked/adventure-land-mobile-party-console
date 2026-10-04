package com.partyconsole.companion.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.domain.occupiedStandSlots
import com.partyconsole.companion.domain.standMerchant

/** character-detail/AccountMenu.tsx: the account-wide tools, reachable from
 *  home and from any character, in the dashboard's order. */
private val ACCOUNT_ITEMS = listOf(
    "Mail" to Routes.ACCOUNT_MAIL,
    "Catalog" to Routes.ACCOUNT_CATALOG,
    "Bestiary" to Routes.ACCOUNT_BESTIARY,
    "Skills" to Routes.ACCOUNT_SKILLS,
    "Inspect stand" to Routes.ACCOUNT_STAND,
    "View Market" to Routes.ACCOUNT_MARKET,
    "Inspect Bank" to Routes.ACCOUNT_BANK,
    "Merchant routines" to Routes.ROUTINES,
    "WTB orders" to Routes.WTB,
    "Logs" to Routes.ACCOUNT_LOGS,
    "Settings" to Routes.ACCOUNT_SETTINGS,
)

@Composable
fun AccountMenuSheet(
    viewModel: PartyViewModel,
    onNavigate: (String) -> Unit,
    onDismiss: () -> Unit,
    // The APK's own per-character screens, shown on a character's menu
    // until their content is inline on the character screen like the PWA's.
    characterItems: List<Pair<String, String>> = emptyList(),
) {
    // mail-count.tsx: "Mail (N)" while the inbox has messages.
    val mail by viewModel.mail.collectAsState()
    // party-header.tsx: "Inspect stand · N/16" (stand-count.tsx).
    val state by viewModel.dynamicState.collectAsState()
    val characters by viewModel.characters.collectAsState()
    val diagnostics by viewModel.characterDetails.collectAsState()
    val standCount = occupiedStandSlots(state.standListings, state.nativeStand, standMerchant(state, characters, diagnostics))

    // Fully open: the whole list fits on a phone without dragging the sheet up.
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = androidx.compose.material3.rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(modifier = Modifier.fillMaxWidth().verticalScroll(androidx.compose.foundation.rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp)) {
            Text("Account", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            for ((label, route) in ACCOUNT_ITEMS) {
                val text = label +
                    (if (route == Routes.ACCOUNT_MAIL && mail.count > 0) " (${mail.count})" else "") +
                    (if (route == Routes.ACCOUNT_STAND) " · $standCount/16" else "")
                MenuRow(text) { onDismiss(); onNavigate(route) }
            }
            if (characterItems.isNotEmpty()) {
                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                for ((label, route) in characterItems) MenuRow(label) { onDismiss(); onNavigate(route) }
            }
        }
    }
}

@Composable
private fun MenuRow(label: String, onClick: () -> Unit) {
    Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 12.dp, horizontal = 4.dp))
}
