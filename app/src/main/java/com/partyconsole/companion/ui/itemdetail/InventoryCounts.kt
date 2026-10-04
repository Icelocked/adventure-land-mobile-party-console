package com.partyconsole.companion.ui.itemdetail

import com.partyconsole.companion.model.BankSnapshot
import com.partyconsole.companion.model.CharacterState
import com.partyconsole.companion.model.InventoryEntry

/** lib/account-inventory.ts's inventoryCounts, verbatim: owned quantity per
 *  item (or item+level when [byLevel]) across characters, the bank snapshot
 *  and bankbois. Persisted storage-worker snapshots supersede their stale
 *  online inventories. */
fun inventoryCounts(
    characters: Map<String, CharacterState>,
    bank: BankSnapshot?,
    byLevel: Boolean = false,
    bankbois: List<com.partyconsole.companion.model.Bankboi> = emptyList(),
): Map<String, Int> {
    val totals = mutableMapOf<String, Int>()
    val storageNames = bankbois.map { it.name }.toSet()
    fun add(entry: InventoryEntry?) {
        val item = entry?.item ?: return
        val key = if (byLevel) "${item.name}@${item.level ?: 0}" else item.name
        totals[key] = (totals[key] ?: 0) + maxOf(1, item.q ?: 1)
    }
    for ((name, state) in characters) {
        if (name !in storageNames) state.inventory?.items?.forEach { add(it) }
    }
    bank?.packs?.values?.forEach { pack -> pack.forEach { add(it) } }
    bankbois.forEach { boi -> boi.items.forEach { add(it) } }
    return totals
}
