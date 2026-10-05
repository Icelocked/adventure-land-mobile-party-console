package com.partyconsole.companion.domain

import kotlinx.serialization.Serializable
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToLong

// Spawn shapes (rectangles or polygons), their distance and overlap,
// clustering several monsters' spawns into shared farming areas, and the
// Phoenix patrol's default order. PWA: web/src/lib/farmingZones.ts and
// farmingAreas.ts.

@Serializable
data class Shape(val boundary: List<Double>? = null, val polygon: List<List<Double>>? = null)

@Serializable
data class Area(
    val map: String = "",
    val x: Double = Double.NaN,
    val y: Double = Double.NaN,
    val mapName: String? = null,
    val id: String? = null,
    val boundary: List<Double>? = null,
    val polygon: List<List<Double>>? = null,
    val shapes: List<Shape>? = null,
    val allOf: List<Area>? = null,
    val monsterIds: List<String> = emptyList(),
) {
    internal val shape get() = Shape(boundary, polygon)
}

data class Point(val x: Double, val y: Double, val map: String? = null)

/** One monster's spawn locations. */
data class CatalogMonster(val id: String, val locations: List<Area>)

fun polygon(shape: Shape): List<List<Double>> {
    shape.polygon?.takeIf { it.size >= 3 }?.let { return it }
    val b = shape.boundary ?: return emptyList()
    return listOf(listOf(b[0], b[1]), listOf(b[2], b[1]), listOf(b[2], b[3]), listOf(b[0], b[3]))
}

fun segmentDistance(p: Point, a: List<Double>, b: List<Double>): Double {
    val dx = b[0] - a[0]
    val dy = b[1] - a[1]
    val d = dx * dx + dy * dy
    val t = if (d != 0.0) max(0.0, min(1.0, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / d)) else 0.0
    return hypot(p.x - a[0] - dx * t, p.y - a[1] - dy * t)
}

