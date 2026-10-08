package com.partyconsole.companion.data

import com.partyconsole.companion.network.LiveEvent
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** The data layer against the shared fixture sections; mirrors the PWA's
 *  data-layer and config-section specs. */
class PartyRepositoryTest {
    private lateinit var console: FakeConsole
    private lateinit var scope: CoroutineScope
    private val live = MutableSharedFlow<LiveEvent>(replay = 1)
    private val foreground = MutableStateFlow(true)

    @Before
    fun start() {
        console = FakeConsole()
        scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    }

    @After
    fun stop() {
        scope.cancel()
        console.close()
    }

    private fun repository() = PartyRepository(console.settings, scope, foreground, live)

    @Test
    fun readsEachSectionOnItsOwnAndMergesThem() {
        val repo = repository()
        // Each section lands on its own; wait for core's queue too, not only config, catalog and bank.
        eventually { repo.stateLoaded.value && repo.dynamicState.value.merchantCatalog != null && repo.dynamicState.value.bank != null && repo.dynamicState.value.merchantQueue.isNotEmpty() }
        val state = repo.dynamicState.value
        // config
        assertEquals("Merchy", state.merchantCharacter)
        assertEquals("Leada", state.leader)
        assertEquals(250_000L, state.threshold)
        assertEquals("hpot1", state.restockPolicies["Leada"]?.hp?.item)
        assertEquals(2, state.standListings.size)
        // core
        assertEquals(3, state.merchantQueue.size)
        // bank (with dashboard=1)
        assertEquals(5_000_000L, state.bank?.gold)
        // market laid over core's stripped aldata (the market section follows
        // the startup aldata/market read on the market's 10s cadence)
        eventually(12_000) { repo.dynamicState.value.aldata?.listings?.size == 1 }
        // catalog, decoded on its own
        assertTrue(state.merchantCatalog!!.allItems.any { it.id == "bow" })
        assertEquals(listOf("goo", "bat", "tinyp"), state.monsterChoices.map { it.id })
        // core's characterDetails, typed, with presence
        val leada = repo.characterDetails.value.getValue("Leada")
        assertTrue(leada.online(now = leada.seenAt!! + 9_000))
        assertFalse(leada.online(now = leada.seenAt!! + 11_000))
        assertEquals("warrior", repo.characterDetails.value.getValue("Leada").ctype)
        // roster from config, ctype from the core summaries
        assertEquals("merchant", repo.roster.value["Merchy"]?.ctype)

        // Every state request names its section and asks for the dashboard shape.
        val stateGets = console.requests.filter { it.path.startsWith("/party-api/state") }
        assertTrue(stateGets.all { it.path.contains("section=") })
        assertTrue(console.sectionRequests("bank").all { it.path.contains("dashboard=1") })
        // The catalog is requested without catalog=0.
        assertTrue(console.sectionRequests("catalog").all { !it.path.contains("catalog=0") })
    }

    @Test
    fun catalogIsRefetchedOnlyWhenTheReferenceRevisionChanges() {
        val repo = repository()
        eventually { repo.dynamicState.value.merchantCatalog != null }
        Thread.sleep(4_500) // two more core polls
        assertEquals(1, console.sectionRequests("catalog").size)
        console.override("core", mapOf("referenceRevision" to JsonPrimitive("next")))
        eventually { console.sectionRequests("catalog").size == 2 }
    }

    @Test
    fun anActionRefreshesTheDomainsItTouched() {
        val repo = repository()
        eventually { repo.stateLoaded.value }
        val bankBefore = console.sectionRequests("bank").size
        val marketBefore = console.sectionRequests("market").size
        runBlocking { repo.api.post("merchant/stand", JsonObject(emptyMap())) }
        eventually { console.sectionRequests("bank").size > bankBefore && console.sectionRequests("market").size > marketBefore }
    }

    @Test
    fun aRedirectToSetupMeansTheSessionWasLost() {
        val repo = repository()
        eventually { repo.stateLoaded.value }
        assertFalse(repo.sessionLost.value)
        console.unpaired = true
        eventually { repo.sessionLost.value }
        console.unpaired = false
        eventually { !repo.sessionLost.value }
    }

    @Test
    fun aMalformedSectionDoesNotStopPolling() {
        val repo = repository()
        eventually { repo.stateLoaded.value }
        console.override("core", mapOf("merchantQueue" to JsonPrimitive("not a list")))
        val before = console.sectionRequests("core").size
        eventually { console.sectionRequests("core").size > before + 1 }
        // Only the field that changed shape is skipped (here it keeps its
        // last good value); everything else keeps updating.
        assertEquals(3, repo.dynamicState.value.merchantQueue.size)
        console.override("config", mapOf("threshold" to JsonPrimitive(1234)))
        runBlocking { repo.refreshDynamicStateNow() }
        assertEquals(1234L, repo.dynamicState.value.threshold)
    }

    @Test
    fun pollingPausesInTheBackground() {
        val repo = repository()
        eventually { repo.stateLoaded.value }
        foreground.value = false
        Thread.sleep(300)
        val paused = console.sectionRequests("core").size
        Thread.sleep(2_500)
        assertEquals(paused, console.sectionRequests("core").size)
        foreground.value = true
        eventually(1_000) { console.sectionRequests("core").size > paused }
    }

    @Test
    fun whileTheStreamIsDownFastAndInventoryStandIn() {
        val repo = repository()
        runBlocking { live.emit(LiveEvent.ConnectionHealth(false, "stream down")) }
        eventually { repo.characters.value["Leada"]?.let { it.inventory?.items?.size == 3 && it.vitals != null } == true }
        val leada = repo.characters.value.getValue("Leada")
        assertEquals("hpot0", leada.inventory?.items?.get(0)?.item?.name)
        assertEquals(12_000L, leada.vitals?.gold)
    }

    @Test
    fun actionDomainsFollowQueryActions() {
        assertEquals(listOf(Domain.CORE, Domain.CONFIG), affectedDomains("/formation", null))
        assertEquals(6, affectedDomains("/command", JsonObject(mapOf("type" to JsonPrimitive("withdraw")))).size)
        assertEquals(listOf(Domain.CORE, Domain.CONFIG), affectedDomains("/command", JsonObject(mapOf("type" to JsonPrimitive("character-travel")))))
        assertEquals(listOf(Domain.LOGS), affectedDomains("/combat-log/Leada/clear", null))
        assertEquals(listOf(Domain.CORE, Domain.CONFIG), affectedDomains("/something/new", null))
    }
}
