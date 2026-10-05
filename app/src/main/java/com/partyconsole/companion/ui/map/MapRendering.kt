package com.partyconsole.companion.ui.map

import android.content.Context
import android.graphics.Bitmap
import android.graphics.drawable.BitmapDrawable
import coil.imageLoader
import coil.request.ImageRequest
import coil.size.Size
import com.partyconsole.companion.model.MapDefinition
import com.partyconsole.companion.model.MapFrame
import com.partyconsole.companion.model.MapPlacement
import kotlinx.coroutines.flow.MutableStateFlow
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

// PWA: web/src/components/map/mapRendering.ts.

/** The latest frame and the one before it (same map). */
class MapRenderBuffer {
    @Volatile var frame: MapFrame? = null
    @Volatile var previous: MapFrame? = null
    @Volatile var receivedAt: Long = 0

    fun clear() { frame = null; previous = null; receivedAt = 0 }
}

/** Keeps the previous frame's recent events (1.1 s), at most 80. */
fun receiveMapFrame(buffer: MapRenderBuffer, next: MapFrame, receivedAt: Long, now: Long) {
    val previous = buffer.frame?.takeIf { it.map == next.map }
    val events = (previous?.events.orEmpty().filter { now - it.at < 1100 } + next.events).takeLast(80)
    buffer.previous = previous
    buffer.frame = next.copy(events = events)
    buffer.receivedAt = receivedAt
}

fun drawDue(now: Long, last: Long, fps: Int?): Boolean = fps == null || fps == 0 || now - last >= 1000.0 / fps - 0.01

data class PreparedPlacement(val placement: MapPlacement, val width: Int, val height: Int, val left: Double, val right: Double, val top: Double, val bottom: Double)
data class PreparedGroup(val y: Double, val placements: List<PreparedPlacement>)
data class PreparedMap(val placements: List<PreparedPlacement>, val groups: List<PreparedGroup>)

fun prepareMap(definition: MapDefinition): PreparedMap {
    fun prepare(p: MapPlacement): PreparedPlacement {
        val tile = definition.tiles.getOrNull(p.tile)
        val width = tile?.width ?: 1
        val height = tile?.height ?: width
        return PreparedPlacement(p, width, height, min(p.x, p.x2 ?: p.x), max(p.x, p.x2 ?: p.x), min(p.y, p.y2 ?: p.y), max(p.y, p.y2 ?: p.y))
    }
    return PreparedMap(
        definition.placements.map(::prepare),
        definition.groups.map { group ->
            PreparedGroup(group.maxOfOrNull { v -> v.y + (definition.tiles.getOrNull(v.tile)?.height ?: 0) } ?: Double.NEGATIVE_INFINITY, group.map(::prepare))
        },
    )
}

data class TileRange(val left: Double, val top: Double, val right: Double, val bottom: Double)

fun visibleTiles(p: PreparedPlacement, left: Double, top: Double, right: Double, bottom: Double): TileRange? {
    if (p.right + p.width < left || p.left > right || p.bottom + p.height < top || p.top > bottom) return null
    return TileRange(
        p.left + max(0.0, ceil((left - p.width - p.left) / p.width)) * p.width,
        p.top + max(0.0, ceil((top - p.height - p.top) / p.height)) * p.height,
        min(p.right, right),
        min(p.bottom, bottom),
    )
}

/** Explicit roles keep scatter targets red and preserve invisible grouped ranks. */
data class MarkerStyle(val color: Int, val double: Boolean)

fun markerStyle(role: String?, state: String?, index: Int = 0): MarkerStyle {
    val resolved = role ?: if (state == "scatter") "current" else listOf("current", "next", "third").getOrNull(index)
    return MarkerStyle(if (resolved == "current") 0xFFEF4444.toInt() else 0xFFFACC15.toInt(), resolved == "third")
}

