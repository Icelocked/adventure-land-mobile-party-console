package com.partyconsole.companion.ui.dungeon

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.ui.PartyViewModel

/** The dungeon controls (DungeonPanel) live only on the party screen, and a
 *  Cave run waits there for a destination. When a dungeon starts, this
 *  jumps to the party screen once; while one runs, every other screen
 *  shows a bar that leads back. AppNavigation mounts it above every screen
 *  once the party view exists. PWA: web/src/components/DungeonNavigator.tsx. */
@Composable
fun DungeonNavigator(viewModel: PartyViewModel, onPartyScreen: Boolean, onOpenParty: () -> Unit, content: @Composable () -> Unit = {}) {
    val query = rememberDungeons(viewModel)
    val view by query.view.collectAsState()
    val phase = view?.state?.phase
    val running = phase != null && phase !in setOf("idle", "held")
    // Null until the first response, so opening the app mid-run never jumps.
    val wasRunning = remember { arrayOfNulls<Boolean>(1) }
    LaunchedEffect(view, running) {
        if (view == null) return@LaunchedEffect
        if (wasRunning[0] == false && running && !onPartyScreen) onOpenParty()
        wasRunning[0] = running
    }
    val bar = running && !onPartyScreen
    Column(modifier = Modifier.fillMaxSize()) {
        if (bar) {
            // The bar takes the status bar inset, so the screen below doesn't pad for it again.
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth().background(Color(0xFF431407)).statusBarsPadding().padding(horizontal = 12.dp, vertical = 8.dp),
            ) {
                Text("Cave of Many Dreams is running.", color = Color(0xFFFFEDD5), style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                OutlinedButton(onClick = onOpenParty, colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFFFEDD5))) { Text("Dungeon controls") }
            }
        }
        Box(modifier = Modifier.weight(1f).then(if (bar) Modifier.consumeWindowInsets(WindowInsets.statusBars) else Modifier)) { content() }
    }
}
