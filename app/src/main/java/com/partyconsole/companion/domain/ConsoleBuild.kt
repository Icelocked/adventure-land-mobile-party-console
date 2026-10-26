package com.partyconsole.companion.domain

import kotlinx.serialization.Serializable

// Managed console builds: a port of the PWA's web/src/lib/consoleBuild.ts,
// from Ryan's tools/console-build/contracts.ts and
// dashboard/features/party/console-build-control.tsx. Only the fields the
// app reads.

@Serializable
data class BuildSummary(
    val id: String,
    val createdAt: String = "",
    val sourceHash: String = "",
    val commit: String? = null,
    val dirty: Boolean? = null,
    /** "dashboard", "coordinator" and "characters" to their content hashes. */
    val components: Map<String, String> = emptyMap(),
)

/** [phase] is "preparing", "waiting-safe", "moving-main", "activating",
 *  "resuming", "rolling-back", "complete" or "failed"; [mode] "now", "safe" or "main". */
@Serializable
data class DeploymentJournal(
    val id: String = "",
    val target: String = "",
    val previous: String? = null,
    val startedAt: String = "",
    val phase: String = "",
    val mode: String? = null,
    val phaseStartedAt: String? = null,
    val waiting: List<String>? = null,
    val error: String? = null,
)

@Serializable
data class ConsoleBuildStatus(
    val active: String? = null,
    val available: String? = null,
    val pendingBuildCount: Int? = null,
    val operation: DeploymentJournal? = null,
    val builds: List<BuildSummary> = emptyList(),
    val cave: Boolean? = null,
)

private val COMPONENTS = listOf("dashboard", "coordinator", "characters")

fun deploymentPending(phase: String) = phase !in setOf("complete", "failed")

/** The completed build the console offers, unless it is already active. */
fun readyBuild(status: ConsoleBuildStatus): BuildSummary? =
    status.builds.find { it.id == status.available }?.takeIf { it.id != status.active }

fun changedComponents(candidate: BuildSummary, active: BuildSummary?): List<String> =
    COMPONENTS.filter { candidate.components[it] != active?.components?.get(it) }

/** The badge count: pendingBuildCount, else the builds newer than the active one, at least 1. */
fun pendingBuildCount(status: ConsoleBuildStatus): Int {
    val active = status.builds.find { it.id == status.active }
    val newer = status.builds.count { it.id != status.active && (active == null || it.createdAt > active.createdAt) }
    return maxOf(1, status.pendingBuildCount ?: newer)
}
