package com.partyconsole.companion.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.security.cert.X509Certificate
import java.util.concurrent.TimeUnit
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.X509TrustManager

private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

/** Builds the OkHttpClient for one server connection, applying exactly the
 *  TrustMode the user chose on the connection screen (network/ServerConfig.kt) -
 *  this is the one place that decides how (or whether) the server's TLS
 *  certificate gets verified, so every request (REST calls here, and the
 *  SSE stream in LiveConnection.kt, which is built from the same client)
 *  is consistent. */
fun buildHttpClient(settings: ServerSettings): OkHttpClient {
    val builder = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS) // 0 = no timeout - the SSE stream is meant to stay open indefinitely
        .callTimeout(0, TimeUnit.SECONDS)

    when (settings.trustMode) {
        TrustMode.SYSTEM, TrustMode.CLEARTEXT -> {
            // Ordinary platform trust store. For CLEARTEXT the URL itself
            // is http://, so TLS verification never enters into it at all -
            // nothing extra to configure here.
        }
        TrustMode.PINNED_CERTIFICATE -> {
            val fingerprint = settings.pinnedCertificateSha256
                ?: throw IllegalStateException("PINNED_CERTIFICATE trust mode requires a saved fingerprint")
            val trustManager = PinnedTrustManager(fingerprint)
            builder.sslSocketFactory(trustManager.socketFactory(), trustManager as X509TrustManager)
            // Hostname verification is meaningless against a self-signed
            // certificate for a bare IP/Tailscale address (no CA vouching
            // for "this cert belongs to this name") - the fingerprint
            // pin above is the actual trust check; this just stops the
            // platform's own hostname check from rejecting a perfectly
            // legitimate pinned connection first.
            builder.hostnameVerifier(HostnameVerifier { _, _ -> true })
        }
    }
    return builder.build()
}

@kotlinx.serialization.Serializable
data class CommandResult(
    val ok: Boolean = false,
    val error: String? = null,
)

sealed interface ApiResult<out T> {
    data class Success<T>(val value: T) : ApiResult<T>
    data class Failure(val message: String) : ApiResult<Nothing>
}

/** Thin wrapper over the party-api REST surface - every endpoint listed
 *  in Adventureland-Team's PARTY-CONSOLE-COMPARISON.md research (e.g.
 *  /party-api/command, /party-api/merchant/order, /party-api/travel) is
 *  reachable through [post] with that endpoint's own field names; this
 *  class deliberately doesn't hardcode a method per endpoint yet since
 *  the app only needs a handful for v1 (see ui/characterdetail for which
 *  ones are actually wired to a button). Add a typed convenience method
 *  here as each new screen needs one, rather than guessing the full
 *  surface up front. */
class PartyApiClient(private val client: OkHttpClient, private val settings: ServerSettings) {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun post(path: String, body: JsonObject): ApiResult<CommandResult> = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(settings.apiBase.trimEnd('/') + "/" + path.trimStart('/'))
            .post(json.encodeToString(JsonObject.serializer(), body).toRequestBody(JSON_MEDIA_TYPE))
            .build()
        try {
            client.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    val parsed = runCatching { json.decodeFromString(CommandResult.serializer(), text) }.getOrNull()
                    return@withContext ApiResult.Failure(parsed?.error ?: "HTTP ${response.code}")
                }
                val result = runCatching { json.decodeFromString(CommandResult.serializer(), text) }
                    .getOrElse { CommandResult(ok = true) }
                ApiResult.Success(result)
            }
        } catch (e: java.io.IOException) {
            ApiResult.Failure(e.message ?: "network error")
        }
    }

    /** `/party-api/command` - the general-purpose command endpoint
     *  (see runtime/coordinator/http/character-command.ts): character
     *  name plus whatever domain-specific fields that command needs. */
    suspend fun sendCommand(character: String, fields: Map<String, Any?>): ApiResult<CommandResult> {
        val body = JsonObject(
            buildMap {
                put("character", kotlinx.serialization.json.JsonPrimitive(character))
                for ((key, value) in fields) put(key, toJsonElement(value))
            },
        )
        return post("command", body)
    }

    private fun toJsonElement(value: Any?): kotlinx.serialization.json.JsonElement = when (value) {
        null -> kotlinx.serialization.json.JsonNull
        is String -> kotlinx.serialization.json.JsonPrimitive(value)
        is Number -> kotlinx.serialization.json.JsonPrimitive(value)
        is Boolean -> kotlinx.serialization.json.JsonPrimitive(value)
        else -> kotlinx.serialization.json.JsonPrimitive(value.toString())
    }
}
