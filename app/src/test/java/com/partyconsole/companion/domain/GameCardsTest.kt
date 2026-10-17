package com.partyconsole.companion.domain

import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.ItemMeta
import com.partyconsole.companion.ui.itemdetail.itemCardProperties
import com.partyconsole.companion.ui.itemdetail.itemExtras
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The item and monster card line builders against the PWA's e2e expectations
 *  (web/e2e/item-card.spec.ts, monster-card.spec.ts and stat-colors.spec.ts on
 *  the cards-1.4 branch). app/docs/cards.md lists the failure inventory. */
class GameCardsTest {
    private val json = Json { ignoreUnknownKeys = true }
    private fun meta(text: String): ItemMeta = json.decodeFromString(ItemMeta.serializer(), text)
    private fun obj(text: String): JsonObject = Json.parseToJsonElement(text).jsonObject

    private fun card(meta: ItemMeta, item: Item, previewLevel: Int = item.level ?: 0, usable: Boolean = true, skillName: (String) -> String? = { null }): List<CardLine> =
        itemCardLines(
            meta = meta,
            item = item.copy(level = previewLevel),
            level = previewLevel,
            properties = itemCardProperties(meta, item.level ?: 0, previewLevel, item.statType),
            setName = meta.world?.set?.name,
            usable = usable,
            skillName = skillName,
        )

    // The card the item sheet shows: its header already carries the explanation.
    private fun shown(lines: List<CardLine>) = lines.filter { it.key != "explanation" }.map { it.display() }
    private fun line(lines: List<CardLine>, key: String) = lines.single { it.key == key }

    private val mothsteps = meta(
        """{"upgradeable":true,"maxLevel":13,
            "definition":{"type":"shoes","tier":2,"scroll":true,"stat":2,"armor":8,"resistance":13,"evasion":4,"speed":8,"exclusive":true,"extra_stat":1,
              "explanation":"Cave of Darkness: +35% Evasion and +20 Speed.","g":90000,"upgrade":{"armor":1,"stat":1}},
            "properties":{"stat":2,"armor":8,"resistance":13,"evasion":4,"speed":8},
            "scaling":{"armor":1,"stat":1},
            "bonuses":[{"kind":"map","id":"cave","name":"Cave of Darkness","stats":{"evasion":35,"speed":20}}],
            "usage":{"classes":[{"id":"warrior","name":"Warrior"},{"id":"mage","name":"Mage"}]}}""",
    )

    @Test
    fun paletteMatchesThePwa() {
        // web/src/lib/statColors.ts, copied hex for hex.
        val pwa = mapOf(
            "hp" to "#FF2E46", "mp" to "#3A62CE", "attack" to "#DB2900", "frequency" to "#3BE681", "range" to "#93A6A2", "speed" to "#36B89E",
            "armor" to "#A3A9B0", "resistance" to "#8B74C9", "str" to "#F07F2F", "int" to "#3E6EED", "dex" to "#44B75C", "vit" to "#FF2E46",
            "for" to "#9A6BC9", "luck" to "#5DE376", "gold" to "gold", "xp" to "#1E73DE", "crit" to "#E52967", "critdamage" to "#C2366A",
            "evasion" to "#7AC0F5", "avoidance" to "#7AC0F5", "miss" to "#F36C6E", "reflection" to "#B484E5", "dreturn" to "#E94959",
            "lifesteal" to "#C8323E", "manasteal" to "#5C66D9", "output" to "#D93319", "heal" to "#CB83AC", "pnresistance" to "#68B84B",
            "firesistance" to "#D2473D", "fzresistance" to "#69B1B6", "phresistance" to "#69B1B6", "stresistance" to "#9FA7B6",
            "blastresistance" to "#8E72A8", "level" to "orange", "cooldown" to "#4EB7DE", "duration" to "#E1924D",
        )
        assertEquals(pwa, STAT_COLORS)
        assertTrue("Cooldown differs from Evasion", STAT_COLORS["cooldown"] != STAT_COLORS["evasion"])
    }

