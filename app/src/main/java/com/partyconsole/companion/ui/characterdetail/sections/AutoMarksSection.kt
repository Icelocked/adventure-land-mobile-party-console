package com.partyconsole.companion.ui.characterdetail.sections

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
    val clearNpc: suspend () -> Unit = { viewModel.api.clearAllAutoNpcSales(if (isMerchant) null else characterName) }

    val deconEntries = dynamicState.autoDeconstruction[characterName].orEmpty().entries
        .map { (key, rule) -> RuleEntry(key, rule.item, null) { viewModel.api.autoDeconstruct(characterName, rule.item, remove = true) } }
    // No bulk route for deconstruction (mark-commands.ts has one for bank/merchant marks, compound-
    // commands.ts for upgrades/compounds, automatic-sales.ts for npc/stand - deconstruction doesn't) -
    // inventory-panel.tsx's own clearAutomaticSection loops the existing per-rule remove the same way.
    val clearDecon: suspend () -> Unit = { for (entry in deconEntries) entry.onRemove() }

    val bankEntries = dynamicState.autoItemMarks[characterName].orEmpty().entries
        .filter { (_, mode) -> mode == "bank" }
        .map { (key, _) -> RuleEntry(key, itemFromRuleKey(key), null) { viewModel.api.removeAutoItemMark(characterName, "bank", key) } }
    val clearBank: suspend () -> Unit = { viewModel.api.clearAutoItemMarks(characterName, "bank") }

    SectionCard(title = "Automatic rules") {
        AutoRuleGroup("Auto NPC sales", npcEntries, catalogFor, clearNpc)
        AutoRuleGroup("Auto deconstruction", deconEntries, catalogFor, clearDecon)

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

            AutoRuleGroup("Auto stand marks", standEntries, catalogFor) { viewModel.api.clearAllAutoStand() }
            AutoRuleGroup("Auto upgrades", upgradeEntries, catalogFor) { viewModel.api.clearAutoUpgrades(characterName) }
            AutoRuleGroup("Auto compounds", compoundEntries, catalogFor) { viewModel.api.clearAutoCompounds(characterName) }
            AutoRuleGroup("Auto merchant marks", merchantMarkEntries, catalogFor) { viewModel.api.clearAutoItemMarks(characterName, "merchant") }
        }

        AutoRuleGroup("Auto bank marks", bankEntries, catalogFor, clearBank)
    }
}

@Composable
private fun AutoRuleGroup(title: String, entries: List<RuleEntry>, catalogFor: (String) -> CatalogItem?, onClearAll: suspend () -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    var confirmingClear by remember { mutableStateOf(false) }
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
            if (entries.isNotEmpty()) {
                if (confirmingClear) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(start = 16.dp, top = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text(
                            "Really clear all?",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                        Button(onClick = {
                            confirmingClear = false
                            scope.launch { onClearAll() }
                        }) { Text("Clear all") }
                        OutlinedButton(onClick = { confirmingClear = false }) { Text("Cancel") }
                    }
                } else {
                    androidx.compose.material3.TextButton(
                        onClick = { confirmingClear = true },
                        modifier = Modifier.padding(start = 8.dp),
                    ) {
                        Text("Clear all", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }
}
