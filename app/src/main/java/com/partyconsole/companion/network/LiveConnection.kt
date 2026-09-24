package com.partyconsole.companion.network

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import kotlin.coroutines.coroutineContext

/** What a screen actually needs to know about the live connection - either
 *  a character updated (or went offline, record == null), or the
 *  connection's own health changed. Mirrors dashboard-live.tsx's two
 *  observable pieces of state (per-character query data, and the shared
 *  `liveConnectionKey` healthy flag) as one merged event stream, since
 *  Kotlin Flow doesn't need the two separate cache slots React Query used
 *  there for its own reasons. */
sealed interface LiveEvent {
    data class CharacterUpdated(val name: String, val record: LiveRecordWire?) : LiveEvent
    data class ConnectionHealth(val healthy: Boolean) : LiveEvent
}

private const val HEARTBEAT_TIMEOUT_MS = 15_000L
private const val RECONNECT_DELAY_MS = 1_000L
private const val WATCHDOG_TICK_MS = 1_000L

/**
 * Connects to `{baseUrl}/party-api/dashboard-stream` (Server-Sent Events,
 * exactly what the web dashboard's own EventSource connects to - see
 * dashboard-live.tsx) and emits a LiveEvent per update.
 *
 * Two independent triggers can start a reconnect, matching the original's
 * behavior exactly: an immediate one on any stream failure/bad frame
 * (`onFailure`, a JSON parse error), and a 1-second watchdog tick that
 * catches a connection which never errored but also stopped sending
 * heartbeats (a stalled-but-not-closed socket). Both funnel through
 * `scheduleReconnect`, guarded by `reconnectPending` so a failure and a
 * watchdog tick landing close together never schedule two overlapping
 * reconnects - the same single-timer guard the original's `!reconnect`
 * check provides.
 *
 * Cancel the collecting coroutine to close the connection cleanly (e.g.
 * when the app goes to the background) - cleanup runs via awaitClose,
 * same lifecycle guarantee as any other cold Flow.
 */
fun liveEvents(client: OkHttpClient, settings: ServerSettings): Flow<LiveEvent> = callbackFlow {
    val json = Json { ignoreUnknownKeys = true }
    val receiver = LiveReceiver { name, record -> trySend(LiveEvent.CharacterUpdated(name, record)) }
    val lastHeartbeat = AtomicLong(System.currentTimeMillis())
    val reconnectPending = AtomicBoolean(false)
    var currentSource: EventSource? = null
    var stopped = false
    val scope = CoroutineScope(coroutineContext)

    fun reportHealth(healthy: Boolean) {
        trySend(LiveEvent.ConnectionHealth(healthy))
    }

    // startConnection and scheduleReconnect call each other (a failed
    // connection schedules a reconnect, which starts a new connection).
    // Kotlin resolves local `fun` declarations top-to-bottom within a
    // block - unlike class member functions, they can't forward-reference
    // each other, confirmed by an actual compile error here. Declaring
    // both as `var`s of function type first, then assigning both bodies
    // afterward, sidesteps that: each body only needs the OTHER var to
    // already be declared (not yet assigned) at the point it's written,
    // since a lambda body only reads its captured variables when it's
    // actually invoked later, not at declaration time.
    var startConnection: () -> Unit = {}
    var scheduleReconnect: () -> Unit = {}

    // Anonymous `fun()` rather than a `{ }` lambda: a lambda stored in a
    // var doesn't support a bare `return` (that's only valid as a
    // non-local return out of an INLINE function's lambda) - an anonymous
    // function does, so the early-return bodies below work unchanged.
    startConnection = fun() {
        if (stopped) return
        lastHeartbeat.set(System.currentTimeMillis())
        val request = Request.Builder().url(settings.streamUrl).build()
        currentSource = EventSources.createFactory(client).newEventSource(
            request,
            object : EventSourceListener() {
                override fun onOpen(eventSource: EventSource, response: Response) {
                    lastHeartbeat.set(System.currentTimeMillis())
                }

                override fun onEvent(eventSource: EventSource, id: String?, type: String?, data: String) {
                    if (stopped) return
                    val message = runCatching { json.decodeFromString(LiveMessage.serializer(), data) }.getOrNull()
                    if (message == null) {
                        // A single malformed frame is treated the same way
                        // the original's try/catch treats a JSON.parse
                        // failure: close and reconnect, since the epoch/
                        // sequence state can no longer be trusted to be in
                        // sync with the server.
                        eventSource.cancel()
                        reportHealth(false)
                        scheduleReconnect()
                        return
                    }
                    if (!receiver.accept(message)) return
                    // Any accepted message proves the connection is alive -
                    // not just heartbeat/snapshot. The original bug here
                    // only refreshed on those two types, so a character
                    // actively sending delta updates (the normal case
                    // during gameplay) never reset the watchdog; after
                    // HEARTBEAT_TIMEOUT_MS of nothing but real data it
                    // looked "silent" and forced a reconnect anyway.
                    lastHeartbeat.set(System.currentTimeMillis())
                    if (message.type == "snapshot") reportHealth(true)
                }

                override fun onFailure(eventSource: EventSource, t: Throwable?, response: Response?) {
                    if (stopped) return
                    reportHealth(false)
                    scheduleReconnect()
                }
            },
        )
    }

    scheduleReconnect = fun() {
        if (stopped || !reconnectPending.compareAndSet(false, true)) return
        scope.launch {
            delay(RECONNECT_DELAY_MS)
            reconnectPending.set(false)
            if (!stopped) startConnection()
        }
    }

    reportHealth(false)
    startConnection()

    val watchdogJob = scope.launch {
        while (isActive && !stopped) {
            delay(WATCHDOG_TICK_MS)
            val silentFor = System.currentTimeMillis() - lastHeartbeat.get()
            if (silentFor > HEARTBEAT_TIMEOUT_MS) {
                currentSource?.cancel()
                reportHealth(false)
                scheduleReconnect()
            }
        }
    }

    awaitClose {
        stopped = true
        currentSource?.cancel()
        watchdogJob.cancel()
    }
}