    @Test
    fun namedColorsResolve() {
        assertEquals(0xFFFFD700L, cssColorArgb("gold"))
        assertEquals(0xFF808080L, cssColorArgb("gray"))
        assertEquals(0xFF808080L, cssColorArgb("grey"))
        assertEquals(0xFFFFA500L, cssColorArgb("orange"))
        assertEquals(0xFFDB2900L, cssColorArgb("#DB2900"))
        assertEquals(0xFFFF9100L, cssColorArgb("#ff9100"))
        assertEquals(0xFFAEAEAEL, cssColorArgb("#aeaeae"))
    }

    @Test
    fun mothstepsShowGameLinesAndTheMapBonus() {
        val lines = card(mothsteps, Item(name = "cave_mothsteps", level = 0))
        assertEquals(
            listOf("Evasion: 4%", "Stat: 2", "Armor: 8", "Resistance: 13", "Speed: +8", "Bonus: Cave of Darkness [Only] Evasion +35% · Speed +20", "[i]: Upgradeable"),
            shown(lines),
        )
        assertEquals("#7AC0F5", line(lines, "evasion").color)
    }

    @Test
    fun mothstepsExtrasHoldEveryOtherTableFieldReadable() {
        val item = Item(name = "cave_mothsteps", level = 0)
        val extras = itemExtras(mothsteps, item, 0, 0)
        val byKey = extras.associate { it.key to it.display() }
        assertEquals("Equip Slot: Shoes", byKey["equip_slot"])
        assertEquals("Stackable: No", byKey["stackable"])
        assertEquals("Tier: 2", byKey["tier"])
        assertEquals("Scroll: Yes", byKey["scroll"])
        assertEquals("Exclusive: Yes", byKey["exclusive"])
        assertEquals("Extra Stat: 1", byKey["extra_stat"])
        assertEquals("#56A244", extras.single { it.key == "tier" }.color)
        for (key in listOf("armor", "resistance", "evasion", "speed", "stat")) assertFalse(key, key in byKey)
    }

    @Test
    fun vampiricGlovesFoldTheStatIntoTheScrolledStatAndKeepEveryGameStat() {
        val gloves = meta(
            """{"upgradeable":true,"maxLevel":12,
                "definition":{"type":"gloves","set":"vampires","int":3,"str":3,"fzresistance":4,"tier":3,"scroll":true,"upgrade":{"stat":1,"resistance":5.5,"armor":5.5},"g":340000,"grades":[0,0,9,10],"stat":3,"extra_stat":2,"armor":28,"resistance":14},
                "properties":{"str":14,"int":3,"armor":68,"resistance":54,"fzresistance":4},
                "scaling":{"stat":1,"resistance":5.5,"armor":5.5}}""",
        )
        val item = Item(name = "vgloves", level = 8, statType = "str")
        val lines = card(gloves, item)
        assertEquals("Strength: 14", line(lines, "str").display())
        assertTrue(lines.none { it.key == "stat" })
        assertEquals("Intelligence: 3", line(lines, "int").display())
        assertEquals("Armor: 68", line(lines, "armor").display())
        assertEquals("Resistance: 54", line(lines, "resistance").display())
        assertEquals("Freeze Res.: 4", line(lines, "fzresistance").display())
        assertEquals("#F07F2F", line(lines, "str").color)
        assertTrue(lines.none { it.key == "stat_type" })
        val extras = itemExtras(gloves, item, 8, 8).associate { it.key to it.display() }
        assertEquals("Stat Scroll: Strength", extras["stat_type"])
        assertEquals("Extra Stat: 2", extras["extra_stat"])
        assertEquals("Equip Slot: Gloves", extras["equip_slot"])
    }

