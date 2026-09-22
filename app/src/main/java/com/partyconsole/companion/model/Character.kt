package com.partyconsole.companion.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Mirrors party-console's `Char` type (dashboard/features/party/char.tsx).
 * Deliberately only the fields this companion app's screens actually need
 * for v1 (vitals card, equipment tab, inventory tab, activity readout) -
 * the server sends more than this (tracktrix, anniversary state, bestiary
 * catalogs, ...) and kotlinx.serialization's `ignoreUnknownKeys` (see
 * network/ApiClient.kt's Json config) means the extra fields are simply
 * skipped, not an error. Add fields here as later screens need them,
 * cross-checking char.tsx for the exact name/type first.
 */
@Serializable
data class CharacterVitals(
    val name: String,
    val ctype: String,
    val level: Int,
    val hp: Int,
    @SerialName("max_hp") val maxHp: Int,
    val mp: Int,
    @SerialName("max_mp") val maxMp: Int,
    val gold: Long,
    val map: String,
    val x: Double,
    val y: Double,
    val rip: Boolean,
    val banking: Boolean = false,
    val bankQueued: Boolean = false,
    val stocking: Boolean = false,
    val upgrading: Boolean = false,
    val seenAt: Long,
    val farmingMode: String? = null,
    val conditions: List<Condition> = emptyList(),
    val inventorySize: Int? = null,
)

/** The character's carried items + what's equipped, kept as its own
 *  live-record slice (see network/LiveProtocol.kt) so the inventory tab
 *  can subscribe without re-rendering on every HP/MP tick, matching how
 *  the web dashboard splits 'vitals' from 'inventory' queries. */
@Serializable
data class CharacterInventory(
    val items: List<InventoryEntry?> = emptyList(),
    val slots: Map<String, EquippedEntry?> = emptyMap(),
)

/** One character's full known state as the app holds it - vitals and
 *  inventory arrive/update independently (see LiveReceiver), so this is
 *  assembled in the repository layer, not sent as one message. */
data class CharacterState(
    val vitals: CharacterVitals?,
    val inventory: CharacterInventory?,
) {
    val isOnline: Boolean get() = vitals != null
}
