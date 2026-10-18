package com.partyconsole.companion.ui

import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.ryanV140
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.testing.field
import com.partyconsole.companion.ui.account.BankScreen
import com.partyconsole.companion.ui.characterdetail.sections.TravelSection
import com.partyconsole.companion.ui.merchant.MerchantSettings
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Console 1.4 bank features (web/e2e/bank-item-banners.spec.ts, bank.spec.ts,
 *  merchant-bank-sort-visit.spec.ts): one banner per bank item, items1's
 *  reservation only while BankBois exist, the server-side BankBoi delete
 *  check, the gapped bank sort layout and "Visit bank".
 *
 *  Failure modes:
 *  - A bank row lists several rule labels instead of the one banner the
 *    dashboard picks, or labels a rule differently.
 *  - An automatic NPC sale mark counts as a manual mark and hides the
 *    conflict between two automatic sale rules.
 *  - With shared rules another member's own rules still count.
 *  - An upgrade rule with quantity 0, or a compound rule at or below the
 *    item's level, shows a banner.
 *  - items1's last seven slots read RESERVED, and leave the free count,
 *    when no BankBoi exists.
 *  - A BankBoi that still holds items can't be deleted from the app, so the
 *    server's refusal never shows.
 *  - The gaps setting posts the sort mode, or the mode radio posts the
 *    layout; a refused change stays ticked.
 *  - "Visit bank" is missing when nobody else is online, or queues a visit
 *    to another character.
 */
@RunWith(RobolectricTestRunner::class)
class BankConsole14Test {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()

    @After fun stop() = console.close()

    private fun posts(path: String) = console.requests.filter { it.method == "POST" && it.path == "/party-api/$path" }.map { Json.parseToJsonElement(it.body).jsonObject }
    private fun json(text: String): JsonElement = Json.parseToJsonElement(text)
    private fun ruleKey(name: String, level: Int = 0) = """{"name":"$name","level":$level,"p":null,"stat_type":null}"""
    private fun quoted(text: String) = Json.encodeToString(JsonPrimitive.serializer(), JsonPrimitive(text))
    private val scroller = SemanticsMatcher.keyIsDefined(SemanticsProperties.VerticalScrollAxisRange)

    private fun bank(items1: String, bankbois: String = "[]") {
        console.override("bank", mapOf("bank" to json("""{"gold":5000000,"packs":{"items1":$items1}}"""), "bankbois" to json(bankbois)))
    }

    private val items1 = """[{"slot":0,"item":{"name":"ironore","q":5}},{"slot":1,"item":{"name":"bow","level":2}},{"slot":2,"item":{"name":"ringsj","level":1}},{"slot":3,"item":{"name":"gem0","q":2}},
        {"slot":4,"item":{"name":"hpot0","q":10}},{"slot":5,"item":{"name":"wcoat"}},{"slot":6,"item":{"name":"seashell","q":3}}]"""