    @Test
    fun wingedBootsWithAStatScrollReadLikeTheGamesCard() {
        for ((statType, statLine) in listOf("int" to "Intelligence: 9", "dex" to "Dexterity: 9")) {
            val winged = meta(
                """{"upgradeable":true,"maxLevel":13,
                    "definition":{"set":"swift","tier":1.5,"type":"shoes","frequency":3,"speed":8,"resistance":20,"scroll":true,
                      "upgrade":{"frequency":0.625,"speed":1,"stat":1,"resistance":1.5,"armor":1.5},"g":150000,"credit":"Pluet","grades":[4,8,10,12],"stat":1,"armor":6},
                    "properties":{"$statType":9,"armor":17,"resistance":31,"speed":15,"frequency":8},
                    "scaling":{"frequency":0.625,"speed":1,"stat":1,"resistance":1.5,"armor":1.5},
                    "world":{"set":{"id":"swift","name":"Swift Judgement","explanation":"","items":[{"id":"wingedboots","name":"Winged Boots","quantity":1}],"bonuses":[{"pieces":2,"stats":{"dex":1}}]}},
                    "usage":{"classes":[{"id":"mage","name":"Mage"}]}}""",
            )
            val item = Item(name = "wingedboots", level = 7, statType = statType)
            assertEquals(
                listOf(statLine, "Armor: 17", "Resistance: 31", "Speed: +15", "A.Speed: 8", "Grade: High", "Set: Swift Judgement", "[i]: Upgradeable"),
                shown(card(winged, item)),
            )
            val extras = itemExtras(winged, item, 7, 7).associate { it.key to it.display() }
            assertEquals("Credit: Pluet", extras["credit"])
            assertEquals("Stat Scroll: " + if (statType == "int") "Intelligence" else "Dexterity", extras["stat_type"])
        }
    }

    private val staff = meta(
        """{"upgradeable":true,"maxLevel":12,
            "definition":{"type":"weapon","wtype":"staff","tier":2,"damage_type":"magical","g":50000,"grades":[6,8,10,12],"upgrade":{"attack":4,"int":1},"ability":"burn","attack":20,"int":3},
            "properties":{"attack":61,"int":14,"crit":1.2,"critdamage":5,"speed":4,"attr0":3,"lifesteal":2,"fzresistance":4},
            "scaling":{"attack":4,"int":1},
            "usage":{"classes":[{"id":"mage","name":"Mage","hands":2}],"hands":[2]}}""",
    )

    @Test
    fun fireStaffKeepsTheGameOrderLabelsAndColors() {
        val lines = card(staff, Item(name = "firestaff", level = 9))
        val order = lines.map { it.key }
        assertTrue(order.indexOf("lifesteal") < order.indexOf("crit"))
        assertTrue(order.indexOf("crit") < order.indexOf("critdamage"))
        assertTrue(order.indexOf("critdamage") < order.indexOf("attack"))
        assertTrue(order.indexOf("attack") < order.indexOf("int"))
        assertEquals("Damage: 61", line(lines, "attack").display())
        assertEquals("#DB2900", line(lines, "attack").color)
        assertEquals("Crit Damage: +5%", line(lines, "critdamage").display())
        assertEquals("#C2366A", line(lines, "critdamage").color)
        assertEquals("Lifesteal: 2%", line(lines, "lifesteal").display())
        assertEquals("#C8323E", line(lines, "lifesteal").color)
        assertEquals("Freeze Res.: 4", line(lines, "fzresistance").display())
        assertEquals("#69B1B6", line(lines, "fzresistance").color)
        assertEquals("Type: Magical", line(lines, "damage_type").display())
        assertEquals("Run Speed: +4", line(lines, "speed").display())
        assertEquals("Grade: Rare", line(lines, "grade").display())
        assertEquals("Ability: Burn", line(lines, "ability").display())
        assertEquals("Burns the opponent with a 3% chance. Deals damage over time.", line(lines, "ability_text").display())
        val type = line(lines, "weapon_type") as PropLine
        assertEquals("Type: T2 Staff", type.display())
        assertEquals("gray", type.color)
        assertEquals("#56A244", type.valueColor)
        assertEquals("#CC3837", (line(card(staff, Item(name = "firestaff", level = 9), usable = false), "weapon_type") as PropLine).valueColor)
    }

    @Test
    fun theLevelPreviewMovesStatsAndGradeAndKeepsUncoveredStats() {
        val lines = card(staff, Item(name = "firestaff", level = 9), previewLevel = 10)
        assertEquals("Grade: Legendary", line(lines, "grade").display())
        assertTrue(line(lines, "attack").display() != "Damage: 61")
        assertEquals("Lifesteal: 2%", line(lines, "lifesteal").display())
    }

