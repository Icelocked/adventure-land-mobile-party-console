package com.partyconsole.companion.network

import com.partyconsole.companion.model.Item
import com.partyconsole.companion.ui.components.ActionToasts
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.encodeToJsonElement
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.security.cert.X509Certificate
import java.util.concurrent.TimeUnit
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.X509TrustManager

private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

/** Applies the user's chosen [TrustMode]. Shared by [buildHttpClient] and
 *  [buildSseHttpClient] so REST calls and the SSE stream trust the server
 *  the same way; only their timeouts differ. */
private fun baseHttpClientBuilder(settings: ServerSettings): OkHttpClient.Builder {
    // The pairing cookie travels with every request, REST and stream alike.
    val builder = OkHttpClient.Builder().connectTimeout(10, TimeUnit.SECONDS).cookieJar(PartyCookies)
        .addInterceptor(OriginInterceptor)
    when (settings.trustMode) {
        TrustMode.SYSTEM, TrustMode.CLEARTEXT -> {
            // Platform trust store; CLEARTEXT URLs are http:// so TLS never applies.
        }
        TrustMode.PINNED_CERTIFICATE -> {
            val fingerprint = settings.pinnedCertificateSha256
                ?: throw IllegalStateException("PINNED_CERTIFICATE trust mode requires a saved fingerprint")
            val trustManager = PinnedTrustManager(fingerprint)
            builder.sslSocketFactory(trustManager.socketFactory(), trustManager as X509TrustManager)
            // A self-signed cert for a bare IP/Tailscale address has no name a
            // CA vouches for; the fingerprint pin is the real trust check, so
            // skip the platform hostname check that would reject it first.
            builder.hostnameVerifier(HostnameVerifier { _, _ -> true })
        }
    }
    return builder
}

/** For one-shot REST calls. Bounded timeouts so a request that stalls after
 *  connecting (e.g. a WiFi-to-cellular handoff) fails and lets the caller's
 *  retry logic run instead of hanging. Must not share the SSE client's
 *  zero timeouts. */
fun buildHttpClient(settings: ServerSettings): OkHttpClient =
    baseHttpClientBuilder(settings)
        // The gateway answers an unpaired request with 302 -> /setup; following
        // it would hand back the setup page's HTML as if it were data.
        .followRedirects(false)
        .readTimeout(15, TimeUnit.SECONDS)
        .callTimeout(20, TimeUnit.SECONDS)
        .build()

/** For the SSE stream: no read/call timeout since it stays open
 *  indefinitely. LiveConnection's heartbeat watchdog detects a stalled
 *  stream instead. */
fun buildSseHttpClient(settings: ServerSettings): OkHttpClient =
    baseHttpClientBuilder(settings)
        .readTimeout(0, TimeUnit.SECONDS)
        .callTimeout(0, TimeUnit.SECONDS)
        .build()

@kotlinx.serialization.Serializable
data class CommandResult(
    val ok: Boolean = false,
    val error: String? = null,
    // Machine-readable reason some routes add (e.g. auto_bank_confirmation_required).
    val code: String? = null,
) {
    /** The whole parsed response body; routes that answer with a view
     *  (e.g. daily dungeons) are read from here. */
    @kotlinx.serialization.Transient
    var data: JsonObject? = null
        internal set
}

@kotlinx.serialization.Serializable
private data class AlDataKeyResponse(val key: String? = null, val error: String? = null)

@kotlinx.serialization.Serializable
private data class AlDataAuthResponse(val auth: String? = null, val error: String? = null)

/** How the pairing gate rejects an unpaired request: a redirect to /setup,
 *  or 401/403. */
internal fun sessionLost(code: Int) = code in 300..399 || code == 401 || code == 403
internal const val SESSION_EXPIRED = "Session expired - pair this device again"

sealed interface ApiResult<out T> {
    data class Success<T>(val value: T) : ApiResult<T>
    /** [status] is the HTTP status (0 for a network error); [body] the parsed
     *  error body, for routes that explain a refusal (e.g. a 409's `missing`). */
    data class Failure(val message: String, val code: String? = null, val status: Int = 0, val body: JsonObject? = null) : ApiResult<Nothing>
}

/** Thin wrapper over the party-api REST surface. Any endpoint is reachable
 *  through [post]; typed helpers exist for the ones the UI uses.
 *  PWA: web/src/api/partyApi.ts. */
