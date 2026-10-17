package com.partyconsole.companion.ui

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.testing.field
import com.partyconsole.companion.ui.account.SettingsScreen
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Console 1.4 realm panel (web/e2e/realm-chase.spec.ts): home-change
 *  wording, mixed homes, boss chase and the realm hop blacklist.
 *
 *  Failure modes:
 *  - Mixed or unconfirmed homes show no per-character warning.
 *  - The current realm can't become home when it isn't everyone's home
 *    yet, or the realm that is already current and home stays pickable.
 *  - A home change keeps the plain switch wording and hides the
 *    account-wide and 36-hour cooldown warnings.
 *  - A running home change hides which characters confirmed the new home.
 *  - Boss chase posts the toggle and the minimum ETA together, or saves an
 *    unchanged or blank ETA.
 *  - A refused ETA hides the server's message.
 *  - The trip, sightings or respawns show while the chase is off, or the
 *    ETA reads in the wrong unit.
 *  - The hop blacklist posts one realm instead of the whole list, lets PVP
 *    realms be unticked, or keeps a refused change ticked.
 *  - Without a realm list the chase settings disappear instead of waiting.
 */
@RunWith(RobolectricTestRunner::class)
class RealmChaseTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun posts(path: String) = console.requests.filter { it.method == "POST" && it.path == "/party-api/$path" }.map { Json.parseToJsonElement(it.body).jsonObject }
    private fun json(text: String): JsonElement = Json.parseToJsonElement(text)
    private val inChase = hasAnyAncestor(hasContentDescription("Event boss realm chase"))
    private val inBlacklist = hasAnyAncestor(hasContentDescription("Realm hopping blacklist"))
    private fun hasValue(value: String) = SemanticsMatcher.expectValue(SemanticsProperties.EditableText, androidx.compose.ui.text.AnnotatedString(value))
    private val time = Regex("""\d{1,2}:\d{2}([\s ][AP]M)?""")

    private fun realms(extra: String = "") = json(
        """{"activeRealm":"SR_USI","currentRealm":"SR_USI","homeRealm":"SR_USI","homeCharacters":[{"name":"Leada","home":"SR_USI"},{"name":"Merchy","home":"SR_USI"}],"split":false,"characters":[],
           "realms":[{"key":"SR_USI","label":"US I","players":80,"pvp":false},{"key":"SR_EUII","label":"EU II","players":40,"pvp":false},{"key":"SR_USPVP","label":"US PVP","players":9,"pvp":true}]$extra}""",
    ).jsonObject

    private fun show(control: JsonElement? = realms()) {
        console.override("core", mapOf("realmControl" to (control ?: JsonNull)))
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { SettingsScreen(viewModel, onBack = {}) }
        eventually { viewModel.stateLoaded.value }
        compose.waitForIdle()
    }

    @Test
    fun mixedHomesWarnPerCharacterAndTheCurrentRealmCanBecomeHome() {
        show(JsonObject(realms() + ("homeRealm" to JsonNull) + ("homeCharacters" to json("""[{"name":"Leada","home":"SR_USI"},{"name":"Merchy","home":null}]"""))))
        compose.onNodeWithText("Current: US I · Home: Unknown").assertExists()
        compose.onNodeWithText("Home realms differ or are unconfirmed:").assertExists()
        compose.onNodeWithText("Leada: SR_USI").assertExists()
        compose.onNodeWithText("Merchy: unconfirmed").assertExists()

        compose.onNodeWithText("Change realm…").performScrollTo().performClick()
        // The party is already on US I, but it is not everyone's home yet.
        compose.onNodeWithText("US I (80 players)").performScrollTo().assertIsEnabled().performClick()
        compose.onNodeWithText("Switch realm?").assertExists()
        compose.onNode(hasText("one non-merchant will visit Bean", substring = true)).assertDoesNotExist()
        compose.onNode(hasContentDescription("Set as home realm")).performScrollTo().performClick()
        compose.onNodeWithText("Change home realm?").assertExists()
        compose.onNodeWithText("This will change for all characters in the account including characters not currently logged in.").assertExists()
        compose.onNode(hasText("Adventure Land enforces a 36-hour home-change cooldown per character.", substring = true)).assertExists()
        compose.onNodeWithText("Change home realm").performScrollTo().performClick()
        eventually { posts("realm/switch").isNotEmpty() }
        assertEquals(json("""{"realm":"SR_USI","setHome":true}"""), posts("realm/switch")[0])
    }

    @Test
    fun aHomeChangeShowsEachConfirmationAndTheCurrentHomeCannotBePicked() {
        show(JsonObject(realms() + ("operation" to json(
            """{"id":"op-1","phase":"setting-home","realm":"SR_EUII","setHome":true,"startedAt":1,"characters":[{"name":"Leada","ctype":"warrior","realm":"SR_EUII","online":true,"homeConfirmed":true},{"name":"Merchy","ctype":"merchant","realm":"SR_EUII","online":true}]}""",
        ))))
        compose.onNodeWithText("Home realms differ or are unconfirmed:").assertDoesNotExist()
        compose.onNodeWithText("Setting home").assertExists()
        compose.onNodeWithText("Leada: SR_EUII — home confirmed").assertExists()
        compose.onNodeWithText("Merchy: SR_EUII — waiting for home confirmation").assertExists()
    }

    @Test
    fun theRealmThatIsCurrentAndHomeCannotBePicked() {
        show()
        compose.onNodeWithText("Change realm…").performScrollTo().performClick()
        compose.onNodeWithText("US I (80 players)").performScrollTo().assertIsNotEnabled()
        compose.onNodeWithText("EU II (40 players)").assertIsEnabled()
    }

    @Test
    fun bossChaseSendsTheToggleAndTheMinimumEtaAndShowsTripSightingsAndRespawns() {
        val respawnAt = System.currentTimeMillis() + 40 * 60_000
        console.override("config", mapOf("bossChase" to json(
            """{"enabled":true,"minEtaMinutes":20,"checkedAt":${System.currentTimeMillis()},"trip":{"boss":"franky","realm":"SR_EUII","returnRealm":"SR_USI","arrived":true},
               "sightings":[{"boss":"icegolem","realm":"SR_EUII","hp":12345678,"etaMinutes":33.4,"target":"Leada"},{"boss":"crabxx","realm":"SR_USI","hp":900000,"etaMinutes":null,"target":null}],
               "respawns":[{"boss":"mrpumpkin","realm":"SR_USI","respawnAt":$respawnAt}],"lastError":"ALData unreachable"}""",
        )))
        show()
        compose.onNode(hasText("Franky · fighting on EU II · returns to US I") and inChase).performScrollTo().assertExists()
        compose.onNode(hasText("Ice Golem · EU II · Leada") and inChase).assertExists()
        compose.onNode(hasText("12.3M HP · ~33 min") and inChase).assertExists()
        compose.onNode(hasText("Giga Crab · US I") and inChase).assertExists()
        compose.onNode(hasText("0.9M HP · estimating…") and inChase).assertExists()
        compose.onNode(hasText("Mr. Pumpkin · US I") and inChase).assertExists()
        val respawn = compose.onNode(hasText("respawns ", substring = true) and inChase).fetchSemanticsNode().config[SemanticsProperties.Text].joinToString()
        assertTrue(respawn, Regex("^respawns ${time.pattern}$").matches(respawn))
        compose.onNode(hasText("ALData unreachable") and inChase).assertExists()

        val minEta = compose.onNode(hasContentDescription("Only hop if at least this many minutes remain"))
        compose.onNode(hasContentDescription("Only hop if at least this many minutes remain") and hasValue("20")).assertExists()
        val save = compose.onNode(hasText("Save") and inChase)
        save.performScrollTo().assertIsNotEnabled()
        minEta.performTextReplacement("30")
        save.performClick()
        eventually { posts("realm/boss-chase").isNotEmpty() }
        assertEquals(json("""{"minEtaMinutes":30}"""), posts("realm/boss-chase")[0])
        compose.waitUntil(5_000) { compose.onAllNodes(hasContentDescription("Only hop if at least this many minutes remain") and hasValue("30")).fetchSemanticsNodes().isNotEmpty() }

        minEta.performTextReplacement("700")
        save.performClick()
        eventually { posts("realm/boss-chase").size == 2 }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("minEtaMinutes must be between 0 and 600") and inChase).fetchSemanticsNodes().isNotEmpty() }

        val toggle = compose.onNode(hasContentDescription("Chase event bosses across realms"))
        toggle.assertIsSelected().performScrollTo().performClick()
        eventually { posts("realm/boss-chase").size == 3 }
        assertEquals(json("""{"enabled":false}"""), posts("realm/boss-chase")[2])
        compose.waitUntil(5_000) { runCatching { toggle.assertIsNotSelected() }.isSuccess }
        toggle.assertTextContains("Off")
        // Disabling ends the trip, and the sightings list only shows while enabled.
        compose.onNode(hasText("fighting on", substring = true)).assertDoesNotExist()
        compose.onNode(hasText("Ice Golem · EU II · Leada")).assertDoesNotExist()
    }

    @Test
    fun enablingBossChaseWithNoDataWaitsForTheFirstCheck() {
        show()
        compose.onNode(hasContentDescription("Only hop if at least this many minutes remain") and hasValue("15")).performScrollTo().assertExists()
        compose.onNode(hasContentDescription("Chase event bosses across realms")).performScrollTo().performClick()
        eventually { posts("realm/boss-chase").isNotEmpty() }
        assertEquals(json("""{"enabled":true}"""), posts("realm/boss-chase")[0])
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Waiting for the first check…")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNode(hasText("Predict scheduled events across realms")).assertDoesNotExist()
    }

    @Test
    fun theHopBlacklistSendsTheWholeListAndAlwaysSkipsPvp() {
        show()
        val pvp = compose.onNode(hasContentDescription("Never hop to US PVP"))
        pvp.performScrollTo().assertIsOn().assertIsNotEnabled()
        compose.onNode(hasText("PVP · always skipped") and inBlacklist).assertExists()
        compose.onNode(hasText("80 players") and inBlacklist).assertExists()
        compose.onNode(hasText("Boss chase skips checked realms", substring = true) and inBlacklist).assertExists()

        val usi = compose.onNode(hasContentDescription("Never hop to US I"))
        val euii = compose.onNode(hasContentDescription("Never hop to EU II"))
        usi.performScrollTo().performClick()
        eventually { posts("realm/hop-blacklist").isNotEmpty() }
        assertEquals(json("""{"realms":["SR_USI"]}"""), posts("realm/hop-blacklist")[0])
        compose.waitUntil(5_000) { runCatching { usi.assertIsOn() }.isSuccess }
        euii.performClick()
        eventually { posts("realm/hop-blacklist").size == 2 }
        assertEquals(json("""{"realms":["SR_USI","SR_EUII"]}"""), posts("realm/hop-blacklist")[1])
        compose.waitUntil(5_000) { runCatching { euii.assertIsOn() }.isSuccess }
        usi.performClick()
        eventually { posts("realm/hop-blacklist").size == 3 }
        assertEquals(json("""{"realms":["SR_EUII"]}"""), posts("realm/hop-blacklist")[2])
        compose.waitUntil(5_000) { runCatching { usi.assertIsOff() }.isSuccess }
        assertEquals(json("""["SR_EUII"]"""), console.field("realmHopBlacklist"))

        console.failOnce["realm/hop-blacklist"] = 400 to """{"error":"unknown Adventure Land realm: SR_USI"}"""
        usi.performClick()
        eventually { posts("realm/hop-blacklist").size == 4 }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("unknown Adventure Land realm: SR_USI") and inBlacklist).fetchSemanticsNodes().isNotEmpty() }
        usi.assertIsOff()
    }

    @Test
    fun withoutARealmListTheChaseSettingsWaitForIt() {
        show(control = null)
        compose.onNode(hasText("Waiting for the realm list…") and inBlacklist).performScrollTo().assertExists()
    }
}
