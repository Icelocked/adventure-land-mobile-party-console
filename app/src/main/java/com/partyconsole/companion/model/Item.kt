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
)

@Serializable
data class InventoryEntry(
    val slot: Int,
    val item: Item,
)

@Serializable
data class EquippedEntry(
    val item: Item,
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
)
