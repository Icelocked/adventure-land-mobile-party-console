package com.partyconsole.companion.network

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * How to treat the server's TLS certificate; chosen per server on the
 * connection screen. party-console runs anywhere from a LAN PC to a VPS:
 *   - a real domain with a public cert (behind your own reverse proxy;
 *     the bundled Caddy only does local-CA)
 *   - the bundled local-CA HTTPS: a phone can't easily install that CA,
 *     so the app pins the certificate fingerprint (trust on first use)
 *   - plain HTTP over an already-encrypted transport such as Tailscale
 */
enum class TrustMode {
    SYSTEM, // ordinary HTTPS, verified against the phone's normal trusted CAs
    PINNED_CERTIFICATE, // self-signed/local-CA HTTPS - trust exactly one fingerprint
    CLEARTEXT, // plain http://, e.g. reached only via a VPN/Tailscale tunnel
}

data class ServerSettings(
    val baseUrl: String, // e.g. "https://party.example.com:3443" or "http://100.x.x.x:3010"
    val trustMode: TrustMode,
    val pinnedCertificateSha256: String? = null, // required when trustMode == PINNED_CERTIFICATE
) {
    /** The dashboard calls a same-origin "/party-api"; this app joins it to
     *  baseUrl. */
    val apiBase: String get() = baseUrl.trimEnd('/') + "/party-api"
    val streamUrl: String get() = "$apiBase/dashboard-stream"

    val isConfigured: Boolean get() = baseUrl.isNotBlank() &&
        (trustMode != TrustMode.PINNED_CERTIFICATE || !pinnedCertificateSha256.isNullOrBlank())
}

private val Context.dataStore by preferencesDataStore(name = "server_settings")

/** Persists the single active server connection. */
class ServerConfigStore(private val context: Context) {
    private object Keys {
        val BASE_URL = stringPreferencesKey("base_url")
        val TRUST_MODE = stringPreferencesKey("trust_mode")
        val PINNED_CERT = stringPreferencesKey("pinned_cert_sha256")
    }

    val settings: Flow<ServerSettings?> = context.dataStore.data.map { prefs ->
        val baseUrl = prefs[Keys.BASE_URL] ?: return@map null
        val trustMode = prefs[Keys.TRUST_MODE]?.let { runCatching { TrustMode.valueOf(it) }.getOrNull() }
            ?: TrustMode.SYSTEM
        ServerSettings(
            baseUrl = baseUrl,
            trustMode = trustMode,
            pinnedCertificateSha256 = prefs[Keys.PINNED_CERT],
        )
    }

    suspend fun save(settings: ServerSettings) {
        context.dataStore.edit { prefs ->
            prefs[Keys.BASE_URL] = settings.baseUrl
            prefs[Keys.TRUST_MODE] = settings.trustMode.name
            if (settings.pinnedCertificateSha256 != null) {
                prefs[Keys.PINNED_CERT] = settings.pinnedCertificateSha256
            } else {
                prefs.remove(Keys.PINNED_CERT)
            }
        }
    }

    suspend fun clear() {
        context.dataStore.edit { it.clear() }
    }
}
