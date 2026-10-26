package com.partyconsole.companion.domain

import com.partyconsole.companion.model.CatalogItem
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull

// A port of the PWA's web/src/lib/marketFilter.ts and marketRows.ts, copied
// from the console fork's dashboard/features/party/market-filter.ts
// (topic15/ponty-ron-buys); keep them in step.

/** One filter for the Market tabs and Ron's stock. Every bound is
 *  inclusive. A row without the field a bound tests fails that bound,
 *  except a missing level, which counts as +0 like an unupgraded item. */
enum class MarketSort(val id: String) { NEWEST("newest"), PRICE("price"), LEVEL("level") }

data class MarketFilter(
    val keywords: String = "",
    val minLevel: Double? = null,
    val maxLevel: Double? = null,
    val minPrice: Double? = null,
    val maxPrice: Double? = null,
    val minTier: Double? = null,
    val maxTier: Double? = null,
    /** Region and identifier as [realmName] joins them, such as "US II"; null keeps every realm. */
    val server: String? = null,
    val sort: MarketSort = MarketSort.NEWEST,
)

data class MarketRow(
    val name: String,
    val key: String,
    val level: Double? = null,
    val price: Double? = null,
    val tier: Double? = null,
    val firstSeenAt: Double? = null,
    val server: String? = null,
)

val EMPTY_MARKET_FILTER = MarketFilter()

private fun within(value: Double?, min: Double?, max: Double?): Boolean {
    if (min == null && max == null) return true
    if (value == null || !value.isFinite()) return false
    return (min == null || value >= min) && (max == null || value <= max)
}

fun passesMarketFilter(row: MarketRow, filter: MarketFilter): Boolean {
    val text = (row.name + " " + row.key).lowercase()
    val words = filter.keywords.lowercase().split(Regex("\\s+")).filter { it.isNotEmpty() }
    return words.all { text.contains(it) } &&
        within(row.level ?: 0.0, filter.minLevel, filter.maxLevel) &&
        within(row.price, filter.minPrice, filter.maxPrice) &&
        within(row.tier, filter.minTier, filter.maxTier) &&
        (filter.server == null || row.server == filter.server)
}

private val SORTS: Map<MarketSort, Comparator<MarketRow>> = mapOf(
    MarketSort.NEWEST to compareByDescending { it.firstSeenAt ?: Double.NEGATIVE_INFINITY },
    MarketSort.PRICE to compareBy { it.price ?: Double.POSITIVE_INFINITY },
    MarketSort.LEVEL to compareByDescending { it.level ?: 0.0 },
)

/** Filters and sorts; rows that tie keep their input order. */
fun <T> filterMarket(entries: List<T>, filter: MarketFilter, row: (T) -> MarketRow): List<T> {
    val sort = SORTS.getValue(filter.sort)
    return entries.map { it to row(it) }.filter { passesMarketFilter(it.second, filter) }.sortedWith { a, b -> sort.compare(a.second, b.second) }.map { it.first }
}

private val BOUNDS: List<Pair<String, (MarketFilter, Double?) -> MarketFilter>> = listOf(
    "minLevel" to { f, v -> f.copy(minLevel = v) },
    "maxLevel" to { f, v -> f.copy(maxLevel = v) },
    "minPrice" to { f, v -> f.copy(minPrice = v) },
    "maxPrice" to { f, v -> f.copy(maxPrice = v) },
    "minTier" to { f, v -> f.copy(minTier = v) },
    "maxTier" to { f, v -> f.copy(maxTier = v) },
)

/** Reads a stored filter; a malformed field falls back to its default. */
fun parseMarketFilter(raw: String?): MarketFilter {
    val value = runCatching { raw?.let { Json.parseToJsonElement(it) } }.getOrElse { return EMPTY_MARKET_FILTER } as? JsonObject ?: return EMPTY_MARKET_FILTER
    var filter = EMPTY_MARKET_FILTER
    (value["keywords"] as? JsonPrimitive)?.takeIf { it.isString }?.let { filter = filter.copy(keywords = it.content) }
    for ((field, set) in BOUNDS) {
        val bound = (value[field] as? JsonPrimitive)?.takeIf { !it.isString && it !is JsonNull }?.doubleOrNull
        if (bound != null && bound.isFinite()) filter = set(filter, bound)
    }
    (value["server"] as? JsonPrimitive)?.takeIf { it.isString && it.content.isNotEmpty() }?.let { filter = filter.copy(server = it.content) }
    when ((value["sort"] as? JsonPrimitive)?.takeIf { it.isString }?.content) {
        "price" -> filter = filter.copy(sort = MarketSort.PRICE)
        "level" -> filter = filter.copy(sort = MarketSort.LEVEL)
    }
    return filter
}

/** The stored form [parseMarketFilter] reads back. */
fun marketFilterJson(filter: MarketFilter): String {
    fun number(value: Double?): JsonElement = value?.let { if (it == Math.floor(it) && it.isFinite()) JsonPrimitive(it.toLong()) else JsonPrimitive(it) } ?: JsonNull
    return JsonObject(
        mapOf(
            "keywords" to JsonPrimitive(filter.keywords),
            "minLevel" to number(filter.minLevel), "maxLevel" to number(filter.maxLevel),
            "minPrice" to number(filter.minPrice), "maxPrice" to number(filter.maxPrice),
            "minTier" to number(filter.minTier), "maxTier" to number(filter.maxTier),
            "server" to (filter.server?.let { JsonPrimitive(it) } ?: JsonNull),
            "sort" to JsonPrimitive(filter.sort.id),
        ),
    ).toString()
}

/** A realm's display name, such as "US II"; null unless both parts are present. */
fun realmName(region: String?, identifier: String?): String? =
    if (!region.isNullOrEmpty() && !identifier.isNullOrEmpty()) "$region $identifier" else null

/** The realms present in a tab's rows, each once and sorted, for the server choice. */
fun serverOptions(servers: List<String?>): List<String> = servers.filterNotNull().filter { it.isNotEmpty() }.toSortedSet().toList()

/** The newest firstSeenAt the coordinator stamped on any of the entries. */
fun latestSeen(times: List<Double?>): Double? = times.filterNotNull().maxOrNull()

/** A raw listing's firstSeenAt, when it is a number. */
fun firstSeenAt(raw: JsonObject?): Double? = (raw?.get("firstSeenAt") as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull

/** The filter's view of a listing: display name, key, level, unit price and tier from G.items. */
fun marketRowFor(entry: CatalogItem?, name: String, level: Int?, price: Double?, firstSeenAt: Double?, server: String? = null): MarketRow {
    val tier = (entry?.meta?.definition?.get("tier") as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull
    return MarketRow(
        name = entry?.name?.ifEmpty { null } ?: name,
        key = name,
        level = (level ?: 0).toDouble(),
        price = price,
        tier = tier,
        firstSeenAt = firstSeenAt,
        server = server,
    )
}
