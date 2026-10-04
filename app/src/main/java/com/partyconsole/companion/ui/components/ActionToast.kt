package com.partyconsole.companion.ui.components

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicLong

/** "A command was just sent" feedback (the PWA's lib/actionToast.ts): the API
 *  client's one POST path reports every action here, so each tap gets an
 *  immediate acknowledgement however slow the network is - without it, taps
 *  on a lossy connection looked like they did nothing and got repeated. */
object ActionToasts {
    enum class Status { SENDING, SENT, FAILED }
    data class Entry(val id: Long, val status: Status)

    private const val SENT_DISMISS_MS = 1_200L
    private const val FAILED_DISMISS_MS = 3_000L
    private val ids = AtomicLong()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val _entries = MutableStateFlow<List<Entry>>(emptyList())
    val entries: StateFlow<List<Entry>> = _entries.asStateFlow()

    /** Call the moment a command is dispatched; resolve it when it answers. */
    fun begin(): Long {
        val id = ids.incrementAndGet()
        _entries.update { it + Entry(id, Status.SENDING) }
        return id
    }

    fun resolve(id: Long, sent: Boolean) {
        _entries.update { list -> list.map { if (it.id == id) it.copy(status = if (sent) Status.SENT else Status.FAILED) else it } }
        scope.launch {
            delay(if (sent) SENT_DISMISS_MS else FAILED_DISMISS_MS)
            _entries.update { list -> list.filterNot { it.id == id } }
        }
    }
}

/** One stacked pill per in-flight (or just-resolved) command, mounted once at
 *  the app root (the PWA's ActionToastHost). Deliberately generic, even on
 *  failure - the acting screen's own inline error carries the message. */
@Composable
fun ActionToastHost(modifier: Modifier = Modifier) {
    val entries by ActionToasts.entries.collectAsState()
    if (entries.isEmpty()) return
    Column(
        modifier = modifier.fillMaxWidth().statusBarsPadding().padding(top = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        for (entry in entries) {
            val (label, color) = when (entry.status) {
                ActionToasts.Status.SENDING -> "Sending…" to MaterialTheme.colorScheme.onSurfaceVariant
                ActionToasts.Status.SENT -> "Sent" to Color(0xFF6EE7B7)
                ActionToasts.Status.FAILED -> "Failed to send" to MaterialTheme.colorScheme.error
            }
            Surface(
                shape = RoundedCornerShape(50),
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 4.dp,
                modifier = Modifier.border(1.dp, color, RoundedCornerShape(50)),
            ) {
                Text(label, color = color, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
            }
        }
    }
}
