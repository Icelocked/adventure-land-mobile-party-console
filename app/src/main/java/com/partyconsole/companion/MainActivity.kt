package com.partyconsole.companion

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.partyconsole.companion.network.PartyCookies
import com.partyconsole.companion.notify.AlertNotifications
import com.partyconsole.companion.notify.NotifierControl
import com.partyconsole.companion.update.UpdateControl
import com.partyconsole.companion.notify.PendingRoute
import com.partyconsole.companion.network.ServerConfigStore
import com.partyconsole.companion.ui.AppForeground
import com.partyconsole.companion.ui.AppNavigation
import com.partyconsole.companion.ui.components.ActionToastHost
import com.partyconsole.companion.ui.components.CrashReport
import com.partyconsole.companion.ui.components.CrashReportDialog
import com.partyconsole.companion.ui.theme.PartyConsoleTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        CrashReport.install(applicationContext)
        PartyCookies.init(applicationContext)
        AppForeground.observe()
        AlertNotifications.ensureChannels(applicationContext)
        NotifierControl.apply(applicationContext)
        UpdateControl.apply(applicationContext)
        if (savedInstanceState == null) PendingRoute.from(intent)
        val store = ServerConfigStore(applicationContext)
        val lastCrash = if (savedInstanceState == null) CrashReport.take(applicationContext) else null
        setContent {
            PartyConsoleTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    Box(modifier = Modifier.fillMaxSize()) {
                        AppNavigation(store)
                        ActionToastHost(modifier = Modifier.align(Alignment.TopCenter))
                    }
                    var crash by remember { mutableStateOf(lastCrash) }
                    crash?.let { CrashReportDialog(it) { crash = null } }
                }
            }
        }
    }

    // A notification tapped while the app is already open.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        PendingRoute.from(intent)
    }
}
