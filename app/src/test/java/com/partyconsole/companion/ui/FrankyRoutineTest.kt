package com.partyconsole.companion.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.ryanV140
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.characterdetail.sections.LeaderFollowerSection
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Console 1.4 Franky routine (web/e2e/combat-party.spec.ts), opened from
 *  Franky's event settings as on the console.
 *
 *  Failure modes:
 *  - A mode or limit post leaves out `character` or `encounter`, so the
 *    server changes the leader's scope or refuses it.
 *  - A follower reads its own profile instead of its leader's routine, or
 *    can still edit it (the server 409s "following leader settings").
 *  - With nothing saved the routine shows something other than Auto and a
 *    death limit of 3.
 *  - A negative or blank death limit reaches the server.
 *  - The death count shows "/0" when the limit is 0.
 *  - A saved limit doesn't replace the draft after the state refresh.
 *  - A refused change hides the server's message.
 *  - Merchant-class characters get a routine.
 */
@RunWith(RobolectricTestRunner::class)
class FrankyRoutineTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun posts(path: String) = console.requests.filter { it.method == "POST" && it.path == "/party-api/$path" }.map { Json.parseToJsonElement(it.body).jsonObject }
    private val inRoutine = hasAnyAncestor(hasContentDescription("Franky routine"))
    private fun mode(label: String) = compose.onNode(hasText(label) and SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button) and inRoutine)
    private fun limit() = compose.onNode(hasContentDescription("Auto-tank death limit"))
    private fun hasValue(value: String) = SemanticsMatcher.expectValue(SemanticsProperties.EditableText, androidx.compose.ui.text.AnnotatedString(value))

    private fun openRoutine(name: String, routine: Boolean = true): PartyViewModel {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent {
            val state by viewModel.dynamicState.collectAsState()
            Column(Modifier.verticalScroll(rememberScrollState())) { LeaderFollowerSection(name, state, viewModel) }
        }
        eventually { viewModel.stateLoaded.value && viewModel.characters.value[name]?.vitals?.ctype?.isNotEmpty() == true }
        compose.waitForIdle()
        compose.onNode(hasText("Events (", substring = true)).performClick()
        compose.onNode(hasContentDescription("Franky settings") and SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button)).performScrollTo().performClick()
        if (routine) compose.onNodeWithText("Franky routine settings").performScrollTo().performClick()
        compose.waitForIdle()
        return viewModel
    }

    @Test
    fun modeAndDeathLimitPostPerCharacterWithTheConsoleDefaults() {
        console.override("config", mapOf(
            "followers" to JsonObject(emptyMap()),
            "farmingProfiles" to Json.parseToJsonElement("""{"Folla":{"encounterAutoDeaths":{"franky":2}}}"""),
        ))
        openRoutine("Folla")
        compose.onNodeWithText("Franky routine · Folla").assertExists()
        mode("Auto").assertIsSelected()
        compose.onNode(hasContentDescription("Auto-tank death limit") and hasValue("3")).assertExists()
        compose.onNodeWithText("Deaths while auto-tanking: 2/3").assertExists()

        mode("Tank").performScrollTo().performClick()
        eventually { posts("encounter-mode").isNotEmpty() }
        assertEquals(Json.parseToJsonElement("""{"character":"Folla","encounter":"franky","mode":"tank"}"""), posts("encounter-mode")[0])
        compose.waitUntil(5_000) { runCatching { mode("Tank").assertIsSelected() }.isSuccess }
        mode("Auto").assertIsNotSelected()

        limit().performScrollTo().performTextReplacement("5")
        compose.onNode(hasText("Set") and inRoutine).performScrollTo().performClick()
        eventually { posts("encounter-mode").size == 2 }
        assertEquals(Json.parseToJsonElement("""{"character":"Folla","encounter":"franky","deathLimit":5}"""), posts("encounter-mode")[1])
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Deaths while auto-tanking: 2/5")).fetchSemanticsNodes().isNotEmpty() }

        // A negative limit never leaves the app.
        limit().performTextReplacement("-1")
        compose.onNode(hasText("Set") and inRoutine).performClick()
        compose.onNodeWithText("Enter 0 or a positive number of deaths.").assertExists()
        assertEquals(2, posts("encounter-mode").size)

        console.failOnce["encounter-mode"] = 400 to """{"error":"invalid encounter mode"}"""
        mode("Off-tank").performScrollTo().performClick()
        eventually { posts("encounter-mode").size == 3 }
        compose.onNodeWithText("invalid encounter mode").assertExists()
    }

    @Test
    fun aFollowerShowsTheLeadersRoutineReadOnly() {
        console.override("core", mapOf(
            "encounterRoutines" to Json.parseToJsonElement("""{"franky":"offtank"}"""),
            "encounterAutoDeathLimits" to Json.parseToJsonElement("""{"franky":0}"""),
        ))
        openRoutine("Folla")
        compose.onNodeWithText("Inherited from the leader.").assertExists()
        mode("Off-tank").assertIsSelected()
        mode("Tank").assertIsNotEnabled()
        limit().assertIsNotEnabled()
        // A limit of 0 shows the death count alone.
        compose.onNodeWithText("Deaths while auto-tanking: 0").assertExists()
        assertEquals(0, posts("encounter-mode").size)
    }

    @Test
    fun merchantsHaveNoRoutine() {
        openRoutine("Merchy", routine = false)
        compose.onNodeWithText("Franky settings").assertExists()
        compose.onNodeWithText("Franky routine settings").assertDoesNotExist()
    }

    @Test
    fun ryanV140FrankySettingsHaveNoRoutine() {
        console.ryanV140()
        openRoutine("Folla", routine = false)
        compose.waitUntil(5_000) { compose.onAllNodes(hasContentDescription("Franky settings")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Franky routine settings").assertDoesNotExist()
    }
}
