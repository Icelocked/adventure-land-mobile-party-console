package com.partyconsole.companion.data

import com.partyconsole.companion.model.DungeonView
import com.partyconsole.companion.network.ApiResult
import com.partyconsole.companion.network.PartyApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.util.UUID
import kotlin.math.ceil
import kotlin.math.max

private val dungeonJson = Json { ignoreUnknownKeys = true; coerceInputValues = true }

/** Polls GET /daily-dungeons every second while a screen shows it and the
 *  app is in the foreground. Every POST carries a fresh operationId and its
 *  response replaces the cached view. PWA: web/src/data/useDailyDungeon.ts. */
class DungeonQuery(private val api: PartyApiClient, private val scope: CoroutineScope, private val visible: StateFlow<Boolean>) {
    private val _view = MutableStateFlow<DungeonView?>(null)
    val view: StateFlow<DungeonView?> = _view.asStateFlow()
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()
    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()
    private val _actionError = MutableStateFlow("")
    val actionError: StateFlow<String> = _actionError.asStateFlow()
    private var watchers = 0
    private var job: Job? = null

    /** A screen showing the dungeon state; release when it leaves. */
    @Synchronized
    fun acquire(): () -> Unit {
        watchers++
        if (job == null) job = scope.launch { poll() }
        return {
            synchronized(this) {
                watchers--
                if (watchers <= 0) {
                    watchers = 0
                    job?.cancel()
                    job = null
                }
            }
        }
    }

    private suspend fun poll() {
        while (scope.isActive) {
            visible.first { it }
            when (val result = api.get("daily-dungeons")) {
                is ApiResult.Failure -> _error.value = result.message
                is ApiResult.Success -> runCatching { dungeonJson.decodeFromString(DungeonView.serializer(), result.value) }
                    .onSuccess { _view.value = it; _error.value = null }
                    .onFailure { _error.value = it.message }
            }
            delay(1000)
        }
    }

    suspend fun action(body: Map<String, Any?>): Boolean {
        _actionError.value = ""
        _busy.value = true
        try {
            val payload = JsonObject(
                body.filterValues { it != null }.mapValues { (_, value) ->
                    when (value) {
                        is kotlinx.serialization.json.JsonElement -> value
                        is Boolean -> JsonPrimitive(value)
                        is Number -> JsonPrimitive(value)
                        else -> JsonPrimitive(value.toString())
                    }
                } + ("operationId" to JsonPrimitive(UUID.randomUUID().toString())),
            )
            return when (val result = api.post("daily-dungeons", payload)) {
                is ApiResult.Failure -> {
                    _actionError.value = result.message
                    false
                }
                is ApiResult.Success -> {
                    result.value.data?.takeIf { it.containsKey("state") }?.let { data -> runCatching { dungeonJson.decodeFromJsonElement(DungeonView.serializer(), data) }.onSuccess { _view.value = it } }
                    true
                }
            }
        } finally {
            _busy.value = false
        }
    }
}

/** "Xh Ym Zs" until [at]. */
fun dungeonCountdown(at: Long, now: Long): String {
    val seconds = max(0L, ceil((at - now) / 1000.0).toLong())
    return "${seconds / 3600}h ${(seconds / 60) % 60}m ${seconds % 60}s"
}

/** Entry availability; a visit check older than 45s counts as unknown. */
fun dungeonEntryLabel(view: DungeonView?, now: Long): String {
    val member = view?.members?.firstOrNull()
    val visit = member?.observation?.visit
    if (member?.fresh != true || visit == null || now - visit.checkedAt > 45000) return "Availability unknown"
    if (visit.available) return "Available now"
    if (visit.resets > now) return "Next entry: ${dungeonCountdown(visit.resets, now)}"
    return "Checking availability…"
}
