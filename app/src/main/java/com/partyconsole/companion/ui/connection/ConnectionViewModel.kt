package com.partyconsole.companion.ui.connection

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.partyconsole.companion.network.CertificateInspector
import com.partyconsole.companion.network.ServerConfigStore
import com.partyconsole.companion.network.ServerSettings
import com.partyconsole.companion.network.TrustMode
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.URI
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLHandshakeException

/**
 * Drives the "add/edit server" screen. The actual trust decision (see
 * network/ServerConfig.kt's TrustMode doc comment for why there isn't one
 * universal right answer) follows the same pattern well-known self-hosted
 * companion apps use (Home Assistant, Syncthing): try a normal HTTPS
 * connection first; if it fails specifically because the certificate
 * isn't from a publicly trusted CA (not for some other reason like the
 * server being unreachable), offer to show that certificate's fingerprint
 * so the user can verify and pin it - trust-on-first-use, not blind trust.
 */
sealed interface ConnectionCheckState {
    data object Idle : ConnectionCheckState
    data object Checking : ConnectionCheckState
    data object Success : ConnectionCheckState
    data class UntrustedCertificate(val host: String, val port: Int, val fingerprint: String) : ConnectionCheckState
    data class Failed(val message: String) : ConnectionCheckState
}

class ConnectionViewModel(private val store: ServerConfigStore) : ViewModel() {
    private val _checkState = MutableStateFlow<ConnectionCheckState>(ConnectionCheckState.Idle)
    val checkState: StateFlow<ConnectionCheckState> = _checkState.asStateFlow()

    val savedSettings: StateFlow<ServerSettings?> = MutableStateFlow<ServerSettings?>(null).also { flow ->
        viewModelScope.launch { store.settings.collect { flow.value = it } }
    }.asStateFlow()

    /** Normalizes user input (which may or may not include a scheme) into
     *  a URI, defaulting to https - matching what most self-hosted app
     *  connection screens do, since that's the common case for anything
     *  beyond a pure-LAN/Tailscale setup. */
    private fun normalize(input: String): URI {
        val withScheme = if (input.contains("://")) input else "https://$input"
        return URI(withScheme)
    }

    fun testConnection(input: String) {
        val uri = runCatching { normalize(input) }.getOrNull()
        if (uri == null || uri.host.isNullOrBlank()) {
            _checkState.value = ConnectionCheckState.Failed("Enter a valid host, e.g. party.example.com or 100.x.x.x:3010")
            return
        }
        val port = if (uri.port != -1) uri.port else if (uri.scheme == "https") 3443 else 3010

        if (uri.scheme == "http") {
            // Cleartext by explicit user choice (they typed http://) - no
            // certificate involved at all, so there's nothing to check;
            // this only makes sense reached through an already-private
            // transport (Tailscale, a LAN), which the connection screen's
            // own copy should be warning about, not this function.
            _checkState.value = ConnectionCheckState.Success
            return
        }

        _checkState.value = ConnectionCheckState.Checking
        viewModelScope.launch(Dispatchers.IO) {
            val trusted = runCatching {
                val client = OkHttpClient.Builder()
                    .connectTimeout(8, TimeUnit.SECONDS)
                    .build()
                client.newCall(Request.Builder().url("https://${uri.host}:$port/party-api/status").build()).execute().use { it.isSuccessful || it.code < 500 }
            }
            trusted.fold(
                onSuccess = { _checkState.value = ConnectionCheckState.Success },
                onFailure = { error ->
                    val isCertProblem = error is SSLHandshakeException ||
                        error is java.security.cert.CertificateException
                    if (!isCertProblem) {
                        _checkState.value = ConnectionCheckState.Failed(error.message ?: "Could not reach that server")
                        return@fold
                    }
                    val fingerprint = withContext(Dispatchers.IO) { CertificateInspector.fetchFingerprint(uri.host, port) }
                    _checkState.value = if (fingerprint != null) {
                        ConnectionCheckState.UntrustedCertificate(uri.host, port, fingerprint)
                    } else {
                        ConnectionCheckState.Failed("Could not read that server's certificate")
                    }
                },
            )
        }
    }

    fun saveSystemTrusted(input: String) {
        val uri = normalize(input)
        viewModelScope.launch {
            store.save(ServerSettings(baseUrl = "https://${uri.host}:${if (uri.port != -1) uri.port else 3443}", trustMode = TrustMode.SYSTEM))
        }
    }

    fun saveCleartext(input: String) {
        val uri = normalize(input).let { if (it.scheme == "https") URI("http://${it.host}:${if (it.port != -1) it.port else 3010}") else it }
        viewModelScope.launch {
            store.save(ServerSettings(baseUrl = "http://${uri.host}:${if (uri.port != -1) uri.port else 3010}", trustMode = TrustMode.CLEARTEXT))
        }
    }

    fun savePinned(state: ConnectionCheckState.UntrustedCertificate) {
        viewModelScope.launch {
            store.save(
                ServerSettings(
                    baseUrl = "https://${state.host}:${state.port}",
                    trustMode = TrustMode.PINNED_CERTIFICATE,
                    pinnedCertificateSha256 = state.fingerprint,
                ),
            )
        }
    }

    fun forget() {
        viewModelScope.launch { store.clear() }
    }
}
