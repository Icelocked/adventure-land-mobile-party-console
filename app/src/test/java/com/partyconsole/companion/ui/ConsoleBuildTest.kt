package com.partyconsole.companion.ui

import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.partyconsole.companion.domain.BuildSummary
import com.partyconsole.companion.domain.ConsoleBuildStatus
import com.partyconsole.companion.domain.changedComponents
import com.partyconsole.companion.domain.deploymentPending
import com.partyconsole.companion.domain.pendingBuildCount
import com.partyconsole.companion.domain.readyBuild
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.characterlist.CharacterListScreen
import kotlinx.serialization.json.Json
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

/** Ryan's managed console builds in the party header (web/src/lib/consoleBuild.test.ts
 *  and web/e2e/console-build.spec.ts).
 *
 *  Failure modes:
 *  - The button shows without a newer completed build, or on a console without managed builds.
 *  - Load now skips its confirm, or a deploy posts the wrong {buildId, mode}.
 *  - A Cave run leaves Load when safe and Load at Main enabled.
 */
@RunWith(RobolectricTestRunner::class)
class ConsoleBuildTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun build(id: String, createdAt: String, dashboard: String = "d") = BuildSummary(id, createdAt, "s-$id", components = mapOf("dashboard" to dashboard, "coordinator" to "c", "characters" to "k"))
    private fun status(available: String? = "b", pending: Int? = null) =
        ConsoleBuildStatus(active = "a", available = available, pendingBuildCount = pending, builds = listOf(build("a", "2026-10-22T01:00:00Z"), build("b", "2026-10-22T02:00:00Z", "d2")))

    @Test
    fun theStatusHelpersFollowConsoleBuildControl() {
        assertTrue(listOf("preparing", "waiting-safe", "moving-main", "activating", "resuming", "rolling-back").all { deploymentPending(it) })
        assertFalse(deploymentPending("complete"))
        assertFalse(deploymentPending("failed"))
        assertEquals("b", readyBuild(status())?.id)
        assertNull(readyBuild(status(available = "a")))
        assertNull(readyBuild(status(available = null)))
        assertEquals(listOf("dashboard"), changedComponents(status().builds[1], status().builds[0]))
        assertEquals(listOf("dashboard", "coordinator", "characters"), changedComponents(status().builds[1], null))
        assertEquals(4, pendingBuildCount(status(pending = 4)))
        assertEquals(1, pendingBuildCount(status()))
        assertEquals(1, pendingBuildCount(ConsoleBuildStatus(active = "a", available = "a", builds = listOf(build("a", "2026-10-22T01:00:00Z")))))
    }

    private fun builds(cave: Boolean = false) = """{"active":"old","available":"new","pendingBuildCount":2,"cave":$cave,"builds":[
        {"schema":1,"id":"old","createdAt":"2026-10-22T01:00:00Z","sourceHash":"source-old","commit":"commit-old","components":{"dashboard":"dash-old","coordinator":"coordinator-old","characters":"characters-same"}},
        {"schema":1,"id":"new","createdAt":"2026-10-22T03:00:00Z","sourceHash":"source-new","commit":"commit-new","components":{"dashboard":"dash-new","coordinator":"coordinator-new","characters":"characters-same"}}]}"""

    private fun show() {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { CharacterListScreen(viewModel, onSelectCharacter = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.characters.value.isNotEmpty() }
    }

    private fun deploys() = console.requests.filter { it.method == "POST" && it.path == "/console-build/deploy" }.map { Json.parseToJsonElement(it.body).jsonObject }

    @Test
    fun loadNowConfirmsTheBuildThenPostsItAndACaveRunBlocksTheOtherModes() {
        console.gets["/console-build"] = builds()
        console.routes["/console-build/deploy"] = { _ -> 200 to """{"id":"op-1","target":"new","startedAt":"2026-10-22T03:01:00Z","phase":"preparing","mode":"now"}""" }
        show()
        compose.waitUntil(5_000) { compose.onAllNodes(hasContentDescription("Deploy new console build")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithContentDescription("2 completed builds since deployment").assertExists()
        compose.onNodeWithContentDescription("Deploy new console build").performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Build new is ready.")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Load now").assertIsEnabled().performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Load console build now?")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Changed components: dashboard, coordinator").assertExists()
        compose.onNodeWithText("Revision: commit-new").assertExists()
        assertTrue(deploys().isEmpty())
        compose.onAllNodesWithText("Load now")[0].assertIsEnabled().performClick()
        eventually { deploys().size == 1 }
        assertEquals(Json.parseToJsonElement("""{"buildId":"new","mode":"now"}"""), deploys()[0])
    }

    @Test
    fun aCaveRunDisablesLoadWhenSafeAndLoadAtMain() {
        console.gets["/console-build"] = builds(cave = true)
        show()
        compose.waitUntil(5_000) { compose.onAllNodes(hasContentDescription("Deploy new console build")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithContentDescription("Deploy new console build").performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Load when safe")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Load when safe").assertIsNotEnabled()
        compose.onNodeWithText("Load at Main").assertIsNotEnabled()
        compose.onNodeWithText("Load now").assertIsEnabled()
    }

    @Test
    fun aConsoleWithoutManagedBuildsHasNoButton() {
        show()
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Send party to town")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithContentDescription("Deploy new console build").assertDoesNotExist()
    }
}
