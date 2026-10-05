package com.partyconsole.companion.network

import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class HttpCacheTest {
    private val server = MockWebServer()

    @After fun stop() = server.shutdown()

    @Test
    fun unchangedPollsRevalidateAndReturnTheCachedBody() = runBlocking {
        var body = """{"bank":{"gold":1}}"""
        server.dispatcher = object : Dispatcher() {
            // Like Express: a weak ETag over the body, 304 when it still matches.
            override fun dispatch(request: RecordedRequest): MockResponse {
                val tag = "W/\"${body.hashCode()}\""
                return if (request.getHeader("If-None-Match") == tag) MockResponse().setResponseCode(304).setHeader("ETag", tag)
                else MockResponse().setHeader("ETag", tag).setHeader("Content-Type", "application/json").setBody(body)
            }
        }
        server.start()
        HttpCache.init(ApplicationProvider.getApplicationContext())
        HttpCache.cache!!.evictAll()
        val settings = ServerSettings(baseUrl = server.url("/").toString().trimEnd('/'), trustMode = TrustMode.CLEARTEXT)
        val api = PartyApiClient(buildHttpClient(settings), settings)

        assertEquals(body, (api.get("state?section=bank") as ApiResult.Success).value)
        assertNull(server.takeRequest().getHeader("If-None-Match"))
        // Unchanged: the poll sends the ETag back, the server answers 304,
        // and the caller still gets the full data.
        assertEquals(body, (api.get("state?section=bank") as ApiResult.Success).value)
        val second = server.takeRequest()
        assertEquals("W/\"${body.hashCode()}\"", second.getHeader("If-None-Match"))
        // Changed: the new body arrives.
        body = """{"bank":{"gold":2}}"""
        assertEquals(body, (api.get("state?section=bank") as ApiResult.Success).value)
    }
}
