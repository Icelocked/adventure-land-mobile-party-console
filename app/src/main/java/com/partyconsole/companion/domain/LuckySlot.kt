package com.partyconsole.companion.domain

import com.partyconsole.companion.model.LuckySlotTracking
import com.partyconsole.companion.model.SlotRollStatistics
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.exp
import kotlin.math.ln

// runtime/lucky-slot-tracking.ts (party-console v1.2.0), verbatim (the PWA's
// lib/luckySlot.ts): merge, validation, normalization and the search.

/** Merges [incoming] into [previous]; a slot only moves forward. */
fun mergeSlotStream(previous: MutableMap<String, SlotRollStatistics>, incoming: Map<String, SlotRollStatistics>): Boolean {
    var changed = false
    for ((slot, stats) in incoming) {
        val old = previous[slot]
        if (old != null && (stats.totalRolls <= old.totalRolls || stats.sumRolls < old.sumRolls || stats.rollsAbove96_3 < old.rollsAbove96_3 || stats.perfectRolls < old.perfectRolls)) continue
        previous[slot] = stats
        changed = true
    }
    return changed
}

fun validSlotStatistics(stats: SlotRollStatistics): Boolean =
    stats.totalRolls > 0 && stats.sumRolls.isFinite() && stats.sumRolls >= 0 && stats.sumRolls < stats.totalRolls &&
        listOf(stats.rollsAbove96_3, stats.perfectRolls).all { it in 0..stats.totalRolls } &&
        stats.rollsAbove96_3 + stats.perfectRolls <= stats.totalRolls

private val SLOT_KEY = Regex("^(?:[0-9]|[1-3][0-9]|4[01])$")
private val STREAM_ID = Regex("^[a-z0-9]{1,30}-[a-z0-9-]{1,60}$")

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
    return LuckySlotTracking(version = 1, streamId = streamId, slots = valid)
}

/** Every persisted stream, with the character's own live local stream merged
 *  into its stream id so replays neither double-count nor drop rolls. */
fun aggregateSlotTracking(streams: Map<String, LuckySlotTracking>, local: LuckySlotTracking? = null): LuckySlotTracking {
    val combined = streams.toMutableMap()
    val localId = local?.streamId
    if (localId != null) {
        val merged = combined[localId]?.slots.orEmpty().toMutableMap()
        mergeSlotStream(merged, local.slots)
        combined[localId] = LuckySlotTracking(version = 1, streamId = localId, slots = merged)
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
    return LuckySlotTracking(version = 1, slots = slots)
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

data class LuckySlotSearchResult(val slot: Int?, val confidence: Double, val samples: Long, val total: Long, val inferred: Boolean, val nextSlot: Int)

/** Ranks all 42 slots by log-evidence for being the lucky one. Inference
 *  needs >=100 rolls in the leading slot and >=99.9% confidence; below that
 *  the next upgrade rotates through the slot with the fewest samples. */
fun luckySlotSearch(tracking: LuckySlotTracking): LuckySlotSearchResult {
    data class Ranked(val slot: Int, val score: Double, val samples: Long)
    val ranked = (0 until 42).map { Ranked(it, slotLogEvidence(tracking.slots[it.toString()]), tracking.slots[it.toString()]?.totalRolls ?: 0) }
        .sortedWith(compareByDescending<Ranked> { it.score }.thenBy { it.samples }.thenBy { it.slot })
    val best = ranked.first()
    val confidence = 1 / ranked.sumOf { exp(it.score - best.score) }
    val total = ranked.sumOf { it.samples }
    val inferred = confidence >= 0.999 && best.samples >= 100
    val nextSlot = if (inferred) best.slot else ranked.sortedWith(compareBy<Ranked> { it.samples }.thenBy { it.slot }).first().slot
    return LuckySlotSearchResult(slot = if (total > 0) best.slot else null, confidence = confidence, samples = best.samples, total = total, inferred = inferred, nextSlot = nextSlot)
}

/** lucky-upgrade-slot.tsx validLuckySlot. */
fun validLuckySlot(slot: Int?): Boolean = slot != null && slot in 0 until 42