    private fun showBank(): PartyViewModel {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { BankScreen(viewModel, onBack = {}) }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.bank != null && viewModel.dynamicState.value.merchantCatalog != null }
        compose.waitForIdle()
        return viewModel
    }

    private fun row(label: String) = compose.onNode(hasText(label)).also { compose.onAllNodes(scroller)[0].performScrollToNode(hasText(label)) }

    @Test
    fun bankRowsShowOneBannerPerAutomaticRule() {
        bank(items1)
        console.override("config", mapOf(
            "autoNpcSales" to json("""{${quoted(ruleKey("ironore"))}:{"item":{"name":"ironore","level":0}}}"""),
            "autoStandMarks" to json("""{${quoted(ruleKey("seashell"))}:{"item":{"name":"seashell","level":0},"price":50}}"""),
            "autoUpgradeMarks" to json("""{"Folla":{"bow@+2":{"tiers":3,"quantity":-1}},"Rangy":{"bow@+2":{"tiers":1,"quantity":0}}}"""),
            "autoCompounds" to json("""{"Merchy":[{"name":"ringsj","targetTier":3,"quantity":-1},{"name":"ringsj","targetTier":1,"quantity":-1}]}"""),
            "autoExchanges" to json("""{"gem0@0":true}"""),
            "autoItemMarks" to json("""{"Folla":{"hpot0@+0":"bank"}}"""),
            "autoDeconstruction" to json("""{"Merchy":{${quoted(ruleKey("wcoat"))}:{"item":{"name":"wcoat","level":0}}}}"""),
        ))
        showBank()
        row("ironore x5").assert(hasText("Auto NPC"))
        row("seashell x3").assert(hasText("Auto stand"))
        // Any character's upgrade rule counts without shared rules: +2 with 3 tiers.
        row("Bow +2").assert(hasText("Auto upgrade → +5"))
        row("Ring of Strength +1").assert(hasText("Auto compound → +3"))
        row("gem0 x2").assert(hasText("Auto exchange"))
        row("Health Potion x10").assert(hasText("Auto bank"))
        row("wcoat").assert(hasText("Auto deconstruction"))
    }

    @Test
    fun aManualNpcMarkWinsTwoAutomaticSaleRulesConflictAndSharedRulesCountOnlyTheMerchant() {
        bank(items1)
        console.override("config", mapOf(
            "autoNpcSales" to json("""{${quoted(ruleKey("ironore"))}:{"item":{"name":"ironore","level":0}},${quoted(ruleKey("seashell"))}:{"item":{"name":"seashell","level":0}}}"""),
            "npcSaleMarks" to json("""[{"id":"m1","source":"bank","pack":"items1","slot":0,"item":{"name":"ironore","q":5},"quantity":5},{"id":"a1","source":"bank","pack":"items1","slot":6,"item":{"name":"seashell","q":3},"quantity":3,"auto":true}]"""),
            "autoStandMarks" to json("""{${quoted(ruleKey("seashell"))}:{"item":{"name":"seashell","level":0},"price":50}}"""),
            "merchantRules" to json("""{"version":1,"owner":"Merchy","members":["Merchy","Folla"],"conflicts":[]}"""),
            "autoItemMarks" to json("""{"Folla":{"hpot0@+0":"bank"},"Merchy":{"gem0@+0":"bank"}}"""),
        ))
        showBank()
        row("ironore x5").assert(hasText("NPC sale"))
        // An auto mark is not a manual mark: the seashell shows its NPC and stand rules' conflict.
        row("seashell x3").assert(hasText("Rule conflict"))
        row("gem0 x2").assert(hasText("Auto bank"))
        row("Health Potion x10").assert(!hasText("Auto bank"))
    }

    private val tail = """[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,{"slot":36,"item":{"name":"bow","level":2}},null,null,null,null,null]"""

    @Test
    fun withoutBankboisItems1HasNoReservedSlots() {
        bank(tail)
        showBank()
        row("Bow +2").assert(!hasText("RESERVED"))
        compose.onNode(hasText("1/42 · 41 free")).assertExists()
        compose.onNode(hasText("No BankBois yet. All bank slots are available for ordinary storage.")).performScrollTo().assertExists()
    }

    @Test
    fun withBankboisItems1IsReservedAndTheServerJudgesADelete() {
        console.routes["bankbois/Vault1/delete"] = { _ -> 409 to """{"error":"bankboi must have no inventory, equipment, gold, or pending work"}""" }
        bank(tail, """[{"name":"Vault1","ctype":"merchant","state":"ready","items":[{"slot":0,"item":{"name":"ironore","q":9}}]}]""")
        val viewModel = showBank()
        eventually { viewModel.dynamicState.value.bankbois.isNotEmpty() }
        compose.waitForIdle()
        row("Bow +2").assert(hasText("RESERVED"))
        compose.onNode(hasText("1/42 · 35 free")).assertExists()
        compose.onAllNodes(scroller)[0].performScrollToNode(hasText("Delete"))
        compose.onNodeWithText("Delete").performClick()
        compose.onNodeWithText("Really? ×").performClick()
        eventually { posts("bankbois/Vault1/delete").isNotEmpty() }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("bankboi must have no inventory, equipment, gold, or pending work")).fetchSemanticsNodes().isNotEmpty() }
    }

    @Test
    fun theFirstBankboiWarnsAboutTheReservedSlots() {
        console.override("config", mapOf("bankboiPrefix" to JsonPrimitive("Vault")))
        showBank()
        compose.onNodeWithText("Create bankboi").performScrollTo().performClick()
        compose.onNodeWithText("This will reserve the final 7 slots of bank pane 1 for BankBoi logistics. Items already in those slots will be moved into BankBoi storage.").performScrollTo().assertExists()
    }

    @Test
    fun leaveGapsPostsOnlyTheLayoutAndTheModeRadioOnlyTheMode() {
        console.override("core", mapOf("bankSortMode" to JsonPrimitive("automatic"), "bankSortLayout" to JsonPrimitive("packed")))
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { androidx.compose.foundation.layout.Column(Modifier.verticalScroll(rememberScrollState())) { MerchantSettings(viewModel) } }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.bankSortMode != null }
        compose.waitForIdle()
        val gaps = compose.onNode(hasContentDescription("Leave gaps between item types"))
        gaps.assertIsOff()
        compose.onNode(hasText("Each item category starts on its own row", substring = true)).assertExists()
        gaps.performClick()
        eventually { posts("merchant/bank-sort").isNotEmpty() }
        assertEquals(listOf(json("""{"layout":"gapped"}""")), posts("merchant/bank-sort"))
        compose.waitUntil(5_000) { runCatching { gaps.assertIsOn() }.isSuccess }
        assertEquals(JsonPrimitive("gapped"), console.field("bankSortLayout"))

        compose.onAllNodes(SemanticsMatcher.expectValue(SemanticsProperties.Role, androidx.compose.ui.semantics.Role.RadioButton))[1].performClick()
        eventually { posts("merchant/bank-sort").size == 2 }
        assertEquals(json("""{"mode":"request"}"""), posts("merchant/bank-sort")[1])

        gaps.performClick()
        eventually { posts("merchant/bank-sort").size == 3 }
        assertEquals(json("""{"layout":"packed"}"""), posts("merchant/bank-sort")[2])
        compose.waitUntil(5_000) { runCatching { gaps.assertIsOff() }.isSuccess }

        console.failOnce["merchant/bank-sort"] = 400 to """{"error":"invalid bank sort setting"}"""
        gaps.performClick()
        eventually { posts("merchant/bank-sort").size == 4 }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("invalid bank sort setting")).fetchSemanticsNodes().isNotEmpty() }
        gaps.assertIsOff()
    }

    @Test
    fun sendMerchantToOffersVisitBankForTheMerchantItself() {
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { TravelSection("Merchy", isMerchant = true, travelPlaces = emptyList(), viewModel = viewModel) }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.merchantCharacter == "Merchy" }
        compose.waitForIdle()
        compose.onNodeWithText("Send merchant to…").performClick()
        // Nobody else is online, but the bank visit is still offered.
        compose.onNodeWithText("No other characters are online.").assertExists()
        compose.onNodeWithText("Visit bank").performClick()
        eventually { posts("command").isNotEmpty() }
        assertEquals(json("""{"character":"Merchy","type":"bank"}"""), posts("command")[0])
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Bank visit queued")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Visit bank").assertDoesNotExist()

        console.failOnce["command"] = 409 to """{"error":"Merchant is busy"}"""
        compose.onNodeWithText("Send merchant to…").performClick()
        compose.onNodeWithText("Visit bank").performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Merchant is busy")).fetchSemanticsNodes().isNotEmpty() }
    }

    @Test
    fun ryanV140HasNoGappedBankSort() {
        console.ryanV140()
        console.override("core", mapOf("bankSortMode" to JsonPrimitive("automatic")))
        val viewModel = PartyViewModel(console.settings)
        compose.setContent { androidx.compose.foundation.layout.Column(Modifier.verticalScroll(rememberScrollState())) { MerchantSettings(viewModel) } }
        eventually { viewModel.stateLoaded.value && viewModel.dynamicState.value.bankSortMode != null }
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Sort every bank visit")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNode(hasContentDescription("Leave gaps between item types")).assertDoesNotExist()
    }
}
