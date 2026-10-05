package com.partyconsole.companion.domain

import com.partyconsole.companion.model.PartyStateDynamic
import java.text.DateFormat
import java.util.Date
import kotlin.math.max

// lib/event-policy.ts (the PWA's lib/eventPolicy.ts), verbatim.

val SUPPORTED_EVENTS = listOf("anniversary", "abtesting", "goobrawl", "crabxx", "franky", "icegolem", "snowman")

data class EventPolicy(val inherited: Boolean, val source: String, val enabled: Boolean)

fun eventPolicy(state: PartyStateDynamic, name: String): EventPolicy {
    val leader = state.leader
    val inherited = leader != null && name != leader && name != state.merchantCharacter && state.followers[name] == true
    val source = if (inherited) leader!! else name
    val saved = state.eventSelectionsByCharacter[source]
    return EventPolicy(
        inherited = inherited,
        source = source,
        enabled = saved?.any { it != "anniversary" && it in SUPPORTED_EVENTS } ?: (state.eventsByCharacter[source] == true),
    )
}

fun selectedEvents(state: PartyStateDynamic, name: String): List<String> {
    val source = eventPolicy(state, name).source
    val selections = state.eventSelectionsByCharacter[source]
        ?: (listOf("anniversary") + if (state.eventsByCharacter[source] == true) SUPPORTED_EVENTS.filter { it != "anniversary" } else emptyList())
    return selections.filter { it in SUPPORTED_EVENTS }
}

fun eventEnabled(state: PartyStateDynamic, name: String, event: String) = event in selectedEvents(state, name)

/** event-selection-control.tsx eventTimeLabel: the local time (short zone)
 *  and the countdown; seconds-based timestamps are accepted. */
fun eventTimeLabel(next: Double?, now: Long): String {
    if (next == null || !next.isFinite() || next == 0.0) return "Time not announced"
    val ms = if (next < 1e12) (next * 1000).toLong() else next.toLong()
    val remaining = max(0L, ms - now)
    val time = DateFormat.getTimeInstance(DateFormat.SHORT).apply { timeZone = java.util.TimeZone.getDefault() }.format(Date(ms))
    val zone = java.util.TimeZone.getDefault().getDisplayName(java.util.TimeZone.getDefault().inDaylightTime(Date(ms)), java.util.TimeZone.SHORT)
    return "$time $zone (${remaining / 60000}m ${(remaining / 1000) % 60}s)"
}
