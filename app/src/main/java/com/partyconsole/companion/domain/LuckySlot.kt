package com.partyconsole.companion.domain

import com.partyconsole.companion.model.LuckySlotCursor
import com.partyconsole.companion.model.LuckySlotTracking
import com.partyconsole.companion.model.SlotRollStatistics
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.exp
import kotlin.math.ln

// Lucky-slot tracking: merge, validation, normalization and the search.
// PWA: web/src/lib/luckySlot.ts (console 1.4 runtime/lucky-slot-tracking.ts).

/** Merges [incoming] into [previous]. A slot is replaced only by one with
 *  more rolls and no smaller counters; the cursor follows whichever copy
 *  has seen more rolls. Answers the merged stream and whether it changed. */
fun mergeSlotStream(previous: LuckySlotTracking, incoming: LuckySlotTracking): Pair<LuckySlotTracking, Boolean> {
    var changed = false
    val slots = previous.slots.toMutableMap()
    for ((slot, stats) in incoming.slots) {
        val old = slots[slot]
        if (old != null && (stats.totalRolls <= old.totalRolls || stats.sumRolls < old.sumRolls || stats.rollsAbove96_3 < old.rollsAbove96_3 || stats.perfectRolls < old.perfectRolls)) continue
        slots[slot] = stats
        changed = true
    }
    var cursor = previous.cursor
    if (incoming.cursor != null && (cursor == null || incoming.cursor.rolls > cursor.rolls)) {
        cursor = incoming.cursor
        changed = true
    }
    return previous.copy(slots = slots, cursor = cursor) to changed
}

fun validSlotStatistics(stats: SlotRollStatistics): Boolean =
    stats.totalRolls > 0 && stats.sumRolls.isFinite() && stats.sumRolls >= 0 && stats.sumRolls < stats.totalRolls &&
        listOf(stats.rollsAbove96_3, stats.perfectRolls).all { it in 0..stats.totalRolls } &&
        stats.rollsAbove96_3 + stats.perfectRolls <= stats.totalRolls

private val SLOT_KEY = Regex("^(?:[0-9]|[1-3][0-9]|4[01])$")
private val STREAM_ID = Regex("^[a-z0-9]{1,30}-[a-z0-9-]{1,60}$")

/** A cursor can't claim more rolls than its own stream records. */
private fun validCursor(raw: JsonElement?, slots: Map<String, SlotRollStatistics>): LuckySlotCursor? {
    val fields = raw as? JsonObject ?: return null
    fun n(key: String) = (fields[key] as? JsonPrimitive)?.takeIf { !it.isString }?.content?.toDoubleOrNull()
    val slot = n("slot") ?: return null
    val at = n("at") ?: return null
    val rolls = n("rolls") ?: return null
    val total = slots.values.sumOf { it.totalRolls }
    val whole = { value: Double -> value.isFinite() && value == Math.floor(value) }
    if (!whole(slot) || slot < 0 || slot >= 42) return null
    if (!at.isFinite() || at < 0) return null
    if (!whole(rolls) || rolls <= 0 || rolls > 9007199254740991.0 || rolls > total) return null
    return LuckySlotCursor(slot = slot.toInt(), at = at, rolls = rolls.toLong())
}

