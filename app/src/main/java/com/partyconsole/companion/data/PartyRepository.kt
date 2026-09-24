package com.partyconsole.companion.data

import com.partyconsole.companion.model.CharacterInventory
import com.partyconsole.companion.model.CharacterState
import com.partyconsole.companion.model.CharacterVitals
import com.partyconsole.companion.model.MailSnapshot
import com.partyconsole.companion.model.PartyStateDynamic
import com.partyconsole.companion.model.PartyStateGameLogs
import com.partyconsole.companion.model.PartyStateRoster
import com.partyconsole.companion.model.RosterMember
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.network.LiveEvent
import com.partyconsole.companion.network.LiveRecordWire
import com.partyconsole.companion.network.PartyApiClient
import com.partyconsole.companion.network.ServerSettings
import com.partyconsole.companion.network.buildHttpClient
import com.partyconsole.companion.network.intField
import com.partyconsole.companion.network.liveEvents
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

/** Owns one live connection to one configured server and exposes every
 *  known character's state as a StateFlow map, keyed by character name -
 *  this is the single source of truth screens read from (character list,
 *  character detail), matching the repository pattern the rest of this
 *  companion app follows so no screen talks to the network layer or
 *  LiveReceiver directly. Recreate this class (don't reuse) whenever the
 *  active ServerSettings changes - see ui/PartyConsoleViewModelFactory.kt. */
class PartyRepository(private val settings: ServerSettings, scope: CoroutineScope) {
    private val json = Json { ignoreUnknownKeys = true }
    private val httpClient = buildHttpClient(settings)
    val api = PartyApiClient(httpClient, settings)

    private val _characters = MutableStateFlow<Map<String, CharacterState>>(emptyMap())
    val characters: StateFlow<Map<String, CharacterState>> = _characters.asStateFlow()

    private val _connected = MutableStateFlow(false)
    val connected: StateFlow<Boolean> = _connected.asStateFlow()

    // Roster (name/ctype/level) is relatively static - fetched once with a
    // short retry, not polled - see recordToState's roster override below.
    private val _roster = MutableStateFlow<Map<String, RosterMember>>(emptyMap())
    val roster: StateFlow<Map<String, RosterMember>> = _roster.asStateFlow()

    // Unlike roster, merchant errands and party formation (leader/follow)
    // change often, so this polls on the same ~6s cadence party-console's
    // own account-info refresh uses (observed in its logs this session).
    private val _dynamicState = MutableStateFlow(PartyStateDynamic())
    val dynamicState: StateFlow<PartyStateDynamic> = _dynamicState.asStateFlow()

    // Mail is its own route (GET /party-api/mail), not part of state -
    // polled on the same cadence for the same reason (it changes whenever
    // anyone sends anything, no push notification for it exists).
    private val _mail = MutableStateFlow(MailSnapshot())
    val mail: StateFlow<MailSnapshot> = _mail.asStateFlow()

    // Raw in-game chat/system logs need a separate ?section=logs query
    // (runtime/game-log-filters.ts) - not present on the plain /state
    // payload used for everything else, so this is its own poll.
    private val _gameLogs = MutableStateFlow<Map<String, List<com.partyconsole.companion.model.GameLogEntry>>>(emptyMap())
    val gameLogs: StateFlow<Map<String, List<com.partyconsole.companion.model.GameLogEntry>>> = _gameLogs.asStateFlow()

    init {
        scope.launch {
            liveEvents(httpClient, settings).collect { event ->
                when (event) {
                    is LiveEvent.ConnectionHealth -> _connected.value = event.healthy
                    is LiveEvent.CharacterUpdated -> applyUpdate(event.name, event.record)
                }
            }
        }
        scope.launch { fetchRosterWithRetry() }
        scope.launch { pollDynamicState() }
    }

    /** Call right after a successful formation/restock/item-action POST so
     *  the UI reflects the change immediately instead of waiting up to 6s
     *  for the next poll tick. */
    suspend fun refreshDynamicStateNow() {
        (api.get("state") as? ApiResult.Success)?.let { result ->
            runCatching { json.decodeFromString(PartyStateDynamic.serializer(), result.value) }
                .getOrNull()?.let { _dynamicState.value = it }
        }
        (api.get("mail") as? ApiResult.Success)?.let { result ->
            runCatching { json.decodeFromString(MailSnapshot.serializer(), result.value) }
                .getOrNull()?.let { _mail.value = it }
        }
        (api.get("state?catalog=0&dashboard=1&section=logs") as? ApiResult.Success)?.let { result ->
            runCatching { json.decodeFromString(PartyStateGameLogs.serializer(), result.value) }
                .getOrNull()?.let { _gameLogs.value = it.gameLogs }
        }
    }

