package com.partyconsole.companion.ui

import kotlinx.coroutines.async

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
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** Whether the app is in the foreground; polling pauses in the background. */
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
    val mapStreams get() = repository.mapStreams

    // Map definitions, keyed by core's referenceRevision and kept for the session.
    private val mapDefinitions = java.util.concurrent.ConcurrentHashMap<String, kotlinx.coroutines.Deferred<com.partyconsole.companion.model.MapDefinition?>>()

    /** GET maps/{map}?revision=, one retry after 1 s for a transient failure; null on failure. */
    suspend fun mapDefinition(map: String): com.partyconsole.companion.model.MapDefinition? {
        val revision = repository.referenceRevision
        val key = "$revision:$map"
        val request = mapDefinitions.getOrPut(key) {
            viewModelScope.async {
                val path = "maps/${java.net.URLEncoder.encode(map, "UTF-8")}?revision=$revision"
                val transient = { failure: com.partyconsole.companion.network.ApiResult.Failure -> failure.status == 0 || failure.status >= 500 || failure.status == 408 || failure.status == 429 }
                var result = api.get(path)
                if (result is com.partyconsole.companion.network.ApiResult.Failure && transient(result)) {
                    kotlinx.coroutines.delay(1000)
                    result = api.get(path)
                }
                val text = (result as? com.partyconsole.companion.network.ApiResult.Success)?.value
                text?.let { runCatching { mapJson.decodeFromString(com.partyconsole.companion.model.MapDefinition.serializer(), it) }.getOrNull() }
            }
        }
        val value = request.await()
        if (value == null) mapDefinitions.remove(key, request)
        return value
    }
    private val mapJson = kotlinx.serialization.json.Json { ignoreUnknownKeys = true; coerceInputValues = true }
    /** Item details' "From catalog": the comparison source the catalog opens
     *  with. */
    val catalogComparison = MutableStateFlow<com.partyconsole.companion.domain.ComparisonSource?>(null)

    /** Routes a shared component asks to open; the navigation shell follows
     *  them. */
    val navigationRequests = kotlinx.coroutines.flow.MutableSharedFlow<String>(extraBufferCapacity = 4)
    fun navigate(route: String) { navigationRequests.tryEmit(route) }

    /** ALData's "Prepare mail": the draft the mail composer opens with. */
    val mailDraft = MutableStateFlow<com.partyconsole.companion.ui.account.MailDraft?>(null)

    /** Set once the ALData auth mail is sent; while set, /aldata/auth is
     *  re-read every 15 s app-wide until CORRECT. [aldataAuthStatus] is the
     *  last read. */
    val aldataAuthPending = MutableStateFlow(false)
    val aldataAuthStatus = MutableStateFlow<String?>(null)

    /** Whether this console is a debug instance (read once). */
    val debugBrowser = MutableStateFlow(false)
    val debugGameUrl: String get() = api.baseUrl.trimEnd('/') + "/debug-game/vnc.html?autoconnect=1&resize=scale&path=debug-game/websockify"

    init {
        viewModelScope.launch {
            (api.consoleDebug() as? com.partyconsole.companion.network.ApiResult.Success)?.let { result ->
                debugBrowser.value = runCatching { (kotlinx.serialization.json.Json.parseToJsonElement(result.value) as kotlinx.serialization.json.JsonObject)["insideDebug"].toString() == "true" }.getOrDefault(false)
            }
        }
        viewModelScope.launch {
            kotlinx.coroutines.flow.combine(aldataAuthPending, AppForeground.visible) { pending, visible -> pending && visible }.collectLatest { active ->
                while (active) {
                    when (val result = api.checkAlDataAuth()) {
                        is com.partyconsole.companion.network.ApiResult.Success -> {
                            aldataAuthStatus.value = result.value
                            if (result.value == "CORRECT") aldataAuthPending.value = false
                        }
                        is com.partyconsole.companion.network.ApiResult.Failure -> aldataAuthStatus.value = "unknown"
                    }
                    kotlinx.coroutines.delay(15_000)
                }
            }
        }
    }

    // The Cave of Many Dreams state, polled while a screen shows it.
    val dungeons = com.partyconsole.companion.data.DungeonQuery(repository.api, viewModelScope, AppForeground.visible)

    suspend fun refreshDynamicStateNow() = repository.refreshDynamicStateNow()
    fun registerInterest(domain: Domain): () -> Unit = repository.registerInterest(domain)
}

/** A screen that shows [domain] makes it poll at its fast cadence while
 *  shown. */
@Composable
fun DomainInterest(viewModel: PartyViewModel, domain: Domain) {
    DisposableEffect(viewModel, domain) {
        val release = viewModel.registerInterest(domain)
        onDispose { release() }
    }
}
