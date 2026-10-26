package com.partyconsole.companion.domain

import com.partyconsole.companion.model.Item
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import java.text.DateFormat
import java.util.Date

// Ponty and Ron watches and buy-now orders: a port of the PWA's
// web/src/lib/npcShop.ts and npcPrice.ts, from the console fork's
// npc-shop-dialog.tsx and commerce/npc-price.ts (topic15/ponty-ron-buys).

/** One entry of Ron's last-visit stock (`npcShop.ron.listings`). */
@Serializable
data class NpcShopOffer(
    val rid: String,
    val item: Item,
    val quantity: Int = 0,
    val price: Long? = null,
    val unitPrice: Long = 0,
    val firstSeenAt: Long? = null,
)

/** [npc] is "ponty" or "ron"; [kind] "watch" or "now"; [status] "active",
 *  "paused", "done" or "stopped". A null [quantity] keeps a watch buying
 *  until the user stops it. */
@Serializable
data class NpcShopOrder(
    val id: String,
    val npc: String = "ponty",
    val kind: String = "watch",
    val item: String = "",
    val levelMin: Int = 0,
    val levelMax: Int = 0,
    val quantity: Int? = null,
    val spendCap: Long? = null,
    val bought: Int = 0,
    val spent: Long = 0,
    val status: String = "active",
    val lastBoughtAt: Long? = null,
    val lastRealm: String? = null,
)

@Serializable
data class NpcShopSettings(val goldReserve: Long = 0, val ronDonation: Boolean = false, val ronVisitMinutes: Int = 10)

@Serializable
data class NpcShopRon(val listings: List<NpcShopOffer> = emptyList(), val updatedAt: Long? = null, val error: String? = null)

/** market `npcShop` (runtime/coordinator/commerce/npc-shop.ts npcShopView). */
@Serializable
data class NpcShopView(
    val orders: List<NpcShopOrder> = emptyList(),
    val settings: NpcShopSettings = NpcShopSettings(),
    val ron: NpcShopRon? = null,
    val ronVisitedAt: Long? = null,
    val merchantRealm: String? = null,
    val spendable: Long = 0,
)

fun npcGold(value: Long) = "%,dg".format(value)

fun orderLevels(order: NpcShopOrder): String =
    if (order.levelMin == order.levelMax) "+${order.levelMin}" else "+${order.levelMin} to +${order.levelMax}"

fun orderSummary(order: NpcShopOrder, name: String): String {
    val cap = order.spendCap?.let { " · cap ${npcGold(it)}" }.orEmpty()
    return "$name ${orderLevels(order)} · ${if (order.npc == "ponty") "Ponty" else "Ron"} · ${if (order.kind == "watch") "watch" else "buy now"}$cap"
}

/** The time as toLocaleTimeString writes it. */
fun localTime(ms: Long): String = DateFormat.getTimeInstance(DateFormat.MEDIUM).format(Date(ms))

fun orderProgress(order: NpcShopOrder): String {
    val target = order.quantity?.let { "/$it" } ?: " (until stopped)"
    val last = order.lastBoughtAt?.takeIf { it != 0L }?.let { " · last ${localTime(it)}" + (order.lastRealm?.takeIf { realm -> realm.isNotEmpty() }?.let { realm -> " on $realm" } ?: "") }.orEmpty()
    return "${order.bought}$target bought · ${npcGold(order.spent)} spent$last · ${order.status}"
}

/**
 * Ponty and Ron prices from game definitions. itemValue mirrors
 * calculate_item_value (js/old_common_functions.js:808-847 at
 * adventureland_mongodb 16881a27), which the server evals (node/server.js:114)
 * and the client loads (htmls/index.html:43). sbuy (node/server.js:8306-8388)
 * multiplies it by 2 for Ponty, 3 for Ponty cash items and 4 for Ron.
 */
typealias PriceDefinitions = Map<String, Map<String, JsonElement>?>

data class LevelPrice(val level: Int, val unitPrice: Long)

// JavaScript's Number() and truthiness for definition fields.
private fun number(value: JsonElement?): Double = when (value) {
    null, JsonNull -> Double.NaN
    is JsonPrimitive -> value.booleanOrNull?.let { if (it) 1.0 else 0.0 } ?: value.doubleOrNull ?: if (value.isString && value.content.isBlank()) 0.0 else Double.NaN
    else -> Double.NaN
}
private fun truthy(value: JsonElement?): Boolean = when (value) {
    null, JsonNull -> false
    is JsonPrimitive -> if (value.isString) value.content.isNotEmpty() else number(value).let { it != 0.0 && !it.isNaN() }
    else -> true
}
private fun orZero(value: Double) = if (value.isNaN() || value == 0.0) 0.0 else value

