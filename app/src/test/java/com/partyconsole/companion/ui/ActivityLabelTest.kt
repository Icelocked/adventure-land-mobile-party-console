package com.partyconsole.companion.ui

import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.testing.put
import com.partyconsole.companion.ui.characterlist.CharacterListScreen
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.shadows.ShadowLooper
import java.util.concurrent.TimeUnit

/** The party list's activity label follows the task phase
 *  (web/e2e/combat-status.spec.ts "Character list and vitals header show the task phase").
 *
 *  Failure modes:
 *  - The row shows the raw target or the position instead of the Hunt stage.
 *  - A new trip only changes the label once a character moves.
 */
@RunWith(RobolectricTestRunner::class)
class ActivityLabelTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private val party = """["Leada","Folla"]"""
    private fun hunt(stage: String) = Json.parseToJsonElement(
        """{"stage":"$stage","participants":$party,"target":"crabx","message":"Monster Hunt: crabx","currentIndex":0,"missions":[{"target":"crabx","owners":["Leada"]}]}""",
    )
    private fun convoy(phase: String) = Json.parseToJsonElement(
        """{"id":"convoy-1","phase":"$phase","purpose":"monster-hunt","label":"Monster Hunt: crabx","participants":$party,"location":{"map":"main","mapName":"Mainland","monsterIds":["crabx"]}}""",
    )
    private fun rows(text: String) = compose.onAllNodes(hasText(text)).fetchSemanticsNodes().size

    // The paused main looper holds the poll loop's delay until its clock moves on.
    private fun polled(viewModel: PartyViewModel, condition: (JsonObject) -> Boolean) = eventually(10_000) {
        ShadowLooper.idleMainLooper(500, TimeUnit.MILLISECONDS)
        condition(viewModel.dynamicState.value.activitySource)
    }

    @Test
    fun theRowFollowsTheHuntStageAndTheConvoyPhaseWithoutAnyMove() {
        console.override("catalog", mapOf("bestiaryCatalog" to Json.parseToJsonElement("""[{"id":"crabx","name":"Crabxx"}]""")))
        console.put("monsterHunt", hunt("farming"))
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { CharacterListScreen(viewModel, onSelectCharacter = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.characters.value.keys.containsAll(listOf("Leada", "Folla")) && viewModel.dynamicState.value.bestiaryCatalog.isNotEmpty() }
        compose.waitUntil(5_000) { rows("Fighting Hunt target - Crabxx") >= 1 }

        console.put("monsterHunt", hunt("mission-travel"))
        console.put("activeConvoy", convoy("shared-prepare"))
        polled(viewModel) { it["activeConvoy"].toString().contains("shared-prepare") }
        compose.waitUntil(5_000) { rows("Regrouping for travel") >= 1 && rows("Fighting Hunt target - Crabxx") == 0 }

        console.put("activeConvoy", convoy("travel"))
        polled(viewModel) { it["activeConvoy"].toString().contains("\"travel\"") }
        compose.waitUntil(5_000) { rows("Travelling to Hunt target - Crabxx") >= 1 && rows("Regrouping for travel") == 0 }
    }
}
