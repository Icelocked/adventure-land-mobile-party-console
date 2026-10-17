package com.partyconsole.companion.domain

import com.partyconsole.companion.model.EventLimits
import com.partyconsole.companion.model.PartyStateDynamic
import java.text.DateFormat
import java.util.Date
import kotlin.math.max

// Which events a character joins; followers inherit the leader's choice.
// PWA: web/src/lib/eventPolicy.ts (console 1.4 dashboard/lib/event-policy.ts).

// A saved legacy all-events flag covers the events that existed when it was
// saved. Newer fights need an explicit selection, so an upgrade never opts a
// character into them.
private val LEGACY_DEFAULT_EVENTS = listOf("anniversary", "abtesting", "goobrawl", "crabxx", "franky", "icegolem", "snowman")
val SUPPORTED_EVENTS = LEGACY_DEFAULT_EVENTS + listOf("slenderman", "mrgreen", "mrpumpkin")
val EVENT_DISPLAY_NAMES = mapOf(
    "anniversary" to "Anniversary", "abtesting" to "A/B Testing", "goobrawl" to "Goobrawl",
    "crabxx" to "Crabxx", "franky" to "Franky", "icegolem" to "Ice Golem", "snowman" to "Snowman",
    "slenderman" to "Slenderman", "mrgreen" to "Mr. Green", "mrpumpkin" to "Mr. Pumpkin",
)

/** A death limit is a whole number >= 0; a time limit is a positive number of minutes. */
fun validEventLimits(limits: EventLimits): Boolean {
    val deaths = limits.deathLimit
    val minutes = limits.timeLimitMinutes
    return (deaths == null || (deaths.isFinite() && deaths == Math.floor(deaths) && deaths in 0.0..9007199254740991.0)) &&
        (minutes == null || (minutes.isFinite() && minutes > 0))
}

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
        ?: (listOf("anniversary") + if (state.eventsByCharacter[source] == true) LEGACY_DEFAULT_EVENTS.filter { it != "anniversary" } else emptyList())
    return eventPriorityOrder(state, name).filter { it in selections }
}

/** The character's event priority order; events added later go to the end. */
fun eventPriorityOrder(state: PartyStateDynamic, name: String): List<String> {
    val source = eventPolicy(state, name).source
    return (state.eventPrioritiesByCharacter[source].orEmpty() + SUPPORTED_EVENTS).distinct().filter { it in SUPPORTED_EVENTS }
}

fun eventLimits(state: PartyStateDynamic, name: String): Map<String, EventLimits> =
    state.eventLimitsByCharacter[eventPolicy(state, name).source].orEmpty()

fun eventEnabled(state: PartyStateDynamic, name: String, event: String) = event in selectedEvents(state, name)

/** The local time (short zone) and the countdown; [next] may be in seconds
 *  or milliseconds. */
fun eventTimeLabel(next: Double?, now: Long): String {
    if (next == null || !next.isFinite() || next == 0.0) return "Time not announced"
    val ms = if (next < 1e12) (next * 1000).toLong() else next.toLong()
    val remaining = max(0L, ms - now)
    val time = DateFormat.getTimeInstance(DateFormat.SHORT).apply { timeZone = java.util.TimeZone.getDefault() }.format(Date(ms))
    val zone = java.util.TimeZone.getDefault().getDisplayName(java.util.TimeZone.getDefault().inDaylightTime(Date(ms)), java.util.TimeZone.SHORT)
    return "$time $zone (${remaining / 60000}m ${(remaining / 1000) % 60}s)"
}
