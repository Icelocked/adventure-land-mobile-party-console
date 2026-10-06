package com.partyconsole.companion.notify

import android.app.Application
import android.app.NotificationManager
import android.content.Context
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import androidx.test.core.app.ApplicationProvider
import com.partyconsole.companion.network.PartyApiClient
import com.partyconsole.companion.network.buildHttpClient
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.account.NotificationsSection
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

/** Detection cases shared with web/src/lib/notifierDetect.test.ts, plus the
 *  phone's own poll loop. */
@RunWith(RobolectricTestRunner::class)
class NotifierTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()
    private val context: Context = ApplicationProvider.getApplicationContext()

    @After fun stop() = console.close()

    private fun obj(text: String) = Json.parseToJsonElement(text).jsonObject
    private fun list(text: String) = Json.parseToJsonElement(text) as kotlinx.serialization.json.JsonArray

    private val now = 1_000_000_000L
    private val core = obj(
        """{"activeSlots":[{"character":"Leada"},{"character":"Folla"},{"character":"Bankboi0"},{"character":null}],
            "bankbois":[{"name":"Bankboi0"}],
            "characterDetails":{"Leada":{"seenAt":${now - 5_000}},"Folla":{"seenAt":${now - 180_000}},"Bankboi0":{"seenAt":1}},
            "characterConnections":[]}""",
    )

    @Test
    fun characterHealthMatchesTheNotifier() {
        assertEquals(listOf("Leada", "Folla"), liveCharacters(core))
        assertEquals(mapOf("Folla" to "No update for 3 min — may be hung"), characterProblems(core, now, 120_000))
        val lost = JsonObject(core + ("characterConnections" to list("""[{"name":"Leada","status":"lost"},{"name":"Folla","status":"stopped"}]""")))
        assertEquals(mapOf("Leada" to "Connection lost", "Folla" to "CODE stopped"), characterProblems(lost, now, 120_000))

        assertEquals(listOf(ProblemEvent("Folla", "No update for 2 min — may be hung")), problemTransitions(emptyMap(), mapOf("Folla" to "No update for 2 min — may be hung")))
        assertEquals(emptyList<ProblemEvent>(), problemTransitions(mapOf("Folla" to "No update for 2 min — may be hung"), mapOf("Folla" to "No update for 3 min — may be hung")))
        assertEquals(listOf(ProblemEvent("Folla", "Connection lost")), problemTransitions(mapOf("Folla" to "No update for 3 min — may be hung"), mapOf("Folla" to "Connection lost")))
        assertEquals(listOf(ProblemEvent("Folla", null)), problemTransitions(mapOf("Folla" to "Connection lost"), emptyMap()))

        val times = errorTimes(
            obj("""{"Leada":[{"at":${now - 60_000},"message":"Route rejected"},{"at":${now - 50_000},"message":"Killed a goo"},{"at":${now - 40_000},"message":"Upgrade failed: no scroll"},{"at":${now - 35_000},"message":"Item upgrade failed"},{"at":${now - 33_000},"message":"Item combination failed"}]}"""),
            list("""[{"at":${now - 30_000},"message":"Exchange failed","level":"error"}]"""),
            "Merchy",
        )
        assertEquals(mapOf("Leada" to listOf(now - 60_000, now - 40_000), "Merchy" to listOf(now - 30_000)), times)
        assertEquals(mapOf("Leada" to 2), bursts(times, now, 2, 600_000))
        assertEquals(emptyMap<String, Int>(), bursts(times, now, 2, 600_000, mapOf("Leada" to now - 35_000)))

        val deaths = deathTimes(obj("""{"Folla":[{"at":${now - 100_000},"type":"death"},{"at":${now - 50_000},"type":"kill"},{"at":${now - 10_000},"type":"death"},{"at":${now - 5_000_000},"type":"death"}]}"""))
        assertEquals(mapOf("Folla" to 2), bursts(deaths, now, 2, 30 * 60_000))
        assertEquals(emptyMap<String, Int>(), bursts(deaths, now, 3, 30 * 60_000))

        val before = activityTimes(emptyMap(), obj("""{"Leada":[{"at":${now - 400_000}}]}"""), null, mapOf("Leada" to Position("main", 0.0, 0.0), "Merchy" to Position("main", 0.0, 0.0)), emptyMap(), now - 400_000)
        assertEquals(mapOf("Leada" to now - 400_000, "Merchy" to now - 400_000), before)
        val still = activityTimes(before, null, null, mapOf("Leada" to Position("main", 1.0, 1.0)), mapOf("Leada" to Position("main", 0.0, 0.0)), now)
        assertEquals(listOf("Leada"), idleCharacters(still, listOf("Leada", "Merchy"), "Merchy", now, 300_000))
        val moved = activityTimes(before, null, null, mapOf("Leada" to Position("main", 40.0, 0.0)), mapOf("Leada" to Position("main", 0.0, 0.0)), now)
        assertEquals(emptyList<String>(), idleCharacters(moved, listOf("Leada"), "Merchy", now, 300_000))
    }

    @Test
    fun storageProgressLootAndTradingMatchTheNotifier() {
        val inventory = obj("""{"Leada":{"items":[{"slot":0},{"slot":1},null]},"Folla":{"items":[{"slot":0},{"slot":1},{"slot":2}]},"Merchy":{"items":[{"slot":0},{"slot":1},null,null]}}""")
        assertEquals(listOf("Folla", "Merchy"), fullInventories(inventory, obj("""{"Merchy":{"inventorySize":2}}"""), listOf("Leada", "Folla", "Merchy", "Gone")))
        assertEquals(listOf("Merchy"), newlyAdded(listOf("Folla"), listOf("Folla", "Merchy")))
        assertEquals(emptyList<String>(), newlyAdded(listOf("Folla", "Merchy"), listOf("Folla")))
        assertNull(bankFreeSlots(null))
        assertNull(bankFreeSlots(obj("""{"packs":{}}""")))
        assertEquals(2, bankFreeSlots(obj("""{"packs":{"items0":[{"slot":0},null],"items1":[null]}}""")))
        assertEquals(0, bankFreeSlots(obj("""{"packs":{"items0":[{"slot":0},{"slot":1}]}}""")))

        val before = obj("""{"autoUpgradeMarks":{"Merchy":{"bow@+0":{"tiers":9,"quantity":1}}},"autoCompounds":{"Merchy":[{"name":"ringsj","targetTier":3,"quantity":2}]}}""")
        val after = obj("""{"autoUpgradeMarks":{"Merchy":{"bow@+0":{"tiers":9,"quantity":0}}},"autoCompounds":{"Merchy":[{"name":"ringsj","targetTier":3,"quantity":0}]}}""")
        assertEquals(listOf("bow reached +9", "ringsj reached +3"), completedRules(before, after).map { it.body })
        assertEquals(emptyList<Done>(), completedRules(after, after))

        val queue = list("""[{"id":"j1","order":{"buys":[{"id":"bow","quantity":1,"level":9},{"id":"hpot0","quantity":5}]}}]""").map { it.jsonObject }
        assertEquals(emptyList<Done>(), finishedUpgradeOrders(queue, queue))
        assertEquals(listOf(Done("Buy-and-upgrade order finished", "1 × bow to +9")), finishedUpgradeOrders(queue, emptyList()))
        // Failure mode: the order the merchant starts moves to merchantCurrent
        // and was announced as finished while it was still running.
        val job = """{"id":"j1","order":{"buys":[{"id":"staff","quantity":1,"level":9}]}}"""
        val waiting = trackedOrders(obj("""{"merchantQueue":[$job],"merchantCurrent":null}"""))
        assertEquals(emptyList<Done>(), finishedUpgradeOrders(waiting, trackedOrders(obj("""{"merchantQueue":[],"merchantCurrent":$job}"""))))
        assertEquals(1, finishedUpgradeOrders(waiting, trackedOrders(obj("""{"merchantQueue":[],"merchantCurrent":null}"""))).size)

        val selected = selectedEventIds(obj("""{"eventSelectionsByCharacter":{"Leada":["goobrawl"]}}"""))
        assertEquals(setOf("goobrawl"), selected)
        assertEquals(
            listOf(ScheduleSeen("goobrawl", "Goo Brawl", true)),
            endedEvents(listOf(ScheduleSeen("goobrawl", "Goo Brawl", true), ScheduleSeen("franky", null, true)), listOf(obj("""{"id":"goobrawl","live":false}""")), selected),
        )

        val index = rareIndex(list(
            """[{"id":"ring","name":"Ring","meta":{"definition":{"g":5000000},"world":{"drops":[{"rate":0.00001},{"rate":0.00002}]}}},
                {"id":"goo","name":"Goo Ball","meta":{"definition":{"g":10},"world":{"drops":[{"rate":0.5}]}}},
                {"id":"gem","name":"Gem","meta":{"definition":{"g":2000000},"world":{"drops":[]}}}]""",
        ))
        assertEquals(RareInfo("Ring", 5_000_000.0, 0.00002), index["ring"])
        val chance = RareRule("chance", 10_000, 1_000_000)
        assertTrue(isRareDrop(index["ring"], chance))
        assertFalse(isRareDrop(index["goo"], chance))
        assertFalse(isRareDrop(index["gem"], chance))
        assertTrue(isRareDrop(index["gem"], chance.copy(mode = "value")))
        assertFalse(isRareDrop(index["gem"], chance.copy(mode = "both")))
        assertTrue(isRareDrop(index["ring"], chance.copy(mode = "both")))

        assertEquals("Stand sale", tradeNotice(obj("""{"at":1,"message":"Sold 2 × hpot0 at stand (+1,000 gold)","level":"success"}"""))?.title)
        assertEquals("WTB order filled", tradeNotice(obj("""{"at":1,"message":"WTB filled for 1 × bow; order complete","level":"success"}"""))?.title)
        assertEquals("Purchase completed", tradeNotice(obj("""{"at":1,"message":"Bought 1 × ring from Ponty","level":"success"}"""))?.title)
        assertNull(tradeNotice(obj("""{"at":1,"message":"Banked 12 items","level":"info"}""")))
        assertNull(tradeNotice(obj("""{"at":1,"message":"Skipped unavailable Ponty listing: bow","level":"error"}""")))
        // Failure mode: the merchant's automatic NPC selling sent a "Sale completed" burst.
        assertNull(tradeNotice(obj("""{"at":1,"message":"Sold 3 × hpamulet to NPC for 1,200 gold","level":"success"}""")))
        val sales = (1..5).map { Done("Stand sale", "Sold $it × bow at stand") }
        assertNull(tradeDigest(emptyList()))
        assertEquals(sales[0], tradeDigest(sales.take(1)))
        assertEquals(Done("5 trades", "Sold 1 × bow at stand\nSold 2 × bow at stand\nSold 3 × bow at stand\n…and 2 more"), tradeDigest(sales))
        val errorLogs = obj("""{"Merchy":[{"at":1,"message":"Route rejected"},{"at":3,"message":"Item upgrade failed"},{"at":2,"message":"Movement failed: blocked"}]}""")
        assertEquals("Movement failed: blocked", latestError(errorLogs, emptyList(), "Merchy", "Merchy"))
        assertEquals("Exchange failed", latestError(errorLogs, list("""[{"at":4,"message":"Exchange failed","level":"error"}]"""), "Merchy", "Merchy"))
        assertEquals("", latestError(errorLogs, emptyList(), "Merchy", "Folla"))
        // An upgrade that destroyed the item is an expected outcome, not an error.
        assertEquals(emptyMap<String, List<Long>>(), errorTimes(obj("{}"), list("""[{"at":9,"message":"wshoes upgrade failed","level":"error","details":"wshoes was destroyed"}]"""), "Merchy"))
        assertEquals(mapOf("Merchy" to listOf(9L)), errorTimes(obj("{}"), list("""[{"at":9,"message":"wshoes upgrade failed","level":"error","details":"upgrade rejected: busy"}]"""), "Merchy"))

        assertEquals(listOf(5.0, 9.0), newEntries(list("""[{"at":5},{"at":3},{"at":9}]""").map { it.jsonObject }, 4).map { it["at"].num() })
        assertEquals(listOf("b"), newMail(list("""[{"id":"a"},{"id":"b"}]""").map { it.jsonObject }, setOf("a")).map { it["id"].str() })
    }

    @Test
    fun limitsClampAndQuietHoursSilenceAllButCharacterHealth() {
        val merged = mergeLimits(NotifierLimits(), NotifierLimits(idleMinutes = 10, errors = Burst(0, 15), rare = RareRule("both", 10_000, 250_000)))
        assertEquals(10, merged.idleMinutes)
        assertEquals(Burst(5, 15), merged.errors)
        assertEquals(RareRule("both", 10_000, 250_000), merged.rare)

        val quiet = QuietHours("22:00", "07:00")
        assertTrue(inQuietHours(quiet, 23 * 60))
        assertFalse(inQuietHours(quiet, 8 * 60))
        val night = 23 * 60
        val first = DevicePrefs(listOf("stuck", "trading"), quiet, emptyList())
        val second = DevicePrefs(listOf("stuck"), null, listOf("Folla"))
        assertTrue(wanted(first, "stuck", "Folla", night))
        assertFalse(wanted(second, "stuck", "Folla", night))
        assertFalse(wanted(first, "trading", null, night))
        assertTrue(wanted(second, "stuck", "Leada", night))

        assertEquals("characters/Leada", routeFor("/characters/Leada"))
        assertEquals("account/bank", routeFor("/bank"))
        assertEquals("account/mail", routeFor("/mail"))
        assertNull(routeFor("/"))
    }

    private fun notifier(store: NotifierStore, delivered: MutableList<Notice>, minutes: Int = 12 * 60) =
        Notifier(PartyApiClient(buildHttpClient(console.settings), console.settings), store, { delivered += it }, { minutes })

    private fun section(name: String, patch: String) = console.override(name, obj(patch).mapValues { it.value as JsonElement })

    @Test
    fun pollingAlertsOncePerProblemFullBagFullBankAndNewMail() = runBlocking {
        val store = NotifierStore(context).apply { watch = WatchState(); device = DevicePrefs() }
        val delivered = mutableListOf<Notice>()
        val serverNow = System.currentTimeMillis()
        section("core", """{"serverNow":$serverNow,"activeSlots":[{"character":"Leada"}],"bankbois":[],"characterDetails":{"Leada":{"seenAt":$serverNow}},"characterConnections":[]}""")
        section("fast", """{"characters":{"Leada":{"map":"main","x":0,"y":0,"inventorySize":2}}}""")
        section("inventory", """{"characters":{"Leada":{"items":[{"name":"hpot0"},null]}}}""")
        section("bank", """{"bank":{"packs":{"items0":[{"name":"hpot0"},null]}}}""")
        console.gets["/party-api/mail"] = """{"messages":[{"id":"m1","from":"Old","subject":"Seen"}]}"""

        assertTrue(notifier(store, delivered).poll(1))
        assertTrue(notifier(store, delivered).poll(2))
        assertTrue(notifier(store, delivered).poll(4))
        assertEquals(emptyList<Notice>(), delivered) // first reads only mark where history ends

        section("core", """{"characterConnections":[{"name":"Leada","status":"lost"}]}""")
        section("inventory", """{"characters":{"Leada":{"items":[{"name":"hpot0"},{"name":"mpot0"}]}}}""")
        section("bank", """{"bank":{"packs":{"items0":[{"name":"hpot0"},{"name":"mpot0"}]}}}""")
        console.gets["/party-api/mail"] = """{"messages":[{"id":"m1","from":"Old","subject":"Seen"},{"id":"m2","from":"Ryan","subject":"Hi"}]}"""
        assertTrue(notifier(store, delivered).poll(8))
        assertEquals(
            listOf("Leada: Connection lost", "Leada: inventory full", "Bank full", "Mail from Ryan"),
            delivered.map { it.title },
        )
        assertEquals("/characters/Leada", delivered[1].url)

        // The same state again: nothing new to say.
        delivered.clear()
        assertTrue(notifier(store, delivered).poll(12))
        assertEquals(emptyList<Notice>(), delivered)

        // Quiet hours hold back mail but not character health.
        store.device = DevicePrefs(quiet = QuietHours("22:00", "07:00"))
        section("core", """{"characterConnections":[]}""")
        console.gets["/party-api/mail"] = """{"messages":[{"id":"m3","from":"Ryan","subject":"Again"}]}"""
        assertTrue(notifier(store, delivered, minutes = 23 * 60).poll(16))
        assertEquals(listOf("Leada is reporting again"), delivered.map { it.title })
    }

    @Test
    fun settingsSectionEnablesAlertsAndSendsATestNotification() {
        shadowOf(context as Application).grantPermissions(android.Manifest.permission.POST_NOTIFICATIONS)
        val store = NotifierStore(context).apply { enabled = false; live = false; device = DevicePrefs(); limits = NotifierLimits() }
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { Column(Modifier.verticalScroll(rememberScrollState())) { NotificationsSection(viewModel) } }
        eventually { viewModel.characters.value.isNotEmpty() }
        compose.waitForIdle()
        compose.onNodeWithText("Off for this device.").performScrollTo().assertExists()
        compose.onNodeWithContentDescription("New mail").performScrollTo().performClick()
        compose.onNodeWithContentDescription("Stuck after minutes").performScrollTo().performTextReplacement("4")
        compose.onNodeWithText("Enable notifications on this device").performScrollTo().performClick()
        compose.onNodeWithText("On for this device.").performScrollTo().assertExists()
        assertTrue(store.enabled)
        assertEquals(4, store.limits.stuckMinutes)
        assertFalse("mail" in store.device.alerts)
        compose.onNodeWithContentDescription("Quiet hours").performScrollTo().performClick()
        assertEquals(QuietHours("22:00", "07:00"), store.device.quiet)
        compose.onNodeWithText("Send test notification").performScrollTo().performClick()
        compose.onNodeWithText("Test notification sent.").assertExists()
        val manager = context.getSystemService(NotificationManager::class.java)
        assertEquals("Party Console", shadowOf(manager).allNotifications.single().extras.getCharSequence("android.title").toString())
        compose.onNodeWithContentDescription("Live alerts").performScrollTo().performClick().assertIsOn()
        assertTrue(store.live)
    }
    @Test
    fun deathsDuringJoinedLiveEventsAreIgnored() {
        assertEquals(false, NotifierLimits().ignoreDeathsDuringEvents)
        assertEquals(true, mergeLimits(NotifierLimits(), NotifierLimits(ignoreDeathsDuringEvents = true)).ignoreDeathsDuringEvents)
        val joined = joinedEvents(obj("""{"eventSelectionsByCharacter":{"Tank":["crabxx"],"Healer":["anniversary"]},"eventsByCharacter":{"Mage":true}}"""))
        assertTrue("crabxx" in joined.getValue("Mage"))
        val live = listOf(obj("""{"id":"crabxx","live":true}"""), obj("""{"id":"franky","live":false}"""))
        var spans = eventSpans(emptyMap(), live, 100_000, 15_000)
        assertEquals(mapOf("crabxx" to listOf(EventSpan(85_000, 100_000))), spans)
        spans = eventSpans(spans, live, 200_000, 100_000)
        assertEquals(listOf(EventSpan(85_000, 200_000)), spans.getValue("crabxx"))
        // A background gap longer than the check interval still extends the same run.
        spans = eventSpans(spans, live, 200_000 + 15 * 60_000L, 15 * 60_000L)
        assertEquals(1, spans.getValue("crabxx").size)
        val end = 200_000 + 15 * 60_000L
        val times = mapOf("Tank" to listOf(10_000L, 150_000L, end + 120_000), "Healer" to listOf(150_000L), "Mage" to listOf(150_000L), "Rogue" to listOf(150_000L))
        assertEquals(
            mapOf("Tank" to listOf(10_000L, end + 120_000), "Healer" to listOf(150_000L), "Mage" to emptyList(), "Rogue" to listOf(150_000L)),
            deathsOutsideEvents(times, spans, joined, 60_000),
        )
        assertTrue(eventSpans(spans, emptyList(), end + 86_400_001, 15_000).isEmpty())
    }
}
