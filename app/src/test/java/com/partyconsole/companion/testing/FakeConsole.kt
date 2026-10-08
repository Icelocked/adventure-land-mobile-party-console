package com.partyconsole.companion.testing

import com.partyconsole.companion.network.ServerSettings
import com.partyconsole.companion.network.TrustMode
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import java.util.concurrent.CopyOnWriteArrayList

/** Reads a fixture written by web/e2e/fixtures/exportAndroidFixtures.ts - the
 *  PWA e2e mock's own section payloads, so both clients are tested against
 *  the same server shapes. */
fun fixture(name: String): JsonObject {
    val text = FakeConsole::class.java.getResource("/fixtures/$name.json")?.readText() ?: error("missing fixture $name")
    return Json.parseToJsonElement(text).jsonObject
}

/** A party-console stand-in on a MockWebServer: serves the fixture sections
 *  (tests can override any of them), records every request, and can answer
 *  like the pairing gate. */
class FakeConsole : AutoCloseable {
    data class Request(val method: String, val path: String, val body: String)

    val sections = mutableMapOf(
        "core" to fixture("section-core"),
        "config" to fixture("section-config"),
        "bank" to fixture("section-bank"),
        "market" to fixture("section-market"),
        "logs" to fixture("section-logs"),
        "catalog" to fixture("section-catalog"),
        "fast" to fixture("section-fast"),
        "inventory" to fixture("section-inventory"),
    )
    val requests = CopyOnWriteArrayList<Request>()
    @Volatile var unpaired = false
    /** Extra GET responses by path (e.g. "/console-debug"), checked first. */
    val gets = java.util.concurrent.ConcurrentHashMap<String, String>()
    /** GET /party-api/daily-dungeons (a DungeonView), when a test sets one. */
    @Volatile var dailyDungeon: String? = null
    @Volatile var postStatus = 200
    @Volatile var postBody = """{"ok":true}"""
    /** GET /party-api/map-stream/{name}: the frames (JSON) sent as SSE, the stream then held open. */
    val mapFrames = java.util.concurrent.ConcurrentHashMap<String, List<String>>()
    /** One-shot replies for a POST path (e.g. "merchant/stand"): status + body. */
    val failOnce = java.util.concurrent.ConcurrentHashMap<String, Pair<Int, String>>()

    init {
        // Poll at about the old desktop pace so tests don't wait on mobile cadences.
        com.partyconsole.companion.data.PartyRepository.pollingScale = 0.2
        actionBaseline = com.partyconsole.companion.ui.components.ActionToasts.entries.value.maxOfOrNull { it.id } ?: actionBaseline
    }

    private val server = MockWebServer().apply {
        dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val path = request.path.orEmpty()
                requests += Request(request.method.orEmpty(), path, request.body.readUtf8())
                if (unpaired) return MockResponse().setResponseCode(302).setHeader("Location", "/setup")
                // party-console's tools/hosting/authorize.ts rejects every non-GET/HEAD request whose
                // Origin is not the console's own address (scheme + Host header), before pairing.
                if (request.method !in setOf("GET", "HEAD") && request.getHeader("Origin") != "http://${request.getHeader("Host")}") {
                    return json("""{"error":"Dashboard origin required"}""").setResponseCode(403)
                }
                if (request.method == "POST") {
                    failOnce.remove(path.removePrefix("/party-api/"))?.let { (status, body) -> return json(body).setResponseCode(status) }
                    return json(postBody).setResponseCode(postStatus)
                }
                val url = request.requestUrl!!
                gets[url.encodedPath]?.let { return json(it) }
                if (url.encodedPath.startsWith("/party-api/map-stream/")) {
                    val frames = mapFrames[url.pathSegments.last()] ?: return MockResponse().setResponseCode(404)
                    val events = frames.joinToString("") { "data: ${kotlinx.serialization.json.Json.parseToJsonElement(it)}\n\n" }
                    val bytes = events.toByteArray().size.toLong()
                    // Every frame in the first period, then a slow comment keeps the stream open.
                    return MockResponse().setHeader("Content-Type", "text/event-stream").setBody(events + ":" + " ".repeat((bytes * 30).toInt()) + "\n\n")
                        .throttleBody(bytes, 2, java.util.concurrent.TimeUnit.SECONDS)
                }
                return when (url.encodedPath) {
                    "/party-api/state" -> {
                        val name = url.queryParameter("section").orEmpty()
                        sections[name]?.let { json(it.toString()) } ?: json(fixture("state-full").toString())
                    }
                    "/party-api/mail" -> json("""{"messages":[],"count":0}""")
                    "/party-api/escape" -> json("""{"escape":null}""")
                    "/party-api/daily-dungeons" -> dailyDungeon?.let { json(it) } ?: MockResponse().setResponseCode(404).setBody("""{"error":"not found"}""")
                    // The market's first read, before core reports a referenceRevision.
                    "/party-api/aldata/market" -> json(sections["market"]?.get("aldata")?.takeIf { it is JsonObject }?.toString() ?: """{"listings":[]}""")
                    "/setup/state" -> json("""{"requirePairing":true}""")
                    else -> MockResponse().setResponseCode(404).setBody("""{"error":"not found"}""")
                }
            }
        }
        start()
    }

    private fun json(body: String) = MockResponse().setHeader("Content-Type", "application/json").setBody(body)

    val settings: ServerSettings get() = ServerSettings(baseUrl = server.url("/").toString().trimEnd('/'), trustMode = TrustMode.CLEARTEXT)

    /** State GETs for one section, in order. */
    fun sectionRequests(section: String) = requests.filter { it.method == "GET" && it.path.contains("section=$section") }

    fun override(section: String, patch: Map<String, JsonElement>) {
        sections[section] = JsonObject(sections.getValue(section) + patch)
    }

    override fun close() = server.shutdown()
}

/** Wait (real time) until [condition] holds. */
/** Ids at or below this belong to earlier tests (ActionToasts is process-wide). */
@Volatile private var actionBaseline = 0L

private fun actionsInFlight() =
    com.partyconsole.companion.ui.components.ActionToasts.entries.value.any { it.id > actionBaseline && it.status == com.partyconsole.companion.ui.components.ActionToasts.Status.SENDING }

/** Waits for [condition], then for every action in flight to get its answer.
 *  A test usually waits for the console to receive a POST; the screen keeps
 *  its buttons disabled until the reply lands, so on a slow machine the next
 *  click would otherwise hit a disabled button and be ignored. */
fun eventually(timeoutMs: Long = 5_000, condition: () -> Boolean) = runBlocking {
    val until = System.currentTimeMillis() + timeoutMs
    while (!condition() || actionsInFlight()) {
        if (System.currentTimeMillis() > until) error("condition not met within ${timeoutMs}ms")
        // Under Robolectric the test thread is the main thread: keep its
        // looper running so Main-dispatched work (viewModelScope) progresses.
        runCatching { org.robolectric.shadows.ShadowLooper.idleMainLooper() }
        delay(20)
    }
}
