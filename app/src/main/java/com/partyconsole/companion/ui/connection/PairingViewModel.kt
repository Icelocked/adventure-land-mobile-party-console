package com.partyconsole.companion.ui.connection

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.network.PartyApiClient
import com.partyconsole.companion.network.ServerSettings
import com.partyconsole.companion.network.buildHttpClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Gates the app behind party-console's own browser-pairing check (GET
 *  /setup/state - 200 once paired, else a redirect to /setup that this
 *  client's stricter content-type check turns into "IllegalStateException:
 *  Invalid content-type: text/html", the exact symptom that led here) before
 *  PartyViewModel opens its live SSE connection. Without this, an unpaired
 *  phone just sat on that raw exception forever with no indication that
 *  pairing - not the network - was the blocker. Mirrors the same gate added
 *  to the PWA (web/src/screens/PairingGate.tsx) against the same endpoints. */
sealed interface PairingState {
    data object Checking : PairingState
    data object Paired : PairingState
    data object Unpaired : PairingState
}

class PairingViewModel(settings: ServerSettings) : ViewModel() {
    private val api = PartyApiClient(buildHttpClient(settings), settings)

    private val _state = MutableStateFlow<PairingState>(PairingState.Checking)
    val state: StateFlow<PairingState> = _state.asStateFlow()

    private val _submitting = MutableStateFlow(false)
    val submitting: StateFlow<Boolean> = _submitting.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    init {
        check()
    }

    fun check() {
        viewModelScope.launch {
            _state.value = PairingState.Checking
            _state.value = when (api.getRoot("setup/state")) {
                is ApiResult.Success -> PairingState.Paired
                is ApiResult.Failure -> PairingState.Unpaired
            }
        }
    }

    /** Accepts either a full invite link (.../setup#<token>) or a bare token. */
    private fun extractToken(raw: String): String {
        val trimmed = raw.trim()
        val hashIndex = trimmed.indexOf('#')
        return if (hashIndex >= 0) trimmed.substring(hashIndex + 1) else trimmed
    }

    fun submitToken(raw: String) {
        val token = extractToken(raw)
        if (token.isBlank()) {
            _error.value = "Enter or scan a pairing link first"
            return
        }
        viewModelScope.launch {
            _submitting.value = true
            _error.value = null
            val result = api.postRoot("setup/pair", JsonObject(mapOf("token" to JsonPrimitive(token))))
            _submitting.value = false
            when (result) {
                is ApiResult.Success -> check()
                is ApiResult.Failure -> _error.value = "That pairing link didn't work - generate a new one from an already-paired browser and try again"
            }
        }
    }
}
