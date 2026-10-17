package com.partyconsole.companion.domain

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The skill card line builders against the PWA's web/e2e/skill-card.spec.ts
 *  (cards-1.4). Skill definitions come from the live game data (G.skills). */
class SkillCardLinesTest {
    private fun obj(text: String): JsonObject = Json.parseToJsonElement(text).jsonObject
    private val names = mapOf("attack" to "Attack", "zapperzap" to "Zap")
    private val skillName = { id: String -> names[id] }

    private val supershot = obj(
        """{"type":"skill","skin":"skill_supershot","class":["ranger"],"name":"Supershot","explanation":"Deals 1.5X instant damage from an incredible distance.",
            "wtype":["bow","crossbow"],"damage_multiplier":1.5,"cooldown":30000,"range_multiplier":3,"range_bonus":20,"mp":400,"target":true,"hostile":true,
            "pierces_immunity":true,"damage_type":"physical","procs":true,"use_range":true}""",
    )

    @Test
    fun supershotReadsLineForLineWithMeaningColors() {
        val lines = skillCardLines(supershot, skillName)
        assertEquals(
            listOf("MP: 400", "Cooldown: 30 seconds", "Range: Character Range", "Range: 3X + 20", "Weapon Requirement: \"Bow\", \"Crossbow\"", "Damage Type: Physical"),
            lines.map { it.display() },
        )
        val colors = lines.associate { it.key to it.color }
        assertEquals("#3A62CE", colors["mp"])
        assertEquals("#93AB98", colors["damage_type"])
        assertEquals("#4EB7DE", colors["cooldown"])
        assertEquals("#93A6A2", colors["use_range"])
        assertEquals("#56A244", colors["wtype"])
        val extras = skillExtras(supershot)
        assertEquals(listOf("Class: ranger", "Damage Multiplier: 1.5", "Hostile: Yes", "Pierces Immunity: Yes", "Procs: Yes", "Target: Yes", "Type: skill"), extras.map { it.display() })
        assertEquals("#E13758", extras.single { it.key == "hostile" }.color)
        assertEquals("#C3C3C3", extras.single { it.key == "type" }.color)
    }

    @Test
    fun partyHealShowsOneOutputLinePerLevel() {
        val partyheal = obj(
            """{"type":"skill","skin":"skill_pheal","class":["priest"],"name":"Party Heal","explanation":"Heals all the party members.","output":400,"action":"heal",
                "levels":[[0,400],[60,600],[72,720],[80,800]],"mp":400,"cooldown":200,"party":true,"projectile":"partyheal","damage_type":"magical","heal":true,"multi":true}""",
        )
        assertEquals(
            listOf("MP: 400", "Cooldown: 0.2 seconds", "Damage Type: Magical", "Output: 400", "Output: 600 (Lv. 60)", "Output: 720 (Lv. 72)", "Output: 800 (Lv. 80)"),
            skillCardLines(partyheal, skillName).map { it.display() },
        )
    }

    @Test
    fun aSharedCooldownNamesTheSharedSkill() {
        val threeshot = obj(
            """{"type":"skill","skin":"skill_3shot","class":["ranger"],"name":"3-Shot","explanation":"Hits 3 targets at once!","wtype":["bow","crossbow"],
                "damage_multiplier":0.7,"level":60,"mp":200,"cooldown_multiplier":1,"multi":true,"share":"attack","hostile":true,"pierces_immunity":true,
                "damage_type":"physical","procs":true,"use_range":true}""",
        )
        val lines = skillCardLines(threeshot, skillName).map { it.display() }
        assertTrue(lines.contains("Cooldown: 1× Attack"))
        assertTrue(lines.contains("Level Requirement: 60"))
    }

    @Test
    fun zapReadsTheSameCardAndKeepsEveryOtherFieldInTheExtras() {
        val zap = obj(
            """{"type":"skill","skin":"trigger","slot":[["ring1","zapper"],["ring2","zapper"]],"name":"Zap","explanation":"Zap your target for 200 damage","damage":200,
                "damage_type":"magical","mp":140,"cooldown":200,"range":420,"projectile":"gburst","target":true,"hostile":true}""",
        )
        assertEquals(listOf("MP: 140", "Cooldown: 0.2 seconds", "Range: 420", "Damage Type: Magical"), skillCardLines(zap, skillName).map { it.display() })
        val extras = skillExtras(zap).map { it.display() }
        assertEquals(listOf("Damage: 200", "Hostile: Yes", "Projectile: gburst", "Slot: ring1 zapper, ring2 zapper", "Target: Yes", "Type: skill"), extras)
        // Every definition field reaches the card or the extras, except the header's name, skin and explanation.
        val shown = skillCardLines(zap, skillName).map { it.key } + skillExtras(zap).map { it.key }
        for (key in zap.keys - setOf("name", "skin", "explanation")) assertTrue(key, shown.any { it == key })
    }

    @Test
    fun aSkillWithoutAnExplanationKeepsEveryFieldInTheExtras() {
        val bare = obj("""{"name":"Bare","mp":10,"type":"passive"}""")
        assertTrue(skillCardLines(bare, skillName).isEmpty())
        assertEquals(listOf("Mp: 10", "Type: passive"), skillExtras(bare).map { it.display() })
    }

    @Test
    fun requiredStatsTakeTheirStatColors() {
        val skill = obj("""{"name":"Req","explanation":"x","requirements":{"str":40,"int":10},"max":3,"duration":5000,"type":"passive"}""")
        val lines = skillCardLines(skill, skillName)
        assertEquals(listOf("Duration: 5 seconds", "Max: 3", "Passive", "Required Strength: 40", "Required Intelligence: 10"), lines.map { it.display() })
        assertEquals("#F07F2F", lines.single { it.key == "required_str" }.color)
        assertEquals("#3E6EED", lines.single { it.key == "required_int" }.color)
        assertEquals("#E1924D", lines.single { it.key == "duration" }.color)
    }
}
