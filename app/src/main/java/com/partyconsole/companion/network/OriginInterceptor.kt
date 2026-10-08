package com.partyconsole.companion.network

import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.Response

/** party-console's tools/hosting/authorize.ts answers every non-GET/HEAD request
 *  whose `Origin` is not its own address with 403 "Dashboard origin required",
 *  before it checks pairing. OkHttp sends no `Origin`, so this adds the one a
 *  browser on the same address sends. */
object OriginInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (request.method in setOf("GET", "HEAD") || request.header("Origin") != null) return chain.proceed(request)
        return chain.proceed(request.newBuilder().header("Origin", browserOrigin(request.url)).build())
    }
}

/** The origin a browser serializes for [url]: scheme and host, with the port only
 *  when it is not the scheme's default, and brackets around an IPv6 host. */
fun browserOrigin(url: HttpUrl): String {
    val host = if (':' in url.host) "[${url.host}]" else url.host
    val port = if (url.port == HttpUrl.defaultPort(url.scheme)) "" else ":${url.port}"
    return "${url.scheme}://$host$port"
}
