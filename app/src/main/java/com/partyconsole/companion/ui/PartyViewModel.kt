package com.partyconsole.companion.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.partyconsole.companion.data.Domain
import com.partyconsole.companion.data.PartyRepository
import com.partyconsole.companion.model.CharacterDiagnostics
import com.partyconsole.companion.model.CharacterState
import com.partyconsole.companion.model.EscapeStatus
import com.partyconsole.companion.model.GameLogEntry
import com.partyconsole.companion.model.MailSnapshot
import com.partyconsole.companion.model.PartyStateDynamic
import com.partyconsole.companion.model.RosterMember
import com.partyconsole.companion.network.ServerSettings
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/** Whether the app is in the foreground - polling pauses in the background
 *  like the dashboard's queries (the PWA's document.hidden). */
object AppForeground {
    private val _visible = MutableStateFlow(true)
    val visible: StateFlow<Boolean> = _visible.asStateFlow()

    private var observing = false

    /** Safe to call from every Activity creation - observes once. */
    fun observe() {
        if (observing) return
        observing = true
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStart(owner: LifecycleOwner) { _visible.value = true }
            override fun onStop(owner: LifecycleOwner) { _visible.value = false }
        })
    }
}

/** One instance per active server connection - screens read character
 *  state and connection health through this, and send commands through
 *  [repository].api. Recreated by [PartyViewModelFactory] whenever the
 *  configured server changes (a fresh PartyRepository per server, no
 *  stale connection carried over). */
class PartyViewModel(settings: ServerSettings) : ViewModel() {
    private val repository = PartyRepository(settings, viewModelScope, AppForeground.visible)
    val characters: StateFlow<Map<String, CharacterState>> = repository.characters
    val connected: StateFlow<Boolean> = repository.connected.map { it == true }.stateIn(viewModelScope, SharingStarted.Eagerly, false)
    val lastConnectionError: StateFlow<String?> = repository.lastConnectionError
    val roster: StateFlow<Map<String, RosterMember>> = repository.roster
    val dynamicState: StateFlow<PartyStateDynamic> = repository.dynamicState
    val stateLoaded: StateFlow<Boolean> = repository.stateLoaded
    val sessionLost: StateFlow<Boolean> = repository.sessionLost
    val mail: StateFlow<MailSnapshot> = repository.mail
    val gameLogs: StateFlow<Map<String, List<GameLogEntry>>> = repository.gameLogs
    val logsError: StateFlow<Boolean> = repository.logsError
    val escape: StateFlow<EscapeStatus?> = repository.escape
    val escapeError: StateFlow<String?> = repository.escapeError
    val latencyMs: StateFlow<Long?> = repository.latencyMs
    val characterDetails: StateFlow<Map<String, CharacterDiagnostics>> = repository.characterDetails
    val serverOffset: StateFlow<Long> = repository.serverOffset
    val api get() = repository.api

    suspend fun refreshDynamicStateNow() = repository.refreshDynamicStateNow()
    fun registerInterest(domain: Domain): () -> Unit = repository.registerInterest(domain)
}

/** A screen that shows [domain] makes it poll at its fast cadence while
 *  shown (the PWA's useDomainInterest). */
@Composable
fun DomainInterest(viewModel: PartyViewModel, domain: Domain) {
    DisposableEffect(viewModel, domain) {
        val release = viewModel.registerInterest(domain)
        onDispose { release() }
    }
}
