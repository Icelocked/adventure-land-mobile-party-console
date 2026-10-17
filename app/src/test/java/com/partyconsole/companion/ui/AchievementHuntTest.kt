package com.partyconsole.companion.ui

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isToggleable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextReplacement
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.account.HuntSettingsScreen
import com.partyconsole.companion.ui.characterdetail.CharacterDetailScreen
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Achievement Hunt (web/e2e/achievement-hunt.spec.ts) on the native
 *  farming screens. The console needs Achievement Hunt (upstream PR #131;
 *  Ryan's v1.4.0 has none).
 *
 *  Failure modes:
 *  - Monsters list in catalog order instead of weakest first, or bosses,
 *    rares and unroutable monsters land among the regular ones.
 *  - "Up to here" drops special picks or selects past the tapped row.
 *  - A setting or blacklist change posts without `character`, so the
 *    server edits the leader's scope.
 *  - A follower can edit the leader's settings, or sees its own.
 *  - An invalid death threshold reaches the server.
 *  - "Fill respawn waits" reads off when the console never saved it.
 *  - The Achievements mode, the status line or the settings block shows on
 *    a v1.4.0 console, even when a farming profile carries achievementHunt.
 *  - The status line is missing while the mode runs.
 */
@RunWith(RobolectricTestRunner::class)
class AchievementHuntTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun posts(path: String) = console.requests.filter { it.method == "POST" && it.path == "/party-api/$path" }.map { Json.parseToJsonElement(it.body).jsonObject }
    private fun json(text: String): JsonElement = Json.parseToJsonElement(text)
    private val inSection = hasAnyAncestor(hasContentDescription("Achievement Hunt settings"))
    private val scroller = SemanticsMatcher.keyIsDefined(SemanticsProperties.VerticalScrollAxisRange)
    private fun ladder(vararg counts: Int) = counts.joinToString(",", "[", "]") { """[$it,"stat","hp",10]""" }

    private fun setUp(withAchievements: Boolean) {
        console.override("catalog", mapOf(
            "bestiaryCatalog" to json(
                """[{"id":"bee","name":"Bee","xp":400,"hp":100,"threat":5,"definition":{"achievements":${ladder(10, 100)}}},
                    {"id":"goo","name":"Goo","xp":100,"hp":50,"threat":1,"definition":{"achievements":${ladder(10, 100)}}},
                    {"id":"wolf","name":"White Wolf","xp":48800,"hp":48000,"threat":50,"definition":{"achievements":${ladder(1, 100)}}},
                    {"id":"dragold","name":"Dragold","hp":25600000,"threat":800,"definition":{"achievements":${ladder(1, 10)},"special":true}},
                    {"id":"phoenix","name":"Phoenix","hp":36000,"threat":300,"definition":{"achievements":${ladder(1, 10)}}}]""",
            ),
            "monsterChoices" to json("""[{"id":"goo","locations":[{"map":"main","x":0,"y":0}]},{"id":"bee","locations":[{"map":"main","x":0,"y":0}]},{"id":"wolf","locations":[{"map":"main","x":0,"y":0}]}]"""),
        ))
        if (withAchievements) {
            val profiles = console.sections.getValue("config")["farmingProfiles"]!!.jsonObject
            console.override("config", mapOf(
                "farmingPolicy" to json("\"achievements\""),
                "achievementHunt" to json("""{"monsters":["goo"],"blacklistDeaths":true,"deathThreshold":3}"""),
                "achievementBlacklist" to json("""{"bee":{"monsterId":"bee","at":1,"reason":"3 deaths while farming for achievements"}}"""),
                "achievementMessage" to json("\"Farming goo: 4 / 10 kills (step 1)\""),
                "farmingProfiles" to JsonObject(profiles + ("Rangy" to JsonObject(profiles.getValue("Rangy").jsonObject + mapOf(
                    "achievementHunt" to json("""{"monsters":[],"blacklistDeaths":false,"deathThreshold":5}"""),
                    "achievementBlacklist" to json("{}"),
                )))),
            ))
        }
    }

    private fun settings(name: String): PartyViewModel {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { HuntSettingsScreen(viewModel, name, onBack = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.bestiaryCatalog.size == 5 }
        compose.waitForIdle()
        return viewModel
    }

    @Test
    fun achievementHuntListsWeakestFirstWithUpToHereBlacklistAndThreshold() {
        setUp(true)
        settings("Leada")
        compose.onAllNodes(scroller)[0].performScrollToNode(hasText("3 deaths while farming for achievements", substring = true))
        compose.onNode(hasText("3 deaths while farming for achievements", substring = true) and inSection).assertExists()

        compose.onNode(hasText("Monsters (1)") and inSection).performScrollTo().performClick()
        val regular = hasAnyAncestor(hasContentDescription("Regular monsters"))
        val names = compose.onAllNodes(hasContentDescription(" for achievements", substring = true) and regular).fetchSemanticsNodes()
            .map { it.config[SemanticsProperties.ContentDescription].first().removePrefix("Farm ").removeSuffix(" for achievements") }
        assertEquals(listOf("Goo", "Bee", "White Wolf"), names)
        // Dragold is special. Phoenix is a rare: listed as special and fought when seen, never a target.
        val special = hasAnyAncestor(hasContentDescription("Special monsters"))
        compose.onNode(hasText("Dragold") and special).assertExists()
        compose.onNode(hasText("Phoenix") and special).assertExists()
        compose.onNode(hasText("fought when seen", substring = true) and special).assertExists()
        compose.onAllNodes(hasText("Up to here") and regular)[1].performScrollTo().performClick()
        eventually { posts("achievement-hunt").isNotEmpty() }
        assertEquals(json("""{"settings":{"monsters":["goo","bee"]},"character":"Leada"}"""), posts("achievement-hunt").last())
        // The list folds away again.
        compose.onNode(hasText("Monsters (", substring = true) and inSection).performScrollTo().performClick()

        compose.onNode(hasText("Clear") and inSection).performScrollTo().performClick()
        eventually { posts("achievement-hunt").size == 2 }
        assertEquals(json("""{"blacklist":{"action":"remove","monsterId":"bee"},"character":"Leada"}"""), posts("achievement-hunt").last())
        val deaths = compose.onNodeWithContentDescription("Achievement Hunt deaths before blacklisting")
        deaths.performScrollTo().performTextReplacement("5")
        deaths.performImeAction()
        eventually { posts("achievement-hunt").size == 3 }
        assertEquals(json("""{"settings":{"deathThreshold":5},"character":"Leada"}"""), posts("achievement-hunt").last())
        // Fill respawn waits is on unless a console saved it off.
        val fill = compose.onNodeWithContentDescription("Fill respawn waits with nearby monsters")
        fill.performScrollTo().assertIsOn().performClick()
        eventually { posts("achievement-hunt").size == 4 }
        assertEquals(json("""{"settings":{"fillIdle":false},"character":"Leada"}"""), posts("achievement-hunt").last())
    }

    @Test
    fun achievementsIsAFarmingModeOnEveryCharacterWithItsStatusUnderTheChips() {
        setUp(true)
        val viewModel = PartyViewModel(console.settings)
        val name = androidx.compose.runtime.mutableStateOf("Leada")
        compose.setContent { CharacterDetailScreen(viewModel, name.value, onBack = {}, onSwitchCharacter = {}, onNavigate = {}, onOpenMerchantCommerce = {}, onOpenRoutines = {}, onOpenHuntSettings = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.bestiaryCatalog.size == 5 && viewModel.characters.value["Leada"]?.vitals != null }
        compose.waitForIdle()
        compose.onAllNodes(scroller)[0].performScrollToNode(hasText("Farming goo: 4 / 10 kills (step 1)"))
        compose.onNode(hasText("Farming goo: 4 / 10 kills (step 1)") and hasAnyAncestor(hasContentDescription("Achievement Hunt status"))).assertExists()

        name.value = "Rangy"
        compose.waitForIdle()
        compose.onAllNodes(scroller)[0].performScrollToNode(hasContentDescription("Achievements: ", substring = true))
        compose.onNode(hasContentDescription("Achievements: ", substring = true)).performClick()
        eventually { posts("farming-mode").isNotEmpty() }
        assertEquals(json("""{"mode":"achievements","character":"Rangy"}"""), posts("farming-mode").last())
    }

    @Test
    fun anIndependentCharacterEditsItsOwnAndAFollowerSeesTheLeadersReadOnly() {
        setUp(true)
        settings("Rangy")
        compose.onNode(hasText("Monsters (0)") and inSection).performScrollTo().assertExists()
        compose.onAllNodes(isToggleable() and inSection)[0].performScrollTo().performClick()
        eventually { posts("achievement-hunt").isNotEmpty() }
        assertEquals(json("""{"settings":{"blacklistDeaths":true},"character":"Rangy"}"""), posts("achievement-hunt").last())
    }

    @Test
    fun aFollowerSeesTheLeadersSettingsReadOnly() {
        setUp(true)
        settings("Folla")
        compose.onNodeWithText("Farming settings · Leada").assertExists()
        compose.onNode(hasText("Monsters (1)") and inSection).performScrollTo().assertExists()
        compose.onNodeWithContentDescription("Achievement Hunt deaths before blacklisting").assertIsNotEnabled()
    }

    @Test
    fun achievementHuntIsAbsentOnAConsoleWithoutIt() {
        setUp(false)
        settings("Leada")
        compose.onNodeWithText("Farming settings · Leada").assertExists()
        compose.onNode(hasContentDescription("Achievement Hunt settings")).assertDoesNotExist()
    }

    /** v1.4.0 never sends the top-level achievementHunt, so a profile's own
     *  copy and a saved "achievements" mode unlock nothing. */
    @Test
    fun aV140ConsoleShowsNoAchievementsModeStatusOrSettings() {
        setUp(false)
        val profiles = console.sections.getValue("config")["farmingProfiles"]!!.jsonObject
        console.override("config", mapOf(
            "farmingPolicy" to json("\"achievements\""),
            "achievementMessage" to json("\"Farming goo: 4 / 10 kills (step 1)\""),
            "farmingProfiles" to JsonObject(profiles + ("Rangy" to JsonObject(profiles.getValue("Rangy").jsonObject + mapOf(
                "achievementHunt" to json("""{"monsters":["goo"],"blacklistDeaths":false,"deathThreshold":5}"""),
            )))),
        ))
        val viewModel = PartyViewModel(console.settings)
        val name = androidx.compose.runtime.mutableStateOf("Leada")
        compose.setContent { CharacterDetailScreen(viewModel, name.value, onBack = {}, onSwitchCharacter = {}, onNavigate = {}, onOpenMerchantCommerce = {}, onOpenRoutines = {}, onOpenHuntSettings = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.bestiaryCatalog.size == 5 && viewModel.characters.value["Leada"]?.vitals != null }
        compose.waitForIdle()
        compose.onAllNodes(scroller)[0].performScrollToNode(hasContentDescription("Scatter: ", substring = true))
        compose.onNode(hasContentDescription("Achievements: ", substring = true)).assertDoesNotExist()
        compose.onNode(hasContentDescription("Achievement Hunt status")).assertDoesNotExist()

        name.value = "Rangy"
        compose.waitForIdle()
        compose.onAllNodes(scroller)[0].performScrollToNode(hasContentDescription("Scatter: ", substring = true))
        compose.onNode(hasContentDescription("Achievements: ", substring = true)).assertDoesNotExist()
    }

    @Test
    fun aV140ConsoleShowsNoSettingsForAProfileThatCarriesAchievementHunt() {
        setUp(false)
        val profiles = console.sections.getValue("config")["farmingProfiles"]!!.jsonObject
        console.override("config", mapOf(
            "farmingProfiles" to JsonObject(profiles + ("Rangy" to JsonObject(profiles.getValue("Rangy").jsonObject + mapOf(
                "achievementHunt" to json("""{"monsters":["goo"],"blacklistDeaths":false,"deathThreshold":5}"""),
            )))),
        ))
        settings("Rangy")
        compose.onNodeWithText("Farming settings · Rangy").assertExists()
        compose.onNode(hasContentDescription("Achievement Hunt settings")).assertDoesNotExist()
    }
}
