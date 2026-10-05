package com.partyconsole.companion.ui.account

import com.partyconsole.companion.model.MerchantJob
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject

/** The merchant's schedulable work reasons and which ones have an on/off
 *  switch, as of party-console v1.2.0 (shared with the PWA's
 *  lib/routineLabels.ts). Re-sync on every console release; the server drops
 *  unknown keys. */
val ROUTINE_LABELS: Map<String, String> = linkedMapOf(
    "merchant luck" to "Merchant's Luck",
    "inventory cleanout" to "Emergency inventory cleanout",
    "manual visit" to "Manual player visit",
    "deliveries" to "Marked deliveries",
    "withdrawals" to "Marked withdrawals",
    "party collection" to "Automatic item collection",
    "restock" to "Party restock",
    "gold threshold" to "Automatic gold collection",
    "npc sales" to "Manual NPC sales",
    "manual marketplace purchases" to "Manual marketplace purchases",
    "auto npc sales" to "Auto NPC sales",
    "collect mail" to "Collect mail",
    "stand bid purchases" to "Automatic WTB fills",
    "upgrade preview" to "Refresh upgrade chances",
    "manual upgrades" to "Manual upgrades",
    "auto upgrade" to "Auto upgrade",
    "manual compounds" to "Manual compounds",
    "ALData marketplace sales" to "ALData marketplace sales",
    "auto compound" to "Auto compound",
    "manual buying" to "Manual buying",
    "manual crafting" to "Manual crafting",
    "manual exchange" to "Manual exchange",
    "automatic exchange" to "Automatic exchange",
    "merchant donation" to "Donate gold",
    "send mail" to "Send mail",
    "join giveaway" to "Join giveaways",
    "stand maintenance" to "Stand listing maintenance",
    "fishing" to "Fishing",
    "mining" to "Mining",
    "merchant idle" to "Idle at stand",
    "manual bank exchange" to "Manual bank exchange",
)

val AUTOMATIC_ROUTINE_KEYS: Set<String> = setOf(
    "merchant luck",
    "restock",
    "gold threshold",
    "inventory cleanout",
    "auto compound",
    "auto upgrade",
    "automatic exchange",
    "stand bid purchases",
    "party collection",
    "auto npc sales",
    "join giveaway",
)

fun hasEnableToggle(key: String): Boolean = AUTOMATIC_ROUTINE_KEYS.contains(key) || key == "fishing" || key == "mining"

/** Which routine a queued merchant job belongs to (console v1.2.0). */
private val PURCHASES = setOf("stand purchases", "stand bid purchases", "ALData marketplace purchases", "Ponty purchases")
private val ALIASES = mapOf(
    "stand search" to "manual marketplace purchases",
    "marked items" to "party collection",
    "npc sale pickup" to "npc sales",
    "auto npc sale pickup" to "auto npc sales",
    "upgrades and compounds" to "manual upgrades",
)

fun routineFor(job: MerchantJob): String {
    if (job.reason == "exchange") return if (job.autoExchangeKeys.isNotEmpty()) "automatic exchange" else "manual exchange"
    job.routine?.let { return it }
    if (job.reason in PURCHASES) {
        return if (job.manual == true || (job.bidItemId == null && job.reason != "stand bid purchases")) "manual marketplace purchases" else "stand bid purchases"
    }
    if (job.reason == "merchant commerce") {
        val crafts = (job.order as? JsonObject)?.get("crafts") as? JsonArray
        return if (!crafts.isNullOrEmpty()) "manual crafting" else "manual buying"
    }
    return ALIASES[job.reason] ?: job.reason
}
