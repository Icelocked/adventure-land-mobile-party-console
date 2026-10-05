package com.partyconsole.companion.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// Map definitions, entities and live frames.
// PWA: web/src/components/map/mapTypes.ts.

/** [tileset, x, y, width, height?] - height defaults to width. */
data class MapTile(val set: String, val x: Int, val y: Int, val width: Int, val height: Int)

/** [tile, x, y, x2?, y2?] - a single tile, or a filled rectangle of it. */
data class MapPlacement(val tile: Int, val x: Double, val y: Double, val x2: Double?, val y2: Double?)

private fun JsonElement?.number(): Double? = (this as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content?.toDoubleOrNull()

@Serializable
data class Tileset(val file: String = "")

@Serializable
data class MapDecoration(val kind: String = "", val x: Double = 0.0, val y: Double = 0.0)

@Serializable
data class MapDefinition(
    val name: String,
    @SerialName("min_x") val minX: Double = 0.0,
    @SerialName("min_y") val minY: Double = 0.0,
    @SerialName("max_x") val maxX: Double = 0.0,
    @SerialName("max_y") val maxY: Double = 0.0,
    val default: Int? = null,
    @SerialName("tiles") val rawTiles: List<JsonArray> = emptyList(),
    @SerialName("placements") val rawPlacements: List<JsonArray> = emptyList(),
    @SerialName("groups") val rawGroups: List<List<JsonArray>> = emptyList(),
    val tilesets: Map<String, Tileset> = emptyMap(),
    val decorations: List<MapDecoration> = emptyList(),
) {
    val tiles: List<MapTile?> by lazy {
        rawTiles.map { t ->
            val width = t.getOrNull(3).number()?.toInt() ?: 1
            (t.getOrNull(0) as? JsonPrimitive)?.content?.let { set ->
                MapTile(set, t.getOrNull(1).number()?.toInt() ?: 0, t.getOrNull(2).number()?.toInt() ?: 0, width, t.getOrNull(4).number()?.toInt()?.takeIf { it != 0 } ?: width)
            }
        }
    }
    val placements: List<MapPlacement> by lazy { rawPlacements.map(::placement) }
    val groups: List<List<MapPlacement>> by lazy { rawGroups.map { group -> group.map(::placement) } }
    val defaultTile: MapTile? get() = default?.let { tiles.getOrNull(it) }

    private fun placement(p: JsonArray) = MapPlacement(p.getOrNull(0).number()?.toInt() ?: 0, p.getOrNull(1).number() ?: 0.0, p.getOrNull(2).number() ?: 0.0, p.getOrNull(3).number(), p.getOrNull(4).number())
}

@Serializable
data class MapWeapon(val hand: String = "", val name: String = "", val sprite: Sprite? = null)

@Serializable
data class MapEntity(
    val id: String,
    val name: String = "",
    val type: String = "",
    val ctype: String? = null,
    val mtype: String? = null,
    val x: Double = 0.0,
    val y: Double = 0.0,
    val hp: Double = 0.0,
    @SerialName("max_hp") val maxHp: Double = 0.0,
    val mp: Double = 0.0,
    @SerialName("max_mp") val maxMp: Double = 0.0,
    val moving: Boolean = false,
    val target: JsonElement? = null,
    val sprite: Sprite? = null,
    val direction: Int = 0,
    val dollHtml: String? = null,
    val stand: JsonElement? = null,
    val standSprite: Sprite? = null,
    val weapons: List<MapWeapon> = emptyList(),
) {
    val targetId: String? get() = (target as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content
    val hasStand: Boolean get() = (stand as? JsonPrimitive)?.let { it !is JsonNull && it.content != "false" && it.content.isNotEmpty() } == true
}

@Serializable
data class MapEvent(val kind: String = "", val at: Double = 0.0, val data: JsonObject = JsonObject(emptyMap())) {
    fun string(key: String): String = (data[key] as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content.orEmpty()
}

@Serializable
data class MapQueueTarget(
    val id: String = "",
    val map: String = "",
    val state: String? = null,
    val role: String? = null,
    val radius: Double? = null,
    val visible: Boolean? = null,
)

@Serializable
data class MapFrame(
    val name: String = "",
    val map: String = "",
    val definition: MapDefinition? = null,
    val at: Double = 0.0,
    val x: Double = 0.0,
    val y: Double = 0.0,
    val target: JsonElement? = null,
    val grouped: Boolean = false,
    val eventCombat: Boolean = false,
    val queue: List<MapQueueTarget> = emptyList(),
    val entities: List<MapEntity> = emptyList(),
    val events: List<MapEvent> = emptyList(),
) {
    val targetId: String? get() = (target as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content
}
