package com.partyconsole.companion.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** The full per-item reference data behind party-console's "left-click an
 *  item" details dialog (item-details.tsx/item-meta.tsx) - `definition` is
 *  the raw game data record (armor/attack/tier/etc., heterogeneous value
 *  types), `properties` is the server's own already-computed current-level
 *  stat block, `scaling` is the per-level stat delta used to preview other
 *  levels (see ItemFormulas.calculatedLevelProperties). Confirmed against
 *  a live GET /party-api/state capture this session - field names and
 *  nesting match exactly. */
@Serializable
data class ItemMeta(
    val definition: Map<String, JsonElement> = emptyMap(),
    val upgradeable: Boolean = false,
    val compoundable: Boolean = false,
    val buyable: Boolean = false,
    val properties: Map<String, JsonElement> = emptyMap(),
    val scaling: Map<String, JsonElement> = emptyMap(),
    val maxLevel: Int? = null,
    val usage: ItemUsage? = null,
    val world: ItemWorldInfo? = null,
    val sprite: Sprite? = null,
)

@Serializable
data class ItemUsage(
    val classes: List<UsageClass> = emptyList(),
    val hands: List<Int> = emptyList(),
)

@Serializable
data class UsageClass(
    val id: String,
    val name: String,
    val hands: Int? = null,
)

/** The "where does this fit in the game world" section of an item -
 *  everything item-details.tsx shows below the base stat block, each
 *  independently optional (a plain stat scroll has none of these; a
 *  craftable armor piece might have recipe + drops + usedIn all at once). */
@Serializable
data class ItemWorldInfo(
    val recipe: ItemRecipe? = null,
    val set: ItemSetInfo? = null,
    val drops: List<ItemDropSource> = emptyList(),
    val usedIn: List<ItemCraftUse> = emptyList(),
)

@Serializable
data class ItemRecipe(
    val cost: Long = 0,
    val quest: String? = null,
    val materials: List<CraftMaterial> = emptyList(),
)

@Serializable
data class CraftMaterial(
    val id: String,
    val name: String,
    val quantity: Int = 1,
    val level: Int = 0,
    val sprite: Sprite? = null,
    val drops: List<ItemDropSource> = emptyList(),
)

@Serializable
data class ItemDropSource(
    val monsterId: String,
    val monsterName: String,
    val rate: Double = 0.0,
    val quantity: Int = 1,
    val originRate: Double? = null,
    val sourceType: String? = null,
    val acquisitionPath: List<String> = emptyList(),
    val sprite: Sprite? = null,
)

@Serializable
data class ItemSetInfo(
    val id: String,
    val name: String,
    val explanation: String? = null,
    val items: List<SetItem> = emptyList(),
    val bonuses: List<SetBonus> = emptyList(),
)

@Serializable
data class SetItem(
    val id: String,
    val name: String,
    val quantity: Int = 1,
    val sprite: Sprite? = null,
)

@Serializable
data class SetBonus(
    val pieces: Int,
    val stats: Map<String, JsonElement> = emptyMap(),
)

@Serializable
data class ItemCraftUse(
    val id: String,
    val name: String,
    val quantity: Int = 1,
    val level: Int = 0,
    val cost: Long = 0,
    val sprite: Sprite? = null,
)

/** A merchant NPC exchange/box entry (merchant-exchange-item.tsx) - either
 *  a straight exchange (`reward`/`rewardQuantity` set: pay [required] of
 *  [id] for a fixed reward) or a randomized table (`results`: opening this
 *  item rolls one of several outcomes by `chance`). Item details' "Exchange
 *  price"/"reward"/"Reward in" sections are all derived by matching this
 *  list against the item being viewed - see ItemFormulas.exchangeSections. */
@Serializable
data class MerchantExchangeItem(
    val key: String,
    val id: String,
    val level: Int = 0,
    val name: String,
    val cost: Long = 0,
    val required: Int = 1,
    val npc: String? = null,
    val sprite: Sprite? = null,
    val results: List<MerchantExchangeResult> = emptyList(),
    val reward: String? = null,
    val rewardQuantity: Int? = null,
    val currencyName: String? = null,
    val currencySprite: Sprite? = null,
)

@Serializable
data class MerchantExchangeResult(
    val kind: String,
    val id: String,
    val name: String,
    val quantity: Int = 1,
    val chance: Double = 0.0,
    val sprite: Sprite? = null,
)
