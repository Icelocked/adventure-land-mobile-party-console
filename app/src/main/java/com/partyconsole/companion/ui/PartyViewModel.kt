package com.partyconsole.companion.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.partyconsole.companion.data.PartyRepository
import com.partyconsole.companion.model.CharacterState
import com.partyconsole.companion.network.ServerSettings
import kotlinx.coroutines.flow.StateFlow

/** One instance per active server connection - screens read character
 *  state and connection health through this, and send commands through
 *  [repository].api. Recreated by [PartyViewModelFactory] whenever the
 *  configured server changes (a fresh PartyRepository per server, no
 *  stale connection carried over). */
class PartyViewModel(settings: ServerSettings) : ViewModel() {
    private val repository = PartyRepository(settings, viewModelScope)
    val characters: StateFlow<Map<String, CharacterState>> = repository.characters
    val connected: StateFlow<Boolean> = repository.connected
    val api get() = repository.api
}
