package com.partyconsole.companion.model

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** consoleHasAchievementHunt and the achievement settings farmingContext
 *  returns. A console with Achievement Hunt (upstream PR #131) always sends
 *  the top-level `achievementHunt` in its config section; Ryan's v1.4.0
 *  never does. PWA: web/src/models/state.ts.
 *
 *  Failure modes:
 *  - A v1.4.0 console unlocks Achievement Hunt because a farming profile
 *    carries `achievementHunt` or the saved mode reads "achievements".
 *  - An Achievement Hunt console hides the leader's, a follower's or an
 *    independent character's settings.
 */
class AchievementHuntCapabilityTest {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }
    private fun state(text: String) = json.decodeFromString(PartyStateDynamic.serializer(), text)

    @Test
    fun aV140ConsoleHasNoAchievementSettingsForAnyCharacter() {
        val v140 = state(
            """{"leader":"Lead","followers":{"Fol":true},"farmingPolicy":"achievements",
                "farmingProfiles":{"Solo":{"farmingPolicy":"achievements","achievementHunt":{"monsters":["goo"],"deathThreshold":4}}}}""",
        )
        assertFalse(v140.consoleHasAchievementHunt)
        assertNull(v140.farmingContext("Lead").achievementSettings)
        assertNull(v140.farmingContext("Fol").achievementSettings)
        // The profile carries achievementHunt while the top level is absent.
        assertNull(v140.farmingContext("Solo").achievementSettings)
    }

    @Test
    fun anAchievementHuntConsoleGivesEachScopeItsOwnSettings() {
        val hunt = state(
            """{"leader":"Lead","followers":{"Fol":true},"farmingPolicy":"achievements",
                "achievementHunt":{"monsters":["bee"],"deathThreshold":3},
                "farmingProfiles":{"Solo":{"achievementHunt":{"monsters":["goo"],"deathThreshold":4}}}}""",
        )
        assertTrue(hunt.consoleHasAchievementHunt)
        assertEquals(listOf("bee"), hunt.farmingContext("Lead").achievementSettings?.monsters)
        assertEquals(listOf("bee"), hunt.farmingContext("Fol").achievementSettings?.monsters)
        assertEquals(4, hunt.farmingContext("Solo").achievementSettings?.deathThreshold)
    }
}