/** Each image layer of a character doll and its clipping parent. */
data class DollLayer(
    val url: String,
    val left: Float,
    val bottom: Float,
    val width: Float,
    val height: Float,
    val imageWidth: Float,
    val imageHeight: Float,
    val marginLeft: Float,
    val marginTop: Float,
)

private val IMG = Regex("<img\\b[^>]*>", RegexOption.IGNORE_CASE)
private val DIV = Regex("<div\\b[^>]*>", RegexOption.IGNORE_CASE)
private val dollCache = object : LinkedHashMap<String, List<DollLayer>>(16, 0.75f, false) {
    override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, List<DollLayer>>?) = size > 64
}

private fun attribute(tag: String, name: String): String =
    Regex("\\b$name\\s*=\\s*(\"([^\"]*)\"|'([^']*)')", RegexOption.IGNORE_CASE).find(tag)?.let { it.groupValues[2].ifEmpty { it.groupValues[3] } }.orEmpty()

private fun px(style: String, property: String): Float =
    Regex("(?<![-\\w])$property\\s*:\\s*(-?[\\d.]+)", RegexOption.IGNORE_CASE).find(style)?.groupValues?.get(1)?.toFloatOrNull() ?: 0f

fun dollLayers(html: String): List<DollLayer> = synchronized(dollCache) {
    dollCache.getOrPut(html) {
        IMG.findAll(html).map { img ->
            val parent = DIV.findAll(html.substring(0, img.range.first)).lastOrNull()?.value.orEmpty()
            val parentStyle = attribute(parent, "style")
            val imageStyle = attribute(img.value, "style")
            DollLayer(
                url = attribute(img.value, "src").replace("&amp;", "&"),
                left = px(parentStyle, "left"),
                bottom = px(parentStyle, "bottom"),
                width = px(parentStyle, "width"),
                height = px(parentStyle, "height"),
                imageWidth = px(imageStyle, "width"),
                imageHeight = px(imageStyle, "height"),
                marginLeft = px(imageStyle, "margin-left"),
                marginTop = px(imageStyle, "margin-top"),
            )
        }.toList()
    }
}

/** Game images loaded once (through Coil) and kept for the session; [version]
 *  ticks as each one arrives so the canvas redraws. On a debug instance,
 *  adventure.land images come from its local copy. */
object MapImages {
    @Volatile var debugAssetsBase: String? = null
    val version = MutableStateFlow(0)
    private val bitmaps = ConcurrentHashMap<String, Bitmap>()
    private val requested = ConcurrentHashMap.newKeySet<String>()
    private val cropped = ConcurrentHashMap<String, Bitmap>()

    fun gameImageUrl(url: String): String {
        val base = debugAssetsBase ?: return url
        if (!url.startsWith("https://adventure.land/images/")) return url
        return "$base/debug-assets${url.removePrefix("https://adventure.land")}"
    }

    fun get(context: Context, source: String): Bitmap? {
        if (source.isEmpty()) return null
        val url = gameImageUrl(source)
        bitmaps[url]?.let { return it }
        if (requested.add(url)) {
            val request = ImageRequest.Builder(context.applicationContext)
                .data(url)
                .size(Size.ORIGINAL)
                .allowHardware(false)
                .target(
                    onSuccess = { drawable ->
                        (drawable as? BitmapDrawable)?.bitmap?.let { bitmaps[url] = it; version.value++ }
                    },
                    onError = { requested.remove(url) },
                )
                .build()
            context.applicationContext.imageLoader.enqueue(request)
        }
        return null
    }

    fun croppedTile(image: Bitmap, url: String, x: Int, y: Int, width: Int, height: Int): Bitmap? {
        if (width <= 0 || height <= 0 || x < 0 || y < 0 || x + width > image.width || y + height > image.height) return null
        return cropped.getOrPut("$url:$x:$y:$width:$height") { Bitmap.createBitmap(image, x, y, width, height) }
    }

    /** Tests hand in bitmaps directly. */
    fun put(url: String, bitmap: Bitmap) { bitmaps[url] = bitmap; version.value++ }
}
