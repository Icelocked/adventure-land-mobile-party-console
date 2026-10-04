package com.partyconsole.companion.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * Mirrors party-console's `Item` type (dashboard/features/party/item.tsx).
 * Field names match the server's JSON exactly - these are also the same
 * field names Adventure Land's own game client uses for an item, which
 * party-console's coordinator passes through mostly as-is.
 */
@Serializable
data class Item(
    val l: JsonElement? = null, // string | boolean - locked, or a lock reason
    val gift: Boolean? = null,
    val expires: JsonElement? = null, // string | number
    val name: String,
    val level: Int? = null,
    val q: Int? = null, // quantity, for stackable items
    val p: String? = null, // special/"shiny" variant, e.g. "glitched", "lucky"
    @SerialName("stat_type") val statType: String? = null,
    val price: Long? = null,
    val rid: String? = null,
    val b: Boolean? = null,
    val m: JsonElement? = null, // boolean | string | number
    val data: JsonElement? = null, // item-specific payload (stand-inspection.ts identity)
)

@Serializable
data class InventoryEntry(
    val slot: Int,
    val item: Item,
    // Live item meta, when the server attaches it (inventory-entry.tsx).
    val meta: ItemMeta? = null,
    // An upgrade/compound in progress on this slot.
    val operation: ItemOperation? = null,
)

@Serializable
data class EquippedEntry(
    val item: Item,
    val meta: ItemMeta? = null,
)

/** inventory-entry.tsx ItemOperation. */
@Serializable
data class ItemOperation(
    val type: String = "",
    val fromLevel: Int = 0,
    val toLevel: Int = 0,
    val chance: Double? = null,
    val sprite: Sprite? = null,
)

/**
 * Mirrors `Condition` (dashboard/features/party/condition.tsx) - one live
 * status effect (e.g. a buff/debuff) on a character.
 */
@Serializable
data class Condition(
    val id: String,
    val name: String,
    val explanation: String? = null,
    val remainingMs: Long? = null,
    val stacks: JsonElement? = null, // number | string
    val source: JsonElement? = null, // string | number
    // condition.tsx: the status sprite, its G definition and live fields.
    val sprite: Sprite? = null,
    val definition: kotlinx.serialization.json.JsonObject? = null,
    val live: kotlinx.serialization.json.JsonObject? = null,
)
