package com.partyconsole.companion.ui.components

import android.content.Context
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter

/** The Android counterpart of the PWA's ErrorBoundary: a crash ends the
 *  process, so it is written down and shown on the next launch (with the
 *  details to copy) instead of the app just vanishing. */
object CrashReport {
    private const val FILE = "last-crash.txt"

    private var installed = false

    fun install(context: Context) {
        if (installed) return
        installed = true
        val file = File(context.filesDir, FILE)
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            runCatching {
                val trace = StringWriter().also { error.printStackTrace(PrintWriter(it)) }.toString()
                file.writeText("${java.util.Date()} on ${thread.name}\n$trace")
            }
            previous?.uncaughtException(thread, error)
        }
    }

    /** The last crash, once - reading it clears it. */
    fun take(context: Context): String? {
        val file = File(context.filesDir, FILE)
        if (!file.exists()) return null
        return runCatching { file.readText() }.getOrNull().also { file.delete() }
    }
}

@Composable
fun CrashReportDialog(report: String, onDismiss: () -> Unit) {
    val clipboard = LocalClipboardManager.current
    var showDetails by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("The app closed unexpectedly") },
        text = {
            Column {
                Text("Your characters are managed separately and were not affected.")
                if (showDetails) {
                    Text(report, modifier = Modifier.heightIn(max = 280.dp).verticalScroll(rememberScrollState()))
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("OK") } },
        dismissButton = {
            TextButton(onClick = {
                if (showDetails) clipboard.setText(AnnotatedString(report)) else showDetails = true
            }) { Text(if (showDetails) "Copy details" else "Details") }
        },
    )
}
