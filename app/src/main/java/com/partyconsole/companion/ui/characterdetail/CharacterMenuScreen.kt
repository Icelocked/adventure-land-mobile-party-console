package com.partyconsole.companion.ui.characterdetail

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** The hamburger menu opened from CharacterDetailScreen - two groups per
 *  the mobile-redesign plan: this character's own management screens,
 *  then the account-wide tools that used to live in the web dashboard's
 *  persistent top bar (no room for 9 buttons across on a phone, so they
 *  move behind this menu instead). */
@Composable
fun CharacterMenuScreen(
    characterName: String,
    onBack: () -> Unit,
    onInventory: () -> Unit,
    onEquipment: () -> Unit,
    onActivity: () -> Unit,
    onMail: () -> Unit,
    onCatalog: () -> Unit,
    onBestiary: () -> Unit,
    onSkills: () -> Unit,
    onStand: () -> Unit,
    onMarket: () -> Unit,
    onBank: () -> Unit,
    onOfferings: () -> Unit,
    onLogs: () -> Unit,
    onSettings: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Menu") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(12.dp)) {
            Text(characterName, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(bottom = 4.dp))
            MenuRow("Inventory", onInventory)
            MenuRow("Equipment", onEquipment)
            MenuRow("Activity", onActivity)

            Text(
                "Account",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(top = 16.dp, bottom = 4.dp),
            )
            MenuRow("Mail", onMail)
            MenuRow("Catalog", onCatalog)
            MenuRow("Bestiary", onBestiary)
            MenuRow("Skills", onSkills)
            MenuRow("Inspect Stand", onStand)
            MenuRow("View Market", onMarket)
            MenuRow("Inspect Bank", onBank)
            MenuRow("Upgrade offerings", onOfferings)
            MenuRow("Logs", onLogs)
            MenuRow("Settings", onSettings)
        }
    }
}

@Composable
private fun MenuRow(label: String, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(label, modifier = Modifier.padding(16.dp), style = MaterialTheme.typography.bodyLarge)
    }
}
