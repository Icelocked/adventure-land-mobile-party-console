package com.partyconsole.companion.network

import com.partyconsole.companion.model.Item
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
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

/** Applies exactly the TrustMode the user chose on the connection screen
 *  (network/ServerConfig.kt) - the one place that decides how (or
 *  whether) the server's TLS certificate gets verified. Shared by both
 *  [buildHttpClient] and [buildSseHttpClient] so REST calls and the SSE
 *  stream always trust the server the same way; only their timeouts
 *  differ (see each function's doc). */
private fun baseHttpClientBuilder(settings: ServerSettings): OkHttpClient.Builder {
    val builder = OkHttpClient.Builder().connectTimeout(10, TimeUnit.SECONDS)
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
    return builder
}

/** For ordinary one-shot REST calls (roster fetch, state polling, item
 *  commands) - a real, bounded timeout, so a request that stalls after
 *  connecting (a network hiccup, the phone handing off from WiFi to
 *  cellular mid-request) actually fails and lets the caller's own retry
 *  logic (e.g. PartyRepository.fetchRosterWithRetry) kick in, instead of
 *  hanging forever with nothing to time it out. This client used to be
 *  shared with the SSE stream's readTimeout=0/callTimeout=0 - correct for
 *  a connection meant to stay open indefinitely, but silently disabled
 *  timeouts for every REST call too, which could hang the whole
 *  "Connecting..." screen with no error and no recovery. */
fun buildHttpClient(settings: ServerSettings): OkHttpClient =
    baseHttpClientBuilder(settings)
        .readTimeout(15, TimeUnit.SECONDS)
        .callTimeout(20, TimeUnit.SECONDS)
        .build()

/** For the SSE stream specifically (LiveConnection.kt) - genuinely no
 *  read/call timeout, since the connection is meant to stay open
 *  indefinitely; LiveConnection's own heartbeat watchdog (not OkHttp) is
 *  what detects a stalled-but-not-closed stream. */
