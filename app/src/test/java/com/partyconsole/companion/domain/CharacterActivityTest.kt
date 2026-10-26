package com.partyconsole.companion.domain

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/** The PWA's web/src/lib/characterActivity.test.ts cases, which replay the
 *  console fork's e2e/console-card-strip.spec.ts "the strip activity follows
 *  the coordinator task and phase" journey with the same fields.
 *
 *  Failure modes:
 *  - A walking leg on the event map reads as travel instead of the fight.
 *  - A trip only names its purpose after arrival, or drops it between legs.
 *  - A profile's own phases lose to the leader's top-level fields.
 *  - Pause, a clean shutdown or death read as the task underneath.
 *  - Names show raw ids instead of the bestiary or event display names.
 */
class CharacterActivityTest {
    private val names = mapOf("bbpompom" to "Pom Pom", "goo" to "Goo", "croc" to "Croc", "mrpumpkin" to "Mr. Pumpkin")
    private val monster: MonsterNames = { id -> names[id] ?: id }

    private fun obj(text: String): JsonObject = Json.parseToJsonElement(text).jsonObject
    private val fighters = """["W","P"]"""
    private fun hunt(stage: String, message: String) =
        """{"stage":"$stage","participants":$fighters,"missions":[{"target":"bbpompom"}],"currentIndex":0,"target":"bbpompom","message":"$message"}"""
    private val frozenCave = """{"map":"winter_cave","mapName":"Frozen Cave","monsterIds":["bbpompom"]}"""
    private fun eventLeg(phase: String, walkingEvent: String, map: String) =
        """{"id":"convoy-e","phase":"$phase","label":"event walking leg","purpose":"shared-walk","participants":$fighters,"walkingActivity":"event","walkingEvent":"$walkingEvent","location":{"map":"$map"}}"""
    private fun huntConvoy(phase: String) =
        """{"id":"convoy-h","phase":"$phase","label":"Monster Hunt: bbpompom","purpose":"monster-hunt","participants":$fighters,"location":$frozenCave}"""
    private fun profile(patch: String = "") =
        """{"monsterHunt":null,"activeConvoy":null,"farmAreaState":null,"combatRecovery":null,"eventReturn":null,"rareHuntState":null,"partyFarmingMode":null,"partyFarmingMonsterType":null,"achievement":null,"eventSession":null${if (patch.isEmpty()) "" else ",$patch"}}"""
    private fun phases(patch: String = "") =
        """{"profiles":{},"attendance":{},"characters":{},"bossChase":null,"escape":null,"dungeon":null${if (patch.isEmpty()) "" else ",$patch"}}"""
    private val quiet = obj("""{"farmAreaState":{"active":null},"monsterHunt":null,"activeConvoy":null,"eventReturn":null,"merchantCurrent":null,"merchantCharacter":"M","activityPhases":${phases()}}""")

    private fun w(patch: String = "") = obj("""{"name":"W","map":"main"${if (patch.isEmpty()) "" else ",$patch"}}""")
    private fun character(raw: JsonObject) = activityCharacter(raw.getValue("name").jsonPrimitive.content, null, raw)
    private fun label(party: String = "{}", character: JsonObject = w(), now: Long = System.currentTimeMillis()): String =
        characterActivity(character(character), JsonObject(quiet + obj(party)), monster, now = now)
    private fun party(vararg fields: Pair<String, String>) = fields.joinToString(",", "{", "}") { (key, value) -> "\"$key\":$value" }

