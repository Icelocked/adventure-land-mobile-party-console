package com.partyconsole.companion.domain

import com.partyconsole.companion.model.Condition
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.max

// Status countdowns: remembers each status's total duration across updates.
// PWA: web/src/lib/statusDuration.ts.

data class StatusDuration(val observed: Long, val at: Long, val total: Long, val source: JsonElement?)

/** What a status's countdown depends on: id, remaining, source and its defined duration. */
data class StatusInput(val id: String, val remainingMs: Long?, val source: JsonElement?, val duration: JsonElement?)

fun durationSignature(conditions: List<Condition>): List<StatusInput> =
    conditions.map { StatusInput(it.id, it.remainingMs, it.source, it.definition?.get("duration")) }

fun reconcileDurations(signature: List<StatusInput>, previous: Map<String, StatusDuration?>, now: Long): Map<String, StatusDuration?> {
    val next = signature.associate { it.id to observeStatus(it.remainingMs, it.source, it.duration, previous[it.id], now) }
    return if (previous.size == signature.size && signature.all { next[it.id] == previous[it.id] }) previous else next
}

fun observeStatus(remainingMs: Long?, source: JsonElement?, duration: JsonElement?, previous: StatusDuration?, now: Long): StatusDuration? {
    val remaining = remainingMs ?: return null
    if (remaining < 0) return null
    val defined = (duration as? JsonPrimitive)?.content?.toDoubleOrNull()?.takeIf { it.isFinite() && it > 0 }?.toLong() ?: 0L
    if (previous != null && previous.observed == remaining && previous.source == source) {
        val total = max(previous.total, defined)
        return if (total == previous.total) previous else previous.copy(total = total)
    }
    val refreshed = previous == null || previous.source != source || remaining > previous.observed
    return StatusDuration(observed = remaining, at = now, source = source, total = maxOf(remaining, defined, if (refreshed) 0 else previous!!.total))
}

fun statusRemaining(value: StatusDuration?, now: Long): Long? = value?.let { max(0L, it.observed - max(0L, now - it.at)) }

/** A JSON value as display text. */
fun displayValue(value: JsonElement?): String = when (value) {
    null -> ""
    is JsonNull -> "None"
    is JsonArray -> value.joinToString(", ") { displayValue(it) }
    is JsonObject -> value.toString()
    is JsonPrimitive -> value.content
}
