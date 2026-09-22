package com.partyconsole.companion.ui.connection

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** First screen the app shows until a server is configured, and reachable
 *  again from settings afterward to change server. Deliberately explains
 *  WHY a certificate might be untrusted rather than just presenting a
 *  scary warning - most users hitting this are self-hosting on purpose. */
@Composable
fun ConnectionScreen(viewModel: ConnectionViewModel, onConnected: () -> Unit) {
    var input by remember { mutableStateOf("") }
    val checkState by viewModel.checkState.collectAsState()

    Scaffold { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text("Connect to Party Console", style = MaterialTheme.typography.headlineSmall)
            Text(
                "Enter the address of your party-console server - the same one your " +
                    "PC's browser dashboard connects to. This could be your home PC's " +
                    "Tailscale address, or a domain if you've deployed it to a server.",
                style = MaterialTheme.typography.bodyMedium,
            )
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                label = { Text("Server address") },
                placeholder = { Text("party.example.com or 100.x.x.x:3010") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )

            when (val state = checkState) {
                is ConnectionCheckState.Idle -> {
                    Button(onClick = { viewModel.testConnection(input) }, modifier = Modifier.fillMaxWidth()) {
                        Text("Connect")
                    }
                }
                is ConnectionCheckState.Checking -> {
                    CircularProgressIndicator()
                }
                is ConnectionCheckState.Success -> {
                    Text("Connected.", color = MaterialTheme.colorScheme.primary)
                    Button(
                        onClick = {
                            if (input.startsWith("http://")) viewModel.saveCleartext(input) else viewModel.saveSystemTrusted(input)
                            onConnected()
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Continue") }
                }
                is ConnectionCheckState.UntrustedCertificate -> {
                    Text(
                        "This server's certificate isn't from a publicly trusted authority - " +
                            "expected if you're using party-console's own bundled HTTPS " +
                            "(self-signed) rather than a real domain. Only continue if you " +
                            "recognize this fingerprint (check it against your server's own " +
                            "setup output or Caddy logs):",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Text(state.fingerprint, style = MaterialTheme.typography.bodySmall)
                    Button(
                        onClick = {
                            viewModel.savePinned(state)
                            onConnected()
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("I recognize this - trust it") }
                    TextButton(onClick = { viewModel.testConnection(input) }) { Text("Cancel") }
                }
                is ConnectionCheckState.Failed -> {
                    Text("Couldn't connect: ${state.message}", color = MaterialTheme.colorScheme.error)
                    OutlinedButton(onClick = { viewModel.testConnection(input) }, modifier = Modifier.fillMaxWidth()) {
                        Text("Try again")
                    }
                }
            }
        }
    }
}
