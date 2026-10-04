package com.partyconsole.companion.network

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl

/** party-console's pairing gate (tools/hosting/authorize.ts) recognises a
 *  paired device by its `party` cookie - a browser keeps it, so this app
 *  must too, across REST calls, the live stream and app restarts. Stored
 *  encrypted, since that cookie is the device's credential. */
object PartyCookies : CookieJar {
    private const val KEY = "cookies"
    private var prefs: SharedPreferences? = null
    private val cookies = mutableMapOf<String, Cookie>() // "domain|path|name" -> cookie

    fun init(context: Context) {
        if (prefs != null) return
        val masterKey = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        val store = EncryptedSharedPreferences.create(
            context,
            "party_cookies",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
        prefs = store
        synchronized(cookies) {
            for (line in store.getStringSet(KEY, emptySet()).orEmpty()) {
                val domain = line.substringBefore('\t')
                val cookie = runCatching { Cookie.parse("https://$domain/".toHttpUrl(), line.substringAfter('\t')) }.getOrNull() ?: continue
                cookies[id(cookie)] = cookie
            }
        }
    }

    private fun id(cookie: Cookie) = "${cookie.domain}|${cookie.path}|${cookie.name}"

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        synchronized(this.cookies) {
            for (cookie in cookies) {
                if (cookie.expiresAt < System.currentTimeMillis()) this.cookies.remove(id(cookie)) else this.cookies[id(cookie)] = cookie
            }
            persist()
        }
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> = synchronized(cookies) {
        val now = System.currentTimeMillis()
        if (cookies.values.removeAll { it.expiresAt < now }) persist()
        cookies.values.filter { it.matches(url) }
    }

    fun clear() = synchronized(cookies) {
        cookies.clear()
        persist()
    }

    private fun persist() {
        prefs?.edit()?.putStringSet(KEY, cookies.values.map { "${it.domain}\t$it" }.toSet())?.apply()
    }
}
