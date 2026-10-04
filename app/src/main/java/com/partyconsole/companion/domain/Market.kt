package com.partyconsole.companion.domain

import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.model.InventoryEntry
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.MerchantBuyItem
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.roundToLong

private val marketJson = Json { ignoreUnknownKeys = true; coerceInputValues = true }

private fun JsonObject.str(key: String) = (this[key] as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content
private fun JsonObject.num(key: String) = (this[key] as? JsonPrimitive)?.content?.toDoubleOrNull()
private fun JsonObject.item(): Item = this["item"]?.let { runCatching { marketJson.decodeFromJsonElement(Item.serializer(), it) }.getOrNull() } ?: Item(name = "")

/** aldata-listing.tsx, read from the listing as received ([raw] is what a
 *  purchase echoes back). */
data class AlDataListing(
    val raw: JsonObject,
    val key: String,
    val seller: String,
    val serverRegion: String,
    val serverIdentifier: String,
    val map: String,
    val seenAt: Long,
    val price: Long,
    val quantity: Int,
    val item: Item,
    val groupedListings: List<AlDataListing>? = null,
)

fun alDataListing(raw: JsonObject) = AlDataListing(
    raw = raw,
    key = raw.str("key").orEmpty(),
    seller = raw.str("seller").orEmpty(),
    serverRegion = raw.str("serverRegion").orEmpty(),
    serverIdentifier = raw.str("serverIdentifier").orEmpty(),
    map = raw.str("map").orEmpty(),
    seenAt = raw.num("seenAt")?.toLong() ?: 0,
    price = raw.num("price")?.toLong() ?: 0,
    quantity = raw.num("quantity")?.toInt() ?: 0,
    item = raw.item(),
)

/** aldata-buy-order.ts. */
data class AlDataBuyOrder(
    val raw: JsonObject,
    val key: String,
    val buyer: String,
    val serverRegion: String,
    val serverIdentifier: String,
    val seenAt: Long,
    val price: Long,
    val quantity: Int,
    val item: Item,
)

fun alDataBuyOrder(raw: JsonObject) = AlDataBuyOrder(
    raw = raw,
    key = raw.str("key").orEmpty(),
    buyer = raw.str("buyer").orEmpty(),
    serverRegion = raw.str("serverRegion").orEmpty(),
    serverIdentifier = raw.str("serverIdentifier").orEmpty(),
    seenAt = raw.num("seenAt")?.toLong() ?: 0,
    price = raw.num("price")?.toLong() ?: 0,
    quantity = raw.num("quantity")?.toInt() ?: 0,
    item = raw.item(),
)

/** ponty-listing.ts. */
data class PontyListing(
    val key: String,
    val item: Item,
    val quantity: Int,
    val unitPrice: Long,
    val groupKey: String?,
    val serverRegion: String?,
    val serverIdentifier: String?,
    val seenAt: Long?,
)

fun pontyListing(raw: JsonObject) = PontyListing(
    key = raw.str("key").orEmpty(),
    item = raw.item(),
    quantity = raw.num("quantity")?.toInt() ?: 0,
    unitPrice = raw.num("unitPrice")?.toLong() ?: 0,
    groupKey = raw.str("groupKey"),
    serverRegion = raw.str("serverRegion"),
    serverIdentifier = raw.str("serverIdentifier"),
    seenAt = raw.num("seenAt")?.toLong(),
)

/** aldata-public-trade.ts: one owner's published intentions. */
data class TradeIntention(val price: Long?, val quantity: Int?)
data class PublicTradeListing(val name: String, val level: Int, val p: String?, val note: String?, val wts: TradeIntention?, val wtb: TradeIntention?)
data class AlDataPublicTrade(val owner: String, val label: String?, val characters: List<String>, val listings: List<PublicTradeListing>)

fun alDataPublicTrade(raw: JsonObject): AlDataPublicTrade {
    fun intention(value: JsonElement?) = (value as? JsonObject)?.let { TradeIntention(it.num("price")?.toLong(), it.num("quantity")?.toInt()) }
    return AlDataPublicTrade(
        owner = raw.str("owner").orEmpty(),
        label = raw.str("label"),
        characters = (raw["characters"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.content }.orEmpty(),
        listings = (raw["listings"] as? JsonArray)?.mapNotNull { it as? JsonObject }?.map {
            PublicTradeListing(it.str("name").orEmpty(), it.num("level")?.toInt() ?: 0, it.str("p"), it.str("note"), intention(it["wts"]), intention(it["wtb"]))
        }.orEmpty(),
    )
}

// stand-sheet.tsx, verbatim logic from here down.

/** The value a listing is judged against: the cheapest of the farm-price
 *  sources and the vendor cost, never below the item's own value. */
fun dealValuesByItem(catalog: List<CatalogItem>, buyable: List<MerchantBuyItem>): Map<String, Double> {
    val buyableById = buyable.associateBy { it.id }
    return catalog.associate { item ->
        val defaultPrice = max(1.0, (item.meta?.definition?.get("g") as? JsonPrimitive)?.content?.toDoubleOrNull()?.takeIf { it != 0.0 } ?: 1.0)
        val candidates = item.meta?.world?.suggestedPrices.orEmpty().map { max(defaultPrice, it.suggested.takeIf { s -> s != 0.0 } ?: defaultPrice) }.toMutableList()
        buyableById[item.id]?.let { vendor -> candidates += max(1.0, vendor.cost.toDouble().takeIf { it != 0.0 } ?: defaultPrice) }
        item.id to (candidates.minOrNull() ?: defaultPrice)
    }
}

/** Same seller/realm/map/price/identity listings become one row with the
 *  quantity summed; purchases are split back across them. */
fun groupAlData(listings: List<AlDataListing>): List<AlDataListing> {
    val groups = linkedMapOf<String, MutableList<AlDataListing>>()
    for (entry in listings) {
        val identity = listOf(entry.item.name, entry.item.level ?: 0, entry.item.p, entry.item.statType, entry.item.data?.toString()).toString()
        val key = "${entry.seller}|${entry.serverRegion}|${entry.serverIdentifier}|${entry.map}|${entry.price}|$identity"
        groups.getOrPut(key) { mutableListOf() } += entry
    }
    return groups.values.map { members ->
        members[0].copy(
            key = members.joinToString("|") { it.key },
            quantity = members.sumOf { max(1, it.quantity) },
            groupedListings = members,
        )
    }
}

private fun marketCutoff(now: Long) = floor(now / 30000.0).toLong() * 30000

/** Fresh first (seen within 2 minutes of the 30 s market cutoff), then price. */
fun filterAlData(grouped: List<AlDataListing>, query: String, now: Long, nameFor: (String) -> String?): List<AlDataListing> {
    val cutoff = marketCutoff(now) - 120000
    val text = query.trim().lowercase()
    return grouped
        .filter { "${nameFor(it.item.name).orEmpty()} ${it.item.name} ${it.seller} ${it.serverRegion} ${it.serverIdentifier}".lowercase().contains(text) }
        .sortedWith(compareBy<AlDataListing> { if (it.seenAt >= cutoff) 0 else 1 }.thenBy { it.price })
}

data class BlacklistRecord(val reason: String?, val until: Double?)

fun blacklistRecords(raw: Map<String, JsonElement>): Map<String, BlacklistRecord> = raw.mapValues { (_, value) ->
    val obj = value as? JsonObject
    BlacklistRecord(obj?.str("reason"), obj?.num("until"))
}

fun blacklistRecord(blacklist: Map<String, BlacklistRecord>, autoBlacklistMerchants: Boolean, now: Long, seller: String, region: String, identifier: String): BlacklistRecord? =
    listOf(blacklist["$seller|$region|$identifier"], blacklist["$seller||"]).find { record ->
        record != null && (autoBlacklistMerchants || record.reason == "manual") && (record.until == -1.0 || (record.until ?: 0.0) > now)
    }

fun ownedKey(item: Item) = "${item.name}@${item.level ?: 0}@${item.p.orEmpty()}"

/** How many of each exact item the merchant and the bank hold. */
fun ownedCounts(merchantItems: List<InventoryEntry?>, bankPacks: Map<String, List<InventoryEntry?>>): Map<String, Int> {
    val owned = linkedMapOf<String, Int>()
    fun add(entry: InventoryEntry?) {
        entry ?: return
        val key = ownedKey(entry.item)
        owned[key] = (owned[key] ?: 0) + (entry.item.q ?: 1)
    }
    bankPacks.values.flatten().forEach(::add)
    merchantItems.forEach(::add)
    return owned
}

data class OwnedSource(val entry: InventoryEntry, val bankPack: String? = null)

/** Where to list an owned copy from: the merchant first, then the bank. */
fun ownedSource(item: Item, merchantItems: List<InventoryEntry?>, bankPacks: Map<String, List<InventoryEntry?>>): OwnedSource? {
    merchantItems.find { it != null && ownedKey(it.item) == ownedKey(item) }?.let { return OwnedSource(it) }
    for ((bankPack, entries) in bankPacks) {
        entries.find { it != null && ownedKey(it.item) == ownedKey(item) }?.let { return OwnedSource(it, bankPack) }
    }
    return null
}

fun filterBuyOrders(orders: List<AlDataBuyOrder>, query: String, now: Long, hideUnowned: Boolean, owned: Map<String, Int>, nameFor: (String) -> String?): List<AlDataBuyOrder> {
    val cutoff = marketCutoff(now) - 120000
    val text = query.trim().lowercase()
    return orders
        .filter { !hideUnowned || (owned[ownedKey(it.item)] ?: 0) > 0 }
        .filter { "${nameFor(it.item.name).orEmpty()} ${it.item.name} ${it.buyer} ${it.serverRegion} ${it.serverIdentifier}".lowercase().contains(text) }
        .sortedWith(compareBy<AlDataBuyOrder> { if (it.seenAt >= cutoff) 0 else 1 }.thenByDescending { it.price })
}

data class PontyGroup(
    val key: String,
    val item: Item,
    val quantity: Int,
    val unitPrice: Long,
    val seenAt: Long?,
    val stale: Boolean,
    val keys: List<String>,
    val realms: Set<String>,
    val minimumLot: Int,
)

/** Ponty listings (no PVP) grouped by groupKey and freshness: quantities
 *  summed, the highest unit price kept, and the smallest lot as the minimum. */
fun groupPonty(listings: List<PontyListing>, query: String, now: Long, nameFor: (String) -> String?): List<PontyGroup> {
    val text = query.trim().lowercase()
    val filtered = listings
        .filter { it.serverIdentifier != "PVP" && "${nameFor(it.item.name).orEmpty()} ${it.item.name}".lowercase().contains(text) }
        .sortedWith(compareBy<PontyListing> { it.unitPrice }.thenBy { it.item.name })
    val freshCutoff = now - 120000
    val groups = linkedMapOf<String, PontyGroup>()
    for (listing in filtered) {
        val stale = listing.seenAt == null || listing.seenAt == 0L || listing.seenAt <= freshCutoff
        val key = "${listing.groupKey ?: listing.key}|${if (stale) "stale" else "fresh"}"
        val realm = "${listing.serverRegion ?: "?"} ${listing.serverIdentifier ?: "?"}"
        val existing = groups[key]
        groups[key] = if (existing != null) {
            existing.copy(
                quantity = existing.quantity + listing.quantity,
                keys = existing.keys + listing.key,
                realms = existing.realms + realm,
                unitPrice = max(existing.unitPrice, listing.unitPrice),
                minimumLot = minOf(existing.minimumLot, listing.quantity),
                seenAt = max(existing.seenAt ?: 0, listing.seenAt ?: 0),
            )
        } else {
            PontyGroup(key, listing.item, listing.quantity, listing.unitPrice, listing.seenAt, stale, listOf(listing.key), setOf(realm), listing.quantity)
        }
    }
    return groups.values.toList()
}

data class PriceComparison(val deal: Boolean, val badDeal: Boolean, val comparison: String)

/** "deal · N% off" / "N% above" / "N% below" / "at suggested". */
fun priceComparison(price: Double, suggested: Double): PriceComparison {
    val deal = price < suggested * 0.5
    val badDeal = price > suggested * 2
    val dealDiscount = max(0L, jsRound((1 - price / suggested) * 100))
    val priceDifference = jsRound(abs(price / suggested - 1) * 100)
    val comparison = when {
        deal -> "deal · $dealDiscount% off"
        price > suggested -> "$priceDifference% above"
        price < suggested -> "$priceDifference% below"
        else -> "at suggested"
    }
    return PriceComparison(deal, badDeal, comparison)
}

/** Math.round: halves round up (towards +infinity). */
private fun jsRound(value: Double): Long = floor(value + 0.5).roundToLong()
