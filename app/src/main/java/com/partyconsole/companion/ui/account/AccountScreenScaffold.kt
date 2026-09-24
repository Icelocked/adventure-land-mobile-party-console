package com.partyconsole.companion.ui.account

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** Shared shell for every account-wide screen (Mail/Bestiary/Skills/Stand/
 *  Market/Bank/Logs/Settings) - same title bar + back button + an optional
 *  manual-refresh action, so each screen only supplies its own list/content
 *  body. Data otherwise only updates on the ~6s poll (or SSE deltas for
 *  vitals) - [onRefresh] forces an immediate re-fetch instead of waiting. */
@Composable
fun AccountScreenScaffold(
    title: String,
    onBack: () -> Unit,
    onRefresh: (() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    onRefresh?.let {
                        IconButton(onClick = it) {
                            Icon(Icons.Filled.Refresh, contentDescription = "Refresh")
                        }
                    }
                },
            )
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            content()
        }
    }
}

/** Shown when a screen has nothing to display yet - keeps the "empty"
 *  message styling consistent across account screens. */
@Composable
fun EmptyState(message: String) {
    Text(message, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(24.dp))
}
