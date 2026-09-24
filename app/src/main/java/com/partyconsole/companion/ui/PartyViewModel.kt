package com.partyconsole.companion.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.partyconsole.companion.data.PartyRepository
import com.partyconsole.companion.model.CharacterState
import com.partyconsole.companion.model.GameLogEntry
import com.partyconsole.companion.model.MailSnapshot
import com.partyconsole.companion.model.PartyStateDynamic
import com.partyconsole.companion.model.RosterMember
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
    val roster: StateFlow<Map<String, RosterMember>> = repository.roster
    val dynamicState: StateFlow<PartyStateDynamic> = repository.dynamicState
    val mail: StateFlow<MailSnapshot> = repository.mail
    val gameLogs: StateFlow<Map<String, List<GameLogEntry>>> = repository.gameLogs
    val api get() = repository.api

    suspend fun refreshDynamicStateNow() = repository.refreshDynamicStateNow()
}
