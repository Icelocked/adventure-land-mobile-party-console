package com.partyconsole.companion.data

import com.partyconsole.companion.model.BankVault
import com.partyconsole.companion.model.BestiaryMonster
import com.partyconsole.companion.model.CharacterDiagnostics
import com.partyconsole.companion.model.CharacterInventory
import com.partyconsole.companion.model.CharacterState
import com.partyconsole.companion.model.CharacterVitals
import com.partyconsole.companion.model.EquippedEntry
import com.partyconsole.companion.model.EscapeResponse
import com.partyconsole.companion.model.EscapeStatus
import com.partyconsole.companion.model.GameLogEntry
import com.partyconsole.companion.model.InventoryEntry
import com.partyconsole.companion.model.MailSnapshot
import com.partyconsole.companion.model.MerchantCatalog
import com.partyconsole.companion.model.MonsterChoice
import com.partyconsole.companion.model.PartyStateDynamic
import com.partyconsole.companion.model.PartyStateGameLogs
import com.partyconsole.companion.model.RosterMember
import com.partyconsole.companion.model.SkillClass
import com.partyconsole.companion.model.TravelPlace
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.network.LiveEvent
import com.partyconsole.companion.network.LiveRecordWire
import com.partyconsole.companion.network.PartyApiClient
import com.partyconsole.companion.network.ServerSettings
import com.partyconsole.companion.network.buildHttpClient
import com.partyconsole.companion.network.buildSseHttpClient
import com.partyconsole.companion.network.intField
import com.partyconsole.companion.network.liveEvents
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull

/** public-state.ts catalogs(): served only by section=catalog, refetched when
 *  core's referenceRevision changes. Decoded once per revision. */
@Serializable
private data class CatalogSection(
    val travelPlaces: List<TravelPlace> = emptyList(),
    val monsterChoices: List<MonsterChoice> = emptyList(),
    val bestiaryCatalog: List<BestiaryMonster> = emptyList(),
    val skillCatalog: List<SkillClass> = emptyList(),
    val merchantCatalog: MerchantCatalog? = null,
    val bankVaults: List<BankVault> = emptyList(),
)

/** Owns one connection to one configured server - a port of the PWA's
 *  data/PartyDataProvider.tsx (itself query-cache.tsx's domain policies):
 *  every state section is its own single-flight request on its own cadence,
 *  so a slow section never holds up another; actions refresh exactly the
 *  domains they touched; screens raise a domain's cadence while visible;
 *  polling pauses in the background. Recreate (don't reuse) whenever the
 *  active ServerSettings changes. [live] and [foreground] are injectable for
 *  tests. */
