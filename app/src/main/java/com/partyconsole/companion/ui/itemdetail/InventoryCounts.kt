package com.partyconsole.companion.ui.itemdetail

import com.partyconsole.companion.model.BankSnapshot
import com.partyconsole.companion.model.CharacterState
import com.partyconsole.companion.model.InventoryEntry

/** lib/account-inventory.ts's inventoryCounts ported verbatim - total
 *  owned quantity per item (or per item+level when [byLevel]), summed
 *  across every character's carried inventory plus the shared bank. Used
 *  to check whether a craft/exchange has its required materials on hand
 *  before letting the merchant queue it. This app has no bankboi concept
 *  yet, so unlike the dashboard's version there's no `bankbois` source to
 *  add or exclude. */
fun inventoryCounts(characters: Map<String, CharacterState>, bank: BankSnapshot?, byLevel: Boolean = false): Map<String, Int> {
    val totals = mutableMapOf<String, Int>()
    fun add(entry: InventoryEntry?) {
        val item = entry?.item ?: return
        val key = if (byLevel) "${item.name}@${item.level ?: 0}" else item.name
        totals[key] = (totals[key] ?: 0) + maxOf(1, item.q ?: 1)
    }
    for (state in characters.values) {
        state.inventory?.items?.forEach { add(it) }
    }
    bank?.packs?.values?.forEach { pack -> pack.forEach { add(it) } }
    return totals
}