fun shapeDistance(shape: Shape, p: Point): Double {
    val poly = polygon(shape)
    var inside = false
    var distance = Double.POSITIVE_INFINITY
    var j = poly.size - 1
    for (i in poly.indices) {
        val a = poly[i]
        val b = poly[j]
        distance = min(distance, segmentDistance(p, a, b))
        if ((a[1] > p.y) != (b[1] > p.y) && p.x < (b[0] - a[0]) * (p.y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
        j = i
    }
    return if (inside) 0.0 else distance
}

fun distance(area: Area?, p: Point?): Double {
    if (area == null || p == null || (p.map != null && p.map != area.map)) return Double.POSITIVE_INFINITY
    area.allOf?.let { all -> return all.maxOfOrNull { distance(it, p) } ?: Double.NEGATIVE_INFINITY }
    val shapes = area.shapes ?: if (area.boundary != null || area.polygon != null) listOf(area.shape) else emptyList()
    if (shapes.isEmpty()) return hypot(p.x - area.x, p.y - area.y)
    return shapes.minOf { shapeDistance(it, p) }
}

fun contains(area: Area?, p: Point, margin: Double = 0.0, radius: Double = 400.0): Boolean {
    if (area == null || !p.x.isFinite() || !p.y.isFinite()) return false
    val shaped = area.shapes != null || area.boundary != null || area.polygon != null || area.allOf != null
    return distance(area, p) <= if (shaped) margin + 0.001 else (radius.takeIf { it != 0.0 } ?: 400.0) + margin
}

fun bounds(area: Area): List<Double> {
    val points = (area.shapes ?: listOf(area.shape)).flatMap(::polygon)
    return if (points.isNotEmpty()) listOf(points.minOf { it[0] }, points.minOf { it[1] }, points.maxOf { it[0] }, points.maxOf { it[1] })
    else listOf(area.x, area.y, area.x, area.y)
}

fun overlap(a: Area, b: Area): Boolean {
    val x = bounds(a)
    val y = bounds(b)
    if (max(x[0], y[0]) > min(x[2], y[2]) || max(x[1], y[1]) > min(x[3], y[3])) return false
    val pa = (a.shapes ?: listOf(a.shape)).flatMap(::polygon)
    val pb = (b.shapes ?: listOf(b.shape)).flatMap(::polygon)
    if (pa.any { contains(b, Point(it[0], it[1])) } || pb.any { contains(a, Point(it[0], it[1])) }) return true
    fun cross(a: List<Double>, b: List<Double>, c: List<Double>) = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    for (sa in a.shapes ?: listOf(a.shape)) for (sb in b.shapes ?: listOf(b.shape)) {
        val ap = polygon(sa)
        val bp = polygon(sb)
        for (i in ap.indices) for (j in bp.indices) {
            val p = ap[i]
            val q = ap[(i + 1) % ap.size]
            val r = bp[j]
            val s = bp[(j + 1) % bp.size]
            if (cross(p, q, r) * cross(p, q, s) < 0 && cross(r, s, p) * cross(r, s, q) < 0) return true
        }
    }
    return false
}

/** JSON.stringify of a number: integers without a fraction. */
private fun jsNumber(value: Double): String = if (value == Math.floor(value) && value.isFinite() && kotlin.math.abs(value) < 1e15) value.roundToLong().toString() else value.toString()
private fun jsList(values: List<Double>) = values.joinToString(",", "[", "]") { jsNumber(it) }
private fun jsShape(shape: Shape): String = buildList {
    shape.boundary?.let { add("\"boundary\":${jsList(it)}") }
    shape.polygon?.let { poly -> add("\"polygon\":${poly.joinToString(",", "[", "]") { jsList(it) }}") }
}.joinToString(",", "{", "}")
private fun jsArea(area: Area): String = idPayload(area)

private fun idPayload(area: Area): String {
    val geometry = when {
        area.allOf != null -> area.allOf.joinToString(",", "[", "]") { jsArea(it) }
        area.shapes != null -> area.shapes.joinToString(",", "[", "]") { jsShape(it) }
        area.boundary != null -> jsList(area.boundary)
        else -> jsList(listOf(area.x, area.y))
    }
    return "[\"${area.map}\",$geometry]"
}

/** An area's stable identity (JSON of its map and geometry). */
fun id(area: Area): String = idPayload(area)

fun zones(catalog: List<CatalogMonster>, ids: List<String>): List<Area> {
    val result = mutableListOf<Area>()
    for (monster in catalog) {
        if (monster.id !in ids) continue
        for (loc in monster.locations) {
            if (loc.map.isEmpty() || !loc.x.isFinite() || !loc.y.isFinite()) continue
            val shapes = loc.shapes ?: if (loc.boundary != null || loc.polygon != null) listOf(Shape(loc.boundary, loc.polygon)) else null
            var area = loc.copy(shapes = shapes, monsterIds = listOf(monster.id))
            var i = result.size - 1
            while (i >= 0) {
                val old = result[i]
                if (old.map == area.map && old.monsterIds[0] == monster.id && area.shapes != null && old.shapes != null && overlap(area, old)) {
                    area = area.copy(shapes = area.shapes!! + old.shapes)
                    result.removeAt(i)
                    i = result.size
                }
                i--
            }
            if (area.shapes != null) area = area.copy(boundary = bounds(area))
            area = area.copy(id = id(area))
            result += area
        }
    }
    return result
}

fun searchPoints(area: Area?): List<Point> {
    area ?: return emptyList()
    val box = bounds(area)
    val points = mutableListOf(Point(area.x, area.y, area.map))
    for (y in 0 until 5) for (x in 0 until 5) {
        points += Point(box[0] + (box[2] - box[0]) * (x + 0.5) / 5, box[1] + (box[3] - box[1]) * (y + 0.5) / 5, area.map)
    }
    return points.filter { contains(area, it, 0.0, 1.0) }
}

/** Dedup key: map plus shapes / boundary / centre. */
private fun areaKey(a: Area): String {
    val geometry = when {
        a.shapes != null -> a.shapes.joinToString(",", "[", "]") { jsShape(it) }
        a.boundary != null -> jsList(a.boundary)
        else -> jsList(listOf(a.x, a.y))
    }
    return "[\"${a.map}\",$geometry]"
}

/** Stable region anchors, independent of catalog enumeration and rounded labels. */
fun defaultPhoenixOrder(areas: List<Area>): List<String> {
    val anchors = listOf(Point(641.0, 1803.0, "main"), Point(-180.0, -1164.0, "cave"), Point(-1184.0, 781.0, "main"), Point(1188.0, -193.0, "main"), Point(8.0, 631.0, "halloween"))
    val order = anchors.map { p -> areas.find { it.map == p.map && contains(it, p, 0.0, 1.0) }?.id }
    return if (order.all { it != null } && order.toSet().size == 5) order.filterNotNull() else emptyList()
}

fun farmingAreas(catalog: List<CatalogMonster>, ids: List<String>): List<Area> {
    val regions = linkedMapOf<String, Area>()
    for (a in zones(catalog, ids)) {
        val k = areaKey(a)
        val existing = regions[k]
        regions[k] = if (existing != null) existing.copy(monsterIds = (existing.monsterIds + a.monsterIds).distinct()) else a
    }
    // Closure of rectangular intersections includes regions shared by 3+ types.
    val queue = regions.values.toMutableList()
    var i = 0
    while (i < queue.size) {
        val a = queue[i]
        for (j in 0 until i) {
            val b = queue[j]
            if (a.map != b.map || a.boundary == null || b.boundary == null) continue
            val members = (a.monsterIds + b.monsterIds).distinct().sorted()
            if (members.size <= max(a.monsterIds.size, b.monsterIds.size)) continue
            val box = listOf(max(a.boundary[0], b.boundary[0]), max(a.boundary[1], b.boundary[1]), min(a.boundary[2], b.boundary[2]), min(a.boundary[3], b.boundary[3]))
            if (box[0] >= box[2] || box[1] >= box[3]) continue
            var region = Area(
                map = a.map,
                mapName = a.mapName,
                boundary = box,
                x = Math.round((box[0] + box[2]) / 2).toDouble(),
                y = Math.round((box[1] + box[3]) / 2).toDouble(),
                monsterIds = members,
                allOf = (a.allOf ?: listOf(a)) + (b.allOf ?: listOf(b)),
            )
            if (!contains(region, Point(region.x, region.y, region.map))) {
                val point = searchPoints(region).find { contains(region, it) } ?: continue
                region = region.copy(x = point.x, y = point.y)
            }
            val k = areaKey(region)
            val existing = regions[k]
            if (existing == null) {
                regions[k] = region
                queue += region
            } else {
                val union = (existing.monsterIds + members).distinct().sorted()
                if (union.size > existing.monsterIds.size) {
                    val updated = existing.copy(monsterIds = union)
                    regions[k] = updated
                    queue += updated
                }
            }
        }
        i++
    }
    return regions.values.map { it.copy(id = areaKey(it), monsterIds = it.monsterIds.sorted()) }
        .sortedWith(
            compareByDescending<Area> { it.monsterIds.size }
                .thenBy { it.monsterIds.joinToString(",") }
                .thenBy { it.map }
                .thenBy { it.x }
                .thenBy { it.y },
        )
}

// Only the leader or an independent character can route to a monster.
const val FOLLOWER_ROUTE_MESSAGE = "only leader can route to monster"

fun canRouteToMonster(leader: String?, followers: Map<String, Boolean>, character: String): Boolean =
    character == leader || followers[character] != true
