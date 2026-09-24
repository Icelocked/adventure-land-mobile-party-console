package com.partyconsole.companion.ui.itempanel

import com.partyconsole.companion.model.Item

/** What was tapped to open the item panel - an inventory slot (numeric
 *  index, most /party-api/command actions) or an equipped gear slot
 *  (named slot like "mainhand", only unequip/upgrade/buy-copy apply). */
sealed interface ItemActionTarget {
    val item: Item

    data class InventorySlot(override val item: Item, val slot: Int) : ItemActionTarget
    data class EquipmentSlot(override val item: Item, val slotName: String) : ItemActionTarget
}
