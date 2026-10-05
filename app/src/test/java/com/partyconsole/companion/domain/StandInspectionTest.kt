package com.partyconsole.companion.domain

import com.partyconsole.companion.model.CharacterVitals
import com.partyconsole.companion.model.EquippedEntry
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.NativeStand
import com.partyconsole.companion.model.NativeStandOffer
import com.partyconsole.companion.model.StandBid
import com.partyconsole.companion.model.StandListing
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Stand inspection and stand capacity. */
class StandInspectionTest {
    private val bow = Item(name = "bow", level = 3, price = 50_000)

    @Test
    fun countsLiveSlotsAndClosedStandStandIns() {
        val merchant = StandMerchant(slots = mapOf("trade1" to EquippedEntry(bow), "trade2" to EquippedEntry(Item(name = "ringsj", b = true)), "mainhand" to EquippedEntry(Item(name = "blade"))), standOpen = false)
        val native = NativeStand(offers = mapOf("o" to NativeStandOffer(itemId = "hpot0", phase = "live", slot = "trade3")))
        val listings = listOf(StandListing(id = "l", item = Item(name = "wcoat"), price = 9_000, tradeSlot = "trade4", state = "live"))
        assertEquals(StandOccupancy(sales = 2, buys = 2, total = 4), standOccupancy(listings, native, merchant))
        // With the stand open only what's really in the trade slots counts.
        assertEquals(2, occupiedStandSlots(listings, native, merchant.copy(standOpen = true)))
    }

    @Test
    fun saleRowsMatchListingsToSlots() {
        val merchant = StandMerchant(slots = mapOf("trade1" to EquippedEntry(bow)), standOpen = true)
        val rows = standSaleRows(listOf(StandListing(id = "a", item = Item(name = "bow", level = 3), price = 50_000), StandListing(id = "b", item = Item(name = "wcoat"), price = 1, state = "paused")), merchant)
        assertEquals(listOf("Live", "Paused"), rows.map { it.status })
        assertTrue(rows[0].occupied)
        assertFalse(rows[1].occupied)
    }

    @Test
    fun theStandIsFullAtSixteenWithReservedBuys() {
        val listings = (1..15).map { StandListing(id = "$it", item = Item(name = "x"), state = "live") }
        assertFalse(standIsFull(listings))
        assertTrue(standIsFull(listings, mapOf("bow" to StandBid(useStandSlot = true))))
        assertFalse(standIsFull(listings + StandListing(item = Item(name = "y"), state = "paused")))
    }

    @Test
    fun vitalsAcceptANumericTargetAndAFractionalPing() {
        val vitals = Json { ignoreUnknownKeys = true }.decodeFromString(
            CharacterVitals.serializer(),
            """{"name":"Leada","hp":1,"max_hp":2,"mp":1,"max_mp":2,"gold":3,"map":"main","x":0,"y":0,"rip":false,"target":1234,"ping":23.7,"standOpen":true}""",
        )
        assertEquals("1234", vitals.targetId)
        assertEquals(23.7, vitals.ping!!, 0.0)
        assertEquals(true, vitals.standOpen)
    }
}
