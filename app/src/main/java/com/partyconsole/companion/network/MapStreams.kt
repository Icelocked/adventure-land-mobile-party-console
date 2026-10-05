package com.partyconsole.companion.network

import com.partyconsole.companion.model.MapFrame
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import java.net.URLEncoder
import java.util.Timer
import kotlin.concurrent.schedule

/** What a map-stream subscriber hears: a frame, or the stream going live / reconnecting. */
sealed interface MapStreamEvent {
    data class Frame(val frame: MapFrame) : MapStreamEvent
    data class State(val state: String) : MapStreamEvent
}

/** useMapFrames.ts subscribeMapFrames: one stream per character's map
 *  stream (runtime/coordinator/telemetry/map-stream.ts), shared by every
 *  subscriber and closed when the last one leaves. Only views that show a
 *  map open a stream (like the dashboard: the live map and the Cave map);
 *  while one is open the character keeps POSTing frames to the console.
 *  Passive observers (the target-type lookup) only hear frames from a
 *  stream a map view already opened. Reconnects after a failure like a
 *  browser EventSource does. */
class MapStreams(private val client: OkHttpClient, private val apiBase: String) {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }
    private val timer by lazy { Timer("map-streams", true) }

    private inner class Stream(val url: String) {
        val listeners = mutableSetOf<(MapStreamEvent) -> Unit>()
        var source: EventSource? = null
        var open = false
        var closed = false
        @Volatile var last: MapFrame? = null

        fun emit(event: MapStreamEvent) = synchronized(streams) { listeners.toList() + passive[url].orEmpty() }.forEach { it(event) }

        fun connect() {
            if (closed) return
            source = EventSources.createFactory(client).newEventSource(
                Request.Builder().url(url).build(),
                object : EventSourceListener() {
                    override fun onOpen(eventSource: EventSource, response: Response) {
                        open = true
                        emit(MapStreamEvent.State("live"))
                    }

                    override fun onEvent(eventSource: EventSource, id: String?, type: String?, data: String) {
                        val frame = runCatching { json.decodeFromString(MapFrame.serializer(), data) }.getOrNull() ?: return
                        last = frame
                        emit(MapStreamEvent.Frame(frame))
                    }

                    override fun onFailure(eventSource: EventSource, t: Throwable?, response: Response?) {
                        open = false
                        if (closed) return
                        emit(MapStreamEvent.State("reconnecting"))
                        timer.schedule(3_000) { connect() }
                    }

                    override fun onClosed(eventSource: EventSource) = onFailure(eventSource, null, null)
                },
            )
        }
    }

    private val streams = mutableMapOf<String, Stream>()
    private val passive = mutableMapOf<String, MutableSet<(MapStreamEvent) -> Unit>>()

    /** Hears [character]'s frames only while a map view has the stream open; never opens one. */
    fun observe(character: String, listener: (MapStreamEvent) -> Unit): () -> Unit {
        val url = url(character)
        val existing = synchronized(streams) {
            passive.getOrPut(url) { mutableSetOf() } += listener
            streams[url]
        }
        existing?.last?.let { listener(MapStreamEvent.Frame(it)) }
        return {
            synchronized(streams) {
                passive[url]?.let { set -> set -= listener; if (set.isEmpty()) passive.remove(url) }
            }
        }
    }

    /** [observe] as a Flow. */
    fun observed(character: String): Flow<MapStreamEvent> = callbackFlow {
        val stop = observe(character) { trySend(it) }
        awaitClose(stop)
    }

    fun url(character: String) = "${apiBase.trimEnd('/')}/map-stream/${URLEncoder.encode(character, "UTF-8").replace("+", "%20")}"

    fun subscribe(character: String, listener: (MapStreamEvent) -> Unit): () -> Unit {
        val url = url(character)
        val (stream, created) = synchronized(streams) {
            val existing = streams[url]
            val stream = existing ?: Stream(url).also { streams[url] = it }
            stream.listeners += listener
            stream to (existing == null)
        }
        if (created) stream.connect()
        else if (stream.open) {
            listener(MapStreamEvent.State("live"))
            // A late subscriber starts from the stream's latest frame.
            stream.last?.let { listener(MapStreamEvent.Frame(it)) }
        }
        return {
            val last = synchronized(streams) {
                stream.listeners -= listener
                (stream.listeners.isEmpty() && streams[url] === stream).also { if (it) streams.remove(url) }
            }
            if (last) {
                stream.closed = true
                stream.source?.cancel()
            }
        }
    }

    /** [subscribe] as a Flow, for collecting from a composable. */
    fun events(character: String): Flow<MapStreamEvent> = callbackFlow {
        val stop = subscribe(character) { trySend(it) }
        awaitClose(stop)
    }
}
