package com.partyconsole.companion

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.partyconsole.companion.network.ServerConfigStore
import com.partyconsole.companion.ui.AppNavigation
import com.partyconsole.companion.ui.theme.PartyConsoleTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val store = ServerConfigStore(applicationContext)
        setContent {
            PartyConsoleTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    AppNavigation(store)
                }
            }
        }
    }
}
