package com.partyconsole.companion.network

import android.content.Context
import okhttp3.Cache
import java.io.File

/** A small on-disk HTTP cache for the REST client. The console's responses
 *  carry an ETag but no freshness time, so OkHttp revalidates every poll and
 *  unchanged data comes back as a body-less 304 instead of the full payload. */
object HttpCache {
    @Volatile var cache: Cache? = null
        private set

    fun init(context: Context) {
        if (cache == null) cache = Cache(File(context.applicationContext.cacheDir, "http"), 20L * 1024 * 1024)
    }
}