    @Test
    fun lolipopMaceShowsExplosionAndSugarRushAsGameLines() {
        val mace = meta(
            """{"upgradeable":true,"maxLevel":12,
                "definition":{"type":"weapon","wtype":"mace","tier":0,"dex":24,"explosion":20,"ability":"sugarrush","attr0":0.25,"damage_type":"physical","upgrade":{"explosion":2,"range":1,"attack":2.9},"g":16000,"grades":[8,9,10,12],"range":4,"attack":14},
                "properties":{"attack":34,"dex":24,"explosion":34,"range":11,"attr0":0.25},
                "scaling":{"explosion":2,"range":1,"attack":2.9}}""",
        )
        val lines = card(mace, Item(name = "glolipop", level = 7), usable = false)
        assertEquals("Explosion: 34%", line(lines, "explosion").display())
        assertEquals("#782D33", line(lines, "explosion").color)
        assertEquals("Ability: Sugar Rush", line(lines, "ability").display())
        assertEquals("#D64770", line(lines, "ability").color)
        assertEquals("Trigger a Sugar Rush on attack with 0.25% chance. Gain 240 Attack Speed for 10 seconds!", line(lines, "ability_text").display())
        assertTrue(lines.none { it.display().contains("attr0") || it.display().contains("sugarrush") })
        assertEquals("#CC3837", (line(lines, "weapon_type") as PropLine).valueColor)
    }

    @Test
    fun zapperLinksItsSkillAndKeepsTheClassBonusStats() {
        val zapper = meta(
            """{"compoundable":true,
                "definition":{"type":"ring","ability":"zapperzap","int":10,"str":5,"rpiercing":10,"resistance":30,"compound":{"int":3,"rpiercing":4},"grades":[0,0,1,3]},
                "properties":{"int":10,"str":5,"rpiercing":10,"resistance":30},
                "bonuses":[{"kind":"class","id":"warrior","name":"Warrior","stats":{"str":10,"apiercing":40}}]}""",
        )
        val lines = card(zapper, Item(name = "zapper", level = 0), skillName = { if (it == "zapperzap") "Zap" else null })
        val ability = line(lines, "ability") as PropLine
        assertEquals("Ability: Zap", ability.display())
        assertEquals("zapperzap", ability.skill)
        assertTrue(lines.none { it.display().contains("zapperzap") })
        assertEquals("Bonus: Warrior [Only] Strength +10 · A.Piercing +40", line(lines, "bonus_warrior").display())
    }

    @Test
    fun nonEquipmentShowsOnlyTheGameLinesAndTheQuantityInTheExtras() {
        val cases = listOf(
            """{"definition":{"type":"tracker","special":true,"g":12,"explanation":"A tool that tracks all your experiences."}}""" to listOf("[i]: Information"),
            """{"definition":{"type":"material","explanation":"A durable yet sticky material","s":9999,"g":300},"world":{"usedIn":[{"id":"wbook1","name":"Wanderer's Book","quantity":3,"level":0,"cost":0,"quest":null}]}}""" to listOf("[i]: Usable"),
            """{"definition":{"type":"material","s":9999,"g":50},"world":{"usedIn":[{"id":"wcap","name":"Cap","quantity":3,"level":0,"cost":0,"quest":"mcollector"}]}}""" to
                listOf("An unknown material, as in, you have no idea what to do with it!", "[i]: Collectable"),
            """{"definition":{"type":"pot","gives":[["hp",400]],"cooldown":2000,"s":9999,"g":100}}""" to listOf("HP: +400", "[i]: Information"),
            """{"definition":{"type":"elixir","luck":16,"duration":12,"s":9999,"g":240000}}""" to listOf("Luck: +16%", "Hours: 12", "[i]: Information"),
            """{"compoundable":true,"definition":{"type":"booster","gain":"xp","xp":20,"compound":{"xp":1},"grades":[0,10,6,7],"days":30,"g":79840000}}""" to listOf("XP: +20%", "[i]: Compoundable"),
            """{"definition":{"type":"gem","e":1,"s":9999,"g":24000}}""" to listOf("[i]: Exchangeable"),
        )
        for ((text, expected) in cases) {
            val entry = meta(text)
            val item = Item(name = "x", q = 5)
            assertEquals(text, expected, shown(card(entry, item)))
            assertEquals("Quantity: 5", itemExtras(entry, item, 0, 0).single { it.key == "quantity" }.display())
        }
    }

