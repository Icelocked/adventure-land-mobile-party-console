package com.partyconsole.companion.network

import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.assertEquals
import org.junit.Test

/** Issue #1: the origin must match what party-console builds from its Host header. */
class OriginInterceptorTest {
    @Test
    fun originMatchesWhatABrowserSends() {
        assertEquals("http://192.168.1.5:3010", browserOrigin("http://192.168.1.5:3010/setup/pair".toHttpUrl()))
        // Tailscale Serve and Funnel addresses use the default HTTPS port, which a browser leaves out.
        assertEquals("https://pc.tail1234.ts.net", browserOrigin("https://pc.tail1234.ts.net:443/party-api/formation".toHttpUrl()))
        assertEquals("http://[fd7a:115c:a1e0::1]:3010", browserOrigin("http://[fd7a:115c:a1e0::1]:3010/party-api/formation".toHttpUrl()))
    }
}
