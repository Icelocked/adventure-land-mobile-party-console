package com.partyconsole.companion.update

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.partyconsole.companion.MainActivity
import com.partyconsole.companion.R
import com.partyconsole.companion.notify.AlertNotifications
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/** A stable GitHub release with a signed APK attached. */
data class AppRelease(val version: String, val apkUrl: String, val apkSize: Long, val notesUrl: String)

data class UpdateState(
    val phase: Phase = Phase.IDLE,
    val available: AppRelease? = null,
    val checkedAt: Long? = null,
    /** Download progress, 0..1, while [Phase.DOWNLOADING]. */
    val progress: Float = 0f,
    val error: String? = null,
) {
    enum class Phase { IDLE, CHECKING, DOWNLOADING, INSTALLING }
}

/** Checks GitHub for new releases of this app and installs them through
 *  Android's package installer. Android asks the user to confirm, except on
 *  Android 12+ once this app itself installed the current version. */
object AppUpdates {
    const val REPOSITORY = "Icelocked/adventure-land-mobile-party-console"
    // Overridable only so tests can point it at a fake server.
    internal var releasesUrl = "https://api.github.com/repos/$REPOSITORY/releases/latest"
    private const val CHANNEL = "app-updates"
    private val json = Json { ignoreUnknownKeys = true }
    private val client = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS).build()

    private val _state = MutableStateFlow(UpdateState())
    val state: StateFlow<UpdateState> = _state.asStateFlow()

    fun installedVersion(context: Context): String =
        runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull().orEmpty()

    fun parseVersion(value: String): List<Int>? =
        Regex("""^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$""").find(value.trim())?.groupValues?.drop(1)?.map { it.toInt() }

    fun newer(candidate: String, current: String): Boolean {
        val a = parseVersion(candidate) ?: return false
        val b = parseVersion(current) ?: return true
        for (i in 0..2) if (a[i] != b[i]) return a[i] > b[i]
        return false
    }

    /** The latest stable release, or null when there is none with an APK. */
    suspend fun latest(): AppRelease? = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(releasesUrl).header("Accept", "application/vnd.github+json").build()
        client.newCall(request).execute().use { response ->
            if (response.code == 404) return@withContext null
            if (!response.isSuccessful) error("GitHub update check failed (${response.code})")
            val body = json.parseToJsonElement(response.body?.string().orEmpty()).jsonObject
            fun text(obj: JsonObject, key: String) = (obj[key] as? JsonPrimitive)?.content
            if (text(body, "draft") == "true" || text(body, "prerelease") == "true") return@withContext null
            val tag = text(body, "tag_name").orEmpty()
            if (parseVersion(tag) == null) return@withContext null
            val apk = (body["assets"] as? JsonArray).orEmpty().map { it.jsonObject }
                .firstOrNull { text(it, "name").orEmpty().let { name -> name.startsWith("party-console-companion-v") && name.endsWith(".apk") } }
                ?: return@withContext null
            AppRelease(
                version = tag.removePrefix("v"),
                apkUrl = text(apk, "browser_download_url").orEmpty(),
                apkSize = text(apk, "size")?.toLongOrNull() ?: -1,
                notesUrl = text(body, "html_url") ?: "https://github.com/$REPOSITORY/releases/tag/$tag",
            )
        }
    }

    /** Checks now; returns the release if it is newer than this install. */
    suspend fun check(context: Context): AppRelease? {
        if (_state.value.phase != UpdateState.Phase.IDLE) return _state.value.available
        _state.update { it.copy(phase = UpdateState.Phase.CHECKING, error = null) }
        return try {
            val release = latest()?.takeIf { newer(it.version, installedVersion(context)) }
            _state.update { it.copy(phase = UpdateState.Phase.IDLE, available = release, checkedAt = System.currentTimeMillis()) }
            release
        } catch (e: Exception) {
            _state.update { it.copy(phase = UpdateState.Phase.IDLE, error = e.message ?: "Update check failed") }
            null
        }
    }

    /** True when Android lets this app hand APKs to the installer. */
    fun canInstall(context: Context): Boolean = context.packageManager.canRequestPackageInstalls()

    /** Android's "Install unknown apps" switch for this app. */
    fun installPermissionIntent(context: Context) =
        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    /** Downloads the APK into a package-installer session and commits it.
     *  Android then shows its own confirmation; [InstallResultReceiver]
     *  surfaces that prompt and the outcome. */
    suspend fun downloadAndInstall(context: Context, release: AppRelease) {
        if (_state.value.phase != UpdateState.Phase.IDLE) return
        _state.update { it.copy(phase = UpdateState.Phase.DOWNLOADING, progress = 0f, error = null) }
        try {
            val installer = context.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
                setAppPackageName(context.packageName)
                if (Build.VERSION.SDK_INT >= 31) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            }
            val sessionId = installer.createSession(params)
            withContext(Dispatchers.IO) {
                installer.openSession(sessionId).use { session ->
                    client.newCall(Request.Builder().url(release.apkUrl).build()).execute().use { response ->
                        if (!response.isSuccessful) error("Download failed (${response.code})")
                        val body = response.body ?: error("Download failed (empty response)")
                        val total = body.contentLength().takeIf { it > 0 } ?: release.apkSize
                        var written = 0L
                        session.openWrite("base.apk", 0, total).use { out ->
                            body.byteStream().use { input ->
                                val buffer = ByteArray(64 * 1024)
                                while (true) {
                                    val read = input.read(buffer)
                                    if (read < 0) break
                                    out.write(buffer, 0, read)
                                    written += read
                                    if (total > 0) _state.update { it.copy(progress = (written.toFloat() / total).coerceIn(0f, 1f)) }
                                }
                            }
                            session.fsync(out)
                        }
                        if (release.apkSize > 0 && written != release.apkSize) error("Download was incomplete; try again")
                    }
                    val callback = PendingIntent.getBroadcast(
                        context, sessionId,
                        Intent(context, InstallResultReceiver::class.java).setPackage(context.packageName),
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
                    )
                    session.commit(callback.intentSender)
                }
            }
            _state.update { it.copy(phase = UpdateState.Phase.INSTALLING) }
        } catch (e: Exception) {
            _state.update { it.copy(phase = UpdateState.Phase.IDLE, error = e.message ?: "Update failed") }
        }
    }

    internal fun resetForTests() { _state.value = UpdateState() }

    internal fun installFinished(error: String?) =
        _state.update { it.copy(phase = UpdateState.Phase.IDLE, error = error) }

    fun notifyAvailable(context: Context, release: AppRelease) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "App updates", NotificationManager.IMPORTANCE_DEFAULT).apply { description = "A new version of this app is available" })
        if (!AlertNotifications.permitted(context)) return
        val open = PendingIntent.getActivity(
            context, CHANNEL.hashCode(),
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(AlertNotifications.EXTRA_ROUTE, "/settings"),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Update available: ${release.version}")
            .setContentText("Tap to open Settings and install it.")
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        try { NotificationManagerCompat.from(context).notify(CHANNEL, 0, notification) } catch (_: SecurityException) {}
    }
}

