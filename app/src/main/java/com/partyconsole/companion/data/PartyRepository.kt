package com.partyconsole.companion.data

import com.partyconsole.companion.model.CharacterInventory
import com.partyconsole.companion.model.CharacterState
import com.partyconsole.companion.model.CharacterVitals
import com.partyconsole.companion.network.LiveEvent
import com.partyconsole.companion.network.LiveRecordWire
import com.partyconsole.companion.network.PartyApiClient
import com.partyconsole.companion.network.ServerSettings
import com.partyconsole.companion.network.buildHttpClient
import com.partyconsole.companion.network.intField
import com.partyconsole.companion.network.liveEvents
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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

    init {
        scope.launch {
            liveEvents(httpClient, settings).collect { event ->
                when (event) {
                    is LiveEvent.ConnectionHealth -> _connected.value = event.healthy
                    is LiveEvent.CharacterUpdated -> applyUpdate(event.name, event.record)
                }
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
        val vitals = runCatching {
            json.decodeFromJsonElement(CharacterVitals.serializer(), withName(record.vitals, name))
        }.getOrNull()
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
