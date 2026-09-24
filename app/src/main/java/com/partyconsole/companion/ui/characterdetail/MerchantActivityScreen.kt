package com.partyconsole.companion.ui.characterdetail

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.characterdetail.sections.MerchantQueueSection
import com.partyconsole.companion.ui.characterdetail.sections.RestockSection

/** The hamburger menu's "Activity" entry for the merchant character -
 *  full job queue + restock policy in one place. Buy/craft/exchange order
 *  submission (merchant-commerce-dialog.tsx) needs its exact submit
 *  endpoint confirmed before wiring - not guessed blind, same reasoning
 *  as CatalogScreen - so this screen is the queue/restock view for v1,
 *  not the full commerce dialog port the mobile-redesign plan describes. */
@Composable
fun MerchantActivityScreen(viewModel: PartyViewModel, characterName: String, onBack: () -> Unit) {
    val characters by viewModel.characters.collectAsState()
    val dynamicState by viewModel.dynamicState.collectAsState()
    val vitals = characters[characterName]?.vitals

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("$characterName · Activity") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())) {
            if (vitals?.ctype != "merchant") {
                Text(
                    "Activity management is only available for the merchant character.",
                    modifier = Modifier.padding(24.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                return@Scaffold
            }
            MerchantQueueSection(dynamicState.merchantCurrent, dynamicState.merchantQueue, viewModel)
            RestockSection(
                characterName,
                dynamicState.restockPolicies[characterName] ?: com.partyconsole.companion.model.RestockPolicy(),
                viewModel,
            )
            Text(
                "Buy/craft/exchange ordering is coming soon.",
                modifier = Modifier.padding(16.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
