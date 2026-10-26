package com.partyconsole.companion.model

import kotlinx.serialization.Serializable

/** Pause, Play and the clean shutdown, as core's `consoleControl` and every
 *  POST /party-api/console-control/:action reply carry it. Console:
 *  runtime/coordinator/lifecycle/console-control.ts status(). PWA:
 *  web/src/models/consoleControl.ts. */
@Serializable
data class ConsoleControlState(
    val paused: Boolean,
    val pausedAt: Long? = null,
    val resume: ConsoleResume? = null,
    val shutdown: ConsoleShutdown? = null,
    val log: List<ConsoleControlLogEntry> = emptyList(),
)

@Serializable
data class ConsoleResume(val since: Long = 0, val waiting: List<String> = emptyList())

/** [phase] is "deferred", "draining" or "safe". */
@Serializable
data class ConsoleShutdown(
    val phase: String,
    val requestedAt: Long = 0,
    val hold: String? = null,
    val waiting: List<String> = emptyList(),
    val command: String = "",
    val directory: String = "",
)

@Serializable
data class ConsoleControlLogEntry(val at: Long = 0, val message: String = "")

/** The actions application.ts routes under /party-api/console-control/. */
enum class ConsoleControlAction(val path: String) {
    PAUSE("pause"), PLAY("play"), SHUTDOWN("shutdown"), CANCEL_SHUTDOWN("cancel-shutdown"), CANCEL_RESUME("cancel-resume"),
}