class PartyApiClient(
    private val client: OkHttpClient,
    private val settings: ServerSettings,
    // Told about every POST (success or not) so the data layer can refresh
    // the domains that action touched.
    private val onAction: (path: String, body: JsonObject) -> Unit = { _, _ -> },
) {
    private val json = Json { ignoreUnknownKeys = true }

    /** The console's own address (setup and debug links open from it). */
    val baseUrl: String get() = settings.baseUrl

    /** GET against the party-api base for one-shot reads that aren't on the
     *  SSE stream. Returns the raw body; callers decode the shape they need. */
    suspend fun get(path: String): ApiResult<String> = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(settings.apiBase.trimEnd('/') + "/" + path.trimStart('/'))
            .get()
            .build()
        try {
            client.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (sessionLost(response.code)) ApiResult.Failure(SESSION_EXPIRED, "session_expired")
                else if (!response.isSuccessful) ApiResult.Failure("HTTP ${response.code}", status = response.code)
                else ApiResult.Success(text)
            }
        } catch (e: java.io.IOException) {
            ApiResult.Failure(e.message ?: "network error")
        }
    }

    /** POST /party-api/formation {leader}. Only the leader key, so nobody's
     *  follow flag changes. */
    suspend fun setLeader(leader: String): ApiResult<CommandResult> =
        post("formation", JsonObject(mapOf("leader" to JsonPrimitive(leader))))

    /** POST /party-api/formation {character, follow}. Never sends `leader`:
     *  the server applies any `leader` key it gets. */
    suspend fun setFollow(character: String, follow: Boolean): ApiResult<CommandResult> =
        post("formation", JsonObject(mapOf("character" to JsonPrimitive(character), "follow" to JsonPrimitive(follow))))

    /** POST /party-api/restock with the whole policy, potion `item`
     *  included, so saving thresholds never drops the chosen potion. */
    suspend fun saveRestock(character: String, policy: com.partyconsole.companion.model.RestockPolicy): ApiResult<CommandResult> {
        val body = JsonObject(
            mapOf(
                "character" to JsonPrimitive(character),
                "hp" to json.encodeToJsonElement(com.partyconsole.companion.model.RestockRange.serializer(), policy.hp),
                "mp" to json.encodeToJsonElement(com.partyconsole.companion.model.RestockRange.serializer(), policy.mp),
            ),
        )
        return post("restock", body)
    }

    /** POST /party-api/slots/{slot}/spawn - load a roster member headless
     *  into an empty slot. */
    suspend fun spawnSlot(slot: Int, character: String): ApiResult<CommandResult> =
        post("slots/$slot/spawn", JsonObject(mapOf("character" to JsonPrimitive(character))))

    /** POST /party-api/slots/{slot}/logout - stop a headless slot's character. */
    suspend fun logoutSlot(slot: Int): ApiResult<CommandResult> = post("slots/$slot/logout", JsonObject(emptyMap()))

    /** POST /party-api/steam/action - login | primary | headless | logout
     *  through the Steam bridge. */
    suspend fun steamAction(character: String?, action: String): ApiResult<CommandResult> =
        post("steam/action", JsonObject(mapOf("character" to (character?.let { JsonPrimitive(it) } ?: JsonNull), "action" to JsonPrimitive(action))))

    /** POST /party-api/steam/recover - recover a failed Steam handoff. */
    suspend fun steamRecover(): ApiResult<CommandResult> = post("steam/recover", JsonObject(emptyMap()))

    /** POST /party-api/roster/create - create a character with one of its
     *  class's official starting looks, then spawn it. */
    suspend fun createCharacter(name: String, ctype: String, look: Int): ApiResult<CommandResult> =
        post("roster/create", JsonObject(mapOf("name" to JsonPrimitive(name), "class" to JsonPrimitive(ctype), "look" to JsonPrimitive(look))))

    /** `/party-api/command` type "go-home" - back to the character's home
     *  spot and home realm. */
    suspend fun goHome(character: String): ApiResult<CommandResult> = sendCommand(character, mapOf("type" to "go-home"))

    /** GET relative to the server root rather than /party-api, for routes
     *  like /setup/state and /console-debug. */
    suspend fun getRoot(path: String): ApiResult<String> = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(settings.baseUrl.trimEnd('/') + "/" + path.trimStart('/')).get().build()
        try {
            client.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (sessionLost(response.code)) ApiResult.Failure(SESSION_EXPIRED, "session_expired")
                else if (!response.isSuccessful) ApiResult.Failure("HTTP ${response.code}") else ApiResult.Success(text)
            }
        } catch (e: java.io.IOException) {
            ApiResult.Failure(e.message ?: "network error")
        }
    }

    /** A party-api request whose failures keep the server's {error} text or
     *  raw body; POSTs acknowledge with a toast. */
    private suspend fun textWithError(method: String, path: String, body: String? = null, headers: Map<String, String> = emptyMap()): ApiResult<String> {
        val toast = if (method == "POST") ActionToasts.begin() else null
        val result = withContext(Dispatchers.IO) {
            val builder = Request.Builder().url(settings.apiBase.trimEnd('/') + "/" + path.trimStart('/'))
            headers.forEach { (name, value) -> builder.header(name, value) }
            if (method == "POST") builder.post((body ?: "").toRequestBody((headers["Content-Type"] ?: "text/plain;charset=UTF-8").toMediaType())) else builder.get()
            try {
                client.newBuilder().readTimeout(if (method == "POST") 120 else 30, TimeUnit.SECONDS).build().newCall(builder.build()).execute().use { response ->
                    val text = response.body?.string().orEmpty()
                    when {
                        sessionLost(response.code) -> ApiResult.Failure(SESSION_EXPIRED, "session_expired", response.code)
                        response.isSuccessful -> ApiResult.Success(text)
                        else -> {
                            val message = runCatching { (json.parseToJsonElement(text) as? JsonObject)?.get("error")?.let { (it as JsonPrimitive).content } }.getOrNull() ?: text
                            ApiResult.Failure(message.ifEmpty { "HTTP ${response.code} ${response.message}".trim() }, status = response.code)
                        }
                    }
                }
            } catch (e: java.io.IOException) {
                ApiResult.Failure(e.message ?: "network error")
            }
        }
        toast?.let { ActionToasts.resolve(it, result is ApiResult.Success) }
        return result
    }

    /** GET /party-api/dashboard-state - the import source paths and size limit. */
    suspend fun dashboardStateInfo(): ApiResult<String> = textWithError("GET", "dashboard-state")

    /** GET /party-api/dashboard-state/export - the settings JSON. */
    suspend fun dashboardStateExport(): ApiResult<String> = textWithError("GET", "dashboard-state/export")

    /** POST /party-api/dashboard-state/{preview,import} - the raw file as
     *  text/plain; an import repeats the preview's digest in X-State-Preview. */
    suspend fun dashboardStateRequest(action: String, source: String, digest: String? = null): ApiResult<String> =
        textWithError("POST", "dashboard-state/$action", source, buildMap {
            put("Content-Type", "text/plain;charset=UTF-8")
            digest?.let { put("X-State-Preview", it) }
        })

    /** GET /console-debug - the debug instance state. */
    suspend fun consoleDebug(): ApiResult<String> = getRoot("console-debug")

    /** POST /console-debug/{start,stop}. */
    suspend fun consoleDebugAction(name: String): ApiResult<String> = postRoot("console-debug/$name", JsonObject(emptyMap()))

    suspend fun postRoot(path: String, body: JsonObject): ApiResult<String> {
        val toast = ActionToasts.begin()
        return postRootOnce(path, body).also { ActionToasts.resolve(toast, it is ApiResult.Success) }
    }

    private suspend fun postRootOnce(path: String, body: JsonObject): ApiResult<String> = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(settings.baseUrl.trimEnd('/') + "/" + path.trimStart('/'))
            .post(json.encodeToString(JsonObject.serializer(), body).toRequestBody(JSON_MEDIA_TYPE))
            .build()
        try {
            client.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (sessionLost(response.code)) ApiResult.Failure(SESSION_EXPIRED, "session_expired")
                else if (!response.isSuccessful) ApiResult.Failure("HTTP ${response.code}") else ApiResult.Success(text)
            }
        } catch (e: java.io.IOException) {
            ApiResult.Failure(e.message ?: "network error")
        }
    }

    suspend fun post(path: String, body: JsonObject): ApiResult<CommandResult> {
        // Every mutating action funnels through here, so this is where a tap
        // gets its immediate acknowledgement toast.
        val toast = ActionToasts.begin()
        var sent = false
        try {
            // Only an explicit `ok: false` is a refusal.
            return postOnce(path, body).also { sent = it is ApiResult.Success && (it.value.data?.get("ok") as? JsonPrimitive)?.content != "false" }
        } finally {
            ActionToasts.resolve(toast, sent)
            onAction("/" + path.trimStart('/'), body)
        }
    }

    private suspend fun postOnce(path: String, body: JsonObject): ApiResult<CommandResult> = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(settings.apiBase.trimEnd('/') + "/" + path.trimStart('/'))
            .post(json.encodeToString(JsonObject.serializer(), body).toRequestBody(JSON_MEDIA_TYPE))
            .build()
        try {
            client.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (sessionLost(response.code)) return@withContext ApiResult.Failure(SESSION_EXPIRED, "session_expired", response.code)
                val body = runCatching { json.parseToJsonElement(text) as? JsonObject }.getOrNull()
                if (!response.isSuccessful) {
                    val parsed = body?.let { runCatching { json.decodeFromJsonElement(CommandResult.serializer(), it) }.getOrNull() }
                    return@withContext ApiResult.Failure(parsed?.error ?: "HTTP ${response.code}", parsed?.code, response.code, body)
                }
                val result = body?.let { runCatching { json.decodeFromJsonElement(CommandResult.serializer(), it) }.getOrNull() } ?: CommandResult(ok = true)
                result.data = body
                ApiResult.Success(result)
            }
        } catch (e: java.io.IOException) {
            ApiResult.Failure(e.message ?: "network error")
        }
    }

    /** `/party-api/command` - the general-purpose command endpoint:
     *  character name plus that command's own fields. */
    suspend fun sendCommand(character: String, fields: Map<String, Any?>): ApiResult<CommandResult> {
        val body = JsonObject(
            buildMap {
                put("character", JsonPrimitive(character))
                for ((key, value) in fields) put(key, toJsonElement(value))
            },
        )
        return post("command", body)
    }

    private fun toJsonElement(value: Any?): JsonElement = when (value) {
        null -> JsonNull
        is JsonElement -> value
        is String -> JsonPrimitive(value)
        is Number -> JsonPrimitive(value)
        is Boolean -> JsonPrimitive(value)
        else -> JsonPrimitive(value.toString())
    }

    /** Item commands send the full item object, not just its name: the
     *  server checks it against the slot, which may have changed since the
     *  app last saw it. [slot] is an inventory index for most actions but an
     *  equip-slot name (e.g. "mainhand") for unequip. */
    suspend fun itemCommand(
        type: String,
        character: String,
        item: Item,
        slot: JsonElement? = null,
        extra: Map<String, JsonElement> = emptyMap(),
    ): ApiResult<CommandResult> {
        val body = JsonObject(
            buildMap {
                put("type", JsonPrimitive(type))
                put("character", JsonPrimitive(character))
                put("item", json.encodeToJsonElement(Item.serializer(), item))
                slot?.let { put("slot", it) }
                for ((key, value) in extra) put(key, value)
            },
        )
        return post("command", body)
    }

    /** POST /party-api/merchant/stand - list an item on the merchant's
     *  stand, or edit an existing listing in place by passing its `id`. */
    suspend fun markForStand(
        item: Item,
        // Left out for a listing without one.
        slot: Int?,
        bankPack: String? = null,
        price: Long,
        // Required: the server overwrites an existing listing's quantity with it.
        quantity: Int,
        markAll: Boolean = false,
        remove: Boolean = false,
        id: String? = null,
    ): ApiResult<CommandResult> {
        val body = JsonObject(
            buildMap {
                id?.let { put("id", JsonPrimitive(it)) }
                put("item", json.encodeToJsonElement(Item.serializer(), item))
                slot?.let { put("slot", JsonPrimitive(it)) }
                bankPack?.let { put("bankPack", JsonPrimitive(it)) }
                put("price", JsonPrimitive(price))
                put("quantity", JsonPrimitive(quantity))
                put("markAll", JsonPrimitive(markAll))
                put("remove", JsonPrimitive(remove))
            },
        )
        return post("merchant/stand", body)
    }

    /** POST /party-api/merchant/npc-sale. The configured merchant's own
     *  items use source "merchant" with no `character`; anyone else's use
     *  "character". */
    suspend fun markForNpcSale(
        character: String,
        item: Item,
        slot: Int,
        isMerchant: Boolean,
        quantity: Int,
        acknowledged: Boolean,
    ): ApiResult<CommandResult> {
        val body = JsonObject(
            buildMap {
                put("source", JsonPrimitive(if (isMerchant) "merchant" else "character"))
                if (!isMerchant) put("character", JsonPrimitive(character))
                put("slot", JsonPrimitive(slot))
                put("item", json.encodeToJsonElement(Item.serializer(), item))
                put("quantity", JsonPrimitive(quantity))
                put("acknowledged", JsonPrimitive(acknowledged))
            },
        )
        return post("merchant/npc-sale", body)
    }

    /** `/party-api/command` type "withdraw" - pulls one item from the bank
     *  to a character's bag. [pack] is the bank pack (e.g. "items0" or
     *  "bankboi:Name") and [slot] that pack's index; the server finds room
     *  in the bag itself. */
    suspend fun withdrawFromBank(character: String, item: Item, pack: String, slot: Int, markAll: Boolean = false, removeAutoBankMark: Boolean = false, upgradeTiers: Int? = null): ApiResult<CommandResult> {
        // removeAutoBankMark confirms dropping an automatic bank mark when the
        // server asks (auto_bank_confirmation_required).
        val extra = buildMap {
            put("pack", JsonPrimitive(pack))
            put("markAll", JsonPrimitive(markAll))
            put("removeAutoBankMark", JsonPrimitive(removeAutoBankMark))
            // Withdraw the item in order to upgrade it.
            upgradeTiers?.let { put("upgradeTiers", JsonPrimitive(it)) }
        }
        return itemCommand("withdraw", character, item, JsonPrimitive(slot), extra)
    }

    /** POST /party-api/merchant/npc-sale with source "bank" - sells a bank
     *  item directly without withdrawing it to a character first. */
    suspend fun sellBankItemToNpc(item: Item, pack: String, slot: Int, quantity: Int, acknowledged: Boolean): ApiResult<CommandResult> {
        val body = JsonObject(
            mapOf(
                "source" to JsonPrimitive("bank"),
                "pack" to JsonPrimitive(pack),
                "slot" to JsonPrimitive(slot),
                "item" to json.encodeToJsonElement(Item.serializer(), item),
                "quantity" to JsonPrimitive(quantity),
                "acknowledged" to JsonPrimitive(acknowledged),
            ),
        )
        return post("merchant/npc-sale", body)
    }

    /** POST /party-api/bank/unlock - queues a merchant errand to open one
     *  locked bank pack. [kind] is "key" (a floor's first vault, using an
     *  owned key) or "gold" (spends the vault's price). The server enforces
     *  ordering/ownership and explains any refusal. */
    suspend fun unlockBankVault(pack: String, kind: String): ApiResult<CommandResult> =
        post("bank/unlock", JsonObject(mapOf("pack" to JsonPrimitive(pack), "kind" to JsonPrimitive(kind))))

    /** POST /party-api/deconstruction/mark with `pack` - marks a bank item
     *  for scrap without withdrawing it first. */
    suspend fun markBankItemForDeconstruction(item: Item, pack: String, slot: Int, all: Boolean = false): ApiResult<CommandResult> {
        val body = JsonObject(
            mapOf(
                "item" to json.encodeToJsonElement(Item.serializer(), item),
                "pack" to JsonPrimitive(pack),
                "slot" to JsonPrimitive(slot),
                "all" to JsonPrimitive(all),
            ),
        )
        return post("deconstruction/mark", body)
    }

    /** POST /party-api/deconstruction/mark. */
    suspend fun markForDeconstruction(
        character: String,
        item: Item,
        slot: Int,
        remove: Boolean = false,
    ): ApiResult<CommandResult> {
        val body = JsonObject(
            mapOf(
                "character" to JsonPrimitive(character),
                "item" to json.encodeToJsonElement(Item.serializer(), item),
                "slot" to JsonPrimitive(slot),
                "remove" to JsonPrimitive(remove),
            ),
        )
        return post("deconstruction/mark", body)
    }

    /** POST /party-api/deconstruction/mark with remove: a manual
     *  deconstruction mark by id. */
    suspend fun removeDeconstructionMark(character: String, id: String, slot: Int, item: Item): ApiResult<CommandResult> = post(
        "deconstruction/mark",
        JsonObject(
            mapOf(
                "character" to JsonPrimitive(character),
                "slot" to JsonPrimitive(slot),
                "item" to json.encodeToJsonElement(Item.serializer(), item),
                "remove" to JsonPrimitive(true),
                "id" to JsonPrimitive(id),
            ),
        ),
    )

    /** POST /party-api/deconstruction/mark with retry: a blocked mark again. */
    suspend fun retryDeconstructionMark(character: String, id: String): ApiResult<CommandResult> =
        post("deconstruction/mark", JsonObject(mapOf("character" to JsonPrimitive(character), "id" to JsonPrimitive(id), "retry" to JsonPrimitive(true))))

    /** Removes a manual NPC-sale mark by id. */
    suspend fun removeNpcSaleMark(character: String, id: String): ApiResult<CommandResult> =
        post("merchant/npc-sale", JsonObject(mapOf("character" to JsonPrimitive(character), "id" to JsonPrimitive(id), "remove" to JsonPrimitive(true))))

    /** POST /party-api/deconstruction/auto - a standing "always deconstruct
     *  this item type" rule, as opposed to marking one instance. */
    suspend fun autoDeconstruct(character: String, item: Item, remove: Boolean = false): ApiResult<CommandResult> {
        val body = JsonObject(
            buildMap {
                put("character", JsonPrimitive(character))
                put("item", json.encodeToJsonElement(Item.serializer(), item))
                if (remove) put("remove", JsonPrimitive(true))
            },
        )
        return post("deconstruction/auto", body)
    }

    /** POST /party-api/merchant/auto-npc-sale - a standing "always sell this
     *  item type to an NPC" rule. */
    suspend fun autoNpcSale(character: String?, item: Item, remove: Boolean = false): ApiResult<CommandResult> {
        // `character` is omitted for the configured merchant (its rule is the
        // account-wide one); with it, the server stores a per-player rule
        // that never fires for the merchant.
        val body = JsonObject(
            buildMap {
                character?.let { put("character", JsonPrimitive(it)) }
                put("item", json.encodeToJsonElement(Item.serializer(), item))
                put("action", JsonPrimitive(if (remove) "remove" else "set"))
            },
        )
        return post("merchant/auto-npc-sale", body)
    }

    /** POST /party-api/merchant/auto-stand - a standing "always list this
     *  item type at this price" rule. */
    suspend fun autoStand(item: Item, price: Long, remove: Boolean = false): ApiResult<CommandResult> {
        // No character: the rule always belongs to the merchant.
        val body = JsonObject(
            mapOf(
                "item" to json.encodeToJsonElement(Item.serializer(), item),
                "price" to JsonPrimitive(price),
                "action" to JsonPrimitive(if (remove) "remove" else "set"),
            ),
        )
        return post("merchant/auto-stand", body)
    }

    /** POST /party-api/merchant/stand {...listing, remove: true} - the whole
     *  listing (id, bank source, trade slot) so the server finds it. */
    suspend fun removeStandListing(listing: com.partyconsole.companion.model.StandListing): ApiResult<CommandResult> {
        val body = json.encodeToJsonElement(com.partyconsole.companion.model.StandListing.serializer(), listing) as JsonObject
        return post("merchant/stand", JsonObject(body + ("remove" to JsonPrimitive(true))))
    }

    /** POST /party-api/bankbois/create - provision the next overflow-storage bankboi. */
    suspend fun createBankboi(): ApiResult<CommandResult> = post("bankbois/create", JsonObject(emptyMap()))

    /** POST /party-api/bankbois/{name}/delete - only once it is empty. */
    suspend fun deleteBankboi(name: String): ApiResult<CommandResult> =
        post("bankbois/${java.net.URLEncoder.encode(name, "UTF-8").replace("+", "%20")}/delete", JsonObject(emptyMap()))

    /** POST /party-api/merchant/auto-npc-sale with action "clear-all" -
     *  drops every auto-NPC-sale rule scoped to [character]; null clears
     *  the merchant's account-wide rules. */
    suspend fun clearAllAutoNpcSales(character: String? = null): ApiResult<CommandResult> {
        val body = JsonObject(
            buildMap {
                put("action", JsonPrimitive("clear-all"))
                character?.let { put("character", JsonPrimitive(it)) }
            },
        )
        return post("merchant/auto-npc-sale", body)
    }

    /** POST /party-api/merchant/auto-stand with action "clear-all" -
     *  merchant-only, account-wide (no character scoping server-side). */
    suspend fun clearAllAutoStand(): ApiResult<CommandResult> =
        post("merchant/auto-stand", JsonObject(mapOf("action" to JsonPrimitive("clear-all"))))

    /** `/party-api/command` type "clear-auto-upgrades"/"clear-auto-compounds" -
     *  drops every owner's rules at once; the server requires `character`
     *  to be the configured merchant. */
    suspend fun clearAutoUpgrades(merchantCharacter: String): ApiResult<CommandResult> =
        sendCommand(merchantCharacter, mapOf("type" to "clear-auto-upgrades"))

    suspend fun clearAutoCompounds(merchantCharacter: String): ApiResult<CommandResult> =
        sendCommand(merchantCharacter, mapOf("type" to "clear-auto-compounds"))

    /** `/party-api/command` type "clear-auto-item-marks" - drops `character`'s
     *  own auto-bank/auto-merchant rules for the given mode. */
    suspend fun clearAutoItemMarks(character: String, mode: String): ApiResult<CommandResult> =
        sendCommand(character, mapOf("type" to "clear-auto-item-marks", "mode" to mode))

    /** POST /party-api/merchant/order - queues an NPC buy and/or crafting
     *  job. The server recomputes each buy line's upgrade budget, so `level`
     *  is what matters; client-side cost estimates are display-only. */
    suspend fun submitMerchantOrder(
        buys: List<com.partyconsole.companion.model.MerchantOrderBuyLine>,
        crafts: List<com.partyconsole.companion.model.MerchantOrderCraftLine>,
        removeAutoBankMark: Boolean = false,
    ): ApiResult<CommandResult> {
        val body = JsonObject(
            mapOf(
                "buys" to json.encodeToJsonElement(
                    kotlinx.serialization.builtins.ListSerializer(com.partyconsole.companion.model.MerchantOrderBuyLine.serializer()),
                    buys,
                ),
                "crafts" to json.encodeToJsonElement(
                    kotlinx.serialization.builtins.ListSerializer(com.partyconsole.companion.model.MerchantOrderCraftLine.serializer()),
                    crafts,
                ),
                "removeAutoBankMark" to JsonPrimitive(removeAutoBankMark),
            ),
        )
        return post("merchant/order", body)
    }

    /** POST /party-api/merchant/exchange-order - NPC exchange/box
     *  operations, a separate endpoint from buy/craft (no `type` field). */
    suspend fun submitExchangeOrder(exchanges: List<com.partyconsole.companion.model.MerchantExchangeLine>): ApiResult<CommandResult> {
        val body = JsonObject(
            mapOf(
                "exchanges" to json.encodeToJsonElement(
                    kotlinx.serialization.builtins.ListSerializer(com.partyconsole.companion.model.MerchantExchangeLine.serializer()),
                    exchanges,
                ),
            ),
        )
        return post("merchant/exchange-order", body)
    }

    /** POST /party-api/merchant/force-stand - pauses ALL merchant work and
     *  returns them home to run the stand exclusively; disabling lets
     *  queued work resume. */
    suspend fun setForceStand(enabled: Boolean): ApiResult<CommandResult> =
        post("merchant/force-stand", JsonObject(mapOf("enabled" to JsonPrimitive(enabled))))

    /** POST /party-api/merchant/gather - toggles a standing gathering
     *  mode (mining/fishing) the merchant does between other jobs. */
    suspend fun setGathering(mode: String, enabled: Boolean): ApiResult<CommandResult> =
        post("merchant/gather", JsonObject(mapOf("mode" to JsonPrimitive(mode), "enabled" to JsonPrimitive(enabled))))

    /** POST /party-api/merchant/job/retry - clears a realm-blocked queued
     *  job's retry backoff so it's attempted again immediately. */
    suspend fun retryMerchantJob(id: String): ApiResult<CommandResult> =
        post("merchant/job/retry", JsonObject(mapOf("id" to JsonPrimitive(id))))

    /** POST /party-api/merchant/clear - drops the entire merchant job queue
     *  and gathering modes. No confirmation server-side, so callers should
     *  confirm first. */
    suspend fun clearMerchantQueue(): ApiResult<CommandResult> = post("merchant/clear", JsonObject(emptyMap()))

    /** POST /party-api/merchant/donate - queues an in-game gold donation. */
    suspend fun donateGold(amount: Long): ApiResult<CommandResult> =
        post("merchant/donate", JsonObject(mapOf("amount" to JsonPrimitive(amount))))

    /** POST /party-api/merchant/join-giveaway - realm is normalized
     *  server-side ("US I"/"EU II" style input both work). */
    suspend fun joinGiveaway(seller: String, realm: String): ApiResult<CommandResult> =
        post("merchant/join-giveaway", JsonObject(mapOf("seller" to JsonPrimitive(seller), "realm" to JsonPrimitive(realm))))

    /** POST /party-api/bank-party - has the merchant visit party members to
     *  collect gold/items. Without `group` the server picks the only party
     *  group, or 409s with the group list when there are several. */
    suspend fun sendMerchantToParty(group: String? = null): ApiResult<CommandResult> =
        post("bank-party", JsonObject(if (group != null) mapOf("group" to JsonPrimitive(group)) else emptyMap()))

    /** POST /party-api/merchant/stale-orders/clear - recovery action that
     *  drops delivery/bank-mark records for items no longer in the
     *  merchant's inventory. */
    suspend fun clearStaleOrders(): ApiResult<CommandResult> = post("merchant/stale-orders/clear", JsonObject(emptyMap()))

    /** POST /party-api/merchant/activity/clear - clears the merchant
     *  activity log shown on the Logs screen. */
    suspend fun clearMerchantActivity(): ApiResult<CommandResult> = post("merchant/activity/clear", JsonObject(emptyMap()))

    /** POST /party-api/merchant/routine-priorities. The server merges
     *  `priorities`, so the full map is always valid; `enabled` keys outside
     *  the automatic routines are ignored. */
    suspend fun saveRoutinePriorities(priorities: Map<String, Int>, enabled: Map<String, Boolean>): ApiResult<CommandResult> {
        val body = JsonObject(
            mapOf(
                "priorities" to JsonObject(priorities.mapValues { JsonPrimitive(it.value) }),
                "enabled" to JsonObject(enabled.mapValues { JsonPrimitive(it.value) }),
            ),
        )
        return post("merchant/routine-priorities", body)
    }

    /** POST /party-api/merchant/bank-sort - `mode: "automatic"` sorts
     *  every visit; `mode: "request"` only sorts when a one-time request
     *  is queued via `enabled: true`. */
    suspend fun setBankSortMode(mode: String): ApiResult<CommandResult> =
        post("merchant/bank-sort", JsonObject(mapOf("mode" to JsonPrimitive(mode))))

    suspend fun requestBankSort(enabled: Boolean): ApiResult<CommandResult> =
        post("merchant/bank-sort", JsonObject(mapOf("enabled" to JsonPrimitive(enabled))))

    /** POST /party-api/config - `threshold` (gold carried before
     *  auto-banking) and/or `itemCollectionThreshold` (1-42 marked slots
     *  before a collection trip); null leaves a value unchanged. */
    suspend fun setThresholds(threshold: Long?, itemCollectionThreshold: Int?): ApiResult<CommandResult> {
        val body = JsonObject(
            buildMap {
                threshold?.let { put("threshold", JsonPrimitive(it)) }
                itemCollectionThreshold?.let { put("itemCollectionThreshold", JsonPrimitive(it)) }
            },
        )
        return post("config", body)
    }

    /** POST /party-api/farming-mode (Auto/Default/Scatter/Hunt). Hunt needs a
     *  `backup` (monster focus + spawn location) when none is set yet; the
     *  server answers 409 `backup_required` otherwise. */
    suspend fun setFarmingMode(mode: String, character: String, backupMonsterFocus: List<String>? = null, backupMap: String? = null, backupX: Double? = null, backupY: Double? = null): ApiResult<CommandResult> {
        // Scoped to the character; without it the server changes the
        // leader's policy.
        val body = JsonObject(
            buildMap {
                put("mode", JsonPrimitive(mode))
                put("character", JsonPrimitive(character))
                if (backupMonsterFocus != null && backupMap != null && backupX != null && backupY != null) {
                    put(
                        "backup",
                        JsonObject(
                            mapOf(
                                "monsterFocus" to JsonArray(backupMonsterFocus.map { JsonPrimitive(it) }),
                                "location" to JsonObject(
                                    mapOf(
                                        "map" to JsonPrimitive(backupMap),
                                        "x" to JsonPrimitive(backupX),
                                        "y" to JsonPrimitive(backupY),
                                    ),
                                ),
                            ),
                        ),
                    )
                }
            },
        )
        return post("farming-mode", body)
    }

    /** POST /party-api/focus - which monsters a character farms/hunts,
     *  per-character (unlike farming-mode). Omitting `monsterSearchRadius`
     *  leaves it unchanged server-side. */
    suspend fun setFocus(character: String, monsterFocus: List<String>, monsterSearchRadius: Int? = null, monsterPriorities: Map<String, Int>? = null): ApiResult<CommandResult> {
        // Priorities and radius only when given.
        val body = JsonObject(
            buildMap {
                put("character", JsonPrimitive(character))
                put("monsterFocus", JsonArray(monsterFocus.map { JsonPrimitive(it) }))
                monsterPriorities?.let { put("monsterPriorities", JsonObject(it.mapValues { (_, v) -> JsonPrimitive(v) })) }
                monsterSearchRadius?.let { put("monsterSearchRadius", JsonPrimitive(it)) }
            },
        )
        return post("focus", body)
    }

    private fun locationJson(map: String, x: Double, y: Double) = JsonObject(mapOf("map" to JsonPrimitive(map), "x" to JsonPrimitive(x), "y" to JsonPrimitive(y)))

    /** POST /party-api/navigate-to-monster - sends the whole party convoy to
     *  one monster; `phoenixRouteOrder` only for "phoenix". */
    suspend fun navigateToMonster(monsterId: String, map: String, x: Double, y: Double, phoenixRouteOrder: List<String>? = null): ApiResult<CommandResult> =
        post(
            "navigate-to-monster",
            JsonObject(
                buildMap {
                    put("monsterId", JsonPrimitive(monsterId))
                    put("location", locationJson(map, x, y))
                    phoenixRouteOrder?.let { put("phoenixRouteOrder", JsonArray(it.map { id -> JsonPrimitive(id) })) }
                },
            ),
        )

    /** Sends one character to a farming area for its focus:
     *  "party-monster-travel" for the leader, "character-travel" otherwise. */
    suspend fun routeToFarmingArea(character: String, isLeader: Boolean, map: String, x: Double, y: Double, farmingMonsterIds: List<String>, label: String? = null): ApiResult<CommandResult> =
        sendCommand(
            character,
            buildMap {
                put("type", if (isLeader) "party-monster-travel" else "character-travel")
                put("location", locationJson(map, x, y))
                put("farmingMonsterIds", JsonArray(farmingMonsterIds.map { JsonPrimitive(it) }))
                label?.let { put("label", it) }
            },
        )

    /** POST /party-api/hunt-blacklist - always scoped to the character;
     *  without it the server edits the leader's list. */
    suspend fun updateHuntBlacklist(character: String, action: String, monsterId: String? = null): ApiResult<CommandResult> {
        val body = JsonObject(
            buildMap {
                put("action", JsonPrimitive(action))
                put("character", JsonPrimitive(character))
                monsterId?.let { put("monsterId", JsonPrimitive(it)) }
            },
        )
        return post("hunt-blacklist", body)
    }

    /** POST /party-api/rare-hunting - passive hunting rules and/or the
     *  party-wide field-generator toggle. */
    suspend fun setRareHunting(patch: JsonObject): ApiResult<CommandResult> = post("rare-hunting", patch)

    /** POST /party-api/hunt-settings - a partial patch of only the changed
     *  fields, scoped to the character. */
    suspend fun saveHuntSettings(character: String, patch: Map<String, JsonElement>): ApiResult<CommandResult> =
        post("hunt-settings", JsonObject(patch + ("character" to JsonPrimitive(character))))

    /** Optional WTB edit fields. [value] is sent as given (JsonNull clears);
     *  null leaves it out. */
    data class WtbOptions(
        val editField: String? = null,
        val value: JsonElement? = null,
        val bidRevision: Int? = null,
        val preferencesOnly: Boolean? = null,
        val useStandSlot: Boolean? = null,
        val acceptHigherLevels: Boolean? = null,
        val replaceStandEntry: String? = null,
    )

    /** POST /party-api/merchant/bid - create, edit or (clear) cancel a WTB
     *  order. [priorityOverride] is sent as given -
     *  JsonNull clears the override, null leaves the key out. A full stand
     *  answers 409 with `occupants` (see the WTB replacement prompt). */
    suspend fun saveBid(
        itemId: String,
        price: Long,
        quantity: Int,
        minimumQuality: Int,
        clear: Boolean,
        priorityOverride: JsonElement? = null,
        options: WtbOptions? = null,
    ): ApiResult<CommandResult> {
        val body = JsonObject(
            buildMap {
                put("itemId", JsonPrimitive(itemId))
                put("price", JsonPrimitive(price))
                put("quantity", JsonPrimitive(quantity))
                put("minimumQuality", JsonPrimitive(minimumQuality))
                put("clear", JsonPrimitive(clear))
                priorityOverride?.let { put("priorityOverride", it) }
                options?.editField?.let { put("editField", JsonPrimitive(it)) }
                options?.value?.let { put("value", it) }
                options?.bidRevision?.let { put("bidRevision", JsonPrimitive(it)) }
                options?.preferencesOnly?.let { put("preferencesOnly", JsonPrimitive(it)) }
                options?.useStandSlot?.let { put("useStandSlot", JsonPrimitive(it)) }
                options?.acceptHigherLevels?.let { put("acceptHigherLevels", JsonPrimitive(it)) }
                options?.replaceStandEntry?.let { put("replaceStandEntry", JsonPrimitive(it)) }
            },
        )
        return post("merchant/bid", body)
    }

    /** POST /party-api/upgrade-preview - polled, so no action toast and no
     *  domain refresh. `refresh` queues a new server preview; otherwise the
     *  stored one is returned. */
    suspend fun upgradePreview(body: JsonObject): ApiResult<JsonObject> = when (val result = postOnce("upgrade-preview", body)) {
        is ApiResult.Success -> ApiResult.Success(result.value.data ?: JsonObject(emptyMap()))
        is ApiResult.Failure -> ApiResult.Failure(
            if (result.code == "session_expired") result.message else (result.body?.get("error") as? JsonPrimitive)?.content ?: "Server preview unavailable",
            result.code,
            result.status,
            result.body,
        )
    }

    /** `/party-api/command` type "upgrade-offering-rule" - creates (empty
     *  `id`) or edits a rule to use an offering instead of scrolls in a
     *  level range. The server assigns ids for new rules. */
    suspend fun saveOfferingRule(character: String, id: String, name: String, floor: Int, ceiling: Int, offering: String, required: Boolean): ApiResult<CommandResult> {
        val rule = JsonObject(
            mapOf(
                "id" to JsonPrimitive(id),
                "name" to JsonPrimitive(name),
                "floor" to JsonPrimitive(floor),
                "ceiling" to JsonPrimitive(ceiling),
                "offering" to JsonPrimitive(offering),
                "required" to JsonPrimitive(required),
            ),
        )
        return sendCommand(character, mapOf("type" to "upgrade-offering-rule", "rule" to rule))
    }

    /** `/party-api/command` type "upgrade-offering-rule" with remove. */
    suspend fun removeOfferingRule(character: String, id: String): ApiResult<CommandResult> {
        val rule = JsonObject(mapOf("id" to JsonPrimitive(id)))
        return sendCommand(character, mapOf("type" to "upgrade-offering-rule", "rule" to rule, "remove" to true))
    }

    /** `/party-api/command` type "character-travel" - sends one character to
     *  a map location (e.g. a [com.partyconsole.companion.model.TravelPlace]). */
    suspend fun sendCharacterTo(character: String, map: String, x: Double, y: Double, label: String): ApiResult<CommandResult> {
        val location = JsonObject(
            mapOf(
                "map" to JsonPrimitive(map),
                "x" to JsonPrimitive(x),
                "y" to JsonPrimitive(y),
            ),
        )
        return sendCommand(character, mapOf("type" to "character-travel", "location" to location, "label" to label))
    }

    /** `/party-api/command` type "return-leader" - rejoin the party leader,
     *  who must be a different, online character. */
    suspend fun returnToLeader(character: String): ApiResult<CommandResult> =
        sendCommand(character, mapOf("type" to "return-leader"))

    /** POST /party-api/town-party - sends every active character to town. */
    suspend fun sendPartyToTown(): ApiResult<CommandResult> = post("town-party", JsonObject(emptyMap()))

    /** POST /party-api/escape - party-wide emergency recovery; needs one
     *  online warrior/mage/priest and the server runs the staged sequence.
     *  Poll GET /party-api/escape for stage/error. */
    suspend fun triggerEscape(): ApiResult<CommandResult> = post("escape", JsonObject(emptyMap()))

    /** `/party-api/command` type "remove-auto-item-mark" - removes one
     *  auto-bank/auto-merchant rule by key. No `item` field; this command
     *  doesn't need one. */
    suspend fun removeAutoItemMark(character: String, mode: String, ruleKey: String): ApiResult<CommandResult> =
        sendCommand(character, mapOf("type" to "remove-auto-item-mark", "mode" to mode, "ruleKey" to ruleKey))

    /** `/party-api/command` type "update-auto-upgrade-rule" with remove -
     *  removes one standing auto-upgrade rule by its rule key. */
    suspend fun removeAutoUpgradeRule(owner: String, item: Item, ruleKey: String): ApiResult<CommandResult> =
        itemCommand("update-auto-upgrade-rule", owner, item, null, mapOf("ruleKey" to JsonPrimitive(ruleKey), "remove" to JsonPrimitive(true)))

    /** `/party-api/command` type "auto-compound-mark" with remove - the same
     *  command that creates the rule. */
    suspend fun removeAutoCompound(owner: String, name: String, targetTier: Int): ApiResult<CommandResult> =
        itemCommand(
            "auto-compound-mark", owner, Item(name = name), null,
            mapOf("targetTier" to JsonPrimitive(targetTier), "remove" to JsonPrimitive(true)),
        )

    /** POST /party-api/realm/switch - moves every active character to another
     *  realm. The server refuses PVP realms, or while a switch or bankboi
     *  transaction is already running. */
    suspend fun switchRealm(realm: String, setHome: Boolean = false): ApiResult<CommandResult> {
        val body = JsonObject(
            mapOf(
                "realm" to JsonPrimitive(realm),
                "setHome" to JsonPrimitive(setHome),
            ),
        )
        return post("realm/switch", body)
    }

    /** POST /party-api/dashboard-preferences - the bankboi naming prefix. */
    suspend fun setBankboiPrefix(prefix: String): ApiResult<CommandResult> =
        post("dashboard-preferences", JsonObject(mapOf("bankboiPrefix" to JsonPrimitive(prefix))))

    /** POST /party-api/formation {character, eventSelections}. */
    suspend fun setEventSelections(character: String, eventSelections: List<String>): ApiResult<CommandResult> =
        post("formation", JsonObject(mapOf("character" to JsonPrimitive(character), "eventSelections" to kotlinx.serialization.json.JsonArray(eventSelections.map { JsonPrimitive(it) }))))

    /** POST /party-api/dashboard-preferences - whether to send the
     *  anniversary chat message when receiving cake from a kiss. */
    suspend fun setAnniversaryAutoChat(enabled: Boolean): ApiResult<CommandResult> =
        post("dashboard-preferences", JsonObject(mapOf("anniversaryAutoChat" to JsonPrimitive(enabled))))

    /** POST /party-api/anniversary/chat-advertise - posts the cake-trade
     *  advertisement to in-game chat now. */
    suspend fun sendAnniversaryChatAdvertisement(): ApiResult<CommandResult> =
        post("anniversary/chat-advertise", JsonObject(emptyMap()))

    /** POST /party-api/aldata/key - generates a fresh ALData publishing key
     *  (replaces any existing one). */
    suspend fun generateAlDataKey(): ApiResult<String> = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(settings.apiBase.trimEnd('/') + "/aldata/key")
            .post(json.encodeToString(JsonObject.serializer(), JsonObject(emptyMap())).toRequestBody(JSON_MEDIA_TYPE))
            .build()
        parseAlDataKeyResponse(request)
    }

    /** GET /party-api/aldata/key - reveals the already-generated key. */
    suspend fun revealAlDataKey(): ApiResult<String> = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(settings.apiBase.trimEnd('/') + "/aldata/key").get().build()
        parseAlDataKeyResponse(request)
    }

    private fun parseAlDataKeyResponse(request: Request): ApiResult<String> = try {
        client.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            val parsed = runCatching { json.decodeFromString(AlDataKeyResponse.serializer(), text) }.getOrNull()
            if (!response.isSuccessful) ApiResult.Failure(parsed?.error ?: "HTTP ${response.code}")
            else if (parsed?.key != null) ApiResult.Success(parsed.key)
            else ApiResult.Failure(parsed?.error ?: "ALData request failed")
        }
    } catch (e: java.io.IOException) {
        ApiResult.Failure(e.message ?: "network error")
    }

    /** GET /party-api/aldata/auth - checks whether ALData has confirmed the
     *  authentication mail yet ("NO" | "YES" | "CORRECT" | "WRONG"). */
    suspend fun checkAlDataAuth(): ApiResult<String> = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(settings.apiBase.trimEnd('/') + "/aldata/auth").get().build()
        try {
            client.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                val parsed = runCatching { json.decodeFromString(AlDataAuthResponse.serializer(), text) }.getOrNull()
                if (!response.isSuccessful) ApiResult.Failure(parsed?.error ?: "HTTP ${response.code}")
                else if (parsed?.auth != null) ApiResult.Success(parsed.auth)
                else ApiResult.Failure(parsed?.error ?: "ALData request failed")
            }
        } catch (e: java.io.IOException) {
            ApiResult.Failure(e.message ?: "network error")
        }
    }

    /** POST /party-api/merchant/send-mail - with an optional attachment from
     *  a pack (merchant, bank pack or bankboi:NAME) and slot; [quantity]
     *  applies to stacks. */
    suspend fun sendMail(recipient: String, subject: String, message: String, quantity: Int, sourcePack: String? = null, sourceSlot: Int? = null, sourceItem: Item? = null): ApiResult<CommandResult> {
        val body = JsonObject(
            buildMap {
                put("recipient", JsonPrimitive(recipient))
                put("subject", JsonPrimitive(subject))
                put("message", JsonPrimitive(message))
                put("quantity", JsonPrimitive(quantity))
                if (sourcePack != null && sourceSlot != null && sourceItem != null) {
                    put("source", JsonObject(mapOf("pack" to JsonPrimitive(sourcePack), "slot" to JsonPrimitive(sourceSlot), "item" to json.encodeToJsonElement(Item.serializer(), sourceItem))))
                }
            },
        )
        return post("merchant/send-mail", body)
    }

    /** POST /party-api/mail/{refresh|collect|delete} {id}. */
    suspend fun mailAction(action: String, id: String? = null): ApiResult<CommandResult> =
        post("mail/$action", JsonObject(buildMap { id?.let { put("id", JsonPrimitive(it)) } }))

    /** POST /party-api/mail/collect - collects an attached item/gold from
     *  a received message by its id. */
    suspend fun collectMail(id: String): ApiResult<CommandResult> =
        post("mail/collect", JsonObject(mapOf("id" to JsonPrimitive(id))))

    /** POST /party-api/combat-log/:character/clear. */
    suspend fun clearCombatLog(character: String): ApiResult<CommandResult> =
        post("combat-log/${java.net.URLEncoder.encode(character, "UTF-8").replace("+", "%20")}/clear", JsonObject(emptyMap()))

    /** POST /party-api/merchant/aldata-order - the listing as received,
     *  minus client-only grouping fields. */
    suspend fun buyAlData(listing: JsonObject, buyQuantity: Int): ApiResult<CommandResult> =
        post("merchant/aldata-order", JsonObject(mapOf("listing" to JsonObject(listing - "origin" - "groupedListings"), "buyQuantity" to JsonPrimitive(buyQuantity))))

    /** POST /party-api/merchant/aldata-sale - sell owned copies into a live
     *  ALData buy order. */
    suspend fun sellAlData(order: JsonObject, sellQuantity: Int): ApiResult<CommandResult> =
        post("merchant/aldata-sale", JsonObject(mapOf("order" to order, "sellQuantity" to JsonPrimitive(sellQuantity))))

    /** POST /party-api/merchant/ponty-order - every listing key of the
     *  grouped lot. */
    suspend fun buyPonty(keys: List<String>, quantity: Int, unitPrice: Long): ApiResult<CommandResult> {
        val body = JsonObject(
            mapOf(
                "keys" to kotlinx.serialization.json.JsonArray(keys.map { JsonPrimitive(it) }),
                "quantity" to JsonPrimitive(quantity),
                "unitPrice" to JsonPrimitive(unitPrice),
            ),
        )
        return post("merchant/ponty-order", body)
    }
}