    @Test
    fun lockAccountBindingAndExpiryOnTheCardQuantityAndScrollInTheExtras() {
        val ring = meta("""{"compoundable":true,"maxLevel":7,"definition":{"type":"ring","compound":{"dex":1},"dex":1},"properties":{"dex":6},"scaling":{"dex":1}}""")
        val item = Item(name = "dexring", level = 5, statType = "dex", l = JsonPrimitive("l"), acl = JsonPrimitive(1), q = 2, expires = JsonPrimitive("2099-01-01T00:00:00.000Z"))
        val lines = card(ring, item)
        val texts = lines.map { it.display() }
        assertTrue(texts.contains("Locked"))
        assertTrue(texts.contains("Account Bound"))
        // new Date(...).toLocaleString() in the device's zone; UTC keeps the year fixed here.
        assertTrue(texts.any { it.startsWith("Expires: ") })
        assertTrue(formatExpiry(JsonPrimitive("2099-01-01T00:00:00.000Z"), java.time.ZoneOffset.UTC, java.util.Locale.US).contains("2099"))
        assertEquals("#8C8C8C", line(lines, "lock").color)
        assertTrue(texts.none { it.contains("Quantity") || it.contains("Stat Scroll") })
        val extras = itemExtras(ring, item, 5, 5).associate { it.key to it.display() }
        assertEquals("Quantity: 2", extras["quantity"])
        assertEquals("Stat Scroll: Dexterity", extras["stat_type"])
        assertEquals("Sealed", line(card(ring, item.copy(l = JsonPrimitive("s"))), "lock").display())
    }

    @Test
    fun gradeFollowsTheGradesAtThePreviewLevel() {
        val sword = obj("""{"upgrade":{"attack":1}}""")
        assertEquals(0, itemGrade(sword, 8))
        assertEquals(1, itemGrade(sword, 9))
        assertEquals(4, itemGrade(sword, 12))
        assertEquals(0, itemGrade(obj("""{"type":"helmet"}"""), 12))
    }

    // Monster definitions from the live game data (G.monsters).
    private val goo = obj("""{"name":"Goo","speed":6,"charge":12,"hp":100,"xp":100,"attack":5,"damage_type":"physical","respawn":1,"range":15,"frequency":0.4,"aggro":0,"aa":1,"achievements":[[10,"stat","hp",5]],"skin":"goo","rage":0,"mp":2}""")
    private val mrgreen = obj(
        """{"name":"Mr. Green","speed":40,"charge":90,"hp":36000000,"xp":48000000,"attack":1200,"damage_type":"physical","respawn":5640,"phresistance":100,"range":620,
            "frequency":1.6,"aggro":1,"rage":1,"apiercing":320,"resistance":900,"cooperative":true,"announce":"#256943",
            "spawns":[["hp:0.75","greenjr",5],["hp:0.50","greenjr",5],["hp:0.25","greenjr",5]],"skin":"mrgreen"}""",
    )
    private val monsterName = { id: String -> if (id == "greenjr") "Green Jr." else null }
    private val skillName = { id: String -> if (id == "weakness_aura") "Weakness Aura" else null }
    private fun monster(definition: Map<String, JsonElement>, level: Int = 1) = monsterCardLines(monsterAtLevel(definition, level), skillName, monsterName)

