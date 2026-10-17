package com.partyconsole.companion.domain

import com.partyconsole.companion.model.LuckySlotCursor
import com.partyconsole.companion.model.LuckySlotTracking
import com.partyconsole.companion.model.SlotRollStatistics
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** web/src/lib/luckySlot.test.ts (console 1.4 sequential discovery), case
 *  for case. The console's own cases are scripts/tests/lucky-slot-tracker.test.cjs
 *  and e2e/lucky-slot-{elimination,lock}.spec.ts at 50c4cb0.
 *
 *  Failure modes:
 *  - The next slot follows the 1.3 least-sampled rule instead of the cursor.
 *  - The scan doesn't wrap past slot 41, or loops forever when every square
 *    is ruled out.
 *  - A square is ruled out before 100 rolls, or stays ruled out after new
 *    evidence restores it as a candidate.
 *  - An inferred slot doesn't override the cursor, or the cursor isn't used
 *    again once confidence lapses.
 *  - One zero roll or a low average counts as proof.
 *  - A cursor that claims more rolls than its stream records is kept.
 *  - Merging keeps the cursor with fewer rolls, or aggregation picks an
 *    older cursor than the live local stream's.
 */
class LuckySlotSearchTest {
    private fun stats(totalRolls: Long, sumRolls: Double, rollsAbove96_3: Long, perfectRolls: Long) = SlotRollStatistics(totalRolls, sumRolls, rollsAbove96_3, perfectRolls)
    private fun ledger(cursor: LuckySlotCursor? = null, fill: (Int) -> SlotRollStatistics) =
        LuckySlotTracking(version = 1, cursor = cursor, slots = (0 until 42).associate { it.toString() to fill(it) })

    @Test
    fun startsAtSlotZeroWithNoEvidence() {
        val search = luckySlotSearch(LuckySlotTracking())
        assertNull(search.slot)
        assertEquals(0, search.nextSlot)
        assertEquals(0, search.ruledOutCount)
    }

    // Console: "a high roll advances exploration one square". The tracker writes
    // cursor = observed slot + 1; the 1.3 least-sampled rule would pick slot 0 here.
    @Test
    fun followsTheCursorOneSquarePastTheLastRoll() {
        val tracking = LuckySlotTracking(cursor = LuckySlotCursor(slot = 8, at = 1000.0, rolls = 1), slots = mapOf("7" to stats(1, 0.9999, 1, 0)))
        assertEquals(8, luckySlotSearch(tracking).nextSlot)
    }

    // Console: "each sampled slot advances the next test across all 42 slots".
    @Test
    fun walksAll42SquaresAndWrapsToZero() {
        var tracking = LuckySlotTracking()
        for (slot in 0 until 42) {
            assertEquals(slot, luckySlotSearch(tracking).nextSlot)
            tracking = tracking.copy(slots = tracking.slots + (slot.toString() to stats(1, 0.1234, 0, 0)), cursor = LuckySlotCursor((slot + 1) % 42, (slot + 1).toDouble(), (slot + 1).toLong()))
        }
        assertEquals(0, luckySlotSearch(tracking).nextSlot)
    }

    // Console e2e: "lucky discovery rules out ordinary slots and recomputes after new evidence".
    @Test
    fun skipsARuledOutSquareOnlyAt100RollsAndUnRulesItOnNewEvidence() {
        var tracking = ledger { if (it == 0) stats(99, 60.0, 20, 0) else stats(100, 50.0, 3, 0) }
        var search = luckySlotSearch(tracking)
        assertEquals(0, search.ruledOutCount)
        assertEquals(0, search.nextSlot)

        tracking = tracking.copy(slots = tracking.slots + ("0" to stats(100, 60.0, 20, 0)))
        search = luckySlotSearch(tracking)
        assertEquals(1, search.ruledOutCount)
        assertTrue(search.slots.getValue(0).ruledOut)
        assertEquals(1, search.nextSlot)

        tracking = tracking.copy(slots = tracking.slots + (1 until 42).associate { it.toString() to stats(10000, 6000.0, 4000, 0) })
        search = luckySlotSearch(tracking)
        assertFalse(search.slots.getValue(0).ruledOut)
        assertEquals(41, search.ruledOutCount)
        assertEquals(0, search.nextSlot)
    }

    // Console e2e: "unlocked lucky inference overrides cursor and lapsing confidence resumes sequential discovery".
    @Test
    fun usesAnInferredSlotOverTheCursorThenResumesFromTheCursorWhenConfidenceLapses() {
        var tracking = ledger(LuckySlotCursor(41, System.currentTimeMillis().toDouble(), 4200)) { if (it == 19) stats(100, 50.0, 0, 5) else stats(100, 50.0, 4, 0) }
        var search = luckySlotSearch(tracking)
        assertTrue(search.inferred)
        assertEquals(19, search.slot)
        assertEquals(19, search.nextSlot)

        tracking = tracking.copy(slots = tracking.slots + mapOf("19" to stats(10000, 6000.0, 4000, 5), "41" to stats(10000, 6000.0, 4000, 0), "0" to stats(10000, 6000.0, 4000, 0)))
        search = luckySlotSearch(tracking)
        assertFalse(search.inferred)
        // Squares 41 and 0 are ruled out, so the scan from the cursor lands on 1.
        assertEquals(1, search.nextSlot)
    }

