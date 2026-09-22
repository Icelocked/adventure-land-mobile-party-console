package com.partyconsole.companion.network

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * How this app should treat the server's TLS certificate. party-console
 * itself has no single answer here - it's explicitly designed to run
 * anywhere from a home PC on a LAN to a real VPS (see this project's
 * PARTY-CONSOLE-COMPARISON.md and the Adventureland-Team repo's research
 * notes), so different users will have different setups:
 *   - a real domain behind Let's Encrypt (put the coordinator behind your
 *     own reverse proxy for this - party-console's own bundled Caddy only
 *     does local-CA trust, not public certs)
 *   - party-console's own bundled local-CA HTTPS (self-signed, normally
 *     trusted by installing its certificate on the game computer - a
 *     phone can't do that install step the same way, so this app pins the
 *     certificate's fingerprint instead, the same trust-on-first-use
 *     pattern Syncthing/Home Assistant's companion apps use)
 *   - plain HTTP over an already-encrypted transport (e.g. Tailscale),
 *     where TLS on top would be redundant
 * The connection screen (ui/connection/ConnectionScreen.kt) is what
 * actually decides this per-server; nothing here assumes one hosting
 * choice is "correct".
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
    /** party-console's own client code uses a relative "/party-api" base
     *  (dashboard/features/party/api.tsx) because it's served same-origin
     *  from the coordinator. This app isn't same-origin, so every call
     *  joins baseUrl with that same relative path - kept as one constant
     *  so it can never drift from the server's actual route prefix. */
    val apiBase: String get() = baseUrl.trimEnd('/') + "/party-api"
    val streamUrl: String get() = "$apiBase/dashboard-stream"

    val isConfigured: Boolean get() = baseUrl.isNotBlank() &&
        (trustMode != TrustMode.PINNED_CERTIFICATE || !pinnedCertificateSha256.isNullOrBlank())
}

private val Context.dataStore by preferencesDataStore(name = "server_settings")

/** Reads/writes the one server connection this app talks to. Deliberately
 *  a single active server, not a list - matches the personal/small-group
 *  self-hosted use case this is built for; multi-server support would be
 *  a real, separate feature to add later, not assumed here. */
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