    @Test
    fun anEventFightStaysFightingEventThroughWalkingLegsOnTheEventMap() {
        val graveyard = w(""""map":"spookytown","activeEvent":"graveyard","joinedEvent":"graveyard"""")
        val paused = hunt("paused-event", "Paused for combat event")
        for (phase in listOf("scheduled", "shared-prepare", "travel"))
            assertEquals("Fighting event - Graveyard Rising", label(party("monsterHunt" to paused, "activeConvoy" to eventLeg(phase, "graveyard", "spookytown")), graveyard))
        assertEquals("Fighting event - Graveyard Rising", label(party("monsterHunt" to paused), graveyard))
    }

    @Test
    fun theEventExitReadsLeavingThenReturning() {
        val waiting = hunt("paused-event", "Waiting for fresh Main town arrival: W")
        assertEquals(
            "Leaving event - Graveyard Rising",
            label(party("monsterHunt" to waiting, "eventReturn" to """{"phase":"evacuating","event":"graveyard","participants":$fighters}"""), w(""""map":"spookytown","joinedEvent":"graveyard"""")),
        )
        val back = """{"id":"c","phase":"shared-prepare","label":"event-return walking leg","purpose":"shared-walk-return","participants":$fighters,"walkingActivity":"event-return","location":{"map":"main"}}"""
        assertEquals("Returning from event", label(party("monsterHunt" to waiting, "activeConvoy" to back), w(""""map":"spookytown"""")))
    }

    @Test
    fun travelNamesItsPurposeFromTheFirstConvoyPhaseAndStaysPutBetweenLegs() {
        val travel = hunt("mission-travel", "Monster Hunt: bbpompom")
        assertEquals("Regrouping for travel", label(party("monsterHunt" to travel, "activeConvoy" to huntConvoy("shared-prepare"))))
        assertEquals("Travelling to Hunt target - Pom Pom", label(party("monsterHunt" to travel, "activeConvoy" to huntConvoy("travel"))))
        assertEquals("Travelling to Hunt target - Pom Pom", label(party("monsterHunt" to travel, "activeConvoy" to huntConvoy("travel")), w(""""map":"winterland"""")))
        // Between legs the convoy is briefly absent while the stage stays mission-travel.
        assertEquals("Travelling to Hunt target - Pom Pom", label(party("monsterHunt" to travel), w(""""map":"winterland"""")))
        assertEquals("Arriving at Hunt target - Pom Pom", label(party("monsterHunt" to travel, "activeConvoy" to huntConvoy("hunt-arrival")), w(""""map":"winter_cave"""")))
    }

    @Test
    fun arrivalSwitchesToFightingAndRetargetsKeepIt() {
        assertEquals("Fighting Hunt target - Pom Pom", label(party("monsterHunt" to hunt("farming", "Monster Hunt: bbpompom")), w(""""map":"winter_cave"""")))
    }

    @Test
    fun aCombatEventRegroupsTravelsToItThenFightsItWithTheBestiaryName() {
        val paused = hunt("paused-event", "Paused for combat event")
        assertEquals("Regrouping for travel", label(party("monsterHunt" to paused, "activeConvoy" to eventLeg("shared-prepare", "mrpumpkin", "halloween")), w(""""map":"winter_cave"""")))
        assertEquals("Travelling to event - Mr. Pumpkin", label(party("monsterHunt" to paused, "activeConvoy" to eventLeg("travel", "mrpumpkin", "halloween")), w(""""map":"winterland"""")))
        assertEquals(
            "Fighting event - Mr. Pumpkin",
            label(party("monsterHunt" to paused, "activeConvoy" to eventLeg("scheduled", "mrpumpkin", "halloween")), w(""""map":"halloween","activeEvent":"mrpumpkin","joinedEvent":"mrpumpkin"""")),
        )
    }

    @Test
    fun readsThePhasesActivityPhasesPublishes() {
        val pumpkin = w(""""map":"halloween","activeEvent":"mrpumpkin","joinedEvent":"mrpumpkin"""")
        val now = System.currentTimeMillis()
        val session = phases(""""profiles":{"W":${profile(""""eventSession":{"event":"mrpumpkin","spawnAt":${now + 600_000},"live":false}""")}}""")
        assertEquals("Waiting for spawn - Mr. Pumpkin", label(party("activityPhases" to session), pumpkin, now))
        assertEquals("Leaving event - Mr. Pumpkin (death limit)", label(party("activityPhases" to phases(""""attendance":{"W":{"mrpumpkin":{"ignored":"death limit","dead":false}}}""")), pumpkin))
        assertEquals("Escaping", label(party("activityPhases" to phases(""""escape":{"stage":"blink"}"""))))
        assertEquals("Cave - travelling", label(party("activityPhases" to phases(""""dungeon":{"phase":"active","participants":$fighters,"travel":"travelling","message":null,"reviving":null}"""))))
        assertEquals("Realm-hopping to Franky", label(party("activityPhases" to phases(""""bossChase":{"trip":{"boss":"franky","realm":"EUI","arrived":false,"respawnAt":null},"returning":false}"""))))
    }

    @Test
    fun achievementHuntReadsItsOwnProfile() {
        fun achievement(message: String, target: String, convoy: String = "null") =
            phases(""""profiles":{"W":${profile(""""achievement":{"target":$target,"message":"$message"},"activeConvoy":$convoy""")}}""")
        val goo = """{"id":"goo","milestone":100,"step":1}"""
        assertEquals("Achievement Hunt - Acquiring target", label(party("activityPhases" to achievement("", "null"))))
        val spawn = """{"id":"convoy-a1","phase":"travel","label":"the goo spawn","purpose":"manual-monster-override","participants":["W"],"location":{"map":"main","monsterIds":["goo"]}}"""
        assertEquals("Travelling to achievement target - Goo", label(party("activityPhases" to achievement("Farming Goo: 5 / 100 kills (step 1)", goo, spawn))))
        assertEquals("Fighting achievement target - Goo (5/100)", label(party("activityPhases" to achievement("Farming Goo: 5 / 100 kills (step 1)", goo)), w(""""monsterAchievementKills":{"goo":5}""")))
        assertEquals("Waiting - P is dead", label(party("activityPhases" to achievement("Waiting: P is dead", goo))))
    }

    @Test
    fun deathIdlePauseAndACleanShutdown() {
        assertEquals("Dead", label("{}", w(""""rip":true""")))
        assertEquals("Idle", label())
        val control = """{"paused":true,"pausedAt":1,"resume":null,"shutdown":null,"log":[]}"""
        assertEquals("Paused", label(party("consoleControl" to control), w(""""rip":true""")))
        val draining = """{"paused":true,"pausedAt":1,"resume":null,"shutdown":{"phase":"draining","requestedAt":1,"hold":null,"waiting":[],"command":"","directory":""},"log":[]}"""
        assertEquals("Holding still for shutdown", label(party("consoleControl" to draining)))
    }

    @Test
    fun theMerchantJobWithItsBankStageThenAFishingTripWhileTheNextJobWaits() {
        val m = obj("""{"name":"M","map":"main"}""")
        assertEquals(
            "Auto compound - bank retrieval",
            label(party("merchantCurrent" to """{"id":"j1","target":"M","reason":"auto compound","routine":"auto compound","phase":"processing","operationStage":"retrieving"}"""), m),
        )
        assertEquals(
            "Fishing - travelling",
            label(party("gatheringModes" to """["fishing"]""", "merchantCurrent" to """{"id":"j2","target":"M","reason":"deconstruction","routine":"deconstruction","phase":"assigned"}"""), obj("""{"name":"M","map":"main","gatheringPhase":"travelling"}""")),
        )
    }

    @Test
    fun aFarmTripNamesTheFarmMonster() {
        val relocate = """{"id":"c","phase":"travel","purpose":"farm-relocation","participants":$fighters,"location":{"map":"main","monsterIds":["croc"]}}"""
        assertEquals("Travelling to farm - Croc", label(party("activeConvoy" to relocate)))
        assertEquals("Fighting farm - Croc", label(party("farmAreaState" to """{"active":{"map":"main","monsterIds":["croc"]}}""")))
    }

    @Test
    fun oneOddFieldNeverBlanksTheLabel() {
        // The console sends a shape this model does not expect for one field.
        assertEquals("Fighting farm - Croc", label(party("gatheringModes" to "7", "farmAreaState" to """{"active":{"map":"main","monsterIds":["croc"]}}""")))
    }
}
