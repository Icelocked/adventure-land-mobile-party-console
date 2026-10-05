package com.partyconsole.companion.domain

import com.partyconsole.companion.model.ActiveSlot
import com.partyconsole.companion.model.Bankboi
import com.partyconsole.companion.model.CharacterConnection
import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Locale

/** Cases shared with web/src/lib/ports.test.ts. */
class RosterTest {
    private data class C(val name: String, val ctype: String? = null)

    @Test
    fun abbreviatesLikeTheDashboardHeader() {
        Locale.setDefault(Locale.US)
        assertEquals(listOf("99,999", "100.0K", "12.346m", "2.500b"), listOf(99_999L, 100_000L, 12_345_678L, 2_500_000_000L).map(::abbreviatedGold))
    }

    @Test
    fun goldCountsOnlyLoadedNonBankboiSlots() {
        val names = partyGoldNames(
            listOf(
                ActiveSlot(0, "headless", character = "A", state = "online"),
                ActiveSlot(1, "headless", character = "B", state = "offline"),
                ActiveSlot(2, "headless", character = "C", state = "online"),
                ActiveSlot(3, "headless", character = null, state = "empty"),
            ),
            listOf(Bankboi(name = "C", state = "idle")),
        )
        assertEquals(listOf("A"), names)
    }

    @Test
    fun goldIsUnknownWhileAnyBalanceIs() {
        assertEquals(GoldTotals(3, 103), goldTotals(100, listOf(1, 2)))
        assertEquals(GoldTotals(null, null), goldTotals(100, listOf(1, null)))
        assertEquals(GoldTotals(1, null), goldTotals(null, listOf(1)))
    }

    @Test
    fun ordersPrimaryThenSteamThenHeadlessMerchantsLast() {
        val chars = listOf(C("M", "merchant"), C("H", "ranger"), C("S", "mage"), C("P", "priest"))
        assertEquals(listOf("P", "S", "H", "M"), orderCharacters(chars, emptyList(), "P", "M", listOf("S"), { it.name }, { it.ctype }).map { it.name })
    }

    @Test
    fun breaksTiesByRosterOrderThenName() {
        val chars = listOf(C("B"), C("A"), C("C"))
        assertEquals(listOf("C", "B", "A"), orderCharacters(chars, listOf("C", "B"), null, null, emptyList(), { it.name }, { it.ctype }).map { it.name })
    }

    @Test
    fun pendingCardsForLoadingAndWaitingCharacters() {
        val pending = pendingCharacters(
            bankbois = listOf(Bankboi(name = "Bank1")),
            bankboiTransaction = null,
            connections = listOf(
                CharacterConnection(name = "Loader", status = "loading", delayed = true),
                CharacterConnection(name = "Live", status = "connected"),
                CharacterConnection(name = "Bank1", status = "loading"),
            ),
            activeSlots = listOf(ActiveSlot(0, "headless", character = "Slotted", state = "starting"), ActiveSlot(1, "headless", character = "Live", state = "online")),
            liveNames = listOf("Live"),
        )
        assertEquals(listOf("Loader" to "loading", "Slotted" to "waiting"), pending.map { it.name to it.status })
    }

    @Test
    fun freshnessLevels() {
        assertEquals(FreshnessLevel.LIVE, freshness(9_000).level)
        assertEquals("No update for 1m 05s — may be hung", freshness(65_000).label)
        assertEquals("2h 03m", ageLabel(2 * 3_600_000L + 3 * 60_000L))
    }
}
