package com.partyconsole.companion.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The PWA's marketFilter.test.ts, copied from the console fork's
 *  scripts/tests/market-filter.test.cjs (topic15/ponty-ron-buys).
 *
 *  Failure modes:
 *  - A bound is exclusive, or a missing field passes a bound that tests it.
 *  - The newest sort puts a row without a first-seen time first.
 *  - A stored filter with a malformed field keeps the bad value.
 */
class MarketFilterTest {
    private fun row(level: Double? = 1.0, price: Double? = 5000.0, tier: Double? = 2.0, firstSeenAt: Double? = 100.0, server: String? = null, key: String = "stramulet") =
        MarketRow(name = "Amulet of Strength", key = key, level = level, price = price, tier = tier, firstSeenAt = firstSeenAt, server = server)
    private fun pass(filter: MarketFilter, entry: MarketRow = row()) = passesMarketFilter(entry, filter)

    @Test
    fun anEmptyFilterPassesEveryRowIncludingRowsWithMissingFields() {
        assertTrue(pass(EMPTY_MARKET_FILTER))
        assertTrue(pass(EMPTY_MARKET_FILTER, MarketRow(name = "Coat", key = "coat")))
    }

    @Test
    fun levelBoundsAreInclusiveAndAMissingLevelCountsAsZero() {
        assertTrue(pass(MarketFilter(minLevel = 1.0))); assertFalse(pass(MarketFilter(minLevel = 2.0)))
        assertTrue(pass(MarketFilter(maxLevel = 1.0))); assertFalse(pass(MarketFilter(maxLevel = 0.0)))
        assertTrue(pass(MarketFilter(maxLevel = 0.0), row(level = null)))
        assertFalse(pass(MarketFilter(minLevel = 1.0), row(level = null)))
    }

    @Test
    fun priceBoundsAreInclusiveAndARowWithoutAPricePassesOnlyWithoutAPriceBound() {
        assertTrue(pass(MarketFilter(maxPrice = 5000.0))); assertFalse(pass(MarketFilter(maxPrice = 4999.0)))
        assertTrue(pass(MarketFilter(minPrice = 5000.0))); assertFalse(pass(MarketFilter(minPrice = 5001.0)))
        assertFalse(pass(MarketFilter(maxPrice = 10.0), row(price = null)))
        assertTrue(pass(EMPTY_MARKET_FILTER, row(price = null)))
    }

    @Test
    fun everyKeywordMustMatchTheDisplayNameOrItemKeyIgnoringCase() {
        assertTrue(pass(MarketFilter(keywords = "amulet STR")))
        assertTrue(pass(MarketFilter(keywords = "stramulet")))
        assertFalse(pass(MarketFilter(keywords = "amulet int")))
        assertTrue(pass(MarketFilter(keywords = "   ")))
    }

    @Test
    fun tierBoundsAreInclusiveAndAnItemWithoutATierPassesOnlyWithoutATierBound() {
        assertTrue(pass(MarketFilter(minTier = 2.0))); assertFalse(pass(MarketFilter(minTier = 3.0)))
        assertTrue(pass(MarketFilter(maxTier = 2.0))); assertFalse(pass(MarketFilter(maxTier = 1.0)))
        assertFalse(pass(MarketFilter(maxTier = 5.0), row(tier = null)))
        assertTrue(pass(MarketFilter(keywords = "amulet"), row(tier = null)))
    }

    @Test
    fun boundsCombineAndTheSortIsNewestFirstByDefault() {
        val rows = listOf(
            row(key = "a", level = 0.0, price = 300.0, firstSeenAt = 10.0), row(key = "b", level = 3.0, price = 100.0, firstSeenAt = 30.0),
            row(key = "c", level = 1.0, price = 200.0, firstSeenAt = null), row(key = "d", level = 2.0, price = 900.0, firstSeenAt = 20.0),
        )
        fun keys(filter: MarketFilter) = filterMarket(rows, filter) { it }.map { it.key }
        // A row with no first-seen time sorts last.
        assertEquals(listOf("b", "d", "a", "c"), keys(EMPTY_MARKET_FILTER))
        assertEquals(listOf("b", "c", "a", "d"), keys(MarketFilter(sort = MarketSort.PRICE)))
        assertEquals(listOf("b", "d", "c", "a"), keys(MarketFilter(sort = MarketSort.LEVEL)))
        assertEquals(listOf("b", "c"), keys(MarketFilter(minLevel = 1.0, maxPrice = 500.0)))
    }

    @Test
    fun aStoredFilterParsesBackAndRejectsMalformedValues() {
        assertEquals(MarketFilter(minLevel = 2.0, sort = MarketSort.PRICE), parseMarketFilter(marketFilterJson(MarketFilter(minLevel = 2.0, sort = MarketSort.PRICE))))
        assertEquals(EMPTY_MARKET_FILTER, parseMarketFilter("""{"minLevel":"x","sort":"cheap","keywords":5}"""))
        assertEquals(EMPTY_MARKET_FILTER, parseMarketFilter("not json"))
        assertEquals(EMPTY_MARKET_FILTER, parseMarketFilter(null))
    }

    @Test
    fun aServerBoundKeepsOnlyThatRealm() {
        assertTrue(pass(MarketFilter(server = "US II"), row(server = "US II")))
        assertFalse(pass(MarketFilter(server = "EU I"), row(server = "US II")))
        assertFalse(pass(MarketFilter(server = "US II"), row(server = null)))
        assertTrue(pass(EMPTY_MARKET_FILTER, row(server = null)))
        // The server bound combines with the others.
        assertFalse(pass(MarketFilter(server = "US II", minLevel = 2.0), row(server = "US II")))
    }

    @Test
    fun serverChoicesListEachRealmOnceAndRealmNamesJoinRegionAndIdentifier() {
        assertEquals(listOf("EU I", "US II"), serverOptions(listOf("US II", "EU I", "US II", null)))
        assertEquals("US II", realmName("US", "II"))
        assertNull(realmName("US", null))
        assertNull(realmName(null, "II"))
        assertEquals(MarketFilter(server = "EU I"), parseMarketFilter("""{"server":"EU I"}"""))
        assertEquals(EMPTY_MARKET_FILTER, parseMarketFilter("""{"server":7}"""))
    }
}