private fun gold(defs: PriceDefinitions, name: String) = orZero(number(defs[name]?.get("g")))
private fun grades(def: Map<String, JsonElement>): Pair<Double, Double> {
    val value = def["grades"] as? JsonArray
    val low = value?.getOrNull(0)?.let { number(it) }?.takeIf { !it.isNaN() && it != 0.0 } ?: 11.0
    val high = value?.getOrNull(1)?.let { number(it) }?.takeIf { !it.isNaN() && it != 0.0 } ?: 12.0
    return low to high
}
private fun grade(level: Int, def: Map<String, JsonElement>): Int {
    val (low, high) = grades(def)
    return if (level > high) 2 else if (level > low) 1 else 0
}
private fun compoundValue(defs: PriceDefinitions, def: Map<String, JsonElement>, start: Double, level: Int): Double {
    var value = start
    for (i in 1..level) {
        value *= if (truthy(def["cash"])) 1.5 else 3.2
        if ((def["type"] as? JsonPrimitive)?.content != "booster") value += gold(defs, "cscroll" + grade(i, def)) / 2.4 else value *= 0.75
    }
    return value
}
private val UPGRADE_STEPS = mapOf(4 to 2.0, 5 to 2.0, 6 to 2.4)
private fun upgradeValue(defs: PriceDefinitions, def: Map<String, JsonElement>, start: Double, level: Int): Double {
    var value = start
    var scrolls = 0.0
    for (i in 1..level) {
        scrolls += gold(defs, "scroll" + grade(i, def)) / 2
        if (i >= 7) {
            value *= 3
            scrolls *= 1.32
        } else value *= UPGRADE_STEPS[i] ?: 1.0
        if (i == 9) value = value * 2.64 + 400000
        if (i == 10) value *= 5
        if (i == 12) value *= 0.8
    }
    return value + scrolls
}
private fun baseValue(def: Map<String, JsonElement>): Double {
    val g = number(def["g"])
    val value = if (truthy(def["cash"]) && orZero(g) != 0.0) g else orZero(g * 0.6)
    val markup = orZero(number(def["markup"]))
    return if (markup != 0.0) value / markup else value
}

/** calculate_item_value for an item with only a name and a level. */
fun itemValue(defs: PriceDefinitions, name: String, level: Int): Long {
    val def = defs[name] ?: return 0
    val value = baseValue(def)
    if (level == 0) return orZero(Math.round(value).toDouble()).toLong()
    val leveled = if (truthy(def["compound"])) compoundValue(defs, def, value, level) else value
    return orZero(Math.round(if (truthy(def["upgrade"])) upgradeValue(defs, def, leveled, level) else leveled).toDouble()).toLong()
}

fun npcUnitPrice(defs: PriceDefinitions, name: String, level: Int, npc: String): Long {
    val multiplier = if (npc == "ron") 4 else if (truthy(defs[name]?.get("cash"))) 3 else 2
    return itemValue(defs, name, level) * multiplier
}

fun levelPrices(defs: PriceDefinitions, name: String, from: Int, to: Int, npc: String): List<LevelPrice> =
    (minOf(from, to)..maxOf(from, to)).map { LevelPrice(it, npcUnitPrice(defs, name, it, npc)) }

/** All copies at the cheapest included level, up to all at the dearest; null for "until I stop". */
fun estimateTotal(prices: List<LevelPrice>, quantity: Int?): Pair<Long, Long>? {
    if (quantity == null || prices.isEmpty()) return null
    val units = prices.map { it.unitPrice }
    return units.min() * quantity to units.max() * quantity
}

/** Every catalog item's game definition, keyed by item id. */
fun priceDefinitions(items: List<com.partyconsole.companion.model.CatalogItem>): PriceDefinitions = items.associate { it.id to it.meta?.definition }

/** A typed field as JSON.stringify(Number(text)) sends it: blank is 0, and
 *  text that is not a number is null. */
fun jsNumberField(text: String): JsonElement {
    val trimmed = text.trim()
    if (trimmed.isEmpty()) return JsonPrimitive(0)
    val value = trimmed.toDoubleOrNull()?.takeIf { it.isFinite() } ?: return JsonNull
    return if (value == Math.floor(value) && kotlin.math.abs(value) < 9.007199254740992E15) JsonPrimitive(value.toLong()) else JsonPrimitive(value)
}

/** The body of POST /party-api/npc-shop/orders; null [quantity] keeps a watch going until stopped. */
fun npcShopOrderBody(npc: String, kind: String, item: String, levelMin: Int, levelMax: Int, quantity: JsonElement, spendCap: JsonElement): JsonObject = JsonObject(
    mapOf(
        "npc" to JsonPrimitive(npc), "kind" to JsonPrimitive(kind), "item" to JsonPrimitive(item),
        "levelMin" to JsonPrimitive(levelMin), "levelMax" to JsonPrimitive(levelMax),
        "quantity" to quantity, "spendCap" to spendCap,
    ),
)
