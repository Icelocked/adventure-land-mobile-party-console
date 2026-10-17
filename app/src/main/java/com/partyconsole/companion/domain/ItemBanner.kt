package com.partyconsole.companion.domain

/** The one banner an item tile shows: a rule conflict first, then manual
 *  marks, automatic rules, delivery, bank, merchant and merchant weapon.
 *  PWA: web/src/lib/itemActionBanner.ts. */
enum class BannerAction { CONFLICT, UPGRADE, COMPOUND, NPC, STAND, EXCHANGE, DECONSTRUCTION, DELIVERY, BANK, MERCHANT, WEAPON, STAT }

data class BannerCandidate(val action: BannerAction, val label: String, val automatic: Boolean = false, val title: String? = null)
data class ItemActionBanner(val action: BannerAction, val label: String, val title: String?)

private fun priority(candidate: BannerCandidate): Int = when (candidate.action) {
    BannerAction.CONFLICT -> 0
    BannerAction.DELIVERY -> 3
    BannerAction.BANK -> 4
    BannerAction.MERCHANT -> 5
    BannerAction.WEAPON -> 6
    else -> if (candidate.automatic) 2 else 1
}

/** Collection/storage are supporting intents, never additional banners. */
fun itemActionBanner(candidates: List<BannerCandidate?>, merchant: Boolean): ItemActionBanner? {
    val actions = candidates.filterNotNull().filter { !(merchant && it.action == BannerAction.MERCHANT) }.toMutableList()
    val automatic = actions.filter { it.automatic }
        .map { if (it.action == BannerAction.UPGRADE || it.action == BannerAction.COMPOUND) "processing" else it.action.name.lowercase() }
        .filter { it in setOf("processing", "npc", "stand", "deconstruction") }
        .distinct()
    if (automatic.size > 1) actions.add(0, BannerCandidate(BannerAction.CONFLICT, "Rule conflict", title = automatic.joinToString(" · ")))
    val choice = actions.sortedBy { priority(it) }.firstOrNull() ?: return null
    return ItemActionBanner(choice.action, choice.label, choice.title)
}

/** Equipment slots in display order. */
val EQUIPMENT_SLOTS = listOf("helmet", "amulet", "earring1", "earring2", "cape", "chest", "mainhand", "offhand", "ring1", "ring2", "belt", "pants", "gloves", "shoes", "orb")

/** Occupied first, empties after. A tracker or supercomputer in the bag's
 *  last usable slot stays pinned there, and occupied overflow cells beyond
 *  the bag size follow it. */
fun compactInventory(items: List<com.partyconsole.companion.model.InventoryEntry?>, size: Int = items.size): List<com.partyconsole.companion.model.InventoryEntry?> {
    val occupied = items.filterNotNull()
    val pinned = occupied.find { it.slot == size - 1 && it.item.name in setOf("tracker", "supercomputer") }
    if (pinned != null) {
        val normal = occupied.filter { it !== pinned && it.slot < size }
        val overflow = occupied.filter { it.slot >= size }
        return normal + List(maxOf(0, size - 1 - normal.size)) { null } + pinned + overflow
    }
    return occupied + List(maxOf(0, items.size - occupied.size)) { null }
}

/** Each entry placed at its own slot index. */
fun <T : Any> physicalInventory(items: List<T?>, slotOf: (T) -> Int, size: Int = 42): List<T?> {
    val slots = MutableList<T?>(maxOf(size, items.size)) { null }
    for (entry in items) if (entry != null) slotOf(entry).takeIf { it in slots.indices }?.let { slots[it] = entry }
    return slots
}
