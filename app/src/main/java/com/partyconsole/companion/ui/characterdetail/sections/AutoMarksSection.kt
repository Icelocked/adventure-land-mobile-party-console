package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.PartyStateDynamic
import com.partyconsole.companion.model.itemFromRuleKey
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.itemicon.displayName
import kotlinx.coroutines.launch

/** One removable rule row, shared shape across all seven auto-mark
 *  categories despite their different underlying wire formats (see
 *  model/MerchantJob.kt's Auto*Rule types). */
private data class RuleEntry(val key: String, val item: Item, val detail: String?, val onRemove: suspend () -> Unit)

/** Ports inventory-panel.tsx's seven "automaticSection(...)" blocks - the
 *  auto-mark management view this app didn't have at all before: not
 *  just setting a rule (item action panel), but seeing and removing every
 *  standing rule. "Upgrade rules" (UpgradeOfferingRules, a separate offer-
 *  negotiation feature) is deliberately not ported - its own system this
 *  app doesn't touch elsewhere either, called out rather than guessed at. */
@Composable
fun AutoMarksSection(
    characterName: String,
    isMerchant: Boolean,
    dynamicState: PartyStateDynamic,
    viewModel: PartyViewModel,
    catalogFor: (String) -> CatalogItem? = { null },
) {
    val npcEntries = dynamicState.autoNpcSales.entries
        .filter { (_, rule) -> if (isMerchant) rule.character == null else rule.character == characterName }
        .map { (key, rule) -> RuleEntry(key, rule.item, null) { viewModel.api.autoNpcSale(characterName, rule.item, remove = true) } }

    val deconEntries = dynamicState.autoDeconstruction[characterName].orEmpty().entries
        .map { (key, rule) -> RuleEntry(key, rule.item, null) { viewModel.api.autoDeconstruct(characterName, rule.item, remove = true) } }

    val bankEntries = dynamicState.autoItemMarks[characterName].orEmpty().entries
        .filter { (_, mode) -> mode == "bank" }
        .map { (key, _) -> RuleEntry(key, itemFromRuleKey(key), null) { viewModel.api.removeAutoItemMark(characterName, "bank", key) } }

    SectionCard(title = "Automatic rules") {
        AutoRuleGroup("Auto NPC sales", npcEntries, catalogFor)
        AutoRuleGroup("Auto deconstruction", deconEntries, catalogFor)

        if (isMerchant) {
            val standEntries = dynamicState.autoStandMarks.entries
                .map { (key, rule) -> RuleEntry(key, rule.item, "${rule.price}g") { viewModel.api.autoStand(characterName, rule.item, rule.price, remove = true) } }

            val upgradeEntries = dynamicState.autoUpgradeMarks.entries.flatMap { (owner, rules) ->
                rules.entries.map { (ruleKey, _) ->
                    val item = itemFromRuleKey(ruleKey)
                    RuleEntry("$owner:$ruleKey", item, if (owner != characterName) owner else null) {
                        viewModel.api.removeAutoUpgradeRule(owner, item, ruleKey)
                    }
                }
            }

            val compoundEntries = dynamicState.autoCompounds.entries.flatMap { (owner, rules) ->
                rules.map { rule ->
                    RuleEntry("$owner:${rule.name}", Item(name = rule.name), "target +${rule.targetTier}" + if (owner != characterName) " · $owner" else "") {
                        viewModel.api.removeAutoCompound(owner, rule.name, rule.targetTier)
                    }
                }
            }

            val merchantMarkEntries = dynamicState.autoItemMarks[characterName].orEmpty().entries
                .filter { (_, mode) -> mode == "merchant" }
                .map { (key, _) -> RuleEntry(key, itemFromRuleKey(key), null) { viewModel.api.removeAutoItemMark(characterName, "merchant", key) } }

            AutoRuleGroup("Auto stand marks", standEntries, catalogFor)
            AutoRuleGroup("Auto upgrades", upgradeEntries, catalogFor)
            AutoRuleGroup("Auto compounds", compoundEntries, catalogFor)
            AutoRuleGroup("Auto merchant marks", merchantMarkEntries, catalogFor)
        }

        AutoRuleGroup("Auto bank marks", bankEntries, catalogFor)
    }
}

@Composable
private fun AutoRuleGroup(title: String, entries: List<RuleEntry>, catalogFor: (String) -> CatalogItem?) {
    var expanded by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            androidx.compose.material3.TextButton(onClick = { expanded = !expanded }) {
                Text("$title (${entries.size})", style = MaterialTheme.typography.bodyMedium)
            }
        }
        if (expanded) {
            for (entry in entries) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(start = 16.dp, top = 2.dp, bottom = 2.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        displayName(entry.item.name, catalogFor) + (entry.item.level?.let { " +$it" } ?: "") + (entry.detail?.let { " · $it" } ?: ""),
                        style = MaterialTheme.typography.labelMedium,
                    )
                    IconButton(onClick = { scope.launch { entry.onRemove() } }) {
                        Icon(Icons.Filled.Close, contentDescription = "Remove")
                    }
                }
            }
        }
    }
}
