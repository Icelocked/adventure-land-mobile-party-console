package com.partyconsole.companion.notify

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.partyconsole.companion.MainActivity
import com.partyconsole.companion.R
import com.partyconsole.companion.network.PartyApiClient
import com.partyconsole.companion.network.PartyCookies
import com.partyconsole.companion.network.ServerConfigStore
import com.partyconsole.companion.network.buildHttpClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit

/** Shows notices on the alerts channel; a tap opens the app on the notice's route. */
object AlertNotifications {
    const val CHANNEL = "alerts"
    const val LIVE_CHANNEL = "live-alerts"
    const val EXTRA_ROUTE = "notification_route"

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "Party alerts", NotificationManager.IMPORTANCE_HIGH).apply { description = "Character health, storage, progress, loot, trading and mail" })
        manager.createNotificationChannel(NotificationChannel(LIVE_CHANNEL, "Live alerts service", NotificationManager.IMPORTANCE_MIN).apply { description = "Shown while live alerts poll every 15 seconds" })
    }

    fun permitted(context: Context): Boolean =
        (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) &&
            NotificationManagerCompat.from(context).areNotificationsEnabled()

    fun show(context: Context, notice: Notice) {
        ensureChannels(context)
        if (!permitted(context)) return
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(EXTRA_ROUTE, notice.url)
        }
        val pending = PendingIntent.getActivity(context, notice.tag.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(notice.title)
            .setContentText(notice.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(notice.body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pending)
            .setAutoCancel(true)
            .build()
        // Same tag replaces the previous notice, like a Web Push tag.
        try { NotificationManagerCompat.from(context).notify(notice.tag, 0, notification) } catch (_: SecurityException) {}
    }

    /** A notifier wired to this phone's saved server, or null before one is set up. */
    suspend fun notifier(context: Context): Notifier? {
        val app = context.applicationContext
        PartyCookies.init(app)
        val settings = ServerConfigStore(app).settings.first()?.takeIf { it.isConfigured } ?: return null
        return Notifier(PartyApiClient(buildHttpClient(settings), settings), NotifierStore(app), { show(app, it) })
    }
}

/** The 15-minute background check (Android's shortest periodic interval):
 *  every check runs each time. */
class NotifierWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val store = NotifierStore(applicationContext)
        if (!store.enabled || store.live) return Result.success()
        val notifier = AlertNotifications.notifier(applicationContext) ?: return Result.success()
        // A multiple of 4 runs config, logs, storage, bank and mail too.
        notifier.poll(((store.watch.tick / 4) + 1) * 4)
        return Result.success()
    }
}

/** Live alerts: a foreground service polling every 15 s, like the PWA's notifier. */
class LiveAlertsService : Service() {
    private var scope: CoroutineScope? = null
    private var job: Job? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        AlertNotifications.ensureChannels(this)
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).putExtra(AlertNotifications.EXTRA_ROUTE, "/settings"), PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(this, AlertNotifications.LIVE_CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Live alerts on")
            .setContentText("Checking your party every 15 seconds.")
            .setOngoing(true)
            .setContentIntent(open)
            .build()
        ServiceCompat.startForeground(this, 1, notification, if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC else 0)
        if (job?.isActive != true) {
            val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO).also { scope = it }
            job = serviceScope.launch {
                val store = NotifierStore(this@LiveAlertsService)
                while (isActive && store.enabled && store.live) {
                    AlertNotifications.notifier(this@LiveAlertsService)?.poll()
                    delay(15_000)
                }
                stopSelf()
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        scope?.cancel()
        super.onDestroy()
    }
}

/** Starts or stops background checks to match the stored switches. */
object NotifierControl {
    private const val WORK = "party-notifier"

    fun apply(context: Context) {
        val app = context.applicationContext
        val store = NotifierStore(app)
        runCatching {
            val work = WorkManager.getInstance(app)
            if (store.enabled) {
                val request = PeriodicWorkRequestBuilder<NotifierWorker>(15, TimeUnit.MINUTES)
                    .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                    .build()
                work.enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.UPDATE, request)
            } else {
                work.cancelUniqueWork(WORK)
            }
        }
        val service = Intent(app, LiveAlertsService::class.java)
        if (store.enabled && store.live) runCatching { ContextCompat.startForegroundService(app, service) }
        else app.stopService(service)
    }
}
