package com.partyconsole.companion.ui.account

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

private const val PARTY_CONSOLE = "https://github.com/Ryan-Haines/adventureland-party-console"

/** party-console's MIT notice: parts of this app are adapted from its
 *  dashboard, so the notice ships with the app (see THIRD_PARTY_NOTICES.md). */
internal const val PARTY_CONSOLE_LICENSE = """MIT License

Copyright (c) 2026 Adventure Land Party Console contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE."""

/** Credits party-console (which this app needs) and ships its license. */
@Composable
fun AboutSection() {
    val context = LocalContext.current
    var showLicense by rememberSaveable { mutableStateOf(false) }
    Column(
        modifier = Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(6.dp)).padding(16.dp).semantics { contentDescription = "About" },
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text("About", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall)
        Text(
            "Party Console Companion is a phone companion for Adventureland Party Console by Ryan Haines and contributors. " +
                "It needs a running party-console: this app connects to it and does nothing on its own.",
            style = MaterialTheme.typography.bodySmall,
        )
        TextButton(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(PARTY_CONSOLE)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }) {
            Text("Adventureland Party Console on GitHub")
        }
        Text(
            "Parts of this app are adapted from party-console's dashboard under its MIT License. Game log filter categories follow " +
                "Crowns3bc's Game Log Filter. Not affiliated with or endorsed by Adventure Land; game art and data are loaded from the game.",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        TextButton(onClick = { showLicense = !showLicense }) { Text(if (showLicense) "Hide party-console license" else "Show party-console license") }
        if (showLicense) {
            Text(PARTY_CONSOLE_LICENSE, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
