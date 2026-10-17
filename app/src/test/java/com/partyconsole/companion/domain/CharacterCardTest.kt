package com.partyconsole.companion.domain

import com.partyconsole.companion.model.CharacterVitals
import com.partyconsole.companion.model.Condition
import com.partyconsole.companion.model.EquippedEntry
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.ItemMeta
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The character card against the PWA's web/e2e/character-card.spec.ts
 *  (cards-1.4): a merchant with an open stand and a cursed, poisoned priest. */
class CharacterCardTest {
    private fun obj(text: String): JsonObject = Json.parseToJsonElement(text).jsonObject

    // A merchant with an open stand: the live speed is the stand-limited 10.
    private val merchantStats = obj(
        """{"primaryStat":"int","attack":33.4,"frequency":0.73,"range":82,"speed":10,"unrestrictedSpeed":82.1,"standOpen":true,"armor":277,"resistance":500,
            "str":23,"int":110,"dex":99,"vit":50,"fortitude":15,"luck":100,
            "combatStats":{"crit":1.5,"critDamage":20,"lifesteal":2,"evasion":3,"armorPiercing":10,"fireResistance":4}}""",
    )
    private fun vitals(name: String, ctype: String, conditions: List<Condition> = emptyList()) =
        CharacterVitals(name = name, ctype = ctype, level = 61, hp = 4760, maxHp = 4760, mp = 2120, maxMp = 2700, gold = 0, map = "main", x = 0.0, y = 0.0, rip = false, conditions = conditions)
    private val dartgun = mapOf("mainhand" to EquippedEntry(Item(name = "dartgun", level = 0), ItemMeta(properties = mapOf("attack" to JsonPrimitive(48)))))

    @Test
    fun merchantPanelReadsTheGamesLinesAndColors() {
        val lines = characterCardLines("Merchantina", vitals("Merchantina", "merchant"), merchantStats)
        assertEquals(
            listOf("NAME: Merchantina", "LEVEL: 61", "HP: 4760/4760", "MP: 2120/2700", "ATT: 33", "ATTSPD: 73", "RANGE: 82", "RUNSPD: 10", "ARMOR: 277", "RESIST.: 500", "CODE: Active"),
            lines.map { it.display() },
        )
        val colors = lines.associate { it.key to it.color }
        assertEquals("orange", colors["level"])
        assertEquals("#FF2E46", colors["hp"])
        assertEquals("#3A62CE", colors["mp"])
        assertEquals("#DB2900", colors["attack"])
        assertEquals("gold", colors["code"])
        // stat-colors.md: the panel's ATTSPD, RANGE, RUNSPD, ARMOR and RESIST. take their stat colors.
        assertEquals("#3BE681", colors["frequency"])
        assertEquals("#93A6A2", colors["range"])
        assertEquals("#36B89E", colors["speed"])
        assertEquals("#A3A9B0", colors["armor"])
        assertEquals("#8B74C9", colors["resistance"])
        assertNull(colors["heal"])
    }

    @Test
    fun aCursedPoisonedPriestShowsHealAndTheGamesTags() {
        val priest = JsonObject(merchantStats + mapOf("speed" to JsonPrimitive(55), "standOpen" to JsonPrimitive(false), "unrestrictedSpeed" to kotlinx.serialization.json.JsonNull, "combatStats" to obj("""{"heal":320}""")))
        val lines = characterCardLines("Healer1", vitals("Healer1", "priest", listOf(Condition("cursed", "Cursed"), Condition("poisoned", "Poisoned"))), priest)
        assertEquals(listOf("MP: 2120/2700", "HEAL: 320", "ATT: 33 [C]", "ATTSPD: 73 [P]"), lines.map { it.display() }.subList(3, 7))
        assertEquals("#CB83AC", lines.single { it.key == "heal" }.color)
        assertEquals("#7D4DAA", lines.single { it.key == "attack" }.suffixColor)
        assertEquals("#45993F", lines.single { it.key == "frequency" }.suffixColor)
    }