    @Test
    fun gooAtLevelOneReadsTheGamesMonsterMode() {
        val lines = monster(goo)
        assertEquals(listOf("XP: 100", "Damage: 5", "Type: Physical", "Range: 15", "HP: 100", "MP: 2", "Speed: 6", "A.Speed: 40"), lines.map { it.display() })
        assertEquals("#DB2900", line(lines, "attack").color)
        assertEquals("#FF2E46", line(lines, "hp").color)
        val extras = monsterExtras(goo, skillName)
        assertEquals(listOf("Aa: 1", "Aggro: 0", "Charge: 12", "Rage: 0", "Respawn: 1"), extras.map { it.display() })
        assertEquals("#E13758", extras.single { it.key == "aggro" }.color)
        assertEquals("#7AC0F5", extras.single { it.key == "respawn" }.color)
        assertEquals("#36B89E", extras.single { it.key == "charge" }.color)
        assertEquals("#F36C6E", extras.single { it.key == "rage" }.color)
    }

    @Test
    fun gooLevelPreviewFollowsLevelMonsterAndCalculateMonsterStats() {
        assertEquals(listOf("XP: 900", "Damage: 10", "Type: Physical", "Range: 15", "HP: 500", "MP: 2", "Speed: 8.16", "A.Speed: 70.6"), monster(goo, 9).map { it.display() })
        assertEquals(listOf("XP: 1500", "Damage: 12", "Type: Physical", "Range: 15", "HP: 800", "MP: 2", "Speed: 8.88", "A.Speed: 80.8"), monster(goo, 15).map { it.display() })
        // Level 12 and 20 share the combat stats; HP and XP keep growing.
        assertEquals("Speed: 8.88", line(monster(goo, 12), "speed").display())
        assertEquals("HP: 1050", line(monster(goo, 20), "hp").display())
        assertEquals("XP: 2000", line(monster(goo, 20), "xp").display())
        assertEquals(goo, monsterAtLevel(goo, 1))
        assertEquals("Gold and drop chance ×9. ", monsterLevelNote(9).substringBefore("Monsters"))
        assertFalse(monsterLevelNote(1).contains("×"))
    }

    @Test
    fun mrGreenKeepsGameNamesFlagsAndSpawns() {
        val lines = monster(mrgreen)
        assertEquals(
            listOf(
                "XP: 48000000", "Damage: 1200", "Type: Physical", "Range: 620", "HP: 36000000", "A.Piercing: 320", "Resistance: 900", "Impact Res.: 100", "Speed: 40",
                "A.Speed: 160", "Cooperative", "Spawns: Green Jr.", "Spawns: Green Jr.", "Spawns: Green Jr.",
            ),
            lines.map { it.display() },
        )
        assertEquals("#237B2A", line(lines, "spawn_0").color)
        assertEquals("greenjr", (line(lines, "spawn_0") as PropLine).monster)
        assertTrue(monsterExtras(mrgreen, skillName).map { it.display() }.contains("Respawn: 5640"))
    }

    @Test
    fun aSkillAuraReadsAsAnAuraAndOtherAbilitiesMoveToTheExtras() {
        val scorpion = obj("""{"name":"Black Scorpion","speed":24,"hp":1200000,"xp":900000,"attack":2400,"damage_type":"physical","respawn":3600,"range":40,"frequency":1,"aggro":1,"skin":"bscorpion","abilities":{"weakness_aura":{"aura":true,"condition":"weakness","radius":100,"cooldown":4000}}}""")
        val aura = line(monster(scorpion), "ability_weakness_aura") as PropLine
        assertEquals("Aura: Weakness Aura", aura.display())
        assertEquals("#FC5F39", aura.color)
        assertEquals("weakness_aura", aura.skill)
        val harpy = obj("""{"name":"Harpy","speed":30,"hp":32000,"xp":24000,"attack":160,"damage_type":"physical","respawn":60,"range":30,"frequency":1,"aggro":0.5,"skin":"harpy","abilities":{"warp_on_hit":{"unlimited":true,"attr0":0.08}}}""")
        assertTrue(monsterExtras(harpy, skillName).map { it.display() }.contains("Abilities: warp_on_hit"))
        assertTrue(monster(harpy).none { it.display().contains("warp") })
    }

