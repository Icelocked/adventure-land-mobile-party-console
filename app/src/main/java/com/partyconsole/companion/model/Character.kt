package com.partyconsole.companion.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** A character's live vitals; only the fields the app reads. */
@Serializable
data class CharacterVitals(
    val name: String,
    // Not in the live vitals stream; filled from the roster, and defaulted
    // so a missing roster never fails the vitals decode.
    val ctype: String = "",
    val level: Int = 0,
    val hp: Int,
    @SerialName("max_hp") val maxHp: Int,
    val mp: Int,
    @SerialName("max_mp") val maxMp: Int,
    val gold: Long,
    val map: String,
    val x: Double,
    val y: Double,
    val rip: Boolean,
    val xp: Long? = null,
    @SerialName("max_xp") val maxXp: Long? = null,
    // A monster id or a numeric entity id, not coerced server-side, so it
    // stays raw; see [targetId].
    val target: kotlinx.serialization.json.JsonElement? = null,
    val server: String? = null,
    // Fractional milliseconds.
    val ping: Double? = null,
    // The character's own live lucky-slot stream.
    val luckySlotTracking: kotlinx.serialization.json.JsonElement? = null,
    // The merchant's stand is open.
    val standOpen: Boolean? = null,
    val primaryStat: String? = null,
    val banking: Boolean = false,
    val bankQueued: Boolean = false,
    val stocking: Boolean = false,
    val upgrading: Boolean = false,
    val farmingMode: String? = null,
    val conditions: List<Condition> = emptyList(),
    val inventorySize: Int? = null,
) {
    val targetId: String? get() = (target as? kotlinx.serialization.json.JsonPrimitive)?.content
}

/** Carried items and equipment, kept apart from vitals. */
@Serializable
data class CharacterInventory(
    val items: List<InventoryEntry?> = emptyList(),
    val slots: Map<String, EquippedEntry?> = emptyMap(),
)

/** One character's known state, assembled by the repository from live
 *  records. */
data class CharacterState(
    val vitals: CharacterVitals?,
    val inventory: CharacterInventory?,
) {
    val isOnline: Boolean get() = vitals != null
}
