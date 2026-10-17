package com.partyconsole.companion.domain

import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.PartyStateDynamic
import com.partyconsole.companion.ui.itemdetail.upgradeRuleTiers
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** The one banner a bank item shows for the automatic rules that match it,
 *  plus its manual NPC sale mark. With shared rules only the merchant's own
 *  per-character rules count; otherwise any character's rule does.
 *  PWA: web/src/lib/bankItemBanner.ts (console bank-item-banner.tsx). */
fun bankItemBanner(item: Item, state: PartyStateDynamic, manualNpc: Boolean = false): ItemActionBanner? {
    val level = item.level ?: 0
    val key = automaticCommerceRuleKey(item)
    val upgradeKey = "${item.name}@+$level"
    fun <T> owners(maps: Map<String, T>): List<T> =
        if (state.merchantRules != null) listOfNotNull(maps[state.merchantCharacter.toString()]) else maps.values.toList()
    val bank = owners(state.autoItemMarks).any { marks -> (marks[upgradeKey] ?: if (level == 0) marks[item.name] else null) == "bank" }
    val tiers = owners(state.autoUpgradeMarks)
        .mapNotNull { it[upgradeKey] }
        .filter { rule -> rule !is JsonObject || (rule["quantity"] as? JsonPrimitive)?.content?.toDoubleOrNull() != 0.0 }
        .maxOfOrNull { upgradeRuleTiers(it) }
        ?.coerceAtLeast(0) ?: 0
    val compound = owners(state.autoCompounds).flatten()
        .filter { it.name == item.name && it.quantity != 0 && it.targetTier > level }
        .maxByOrNull { it.targetTier }
    return itemActionBanner(
        listOf(
            if (manualNpc) BannerCandidate(BannerAction.NPC, "NPC sale") else null,
            if (state.autoNpcSales.containsKey(key)) BannerCandidate(BannerAction.NPC, "Auto NPC", automatic = true) else null,
            if (owners(state.autoDeconstruction).any { it.containsKey(key) }) BannerCandidate(BannerAction.DECONSTRUCTION, "Auto deconstruction", automatic = true) else null,
            if (state.autoStandMarks.containsKey(key)) BannerCandidate(BannerAction.STAND, "Auto stand", automatic = true) else null,
            if (tiers > 0) BannerCandidate(BannerAction.UPGRADE, "Auto upgrade → +${level + tiers}", automatic = true) else null,
            compound?.let { BannerCandidate(BannerAction.COMPOUND, "Auto compound → +${it.targetTier}", automatic = true) },
            if (state.autoExchanges.containsKey("${item.name}@$level")) BannerCandidate(BannerAction.EXCHANGE, "Auto exchange", automatic = true) else null,
            if (bank) BannerCandidate(BannerAction.BANK, "Auto bank", automatic = true) else null,
        ),
        merchant = false,
    )
}
