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
 *  subscriber - the live map, the Cave map and the target-type lookup -
 *  and closed when the last one leaves. Reconnects after a failure like
 *  a browser EventSource does. */
class MapStreams(private val client: OkHttpClient, private val apiBase: String) {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }
    private val timer by lazy { Timer("map-streams", true) }

    private inner class Stream(val url: String) {
        val listeners = mutableSetOf<(MapStreamEvent) -> Unit>()
        var source: EventSource? = null
        var open = false
        var closed = false
        @Volatile var last: MapFrame? = null

        fun emit(event: MapStreamEvent) = synchronized(streams) { listeners.toList() }.forEach { it(event) }

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