/** A character's raw live stream (vitals.luckySlotTracking), validated. */
fun normalizeSlotTracking(raw: JsonElement?): LuckySlotTracking {
    val obj = raw as? JsonObject ?: return LuckySlotTracking()
    val slots = obj["slots"] as? JsonObject ?: return LuckySlotTracking()
    val streamId = (obj["streamId"] as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { STREAM_ID.matches(it) }
    val valid = buildMap {
        for ((slot, value) in slots) {
            if (!SLOT_KEY.matches(slot)) continue
            val fields = value as? JsonObject ?: continue
            fun n(key: String) = (fields[key] as? JsonPrimitive)?.content?.toDoubleOrNull()
            val total = n("totalRolls") ?: continue
            val stats = SlotRollStatistics(
                totalRolls = total.toLong().takeIf { it.toDouble() == total } ?: continue,
                sumRolls = n("sumRolls") ?: continue,
                rollsAbove96_3 = n("rollsAbove96_3")?.toLong() ?: continue,
                perfectRolls = n("perfectRolls")?.toLong() ?: continue,
            )
            if (validSlotStatistics(stats)) put(slot, stats)
        }
    }
    return LuckySlotTracking(version = 1, streamId = streamId, cursor = validCursor(obj["cursor"], valid), slots = valid)
}

/** Every persisted stream, with the character's own live local stream merged
 *  into its stream id so replays neither double-count nor drop rolls. The
 *  most recent cursor across streams wins. */
fun aggregateSlotTracking(streams: Map<String, LuckySlotTracking>, local: LuckySlotTracking? = null): LuckySlotTracking {
    val combined = streams.toMutableMap()
    val localId = local?.streamId
    if (localId != null) {
        val stored = combined[localId]
        val base = LuckySlotTracking(version = 1, streamId = localId, cursor = stored?.cursor, slots = stored?.slots.orEmpty())
        combined[localId] = mergeSlotStream(base, local).first
    }
    val slots = mutableMapOf<String, SlotRollStatistics>()
    for (stream in combined.values) {
        for ((slot, stats) in stream.slots) {
            val total = slots[slot] ?: SlotRollStatistics()
            slots[slot] = SlotRollStatistics(
                totalRolls = total.totalRolls + stats.totalRolls,
                sumRolls = total.sumRolls + stats.sumRolls,
                rollsAbove96_3 = total.rollsAbove96_3 + stats.rollsAbove96_3,
                perfectRolls = total.perfectRolls + stats.perfectRolls,
            )
        }
    }
    val cursor = combined.values.mapNotNull { it.cursor }
        .sortedWith(compareByDescending<LuckySlotCursor> { it.at }.thenByDescending { it.rolls }.thenBy { it.slot })
        .firstOrNull()
    return LuckySlotTracking(version = 1, cursor = cursor, slots = slots)
}

// Source: kaansoral/adventureland_mongodb node/server.js, upgrade handler.
// 60%: max(U/10000, 0.975*R - 0.012), otherwise uniform R.
private val NORMAL = doubleArrayOf(0.0001, 0.0369, 0.963)
private val LUCKY_ZERO = 0.4 * 0.0001 + 0.6 * (0.0121 / 0.975)
private val LUCKY_HIGH = 0.4 * 0.0369
private val LUCKY = doubleArrayOf(LUCKY_ZERO, LUCKY_HIGH, 1 - LUCKY_ZERO - LUCKY_HIGH)

fun slotLogEvidence(stats: SlotRollStatistics?): Double {
    if (stats == null) return 0.0
    val counts = longArrayOf(stats.perfectRolls, stats.rollsAbove96_3, stats.totalRolls - stats.perfectRolls - stats.rollsAbove96_3)
    return counts.withIndex().sumOf { (index, count) -> count * ln(LUCKY[index] / NORMAL[index]) }
}

/** One square's standing in the 42-way joint model. [eliminationConfidence]
 *  is the probability the square is ordinary. */
data class SlotPosterior(val slot: Int, val score: Double, val samples: Long, val probability: Double, val eliminationConfidence: Double, val ruledOut: Boolean)

private fun slotPosterior(tracking: LuckySlotTracking): List<SlotPosterior> {
    data class Ranked(val slot: Int, val score: Double, val samples: Long)
    val ranked = (0 until 42).map { Ranked(it, slotLogEvidence(tracking.slots[it.toString()]), tracking.slots[it.toString()]?.totalRolls ?: 0) }
        .sortedWith(compareByDescending<Ranked> { it.score }.thenBy { it.samples }.thenBy { it.slot })
    val best = ranked.first()
    val denominator = ranked.sumOf { exp(it.score - best.score) }
    return ranked.map {
        val probability = exp(it.score - best.score) / denominator
        val elimination = 1 - probability
        SlotPosterior(it.slot, it.score, it.samples, probability, elimination, ruledOut = it.samples >= 100 && elimination >= 0.999)
    }
}

data class LuckySlotSearchResult(
    val slot: Int?,
    val confidence: Double,
    val samples: Long,
    val total: Long,
    val inferred: Boolean,
    val nextSlot: Int,
    val slots: Map<Int, SlotPosterior> = emptyMap(),
    val ruledOutCount: Int = 0,
)

/** Ranks all 42 slots by log-evidence for being the lucky one. Inference
 *  needs >=100 rolls in the leading slot and >=99.9% confidence. Below that,
 *  the next upgrade tests the cursor square, or the first square after it
 *  that isn't ruled out (console 1.4 sequential discovery). */
fun luckySlotSearch(tracking: LuckySlotTracking): LuckySlotSearchResult {
    val ranked = slotPosterior(tracking)
    val best = ranked.first()
    val confidence = best.probability
    val total = ranked.sumOf { it.samples }
    val inferred = confidence >= 0.999 && best.samples >= 100
    val start = tracking.cursor?.slot ?: 0
    val ruledOut = ranked.filter { it.ruledOut }.map { it.slot }.toSet()
    // The scan stops after one lap, so a model that rules out every square
    // leaves the cursor in place.
    val nextSlot = if (inferred) best.slot else (0 until 42).map { (start + it) % 42 }.firstOrNull { it !in ruledOut } ?: start
    return LuckySlotSearchResult(
        slot = if (total > 0) best.slot else null,
        confidence = confidence,
        samples = best.samples,
        total = total,
        inferred = inferred,
        nextSlot = nextSlot,
        slots = ranked.associateBy { it.slot },
        ruledOutCount = ruledOut.size,
    )
}

fun validLuckySlot(slot: Int?): Boolean = slot != null && slot in 0 until 42