fun buildSseHttpClient(settings: ServerSettings): OkHttpClient =
    baseHttpClientBuilder(settings)
        .readTimeout(0, TimeUnit.SECONDS)
        .callTimeout(0, TimeUnit.SECONDS)
        .build()

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

    /** GET against the party-api base - used for one-shot reads like
     *  /party-api/state (roster, merchant queue) that don't belong on the
     *  SSE stream (live-protocol.ts's LiveRecord is vitals/items/slots
     *  only). Returns the raw body string; callers decode with the exact
     *  slice-type they need (see PartyRepository's roster/merchant-queue
     *  fetches) rather than this class assuming one shape for every GET. */
    suspend fun get(path: String): ApiResult<String> = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(settings.apiBase.trimEnd('/') + "/" + path.trimStart('/'))
            .get()
            .build()
        try {
            client.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (!response.isSuccessful) ApiResult.Failure("HTTP ${response.code}")
                else ApiResult.Success(text)
            }
        } catch (e: java.io.IOException) {
            ApiResult.Failure(e.message ?: "network error")
        }
    }

    /** POST /party-api/formation (runtime/coordinator/http/formation.ts) -
     *  leader is the party leader's name (or null to clear it), independent
     *  of follow, which is this specific character's own follow-the-leader
     *  toggle. The web dashboard's two controls (RadioGroup + Checkbox,
     *  see party-workspace.tsx) both call this same route. */
    suspend fun setFormation(leader: String?, character: String, follow: Boolean): ApiResult<CommandResult> {
        val body = JsonObject(
            buildMap {
                put("character", kotlinx.serialization.json.JsonPrimitive(character))
                put("follow", kotlinx.serialization.json.JsonPrimitive(follow))
                put("leader", leader?.let { kotlinx.serialization.json.JsonPrimitive(it) } ?: kotlinx.serialization.json.JsonNull)
            },
        )
        return post("formation", body)
    }

    /** POST /party-api/restock (runtime/coordinator/http/restock.ts) - one
     *  character's HP/MP auto-potion thresholds. */
    suspend fun saveRestock(character: String, hpMin: Int, hpMax: Int, mpMin: Int, mpMax: Int): ApiResult<CommandResult> {
        fun range(min: Int, max: Int) = JsonObject(
            mapOf(
                "min" to kotlinx.serialization.json.JsonPrimitive(min),
                "max" to kotlinx.serialization.json.JsonPrimitive(max),
            ),
        )
        val body = JsonObject(
            mapOf(
                "character" to kotlinx.serialization.json.JsonPrimitive(character),
                "hp" to range(hpMin, hpMax),
                "mp" to range(mpMin, mpMax),
            ),
        )
        return post("restock", body)
    }

    /** party-console's account-pairing controls (/setup/state,
     *  /setup/pairing) live at the server root, not under /party-api - see
     *  SettingsScreen. Everything else in this class deliberately only
     *  ever talks to party-api routes, so this is spelled out as its own
     *  root-relative pair rather than a silent exception inside get/post. */
    suspend fun getRoot(path: String): ApiResult<String> = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(settings.baseUrl.trimEnd('/') + "/" + path.trimStart('/')).get().build()
        try {
            client.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (!response.isSuccessful) ApiResult.Failure("HTTP ${response.code}") else ApiResult.Success(text)
            }
        } catch (e: java.io.IOException) {
            ApiResult.Failure(e.message ?: "network error")
        }
    }

    suspend fun postRoot(path: String, body: JsonObject): ApiResult<String> = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(settings.baseUrl.trimEnd('/') + "/" + path.trimStart('/'))
            .post(json.encodeToString(JsonObject.serializer(), body).toRequestBody(JSON_MEDIA_TYPE))
            .build()
        try {
            client.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (!response.isSuccessful) ApiResult.Failure("HTTP ${response.code}") else ApiResult.Success(text)
            }
        } catch (e: java.io.IOException) {
            ApiResult.Failure(e.message ?: "network error")
        }
    }

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

    /** Every item-mark/equip/use/give command on /party-api/command needs
     *  the FULL item object in its `item` field, not just its name - the
     *  server verifies identity against it (see mark-commands.ts:
     *  `requestObject(body.item)`, requires `.name` to be a string) rather
     *  than trusting a bare name/slot pair, since the slot's contents can
     *  have changed between when this app last saw them and when the tap
     *  landed. [slot] varies by action: a number (inventory index) for
     *  most, but a string equip-slot name (e.g. "mainhand") for unequip -
     *  callers pass whichever JsonElement that action expects. */
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

    /** POST /party-api/merchant/stand (http/stand-marks.ts) - list an
     *  inventory item on the merchant's stand. Own route, not /command. */
    suspend fun markForStand(
        item: Item,
        slot: Int,
        bankPack: String? = null,
        price: Long,
        quantity: Int = 1,
        remove: Boolean = false,
    ): ApiResult<CommandResult> {
        val body = JsonObject(
            buildMap {
                put("item", json.encodeToJsonElement(Item.serializer(), item))
                put("slot", JsonPrimitive(slot))
                bankPack?.let { put("bankPack", JsonPrimitive(it)) }
                put("price", JsonPrimitive(price))
                put("quantity", JsonPrimitive(quantity))
                put("remove", JsonPrimitive(remove))
            },
        )
        return post("merchant/stand", body)
    }

    /** POST /party-api/merchant/npc-sale (http/npc-sale.ts) - source is
     *  always "character" from this app's item-action panel (bank-side
     *  NPC sales are a bank-screen concern, not this character's, per the
     *  mobile-redesign plan's Phase 3 account screens). */
    suspend fun markForNpcSale(
        character: String,
        item: Item,
        slot: Int,
        quantity: Int = 1,
        remove: Boolean = false,
    ): ApiResult<CommandResult> {
        val body = JsonObject(
            mapOf(
                "source" to JsonPrimitive("character"),
                "character" to JsonPrimitive(character),
                "slot" to JsonPrimitive(slot),
                "item" to json.encodeToJsonElement(Item.serializer(), item),
                "quantity" to JsonPrimitive(quantity),
                "remove" to JsonPrimitive(remove),
            ),
        )
        return post("merchant/npc-sale", body)
    }

    /** `/party-api/command` type "withdraw" (inventory/transfer-commands.ts) -
     *  pulls one item out of the shared bank to a character's own bag.
     *  `pack` is the bank pack name (e.g. "items0", or "bankboi:Name"),
     *  `slot` is that pack's slot index - both distinct from the
     *  requesting character's own inventory slot, which this command
     *  doesn't need (the server finds room on its own). */
    suspend fun withdrawFromBank(character: String, item: Item, pack: String, slot: Int, markAll: Boolean = false): ApiResult<CommandResult> {
        val extra = buildMap {
            put("pack", JsonPrimitive(pack))
            if (markAll) put("markAll", JsonPrimitive(true))
        }
        return itemCommand("withdraw", character, item, JsonPrimitive(slot), extra)
    }

    /** POST /party-api/merchant/npc-sale with source "bank" - sells a bank
     *  item directly without withdrawing it to a character first. */
    suspend fun sellBankItemToNpc(item: Item, pack: String, slot: Int, quantity: Int = 1, remove: Boolean = false): ApiResult<CommandResult> {
        val body = JsonObject(
            mapOf(
                "source" to JsonPrimitive("bank"),
                "pack" to JsonPrimitive(pack),
                "slot" to JsonPrimitive(slot),
                "item" to json.encodeToJsonElement(Item.serializer(), item),
                "quantity" to JsonPrimitive(quantity),
                "remove" to JsonPrimitive(remove),
            ),
        )
        return post("merchant/npc-sale", body)
    }

    /** POST /party-api/deconstruction/mark (merchant/bank-deconstruction.ts,
     *  triggered by `pack` being present) - marks a bank item for scrap
     *  without withdrawing it first. */
    suspend fun markBankItemForDeconstruction(item: Item, pack: String, slot: Int): ApiResult<CommandResult> {
        val body = JsonObject(
            mapOf(
                "item" to json.encodeToJsonElement(Item.serializer(), item),
                "pack" to JsonPrimitive(pack),
                "slot" to JsonPrimitive(slot),
            ),
        )
        return post("deconstruction/mark", body)
    }

    /** POST /party-api/deconstruction/mark (merchant/deconstruction.ts). */
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

    /** POST /party-api/deconstruction/auto (merchant/deconstruction.ts) -
     *  a standing "always deconstruct this item type" rule, separate from
     *  marking one instance (markForDeconstruction). */
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

    /** POST /party-api/merchant/auto-npc-sale (http/automatic-sales.ts) -
     *  a standing "always sell this item type to an NPC" rule. */
    suspend fun autoNpcSale(character: String, item: Item, remove: Boolean = false): ApiResult<CommandResult> {
        val body = JsonObject(
            mapOf(
                "character" to JsonPrimitive(character),
                "item" to json.encodeToJsonElement(Item.serializer(), item),
                "action" to JsonPrimitive(if (remove) "remove" else "set"),
            ),
        )
        return post("merchant/auto-npc-sale", body)
    }

    /** POST /party-api/merchant/auto-stand (http/automatic-sales.ts) - a
     *  standing "always list this item type on the stand at this price"
     *  rule, merchant-only. */
    suspend fun autoStand(character: String, item: Item, price: Long, remove: Boolean = false): ApiResult<CommandResult> {
        val body = JsonObject(
            mapOf(
                "character" to JsonPrimitive(character),
                "item" to json.encodeToJsonElement(Item.serializer(), item),
                "price" to JsonPrimitive(price),
                "action" to JsonPrimitive(if (remove) "remove" else "set"),
            ),
        )
        return post("merchant/auto-stand", body)
    }

    /** `/party-api/command` type "character-travel" (navigation/manual-
     *  commands.ts's travel handler) - sends one character to a preset
     *  map location (see model/TravelPlace, sourced from state's
     *  travelPlaces list). No item involved, so this uses sendCommand
     *  directly rather than itemCommand. */
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

    /** `/party-api/command` type "return-leader" - rendezvous back with
     *  the current party leader. Server requires a different, currently-
     *  online leader to exist. */
    suspend fun returnToLeader(character: String): ApiResult<CommandResult> =
        sendCommand(character, mapOf("type" to "return-leader"))

    /** `/party-api/command` type "remove-auto-item-mark" (inventory/mark-
     *  commands.ts) - removes one standing auto-bank/auto-merchant rule
     *  by its rule key. Deliberately no `item` field: the real dashboard
     *  omits it too, and the server-side handler for this type never
     *  requires one (only auto-item-mark itself does). */
    suspend fun removeAutoItemMark(character: String, mode: String, ruleKey: String): ApiResult<CommandResult> =
        sendCommand(character, mapOf("type" to "remove-auto-item-mark", "mode" to mode, "ruleKey" to ruleKey))

    /** `/party-api/command` type "update-auto-upgrade-rule" with remove -
     *  removes one standing auto-upgrade rule by its rule key. */
    suspend fun removeAutoUpgradeRule(owner: String, item: Item, ruleKey: String): ApiResult<CommandResult> =
        itemCommand("update-auto-upgrade-rule", owner, item, null, mapOf("ruleKey" to JsonPrimitive(ruleKey), "remove" to JsonPrimitive(true)))

    /** `/party-api/command` type "auto-compound-mark" with remove - the
     *  same command that CREATES the rule (see itemCommand's earlier
     *  auto-compound call), just with remove=true. */
    suspend fun removeAutoCompound(owner: String, name: String, targetTier: Int): ApiResult<CommandResult> =
        itemCommand(
            "auto-compound-mark", owner, Item(name = name), null,
            mapOf("targetTier" to JsonPrimitive(targetTier), "remove" to JsonPrimitive(true)),
        )

    /** POST /party-api/realm/switch (http/realms.ts) - moves every active
     *  character to a different Adventure Land realm together. Server
     *  refuses PVP realms and refuses if a switch is already running or a
     *  bankboi transaction is in progress - surface the returned error
     *  rather than assume success. */
    suspend fun switchRealm(realm: String, setHome: Boolean = false): ApiResult<CommandResult> {
        val body = JsonObject(
            mapOf(
                "realm" to JsonPrimitive(realm),
                "setHome" to JsonPrimitive(setHome),
            ),
        )
        return post("realm/switch", body)
    }

    /** POST /party-api/dashboard-preferences (http/dashboard-import.ts's
     *  preferences handler) - the bankboi mule-character naming prefix. */
    suspend fun setBankboiPrefix(prefix: String): ApiResult<CommandResult> =
        post("dashboard-preferences", JsonObject(mapOf("bankboiPrefix" to JsonPrimitive(prefix))))

    /** POST /party-api/merchant/send-mail (http/send-mail.ts). Server-side
     *  validation this app should match before calling: recipient
     *  ^[A-Za-z0-9_]{1,40}$, subject 1-74 chars, message <=1000 chars. No
     *  item/gold attachment for v1 - that needs a source pack/slot this
     *  screen has no natural "which character" context for yet. */
    suspend fun sendMail(recipient: String, subject: String, message: String): ApiResult<CommandResult> {
        val body = JsonObject(
            mapOf(
                "recipient" to JsonPrimitive(recipient),
                "subject" to JsonPrimitive(subject),
                "message" to JsonPrimitive(message),
            ),
        )
        return post("merchant/send-mail", body)
    }

    /** POST /party-api/mail/collect - collects an attached item/gold from
     *  a received message by its id. */
    suspend fun collectMail(id: String): ApiResult<CommandResult> =
        post("mail/collect", JsonObject(mapOf("id" to JsonPrimitive(id))))

    /** POST /party-api/merchant/aldata-order (manual-market-orders.ts) -
     *  buys from one ALData public listing. Server only reads the
     *  listing's `key` plus the desired quantity; it must still exist and
     *  be fresh (<120s old) in the coordinator's own market snapshot. */
    suspend fun buyAlData(listingKey: String, buyQuantity: Int): ApiResult<CommandResult> {
        val body = JsonObject(
            mapOf(
                "listing" to JsonObject(mapOf("key" to JsonPrimitive(listingKey))),
                "buyQuantity" to JsonPrimitive(buyQuantity),
            ),
        )
        return post("merchant/aldata-order", body)
    }

    /** POST /party-api/merchant/ponty-order - `keys` lets the server
     *  combine several Ponty listings into one purchase; this app always
     *  buys a single listing, so it's always a one-element list. */
    suspend fun buyPonty(listingKey: String, quantity: Int, unitPrice: Long): ApiResult<CommandResult> {
        val body = JsonObject(
            mapOf(
                "keys" to kotlinx.serialization.json.JsonArray(listOf(JsonPrimitive(listingKey))),
                "quantity" to JsonPrimitive(quantity),
                "unitPrice" to JsonPrimitive(unitPrice),
            ),
        )
        return post("merchant/ponty-order", body)
    }

    /** POST /party-api/merchant/stand-search (manual-market-orders.ts) -
     *  starts a live search for a specific item across nearby players'
     *  open stands; results land in GET /party-api/state's `standSearch`
     *  field (polled - see PartyRepository), not this call's own response. */
    suspend fun standSearch(itemId: String): ApiResult<CommandResult> =
        post("merchant/stand-search", JsonObject(mapOf("itemId" to JsonPrimitive(itemId))))

    /** POST /party-api/merchant/stand-order - buys one live player-stand
     *  listing. The server re-matches by seller+slot+rid+item.name+price,
     *  so this echoes those exact fields back from the search result
     *  rather than re-deriving them, per manual-market-orders.ts. */
    suspend fun buyFromStand(listing: com.partyconsole.companion.model.StandSearchListing, buyQuantity: Int): ApiResult<CommandResult> {
        val entry = buildMap {
            put("seller", JsonPrimitive(listing.seller))
            put("slot", JsonPrimitive(listing.slot))
            listing.rid?.let { put("rid", JsonPrimitive(it)) }
            put("itemName", JsonPrimitive(listing.item.name))
            put("price", JsonPrimitive(listing.price))
            put("buyQuantity", JsonPrimitive(buyQuantity))
        }
        val body = JsonObject(
            mapOf("listings" to kotlinx.serialization.json.JsonArray(listOf(JsonObject(entry)))),
        )
        return post("merchant/stand-order", body)
    }
}
