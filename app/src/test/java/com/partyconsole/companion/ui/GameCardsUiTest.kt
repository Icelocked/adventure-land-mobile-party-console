package com.partyconsole.companion.ui

import android.content.Context
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import com.partyconsole.companion.domain.itemCardLines
import com.partyconsole.companion.model.CharacterDiagnostics
import com.partyconsole.companion.model.CharacterVitals
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.ItemMeta
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.cardShot
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.characterdetail.CharacterStatsSheet
import com.partyconsole.companion.ui.components.ItemCards
import com.partyconsole.companion.ui.components.MonsterCards
import com.partyconsole.companion.ui.itemdetail.ItemDetailBrowser
import com.partyconsole.companion.ui.itemdetail.itemCardProperties
import com.partyconsole.companion.ui.itemdetail.itemExtras
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** The game-style cards on screen (app/docs/cards.md): layout, the skill link, the level
 *  preview and the remembered breakdowns. Each test also writes a PNG of what it rendered
 *  to app/build/card-shots/ through Robolectric's native graphics, for a visual check
 *  without a device. */
@RunWith(RobolectricTestRunner::class)
class GameCardsUiTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private val json = Json { ignoreUnknownKeys = true }
    private fun meta(text: String): ItemMeta = json.decodeFromString(ItemMeta.serializer(), text)

    private fun shot(name: String) {
        compose.waitForIdle()
        cardShot(name)
    }

    private fun bounds(matcher: SemanticsMatcher) = compose.onNode(matcher).fetchSemanticsNode().boundsInRoot

    private val mothsteps = meta(
        """{"upgradeable":true,"maxLevel":13,
            "definition":{"type":"shoes","tier":2,"scroll":true,"stat":2,"armor":8,"resistance":13,"evasion":4,"speed":8,"exclusive":true,"extra_stat":1,
              "explanation":"Cave of Darkness: +35% Evasion and +20 Speed.","g":90000,"upgrade":{"armor":1,"stat":1}},
            "properties":{"stat":2,"armor":8,"resistance":13,"evasion":4,"speed":8},"scaling":{"armor":1,"stat":1},
            "bonuses":[{"kind":"map","id":"cave","name":"Cave of Darkness","stats":{"evasion":35,"speed":20}}]}""",
    )

    private fun showMothsteps() {
        val item = Item(name = "cave_mothsteps", level = 0)
        val lines = itemCardLines(mothsteps, item, 0, itemCardProperties(mothsteps, 0, 0, null), null, true)
        compose.setContent { Column(Modifier.padding(16.dp)) { ItemCards(lines, itemExtras(mothsteps, item, 0, 0)) {} } }
        compose.waitForIdle()
    }

    @Test
    fun itemCardStacksTheExtrasBelowOnAPhone() {
        showMothsteps()
        compose.onNode(hasText("Bonus: Cave of Darkness [Only] Evasion +35% · Speed +20") and hasAnyAncestor(hasContentDescription("Item card"))).assertExists()
        compose.onNode(hasText("Extra Stat: 1") and hasAnyAncestor(hasContentDescription("Item extras"))).assertExists()
        val card = bounds(hasContentDescription("Item card"))
        val extras = bounds(hasContentDescription("Item extras"))
        assertTrue("extras below the card", extras.top >= card.bottom - 1f)
        assertEquals(card.left, extras.left, 1f)
        shot("item-card-phone")
    }

    @Test
    @Config(qualifiers = "w900dp-h1200dp")
    fun itemCardSitsBesideItsExtrasOnAWideScreen() {
        showMothsteps()
        val card = bounds(hasContentDescription("Item card"))
        val extras = bounds(hasContentDescription("Item extras"))
        assertTrue("extras beside the card", extras.left >= card.right - 1f)
        assertEquals("tops aligned", card.top, extras.top, 1f)
        shot("item-card-wide")
    }

    private fun catalogWith(entries: String, skills: String = "[]", monsters: String = "[]"): PartyViewModel {
        val catalog = console.sections.getValue("catalog")
        val merchant = catalog["merchantCatalog"]!!.jsonObject
        console.override(
            "catalog",
            mapOf(
                "merchantCatalog" to JsonObject(merchant + ("allItems" to JsonArray((merchant["allItems"] as JsonArray) + (Json.parseToJsonElement(entries) as JsonArray)))),
                "skillCatalog" to Json.parseToJsonElement(skills),
                "bestiaryCatalog" to Json.parseToJsonElement(monsters),
            ),
        )
        return PartyViewModel(console.settings)
    }

    @Test
    fun skillLinkOpensTheSkillCardAndBackReturns() {
        val viewModel = catalogWith(
            """[{"id":"zapper","name":"The Zapper","compoundable":true,"meta":{"compoundable":true,
                "definition":{"type":"ring","ability":"zapperzap","int":10,"str":5,"rpiercing":10,"resistance":30,"compound":{"int":3,"rpiercing":4},"grades":[0,0,1,3]},
                "properties":{"int":10,"str":5,"rpiercing":10,"resistance":30},
                "bonuses":[{"kind":"class","id":"warrior","name":"Warrior","stats":{"str":10,"apiercing":40}}]}}]""",
            skills = """[{"id":"shared","name":"Shared / system","skills":[{"id":"zapperzap","name":"Zap","definition":{"name":"Zap","explanation":"Zap your target for 200 damage","mp":140,"cooldown":200,"range":420,"damage":200}}]}]""",
        )
        compose.setContent {
            val state by viewModel.dynamicState.collectAsState()
            Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
                ItemDetailBrowser(rootItemId = "zapper", rootLevel = 0, catalog = state.merchantCatalog, monsters = state.bestiaryCatalog, viewModel = viewModel)
            }
        }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.merchantCatalog?.allItems?.any { it.id == "zapper" } == true && viewModel.dynamicState.value.skillCatalog.isNotEmpty() }
        compose.waitForIdle()
        compose.onNode(hasText("Bonus: Warrior [Only] Strength +10 · A.Piercing +40")).performScrollTo().assertExists()
        shot("item-card-skill-link")
        compose.onNodeWithText("Ability: Zap").performScrollTo().performClick()
        compose.waitForIdle()
        compose.onNodeWithText("G.skills.zapperzap").assertExists()
        compose.onNode(hasText("Cooldown: 0.2 seconds") and hasAnyAncestor(hasContentDescription("Skill card"))).assertExists()
        compose.onNode(hasText("Damage: 200") and hasAnyAncestor(hasContentDescription("Skill extras"))).assertExists()
        shot("skill-card-item-link")
        compose.onNodeWithText("Back").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Ability: Zap").assertExists()
    }

    @Test
    fun previewSliderMovesTheCardsStatsAndGrade() {
        val viewModel = catalogWith(
            """[{"id":"firestaff","name":"Fire Staff","upgradeable":true,"maxLevel":12,"meta":{"upgradeable":true,"maxLevel":12,
                "definition":{"type":"weapon","wtype":"staff","tier":2,"damage_type":"magical","g":50000,"grades":[6,8,10,12],"upgrade":{"attack":4,"int":1},"ability":"burn","attack":20,"int":3},
                "properties":{"attack":61,"int":14,"crit":1.2,"critdamage":5,"speed":4,"attr0":3,"lifesteal":2,"fzresistance":4},
                "scaling":{"attack":4,"int":1},"usage":{"classes":[{"id":"mage","name":"Mage","hands":2}],"hands":[2]}}}]""",
        )
        compose.setContent {
            val state by viewModel.dynamicState.collectAsState()
            Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
                ItemDetailBrowser(rootItemId = "firestaff", rootLevel = 9, catalog = state.merchantCatalog, monsters = state.bestiaryCatalog, viewModel = viewModel)
            }
        }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.merchantCatalog?.allItems?.any { it.id == "firestaff" } == true }
        compose.waitForIdle()
        compose.onNodeWithText("Grade: Rare").performScrollTo().assertExists()
        compose.onNodeWithText("Damage: 61").assertExists()
        compose.onNodeWithText("Burns the opponent with a 3% chance. Deals damage over time.").assertExists()
        shot("item-card-fire-staff")
        compose.onNode(SemanticsMatcher.keyIsDefined(SemanticsActions.SetProgress)).performSemanticsAction(SemanticsActions.SetProgress) { it(10f) }
        compose.waitForIdle()
        compose.onNodeWithText("Grade: Legendary").assertExists()
        compose.onNodeWithText("Damage: 61").assertDoesNotExist()
        compose.onNodeWithText("Lifesteal: 2%").assertExists()
    }

    private val goo = Json.parseToJsonElement(
        """{"name":"Goo","speed":6,"charge":12,"hp":100,"xp":100,"attack":5,"damage_type":"physical","respawn":1,"range":15,"frequency":0.4,"aggro":0,"aa":1,"achievements":[[10,"stat","hp",5]],"skin":"goo","rage":0,"mp":2}""",
    ).jsonObject
    private val mrgreen = Json.parseToJsonElement(
        """{"name":"Mr. Green","speed":40,"hp":36000000,"xp":48000000,"attack":1200,"damage_type":"physical","respawn":5640,"range":620,"frequency":1.6,"cooperative":true,
            "spawns":[["hp:0.75","greenjr",5],["hp:0.50","greenjr",5],["hp:0.25","greenjr",5]]}""",
    ).jsonObject

    @Test
    fun monsterLevelPreviewAndSpawnLinks() {
        var opened: String? = null
        compose.setContent {
            Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
                MonsterCards(goo, skillName = { null }, monsterName = { null })
                MonsterCards(mrgreen, skillName = { null }, monsterName = { if (it == "greenjr") "Green Jr." else null }, onMonster = { opened = it })
            }
        }
        compose.waitForIdle()
        compose.onNodeWithText("A.Speed: 40").assertExists()
        compose.onNode(hasText("Aggro: 0") and hasAnyAncestor(hasContentDescription("Monster extras"))).assertExists()
        shot("monster-card-goo")
        compose.onAllNodes(hasContentDescription("Monster level preview"))[0].performSemanticsAction(SemanticsActions.SetProgress) { it(9f) }
        compose.waitForIdle()
        for (line in listOf("XP: 900", "Damage: 10", "HP: 500", "Speed: 8.16", "A.Speed: 70.6")) compose.onNodeWithText(line).assertExists()
        compose.onNode(hasText("Gold and drop chance ×9.", substring = true)).assertExists()
        compose.onAllNodes(hasContentDescription("Monster level preview"))[0].performSemanticsAction(SemanticsActions.SetProgress) { it(15f) }
        compose.waitForIdle()
        for (line in listOf("XP: 1500", "Damage: 12", "HP: 800", "Speed: 8.88", "A.Speed: 80.8")) compose.onNodeWithText(line).assertExists()
        shot("monster-card-goo-level-15")
        compose.onAllNodes(hasText("Spawns: Green Jr."))[0].performScrollTo().performClick()
        assertEquals("greenjr", opened)
    }

    private fun vitals(name: String, ctype: String) =
        CharacterVitals(name = name, ctype = ctype, level = 61, hp = 4760, maxHp = 4760, mp = 2120, maxMp = 2700, gold = 0, map = "main", x = 0.0, y = 0.0, rip = false)
    private fun diagnostics(text: String) = CharacterDiagnostics().also {
        it.raw = Json.parseToJsonElement(text).jsonObject
    }
    private val merchantStats = """{"primaryStat":"int","attack":33.4,"frequency":0.73,"range":82,"speed":10,"unrestrictedSpeed":82.1,"standOpen":true,"armor":277,"resistance":500,
        "str":23,"int":110,"dex":99,"vit":50,"fortitude":15,"luck":100,"combatStats":{"crit":1.5,"critDamage":20,"lifesteal":2,"evasion":3,"armorPiercing":10,"fireResistance":4}}"""

    @Test
    fun collapseIsRememberedAcrossCharactersAndReopening() {
        val prefs = ApplicationProvider.getApplicationContext<Context>().getSharedPreferences("card_preferences", Context.MODE_PRIVATE)
        var who by mutableStateOf("Merchantina")
        var open by mutableStateOf(true)
        compose.setContent {
            if (open) CharacterStatsSheet(who, vitals(who, if (who == "Merchantina") "merchant" else "priest"), diagnostics(merchantStats), emptyMap()) {}
        }
        compose.waitForIdle()
        compose.onNode(hasText("NAME: Merchantina") and hasAnyAncestor(hasContentDescription("Character card"))).assertExists()
        compose.onNode(hasText("+483 Max HP +21 per point")).assertExists()
        shot("character-card-phone")
        compose.onNode(hasText("Strength: 23", substring = true)).performClick()
        compose.waitForIdle()
        compose.onNode(hasText("+483 Max HP +21 per point")).assertDoesNotExist()
        compose.onNode(hasText("+1,650 Max MP +15 per point")).assertExists()
        assertFalse(prefs.getBoolean("party-character-effects-str", true))
        // Another character's sheet keeps Strength collapsed.
        who = "Healer1"
        compose.waitForIdle()
        compose.onNode(hasText("NAME: Healer1")).assertExists()
        compose.onNode(hasText("+483 Max HP +21 per point")).assertDoesNotExist()
        // Closing and reopening the sheet reads the stored choice; expanding is stored too.
        open = false
        compose.waitForIdle()
        open = true
        compose.waitForIdle()
        compose.onNode(hasText("+483 Max HP +21 per point")).assertDoesNotExist()
        compose.onNode(hasText("Strength: 23", substring = true)).performClick()
        compose.waitForIdle()
        compose.onNode(hasText("+483 Max HP +21 per point")).assertExists()
        assertTrue(prefs.getBoolean("party-character-effects-str", false))
    }

    @Test
    @Config(qualifiers = "w900dp-h1200dp")
    fun characterCardSitsBesideItsExtrasOnAWideScreen() {
        compose.setContent { CharacterStatsSheet("Merchantina", vitals("Merchantina", "merchant"), diagnostics(merchantStats), emptyMap()) {} }
        compose.waitForIdle()
        val card = bounds(hasContentDescription("Character card"))
        val extras = bounds(hasContentDescription("Character extras"))
        assertTrue("extras beside the card", extras.left >= card.right - 1f)
        assertEquals("tops aligned", card.top, extras.top, 1f)
        shot("character-card-wide")
    }
}
