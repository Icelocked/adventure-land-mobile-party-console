package com.partyconsole.companion.domain

import com.partyconsole.companion.model.EquippedEntry
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.NativeStand
import com.partyconsole.companion.model.NativeStandOffer
import com.partyconsole.companion.model.PartyStateDynamic
import com.partyconsole.companion.model.CharacterDiagnostics
import com.partyconsole.companion.model.CharacterState
import com.partyconsole.companion.model.StandBid
import com.partyconsole.companion.model.StandListing

/** The merchant as stand-inspection.ts needs it: its equipped slots (the
 *  trade1..16 stand slots live there) and whether the stand is open. */
data class StandMerchant(val slots: Map<String, EquippedEntry?> = emptyMap(), val standOpen: Boolean? = null)

/** StandScreen.tsx useStandMerchant: the configured merchant's live slots and
 *  stand state (vitals, else its diagnostics). */
fun standMerchant(state: PartyStateDynamic, characters: Map<String, CharacterState>, diagnostics: Map<String, CharacterDiagnostics>): StandMerchant? {
    val name = state.merchantCharacter ?: return null
    val character = characters[name]
    val standOpen = character?.vitals?.standOpen ?: (diagnostics[name]?.raw?.get("standOpen") as? kotlinx.serialization.json.JsonPrimitive)?.content?.toBooleanStrictOrNull()
    return StandMerchant(slots = character?.inventory?.slots ?: emptyMap(), standOpen = standOpen)
}

// stand-inspection.ts (party-console v1.2.0), verbatim from here down
// (the PWA's lib/standInspection.ts).
private val VALID_STAND_SLOT = Regex("^trade(?:[1-9]|1[0-6])$")
private fun validStandSlot(slot: String) = VALID_STAND_SLOT.matches(slot)
private fun identity(a: Item, b: Item) =
    a.name == b.name && (a.level ?: 0) == (b.level ?: 0) && a.p == b.p && a.statType == b.statType && a.data == b.data

private data class Occupant(val kind: String, val item: Item? = null, val itemId: String? = null, val listing: StandListing? = null, val offer: NativeStandOffer? = null)

private fun standOccupants(listings: List<StandListing>, native: NativeStand?, merchant: StandMerchant?): LinkedHashMap<String, Occupant> {
    val slots = LinkedHashMap<String, Occupant>()
    for ((slot, entry) in merchant?.slots.orEmpty()) if (validStandSlot(slot) && entry != null) slots[slot] = Occupant(if (entry.item.b == true) "buy" else "sale", item = entry.item)
    if (merchant?.standOpen != true) {
        for (offer in native?.offers?.values.orEmpty())
            if (validStandSlot(offer.slot) && !slots.containsKey(offer.slot) && offer.phase in setOf("live", "removing")) slots[offer.slot] = Occupant("buy", itemId = offer.itemId, offer = offer)
        for (listing in listings) {
            val tradeSlot = listing.tradeSlot ?: continue
            if (validStandSlot(tradeSlot) && !slots.containsKey(tradeSlot) && listing.state == "live") slots[tradeSlot] = Occupant("sale", item = listing.item, listing = listing)
        }
    }
    return slots
}

data class StandOccupancy(val sales: Int, val buys: Int, val total: Int)

fun standOccupancy(listings: List<StandListing>, native: NativeStand?, merchant: StandMerchant?): StandOccupancy {
    val slots = standOccupants(listings, native, merchant)
    val sales = slots.values.count { it.kind == "sale" }
    return StandOccupancy(sales = sales, buys = slots.size - sales, total = slots.size)
}

fun occupiedStandSlots(listings: List<StandListing>, native: NativeStand?, merchant: StandMerchant?): Int = standOccupancy(listings, native, merchant).total

data class StandSaleRow(
    val occupied: Boolean,
    val configured: StandListing,
    val liveEntry: EquippedEntry?,
    val editable: Boolean,
    val key: String,
    val status: String, // Live | Paused | Queued
)

fun standSaleRows(listings: List<StandListing>, merchant: StandMerchant?, native: NativeStand? = null): List<StandSaleRow> {
    val slots = merchant?.slots.orEmpty().entries.filter { (slot, entry) -> validStandSlot(slot) && entry != null && entry.item.b != true }.map { it.key to it.value!! }
    val occupants = standOccupants(listings, native, merchant)
    val used = mutableSetOf<String>()
    val rows = listings.mapIndexed { index, configured ->
        val match = if (configured.state != "paused") slots.find { (slot, entry) -> slot !in used && identity(configured.item, entry.item) && (configured.tradeSlot == null || configured.tradeSlot == slot) } else null
        val stored = match == null && configured.state == "live" && configured.tradeSlot != null && configured.tradeSlot !in used && occupants[configured.tradeSlot]?.listing == configured
        if (match != null) used += match.first else if (stored) used += configured.tradeSlot!!
        StandSaleRow(
            occupied = match != null || stored,
            configured = configured,
            liveEntry = match?.second,
            editable = true,
            key = configured.id ?: "configured-$index",
            status = when {
                configured.state == "paused" -> "Paused"
                merchant?.standOpen == true && match != null && (match.second.item.price ?: 0L) == configured.price -> "Live"
                else -> "Queued"
            },
        )
    }.toMutableList()
    for ((slot, entry) in slots) {
        if (slot in used) continue
        rows += StandSaleRow(
            occupied = true,
            configured = StandListing(slot = slot.removePrefix("trade").toIntOrNull(), item = entry.item, price = entry.item.price ?: 0L, quantity = entry.item.q ?: 1),
            liveEntry = entry,
            editable = false,
            key = slot,
            status = if (merchant?.standOpen == true) "Live" else "Queued",
        )
    }
    return rows
}

data class StandBuyRow(
    val key: String,
    val id: String,
    val bid: StandBid?,
    val offer: NativeStandOffer?,
    val observed: EquippedEntry?,
    val level: Int,
    val price: Long,
    val quantity: Int,
)

fun standBuyRows(bids: Map<String, StandBid>, native: NativeStand?, merchant: StandMerchant?, listings: List<StandListing> = emptyList()): List<StandBuyRow> {
    val offers = native?.offers?.values.orEmpty()
    return standOccupants(listings, native, merchant).entries
        .filter { it.value.kind == "buy" }
        .sortedBy { it.key.removePrefix("trade").toIntOrNull() ?: 0 }
        .map { (slot, occupant) ->
            val observed = merchant?.slots?.get(slot)
            val id = occupant.item?.name ?: occupant.itemId.orEmpty()
            val offer = occupant.offer ?: offers.find { candidate ->
                candidate.slot == slot && candidate.itemId == id && (occupant.item?.level ?: 0) == candidate.level && occupant.item?.price == candidate.price
            }
            StandBuyRow(
                key = slot,
                id = id,
                bid = bids[id],
                offer = offer,
                observed = observed,
                level = occupant.item?.level ?: offer?.level ?: 0,
                price = occupant.item?.price ?: offer?.price ?: 0L,
                quantity = occupant.item?.q ?: (if (offer != null) maxOf(0, (offer.quantity ?: 1) - (offer.acknowledged ?: 0L).toInt()) else 1),
            )
        }
}

/** stand-capacity.ts, verbatim: automatic buys yield their slots to sales;
 *  explicit buy orders reserve them. */
fun standIsFull(listings: List<StandListing>, bids: Map<String, StandBid> = emptyMap()): Boolean =
    listings.count { it.state != "paused" } + bids.values.count { it.useStandSlot == true } >= 16