class PartyRepository(
    private val settings: ServerSettings,
    private val scope: CoroutineScope,
    private val foreground: StateFlow<Boolean> = MutableStateFlow(true),
    live: Flow<LiveEvent>? = null,
) {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }
    private val httpClient = buildHttpClient(settings)
    private val sseClient = buildSseHttpClient(settings)
    val api = PartyApiClient(httpClient, settings) { path, body -> onAction(path, body) }

    private val _characters = MutableStateFlow<Map<String, CharacterState>>(emptyMap())
    val characters: StateFlow<Map<String, CharacterState>> = _characters.asStateFlow()

    // null until the stream has reported once - the fallback polls only after
    // it has actually gone unhealthy, never during the first connect.
    private val _connected = MutableStateFlow<Boolean?>(null)
    val connected: StateFlow<Boolean?> = _connected.asStateFlow()

    private val _lastConnectionError = MutableStateFlow<String?>(null)
    val lastConnectionError: StateFlow<String?> = _lastConnectionError.asStateFlow()

    private val _roster = MutableStateFlow<Map<String, RosterMember>>(emptyMap())
    val roster: StateFlow<Map<String, RosterMember>> = _roster.asStateFlow()

    private val _dynamicState = MutableStateFlow(PartyStateDynamic())
    val dynamicState: StateFlow<PartyStateDynamic> = _dynamicState.asStateFlow()

    // The config section has arrived (the PWA's useConfigLoaded): every
    // control seeded from a config field stays disabled until then.
    private val _stateLoaded = MutableStateFlow(false)
    val stateLoaded: StateFlow<Boolean> = _stateLoaded.asStateFlow()

    // The pairing gate turned this device away (its cookie expired or was
    // revoked) - the PWA's "Session expired - Reconnect".
    private val _sessionLost = MutableStateFlow(false)
    val sessionLost: StateFlow<Boolean> = _sessionLost.asStateFlow()

    private val _mail = MutableStateFlow(MailSnapshot())
    val mail: StateFlow<MailSnapshot> = _mail.asStateFlow()

    private val _gameLogs = MutableStateFlow<Map<String, List<GameLogEntry>>>(emptyMap())
    val gameLogs: StateFlow<Map<String, List<GameLogEntry>>> = _gameLogs.asStateFlow()

    // log-sidebar.tsx: a failed refresh keeps the retained logs and says so.
    private val _logsError = MutableStateFlow(false)
    val logsError: StateFlow<Boolean> = _logsError.asStateFlow()

    private val _escape = MutableStateFlow<EscapeStatus?>(null)
    val escape: StateFlow<EscapeStatus?> = _escape.asStateFlow()
    private val _escapeError = MutableStateFlow<String?>(null)
    val escapeError: StateFlow<String?> = _escapeError.asStateFlow()

    // Round trip of the smallest request (escape) - the latency badge.
    private val _latencyMs = MutableStateFlow<Long?>(null)
    val latencyMs: StateFlow<Long?> = _latencyMs.asStateFlow()

    // core's characterDetails (diagnostics + presence), per active character.
    private val _characterDetails = MutableStateFlow<Map<String, CharacterDiagnostics>>(emptyMap())
    val characterDetails: StateFlow<Map<String, CharacterDiagnostics>> = _characterDetails.asStateFlow()

    // Server clock minus this device's clock (live-metrics.ts serverOffset).
    private val _serverOffset = MutableStateFlow(0L)
    val serverOffset: StateFlow<Long> = _serverOffset.asStateFlow()

    // --- merged state: every non-catalog section laid over the previous one
    // ({...current, ...patch}), decoded into PartyStateDynamic after each
    // merge; the catalog is decoded on its own, once per referenceRevision.
    private val stateLock = Any()
    private var merged = JsonObject(emptyMap())
    private var catalog = CatalogSection()
    private var lastAccountId: String? = null
    @Volatile private var lastReferenceRevision: String? = null
    @Volatile private var marketAldata: JsonElement? = null
    @Volatile private var catalogLoaded = false
    // The referenceRevision the loaded (or loading) catalog belongs to.
    @Volatile private var catalogRevision: String? = null

    private fun mergeState(patch: Map<String, JsonElement>) {
        synchronized(stateLock) {
            val candidate = JsonObject(merged + patch)
            if (decodeState(candidate) != null) {
                merged = candidate
            } else {
                val bad = badFields(patch)
                if (bad != droppedFields) {
                    droppedFields = bad
                    log("state fields skipped (shape changed): $bad", IllegalStateException(bad.toString()))
                }
                merged = JsonObject(merged + (patch - bad))
            }
            publish()
        }
    }

    private fun publish() {
        val decoded = decodeState(merged) ?: return
        _dynamicState.value = decoded.copy(
            travelPlaces = catalog.travelPlaces,
            monsterChoices = catalog.monsterChoices,
            bestiaryCatalog = catalog.bestiaryCatalog,
            skillCatalog = catalog.skillCatalog,
            merchantCatalog = catalog.merchantCatalog,
            // The bank section carries the live vault list; the catalog's copy
            // only fills in until it arrives.
            bankVaults = if (merged.containsKey("bankVaults")) decoded.bankVaults else catalog.bankVaults,
        )
    }

    /** If one field of an incoming section doesn't match the model (a
     *  console release changed its shape), only that field is rejected - it
     *  keeps its last good value and the rest of the state keeps updating
     *  instead of freezing. */
    private fun decodeState(source: JsonObject): PartyStateDynamic? =
        runCatching { json.decodeFromJsonElement(PartyStateDynamic.serializer(), source) }.getOrNull()

    private fun badFields(patch: Map<String, JsonElement>): Set<String> = patch.keys.filter { key ->
        runCatching { json.decodeFromJsonElement(PartyStateDynamic.serializer(), JsonObject(mapOf(key to patch.getValue(key)))) }.isFailure
    }.toSet()
    @Volatile private var droppedFields: Set<String> = emptySet()

    private suspend fun section(name: String): ApiResult<JsonObject> = getObject("state?catalog=0&dashboard=1&section=$name")

    private suspend fun getObject(path: String): ApiResult<JsonObject> =
        when (val result = api.get(path)) {
            is ApiResult.Failure -> {
                if (result.code == "session_expired") _sessionLost.value = true
                result
            }
            is ApiResult.Success -> {
                _sessionLost.value = false
                runCatching { json.parseToJsonElement(result.value).jsonObject }
                    .fold({ ApiResult.Success(it) }, { ApiResult.Failure("Unreadable response") })
            }
        }

    private suspend fun fetchCore() {
        val sentAt = System.currentTimeMillis()
        val value = (section("core") as? ApiResult.Success)?.value ?: return
        // query-cache.tsx: a different account on the same server replaces everything.
        val accountId = (value["accountId"] as? JsonPrimitive)?.content
        if (accountId != null && lastAccountId != null && accountId != lastAccountId) resetAccount()
        if (accountId != null) lastAccountId = accountId
        // live-metrics.ts synchronizeDashboardClock: offset from the round trip's midpoint.
        (value["serverNow"] as? JsonPrimitive)?.longOrNull?.let { _serverOffset.value = it - (sentAt + System.currentTimeMillis()) / 2 }
        (value["characterDetails"] as? JsonObject)?.let { details ->
            // Each character decodes on its own - one odd report never hides the others.
            _characterDetails.value = details.mapNotNull { (name, detail) ->
                val raw = detail as? JsonObject ?: return@mapNotNull null
                val decoded = runCatching { json.decodeFromJsonElement(CharacterDiagnostics.serializer(), raw) }.getOrElse { CharacterDiagnostics(name = name) }
                name to decoded.also { it.raw = raw }
            }.toMap()
        }
        (value["characters"] as? JsonObject)?.let { summaries ->
            val roster = _roster.value.toMutableMap()
            for ((name, summary) in summaries) {
                val patch = summary as? JsonObject ?: continue
                val previous = roster[name]
                roster[name] = RosterMember(
                    name = name,
                    ctype = (patch["ctype"] as? JsonPrimitive)?.content ?: previous?.ctype.orEmpty(),
                    level = (patch["level"] as? JsonPrimitive)?.content?.toIntOrNull() ?: previous?.level ?: 0,
                    id = previous?.id,
                    online = previous?.online ?: false,
                    home = previous?.home,
                    server = (patch["server"] as? JsonPrimitive)?.content ?: previous?.server,
                )
            }
            applyRoster(roster)
        }
        // bankbois: core only has item-less summaries; the bank section has the full entries.
        val patch = value.filterKeys { it !in CORE_ONLY_KEYS }.toMutableMap()
        // use-panel-model.ts lays the market domain over core, so core's
        // stripped aldata never replaces the market's copy once loaded.
        marketAldata?.let { patch["aldata"] = it }
        mergeState(patch)
        // query-cache.tsx keys the catalog by core's referenceRevision. A
        // catalog request already under way is not repeated (it is the
        // biggest payload); a newer revision is picked up by the next poll.
        val revision = (value["referenceRevision"] as? JsonPrimitive)?.content
        if (revision != null) {
            lastReferenceRevision = revision
            if (revision != catalogRevision && !flights.getValue(Domain.CATALOG).busy) trigger(Domain.CATALOG)
        }
    }

    private suspend fun fetchConfig() {
        val value = (section("config") as? ApiResult.Success)?.value ?: return
        mergeState(value - "roster")
        _stateLoaded.value = true
        (value["roster"] as? JsonArray)?.let { list ->
            val roster = list.mapNotNull { runCatching { json.decodeFromJsonElement(RosterMember.serializer(), it) }.getOrNull() }.associateBy { it.name }
            applyRoster(roster)
        }
    }

    // query-cache.tsx market domain: before core's first referenceRevision it
    // reads GET /aldata/market alone; afterwards the market section.
    private suspend fun fetchMarket() {
        if (lastReferenceRevision == null) {
            val value = (getObject("aldata/market") as? ApiResult.Success)?.value ?: return
            marketAldata = value
            mergeState(mapOf("aldata" to value))
            return
        }
        val value = (section("market") as? ApiResult.Success)?.value ?: return
        value["aldata"]?.takeIf { it !is JsonNull }?.let { marketAldata = it }
        mergeState(value)
    }

    private suspend fun fetchBank() {
        (section("bank") as? ApiResult.Success)?.value?.let { mergeState(it) }
    }

    private suspend fun fetchLogs() {
        val result = section("logs")
        _logsError.value = result !is ApiResult.Success
        val value = (result as? ApiResult.Success)?.value ?: return
        mergeState(value.filterKeys { it == "combatLogs" || it == "merchantActivity" })
        _gameLogs.value = value["gameLogs"]?.let {
            runCatching { json.decodeFromJsonElement(PartyStateGameLogs.serializer(), JsonObject(mapOf("gameLogs" to it))).gameLogs }.getOrNull()
        } ?: emptyMap()
    }

    private suspend fun fetchMail() {
        when (val result = api.get("mail")) {
            // mail-query.ts: a failed refresh keeps the last inbox and shows why.
            is ApiResult.Failure -> _mail.update { it.copy(error = result.message.ifBlank { "Mail unavailable" }) }
            is ApiResult.Success -> runCatching { json.decodeFromString(MailSnapshot.serializer(), result.value) }
                .getOrNull()?.let { _mail.value = it.copy(error = null) }
        }
    }

    private suspend fun fetchEscape() {
        val started = System.nanoTime()
        when (val result = api.get("escape")) {
            is ApiResult.Failure -> _escapeError.value = result.message.ifBlank { "Escape status unavailable" }
            is ApiResult.Success -> {
                _escapeError.value = null
                _latencyMs.value = (System.nanoTime() - started) / 1_000_000
                runCatching { json.decodeFromString(EscapeResponse.serializer(), result.value) }.getOrNull()?.let { _escape.value = it.escape }
            }
        }
    }

    private suspend fun fetchCatalog() {
        val revision = lastReferenceRevision
        catalogRevision = revision
        val result = getObject("state?section=catalog")
        val value = (result as? ApiResult.Success)?.value
        if (value == null) {
            catalogRevision = null
            return
        }
        val decoded = runCatching { json.decodeFromJsonElement(CatalogSection.serializer(), value) }
            .onFailure { log("catalog decode failed", it) }.getOrNull()
        if (decoded == null) {
            catalogRevision = null
            return
        }
        // The catalog names its own revision - the one it actually belongs to.
        (value["referenceRevision"] as? JsonPrimitive)?.content?.let { catalogRevision = it }
        catalogLoaded = true
        synchronized(stateLock) {
            catalog = decoded
            publish()
        }
    }

    // dashboard-live.tsx: while the live stream is down, `fast` (vitals) and
    // `inventory` (items/slots) stand in for it.
    private val fallbackRecords = mutableMapOf<String, LiveRecordWire>()
    private fun applyFallback(name: String, update: (LiveRecordWire) -> LiveRecordWire) {
        // A response that lands after the stream recovered is stale.
        if (_connected.value != false) return
        val record = synchronized(fallbackRecords) {
            val previous = fallbackRecords[name] ?: LiveRecordWire(generation = "poll", sample = 0, sampledAt = System.currentTimeMillis())
            update(previous).also { fallbackRecords[name] = it }
        }
        _characters.update { it + (name to recordToState(name, record)) }
    }

    private suspend fun fetchFast() {
        val characters = (section("fast") as? ApiResult.Success)?.value?.get("characters") as? JsonObject ?: return
        for ((name, vitals) in characters) {
            val incoming = vitals as? JsonObject ?: continue
            applyFallback(name) { previous ->
                val size = previous.vitals["inventorySize"]
                previous.copy(vitals = JsonObject(incoming + (size?.let { mapOf("inventorySize" to it) } ?: emptyMap())))
            }
        }
    }

    private suspend fun fetchInventory() {
        val characters = (section("inventory") as? ApiResult.Success)?.value?.get("characters") as? JsonObject ?: return
        for ((name, entry) in characters) {
            val wire = entry as? JsonObject ?: continue
            val list = wire["items"] as? JsonArray ?: JsonArray(emptyList())
            val items = list.mapIndexedNotNull { index, value -> if (value is JsonNull) null else index.toString() to value }.toMap()
            applyFallback(name) { previous ->
                previous.copy(
                    items = JsonObject(items),
                    slots = wire["slots"] as? JsonObject ?: JsonObject(emptyMap()),
                    vitals = JsonObject(previous.vitals + ("inventorySize" to JsonPrimitive(list.size))),
                )
            }
        }
    }

    // --- single-flight per domain: a refresh asked for while one is in flight
    // runs once more right after it (never two at once, never an older
    // response landing after a newer one).
    private inner class SingleFlight(private val fetch: suspend () -> Unit) {
        private val lock = Any()
        private var inFlight: Deferred<Unit>? = null
        private var again = false

        val busy: Boolean get() = synchronized(lock) { inFlight != null }

        fun trigger(): Deferred<Unit> = synchronized(lock) {
            inFlight?.let {
                again = true
                return it
            }
            scope.async {
                try {
                    do {
                        synchronized(lock) { again = false }
                        try {
                            fetch()
                        } catch (error: CancellationException) {
                            throw error
                        } catch (error: Exception) {
                            log("poll failed", error)
                        }
                    } while (synchronized(lock) { again })
                } finally {
                    synchronized(lock) { inFlight = null }
                }
            }.also { inFlight = it }
        }
    }

    private val flights: Map<Domain, SingleFlight> = mapOf(
        Domain.CORE to SingleFlight(::fetchCore),
        Domain.CONFIG to SingleFlight(::fetchConfig),
        Domain.BANK to SingleFlight(::fetchBank),
        Domain.MARKET to SingleFlight(::fetchMarket),
        Domain.LOGS to SingleFlight(::fetchLogs),
        Domain.MAIL to SingleFlight(::fetchMail),
        Domain.ESCAPE to SingleFlight(::fetchEscape),
        Domain.CATALOG to SingleFlight(::fetchCatalog),
        Domain.FAST to SingleFlight(::fetchFast),
        Domain.INVENTORY to SingleFlight(::fetchInventory),
    )

    fun trigger(domain: Domain): Deferred<Unit> = flights.getValue(domain).trigger()

    // A domain a visible screen depends on polls faster (useDomainInterest).
    private val interest = mutableMapOf<Domain, Int>()
    private fun interested(domain: Domain) = synchronized(interest) { (interest[domain] ?: 0) > 0 }

    /** Raise [domain]'s cadence while the returned handle is open. */
    fun registerInterest(domain: Domain): () -> Unit {
        synchronized(interest) { interest[domain] = (interest[domain] ?: 0) + 1 }
        trigger(domain)
        return { synchronized(interest) { interest[domain] = maxOf(0, (interest[domain] ?: 1) - 1) } }
    }

    /** query-cache.tsx policies (core is 2s rather than 1s - mobile data);
     *  null = not on a timer right now. */
    internal fun cadence(domain: Domain): Long? {
        val liveDown = _connected.value == false
        return when (domain) {
            Domain.CORE -> 2_000
            Domain.CONFIG -> 15_000
            Domain.BANK -> if (interested(Domain.BANK)) 2_000 else 15_000
            Domain.MARKET -> 10_000
            Domain.LOGS -> if (interested(Domain.LOGS)) 1_000 else 6_000
            Domain.MAIL -> if (interested(Domain.MAIL)) 2_000 else 10_000
            Domain.ESCAPE -> if (_escape.value != null) 1_000 else 6_000
            // Refetched when core's referenceRevision changes, not on a
            // timer - but retried until the first one lands.
            Domain.CATALOG -> if (catalogLoaded) null else 5_000
            Domain.FAST -> if (liveDown) 250 else null
            Domain.INVENTORY -> if (liveDown) 2_000 else null
        }
    }

    /** query-actions.ts: after an action, refresh the domains it touched. */
    private fun onAction(path: String, body: JsonObject) {
        for (domain in affectedDomains(path, body)) {
            if ((domain == Domain.FAST || domain == Domain.INVENTORY) && cadence(domain) == null) continue
            trigger(domain)
        }
    }

    /** After a mutation: core, config and escape together, like
     *  query-actions.ts's ['core', 'config'] group. Resolves once all landed. */
    suspend fun refreshDynamicStateNow() {
        listOf(trigger(Domain.CORE), trigger(Domain.CONFIG), trigger(Domain.ESCAPE)).awaitAll()
    }

    private fun applyRoster(roster: Map<String, RosterMember>) {
        _roster.value = roster
        // The roster and the live stream race - a character's first snapshot
        // can arrive (decoded with blank ctype/level) before the roster does.
        _characters.update { current ->
            current.mapValues { (name, state) ->
                val member = roster[name] ?: return@mapValues state
                val vitals = state.vitals?.copy(ctype = member.ctype, level = member.level, server = member.server) ?: return@mapValues state
                state.copy(vitals = vitals)
            }
        }
    }

    private fun resetAccount() {
        synchronized(stateLock) {
            merged = JsonObject(emptyMap())
            catalog = CatalogSection()
            marketAldata = null
            lastReferenceRevision = null
            catalogRevision = null
            catalogLoaded = false
            _stateLoaded.value = false
            publish()
        }
        _roster.value = emptyMap()
        _characterDetails.value = emptyMap()
        _mail.value = MailSnapshot()
    }

    init {
        scope.launch {
            (live ?: liveEvents(sseClient, settings)).collect { event ->
                when (event) {
                    is LiveEvent.ConnectionHealth -> {
                        _connected.value = event.healthy
                        if (!event.healthy && event.error != null) _lastConnectionError.value = event.error
                        if (event.healthy) {
                            _lastConnectionError.value = null
                            synchronized(fallbackRecords) { fallbackRecords.clear() }
                        }
                    }
                    is LiveEvent.CharacterUpdated -> applyUpdate(event.name, event.record)
                }
            }
        }
        for (domain in Domain.entries) {
            scope.launch {
                while (isActive) {
                    val interval = cadence(domain)
                    // Polling pauses while the app is in the background.
                    if (interval != null && foreground.value) trigger(domain).await()
                    sleep(interval ?: 1_000)
                }
            }
        }
    }

    /** Sleep, but wake at once when the app comes back to the foreground. */
    private suspend fun sleep(ms: Long) {
        if (foreground.value) withTimeoutOrNull(ms) { foreground.first { !it } }
        if (!foreground.value) foreground.first { it }
    }

    private fun applyUpdate(name: String, record: LiveRecordWire?) {
        _characters.update { current ->
            if (record == null) current - name else current + (name to recordToState(name, record))
        }
    }

    /** Parses the wire-level LiveRecordWire (raw JSON objects, merged by
     *  LiveReceiver) into this app's typed model. Matches dashboard-live.tsx:
     *  a FIXED-length item list sized by vitals.inventorySize, gaps as null -
     *  an empty slot is never sent over the wire. */
    private fun recordToState(name: String, record: LiveRecordWire): CharacterState {
        val decoded = runCatching {
            json.decodeFromJsonElement(CharacterVitals.serializer(), JsonObject(record.vitals + ("name" to JsonPrimitive(name))))
        }.getOrNull()
        val member = _roster.value[name]
        val vitals = if (decoded != null && member != null) decoded.copy(ctype = member.ctype, level = member.level, server = member.server) else decoded
        val slots = record.slots.mapValues { (_, value) ->
            runCatching { json.decodeFromJsonElement(EquippedEntry.serializer(), value) }.getOrNull()
        }
        val inventorySize = record.vitals.intField("inventorySize") ?: record.items.size
        val items = (0 until inventorySize).map { index ->
            record.items[index.toString()]?.let { value ->
                runCatching { json.decodeFromJsonElement(InventoryEntry.serializer(), value) }.getOrNull()
            }
        }
        return CharacterState(vitals = vitals, inventory = CharacterInventory(items = items, slots = slots))
    }

    private fun log(message: String, error: Throwable) {
        runCatching { android.util.Log.w("PartyRepository", message, error) }
    }

    private companion object {
        val CORE_ONLY_KEYS = setOf("characterDetails", "bankbois", "characters", "serverNow")
    }
}
