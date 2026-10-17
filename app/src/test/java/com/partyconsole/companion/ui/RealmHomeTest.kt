package com.partyconsole.companion.ui

import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.account.SettingsScreen
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Console 1.4 realm panel home changes (web/e2e/realm-chase.spec.ts):
 *  home-change wording and mixed homes.
 *
 *  Failure modes:
 *  - Mixed or unconfirmed homes show no per-character warning.
 *  - The current realm can't become home when it isn't everyone's home
 *    yet, or the realm that is already current and home stays pickable.
 *  - A home change keeps the plain switch wording and hides the
 *    account-wide and 36-hour cooldown warnings.
 *  - A running home change hides which characters confirmed the new home.
 */
@RunWith(RobolectricTestRunner::class)
class RealmHomeTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun posts(path: String) = console.requests.filter { it.method == "POST" && it.path == "/party-api/$path" }.map { Json.parseToJsonElement(it.body).jsonObject }
    private fun json(text: String): JsonElement = Json.parseToJsonElement(text)

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
}