    private suspend fun fetchRosterWithRetry() {
        repeat(3) { attempt ->
            when (val result = api.get("state")) {
                is ApiResult.Success -> {
                    val decoded = runCatching {
                        json.decodeFromString(PartyStateRoster.serializer(), result.value)
                    }.getOrNull()
                    if (decoded != null) {
                        _roster.value = decoded.roster.associateBy { it.name }
                        reapplyRosterToExistingCharacters()
                        return
                    }
                }
                is ApiResult.Failure -> Unit
            }
            if (attempt < 2) delay(2000)
        }
    }

    private suspend fun pollDynamicState() {
        while (true) {
            refreshDynamicStateNow()
            delay(6000)
        }
    }

    /** The roster fetch and the live SSE stream race - a character's first
     *  snapshot can arrive (and get decoded with defaulted ctype/level)
     *  before the roster call completes. Once it does, patch every
     *  already-known character rather than waiting for their next tick. */
    private fun reapplyRosterToExistingCharacters() {
        _characters.update { current ->
            current.mapValues { (name, state) ->
                val member = _roster.value[name] ?: return@mapValues state
                val vitals = state.vitals?.copy(ctype = member.ctype, level = member.level, server = member.server)
                    ?: return@mapValues state
                state.copy(vitals = vitals)
            }
        }
    }

    private fun applyUpdate(name: String, record: LiveRecordWire?) {
        _characters.value = _characters.value.toMutableMap().apply {
            if (record == null) {
                remove(name)
            } else {
                put(name, recordToState(name, record))
            }
        }
    }

    /** Parses the wire-level LiveRecordWire (raw JSON objects, merged by
     *  LiveReceiver - see network/LiveProtocol.kt) into this app's typed
     *  model. Done lazily here rather than in the receiver itself so the
     *  merge logic stays faithful to the original protocol regardless of
     *  what fields this app currently knows how to read - a field the
     *  server adds tomorrow still merges correctly today, it just isn't
     *  surfaced in the UI until a model field is added for it. */
    private fun recordToState(name: String, record: LiveRecordWire): CharacterState {
        val decoded = runCatching {
            json.decodeFromJsonElement(CharacterVitals.serializer(), withName(record.vitals, name))
        }.getOrNull()
        val member = _roster.value[name]
        val vitals = if (decoded != null && member != null) {
            decoded.copy(ctype = member.ctype, level = member.level, server = member.server)
        } else {
            decoded
        }
        val slots = record.slots.mapValues { (_, value) ->
            runCatching {
                json.decodeFromJsonElement(com.partyconsole.companion.model.EquippedEntry.serializer(), value)
            }.getOrNull()
        }
        // Matches dashboard-live.tsx exactly: reconstruct a FIXED-length
        // array sized by vitals.inventorySize, looking up each index by
        // string key and filling gaps with null - not just whatever keys
        // happen to be present in the merged record. An empty slot is
        // never sent over the wire (nothing to merge for it), so building
        // the list from present keys alone would silently compact the
        // grid instead of showing real empty slots in their real
        // positions.
        val inventorySize = record.vitals.intField("inventorySize") ?: record.items.size
        val items = (0 until inventorySize).map { index ->
            record.items[index.toString()]?.let { value ->
                runCatching {
                    json.decodeFromJsonElement(com.partyconsole.companion.model.InventoryEntry.serializer(), value)
                }.getOrNull()
            }
        }
        return CharacterState(
            vitals = vitals,
            inventory = CharacterInventory(items = items, slots = slots),
        )
    }

    /** The vitals JSON object doesn't repeat the character's own name
     *  (it's the map key in LiveMessage.characters instead - see
     *  live-protocol.ts) - CharacterVitals.name is required, so this
     *  injects it before decoding rather than making the model field
     *  nullable just to accommodate the wire shape. */
    private fun withName(vitals: JsonObject, name: String): JsonObject =
        JsonObject(vitals + ("name" to kotlinx.serialization.json.JsonPrimitive(name)))
}