class UpdatePrefs(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("app-updates", Context.MODE_PRIVATE)

    var automaticChecks: Boolean
        get() = prefs.getBoolean("automatic", true)
        set(value) = prefs.edit().putBoolean("automatic", value).apply()

    /** The last version a notification went out for, so each release notifies once. */
    var notifiedVersion: String
        get() = prefs.getString("notified", "").orEmpty()
        set(value) = prefs.edit().putString("notified", value).apply()
}

/** Checks for a new release every 6 hours while automatic checks are on. */
class UpdateCheckWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val release = AppUpdates.check(applicationContext) ?: return Result.success()
        val prefs = UpdatePrefs(applicationContext)
        if (prefs.notifiedVersion != release.version) {
            AppUpdates.notifyAvailable(applicationContext, release)
            prefs.notifiedVersion = release.version
        }
        return Result.success()
    }
}

object UpdateControl {
    private const val WORK = "app-update-check"

    fun apply(context: Context) {
        val work = WorkManager.getInstance(context.applicationContext)
        if (UpdatePrefs(context).automaticChecks) {
            val request = PeriodicWorkRequestBuilder<UpdateCheckWorker>(6, TimeUnit.HOURS)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            work.enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP, request)
        } else {
            work.cancelUniqueWork(WORK)
        }
    }
}

/** Receives the package installer's progress: shows Android's confirmation
 *  prompt when it asks for one, and reports failures back to Settings. */
class InstallResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = (if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java) else intent.getParcelableExtra(Intent.EXTRA_INTENT))
                confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)?.let(context::startActivity)
            }
            PackageInstaller.STATUS_SUCCESS -> AppUpdates.installFinished(null)
            PackageInstaller.STATUS_FAILURE_ABORTED -> AppUpdates.installFinished("Install cancelled")
            else -> AppUpdates.installFinished(intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "Install failed (status $status)")
        }
    }
}