    // Console e2e lucky-slot-lock.spec.ts confidence ledger.
    @Test
    fun reportsTheLeadingCandidateConfidenceTheDashboardShows() {
        val search = luckySlotSearch(LuckySlotTracking(slots = mapOf("0" to stats(100, 50.0, 3, 2))))
        assertEquals(0, search.slot)
        assertFalse(search.inferred)
        assertEquals("97.37", "%.2f".format(java.util.Locale.US, search.confidence * 100))
    }

    // Console: "source-derived likelihoods do not treat one zero or a low average as proof".
    @Test
    fun doesNotTreatOneZeroOrALowAverageAsProof() {
        val first = luckySlotSearch(LuckySlotTracking(slots = mapOf("7" to stats(1, 0.0, 0, 1))))
        assertEquals(7, first.slot)
        assertFalse(first.inferred)
        assertTrue(first.confidence < 0.7)
        val ordinary = luckySlotSearch(LuckySlotTracking(slots = mapOf("7" to stats(1000, 100.0, 37, 0))))
        assertNotEquals(7, ordinary.slot)
        assertFalse(ordinary.inferred)
    }

    // Console: "rotating search converges on a simulated lucky slot using only scheduled attempts", same seeded generator.
    @Test
    fun convergesOnASimulatedLuckySlotUsingOnlyTheScheduledSquares() {
        var seed = 12345
        fun random(): Double {
            seed = seed * 1664525 + 1013904223
            return seed.toUInt().toDouble() / 4294967296.0
        }
        val slots = mutableMapOf<String, SlotRollStatistics>()
        var tracking = LuckySlotTracking()
        var decision = luckySlotSearch(tracking)
        var attempt = 0
        while (attempt < 25000 && !decision.inferred) {
            val slot = decision.nextSlot
            var roll = random()
            if (slot == 23 && random() < 0.6) roll = maxOf(random() / 10000, roll * 0.975 - 0.012)
            roll = Math.floor(roll * 10000) / 10000
            val entry = slots[slot.toString()] ?: SlotRollStatistics()
            slots[slot.toString()] = SlotRollStatistics(
                totalRolls = entry.totalRolls + 1,
                sumRolls = entry.sumRolls + roll,
                rollsAbove96_3 = entry.rollsAbove96_3 + if (roll > 0.963) 1 else 0,
                perfectRolls = entry.perfectRolls + if (roll == 0.0) 1 else 0,
            )
            tracking = LuckySlotTracking(slots = slots.toMap(), cursor = LuckySlotCursor((slot + 1) % 42, (attempt + 1).toDouble(), (attempt + 1).toLong()))
            decision = luckySlotSearch(tracking)
            attempt++
        }
        assertTrue(decision.inferred)
        assertEquals(23, decision.slot)
        assertTrue(decision.confidence >= 0.999)
        val copy = Json.decodeFromString(LuckySlotTracking.serializer(), Json.encodeToString(LuckySlotTracking.serializer(), tracking))
        assertEquals(decision, luckySlotSearch(copy))
    }

    @Test
    fun keepsAValidCursorAndDropsOneThatClaimsMoreRollsThanTheStreamHas() {
        val slots = """"slots":{"7":{"totalRolls":2,"sumRolls":0.5,"rollsAbove96_3":0,"perfectRolls":0}}"""
        fun parse(cursor: String) = normalizeSlotTracking(Json.parseToJsonElement("""{"version":1,$slots,"cursor":$cursor}"""))
        assertEquals(LuckySlotCursor(8, 5.0, 2), parse("""{"slot":8,"at":5,"rolls":2}""").cursor)
        assertNull(parse("""{"slot":8,"at":5,"rolls":3}""").cursor)
        assertNull(parse("""{"slot":42,"at":5,"rolls":1}""").cursor)
    }

    @Test
    fun mergesInTheCursorWithMoreRolls() {
        val previous = LuckySlotTracking(cursor = LuckySlotCursor(3, 10.0, 5))
        val (kept, changed) = mergeSlotStream(previous, LuckySlotTracking(cursor = LuckySlotCursor(9, 20.0, 4)))
        assertFalse(changed)
        assertEquals(3, kept.cursor?.slot)
        val (merged, moved) = mergeSlotStream(previous, LuckySlotTracking(cursor = LuckySlotCursor(9, 20.0, 6)))
        assertTrue(moved)
        assertEquals(9, merged.cursor?.slot)
    }

    @Test
    fun aggregatesToTheMostRecentCursorAcrossStreamsIncludingTheLiveLocalOne() {
        val streams = mapOf(
            "a-1" to LuckySlotTracking(cursor = LuckySlotCursor(4, 100.0, 1), slots = mapOf("3" to stats(1, 0.5, 0, 0))),
            "b-1" to LuckySlotTracking(cursor = LuckySlotCursor(11, 50.0, 1), slots = mapOf("10" to stats(1, 0.5, 0, 0))),
        )
        assertEquals(4, aggregateSlotTracking(streams).cursor?.slot)
        val local = LuckySlotTracking(streamId = "b-1", cursor = LuckySlotCursor(12, 200.0, 2), slots = mapOf("10" to stats(1, 0.5, 0, 0), "11" to stats(1, 0.5, 0, 0)))
        val merged = aggregateSlotTracking(streams, local)
        assertEquals(12, merged.cursor?.slot)
        assertEquals(12, luckySlotSearch(merged).nextSlot)
    }
}