    @Test
    fun prettyNumbersFollowTheGamesFormatting() {
        assertEquals("8.87", prettyFloat(8.879))
        assertEquals("1,234.5", prettyFloat(1234.5))
        assertEquals("0", prettyFloat(-0.0))
        assertEquals("1,200", prettyNum(1200.9))
        assertEquals("70.6", hundredths(70.59999999))
        assertEquals("61", jsText(JsonPrimitive(61.0)))
        assertEquals("0.25", jsText(JsonPrimitive(0.25)))
    }

    @Test
    fun aStatReadsTheSameColorOnEveryCard() {
        // stat-colors.spec.ts: Attack, MP, Armor, Resistance, Lifesteal and Range on the item
        // card, the monster card, the character card and extras, the comparison and the skill card.
        val stats = """{"attack":30,"mp":50,"armor":20,"resistance":10,"lifesteal":2,"range":5,"evasion":3,"frequency":1,"speed":4}"""
        val item = card(meta("""{"definition":{"type":"chest"},"properties":$stats}"""), Item(name = "testgear")).associate { it.key to it.color }
        val monster = monsterCardLines(obj(stats), { null }, { null }).associate { it.key to it.color }
        val vitals = com.partyconsole.companion.model.CharacterVitals(name = "Mage1", ctype = "mage", level = 50, hp = 1, maxHp = 1, mp = 1, maxMp = 1, gold = 0, map = "main", x = 0.0, y = 0.0, rip = false)
        val raw = obj("""{"primaryStat":"int","attack":30,"frequency":1,"range":5,"speed":4,"armor":20,"resistance":10,"combatStats":{"lifesteal":2,"manasteal":1}}""")
        val character = characterCardLines("Mage1", vitals, raw).associate { it.key to it.color }
        val extras = characterExtras(vitals, raw, emptyMap()).associate { it.line.key to it.line.color }
        val comparison = com.partyconsole.companion.ui.itempanel.COMPARISON_ROW_COLORS
        val skill = skillCardLines(obj("""{"explanation":"x","mp":10,"range":5,"cooldown":1000}"""), { null }).associate { it.key to it.color }
        val expected = mapOf("attack" to "#DB2900", "mp" to "#3A62CE", "armor" to "#A3A9B0", "resistance" to "#8B74C9", "lifesteal" to "#C8323E", "range" to "#93A6A2")
        assertEquals(expected.getValue("attack"), item["attack"]); assertEquals(expected.getValue("attack"), monster["attack"]); assertEquals(expected.getValue("attack"), character["attack"]); assertEquals(expected.getValue("attack"), comparison["attack"])
        assertEquals(expected.getValue("mp"), item["mp"]); assertEquals(expected.getValue("mp"), monster["mp"]); assertEquals(expected.getValue("mp"), character["mp"]); assertEquals(expected.getValue("mp"), comparison["max_mp"]); assertEquals(expected.getValue("mp"), skill["mp"])
        assertEquals(expected.getValue("armor"), item["armor"]); assertEquals(expected.getValue("armor"), character["armor"]); assertEquals(expected.getValue("armor"), extras["armor"]); assertEquals(expected.getValue("armor"), comparison["armor"])
        assertEquals(expected.getValue("resistance"), item["resistance"]); assertEquals(expected.getValue("resistance"), character["resistance"]); assertEquals(expected.getValue("resistance"), extras["resistance"]); assertEquals(expected.getValue("resistance"), comparison["resistance"])
        assertEquals(expected.getValue("lifesteal"), item["lifesteal"]); assertEquals(expected.getValue("lifesteal"), extras["lifesteal"]); assertEquals(expected.getValue("lifesteal"), comparison["lifesteal"])
        assertEquals(expected.getValue("range"), item["range"]); assertEquals(expected.getValue("range"), monster["range"]); assertEquals(expected.getValue("range"), character["range"]); assertEquals(expected.getValue("range"), comparison["range"]); assertEquals(expected.getValue("range"), skill["range"])
        // A dark game color stays readable: the brighter Fortitude and Manasteal shades.
        assertEquals("#9A6BC9", extras["for"])
        assertEquals("#5C66D9", extras["manasteal"])
    }
}