    @Test
    fun everyExtraAndEffectIsNamedAndColoredByItsStat() {
        val extras = characterExtras(vitals("Merchantina", "merchant"), merchantStats, dartgun).associateBy { it.line.key }
        fun effects(key: String) = extras.getValue(key).effects.associate { it.key to it.display() }
        val strength = extras.getValue("str")
        assertEquals("Strength: 23", strength.line.display())
        assertEquals("+483 Max HP +21 per point", effects("str")["max_hp"])
        assertEquals("#FF2E46", strength.effects.single { it.key == "max_hp" }.color)
        assertEquals("+23 Armor +1 per next point", effects("str")["armor"])
        assertEquals("#A3A9B0", strength.effects.single { it.key == "armor" }.color)
        assertEquals("+0.36 Run Speed +0.0156 per next point", effects("str")["run_speed"])
        assertEquals("Intelligence: 110 Primary", extras.getValue("int").line.display())
        assertEquals("gold", extras.getValue("int").line.suffixColor)
        assertEquals("+264.0 Attack +2.40 per point", effects("int")["attack"])
        assertEquals("+1,650 Max MP +15 per point", effects("int")["max_mp"])
        assertEquals("+110 Resistance +1 per next point", effects("int")["resistance"])
        assertEquals("+0.070 Attacks/sec +0.000635 per point", effects("int")["attack_speed"])
        assertEquals(4, extras.getValue("int").effects.size)
        assertEquals("+3.09 Run Speed +0.0313 per next point", effects("dex")["run_speed"])
        assertEquals("+3,417 Max HP 68.33 HP per VIT at level 61", effects("vit")["max_hp"])
        assertEquals("7.50% less incoming PvP damage no PvE reduction", effects("for")["pvp"])
        assertEquals("27.32% physical damage reduction a 100-damage physical hit becomes 72.7", effects("armor")["reduction"])
        assertEquals("46.70% magical damage reduction a 100-damage magical hit becomes 53.3", effects("resistance")["reduction"])
        assertEquals("Run Speed: 82.10 before movement restrictions", extras.getValue("run_speed").line.display())
        for ((key, text) in listOf(
            "luck" to "Luck: 100%", "crit" to "Crit: 1.5%", "critdamage" to "Crit Damage: 220%", "lifesteal" to "Lifesteal: 2%", "evasion" to "Evasion: 3%",
            "apiercing" to "A.Piercing: 10", "firesistance" to "Fire Res.: 4", "miss" to "Miss: 0%", "manasteal" to "Manasteal: 0%", "rpiercing" to "R.Piercing: 0",
            "pnresistance" to "Poison Res.: 0", "fzresistance" to "Freeze Res.: 0", "phresistance" to "Physical Res.: 0", "stresistance" to "Status Res.: 0",
            "blastresistance" to "Blast Res.: 0", "dreturn" to "D.Return: 0%", "reflection" to "Reflection: 0%", "mp_cost" to "MP Cost: 0", "heal" to "Heal: 0",
            "output" to "Output: 0%",
        )) assertEquals(text, extras.getValue(key).line.display())
        assertEquals("#C8323E", extras.getValue("lifesteal").line.color)
        // Each attribute, armor and resistance carries a breakdown; the rest are plain lines.
        assertEquals(listOf("str", "int", "dex", "vit", "for", "armor", "resistance"), extras.values.filter { it.effects.isNotEmpty() }.map { it.line.key })
    }

    @Test
    fun aMissingRunSpeedStillSaysSo() {
        val noSpeed = JsonObject(merchantStats - "unrestrictedSpeed")
        val extras = characterExtras(vitals("Merchantina", "merchant"), noSpeed, dartgun)
        assertEquals("Run Speed: Waiting for speed data", extras.single { it.line.key == "run_speed" }.line.display())
        assertTrue(characterCardLines("Merchantina", vitals("Merchantina", "merchant"), noSpeed).any { it.display() == "RUNSPD: 10" })
    }
}
