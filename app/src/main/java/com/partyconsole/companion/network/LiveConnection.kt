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

/** A character updated (record == null when it went offline), or the
 *  connection's health changed. */
sealed interface LiveEvent {
    data class CharacterUpdated(val name: String, val record: LiveRecordWire?) : LiveEvent
    /** [error] is the failure reason (exception or HTTP status) when
     *  [healthy] is false, so the UI can say why it can't connect. */
    data class ConnectionHealth(val healthy: Boolean, val error: String? = null) : LiveEvent
}

private const val HEARTBEAT_TIMEOUT_MS = 15_000L
private const val RECONNECT_DELAY_MS = 1_000L
private const val WATCHDOG_TICK_MS = 1_000L

/**
 * Streams `/party-api/dashboard-stream` (SSE) as [LiveEvent]s.
 *
 * Two triggers reconnect: any stream failure or malformed frame, and a
 * watchdog that catches a stalled-but-open socket that stopped sending.
 * Both go through `scheduleReconnect`, which `reconnectPending` guards so
 * they never schedule overlapping reconnects.
 *
 * Cancel the collector to close the connection.
 */
fun liveEvents(client: OkHttpClient, settings: ServerSettings): Flow<LiveEvent> = callbackFlow {
    val json = Json { ignoreUnknownKeys = true }
    val receiver = LiveReceiver { name, record -> trySend(LiveEvent.CharacterUpdated(name, record)) }
    val lastHeartbeat = AtomicLong(System.currentTimeMillis())
    val reconnectPending = AtomicBoolean(false)
    var currentSource: EventSource? = null
    var stopped = false
    val scope = CoroutineScope(coroutineContext)

    fun reportHealth(healthy: Boolean, error: String? = null) {
        trySend(LiveEvent.ConnectionHealth(healthy, error))
    }

    // startConnection and scheduleReconnect call each other, and local funs
    // can't forward-reference, so both are declared as vars first.
    var startConnection: () -> Unit = {}
    var scheduleReconnect: () -> Unit = {}

    // Anonymous functions rather than lambdas so the bodies can use a bare
    // `return`.
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
                        // After a malformed frame the epoch/sequence state
                        // can't be trusted, so close and reconnect.
                        eventSource.cancel()
                        reportHealth(false, "Received a malformed message from the server")
                        scheduleReconnect()
                        return
                    }
                    if (!receiver.accept(message)) return
                    // Any accepted message proves the connection is alive,
                    // deltas included; otherwise a busy stream of deltas
                    // would trip the watchdog.
                    lastHeartbeat.set(System.currentTimeMillis())
                    if (message.type == "snapshot") reportHealth(true)
                }

                override fun onFailure(eventSource: EventSource, t: Throwable?, response: Response?) {
                    if (stopped) return
                    // okhttp-sse can pass both a response (even a 200, e.g.
                    // on a content-type mismatch) and a throwable; report
                    // both.
                    val parts = buildList {
                        response?.let { add("HTTP ${it.code} ${it.message}".trim()) }
                        t?.let { add("${it::class.simpleName}: ${it.message ?: "no details"}") }
                    }
                    val message = parts.ifEmpty { listOf("Connection failed for an unknown reason") }.joinToString(" — ")
                    reportHealth(false, message)
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
                reportHealth(false, "No response from the server for over ${HEARTBEAT_TIMEOUT_MS / 1000}s")
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
