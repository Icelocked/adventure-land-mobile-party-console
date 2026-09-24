package com.partyconsole.companion.ui.account

/** routine-labels.tsx + automatic-routine-keys.tsx ported verbatim - the
 *  merchant's schedulable work reasons and which ones have an on/off
 *  switch (the rest always run when their trigger condition is met, only
 *  their relative priority is configurable). */
val ROUTINE_LABELS: Map<String, String> = linkedMapOf(
    "merchant luck" to "Merchant's Luck",
    "inventory cleanout" to "Emergency inventory cleanout",
    "manual visit" to "Manual player visit",
    "party collection" to "Automatic item collection",
    "restock" to "Party restock",
    "gold threshold" to "Automatic gold collection",
    "npc sales" to "Manual NPC sales",
    "manual marketplace purchases" to "Manual marketplace purchases",
    "auto npc sales" to "Auto NPC sales",
    "collect mail" to "Collect mail",
    "stand bid purchases" to "Automatic WTB fills",
    "manual upgrades" to "Manual upgrades",
    "auto upgrade" to "Auto upgrade",
    "manual compounds" to "Manual compounds",
    "ALData marketplace sales" to "ALData marketplace sales",
    "auto compound" to "Auto compound",
    "manual buying" to "Manual buying",
    "manual crafting" to "Manual crafting",
    "exchange" to "Exchange",
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
    "merchant luck", "restock", "gold threshold", "inventory cleanout", "auto compound",
    "auto upgrade", "exchange", "stand bid purchases", "party collection", "auto npc sales",
    "join giveaway",
)

fun hasEnableToggle(key: String): Boolean = AUTOMATIC_ROUTINE_KEYS.contains(key) || key == "fishing" || key == "mining"
