package com.partyconsole.companion.ui.map

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.DashPathEffect
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.os.SystemClock
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import com.partyconsole.companion.model.MapDefinition
import com.partyconsole.companion.model.MapEntity
import com.partyconsole.companion.model.MapFrame
import com.partyconsole.companion.model.Sprite
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

data class MapPin(val x: Double, val y: Double, val label: String, val color: Int)
data class MapArea(val x: Double, val y: Double, val boundary: List<Double>? = null)
data class MapPoint(val x: Double, val y: Double)

/** Everything one draw needs (MapCanvas.tsx props). */
data class MapProps(
    val definition: MapDefinition?,
    val frame: MapFrame?,
    val previous: MapFrame?,
    val receivedAt: Long,
    val scale: Double,
    val detailed: Boolean,
    val area: MapArea? = null,
    val huntRadius: Double? = null,
    val fullMap: Boolean = false,
    val pins: List<MapPin> = emptyList(),
)

private data class Viewport(val left: Double, val top: Double, val scale: Double)

/** map-canvas.tsx's draw(), on an Android canvas: terrain, layered entities
 *  with interpolation, target-queue markers, HP/MP bars, names and hit/heal
 *  floaters when detailed, farming-area overlay and pins. Units are dp (the
 *  PWA's CSS pixels); [density] is the device pixel ratio. */
class MapRenderer(private val context: Context) {
    private var preparedFor: MapDefinition? = null
    private var prepared: PreparedMap? = null
    private var viewport = Viewport(0.0, 0.0, 1.0)
    private val tilePaint = Paint().apply { isFilterBitmap = false; isAntiAlias = false }
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER }
    private val src = Rect()
    private val dst = RectF()

    /** Screen point (dp) → map coordinates, for waypoint placement. */
    fun toMap(x: Float, y: Float) = MapPoint(viewport.left + x / viewport.scale, viewport.top + y / viewport.scale)

    private fun image(url: String): Bitmap? = MapImages.get(context, url)

    private fun pattern(definition: MapDefinition, tileIndex: Int?): BitmapShader? {
        val tile = tileIndex?.let { definition.tiles.getOrNull(it) } ?: return null
        val url = definition.tilesets[tile.set]?.file.orEmpty()
        val image = image(url) ?: return null
        val cropped = MapImages.croppedTile(image, url, tile.x, tile.y, tile.width, tile.height) ?: return null
        return BitmapShader(cropped, Shader.TileMode.REPEAT, Shader.TileMode.REPEAT)
    }

    private fun drawBitmap(canvas: Canvas, image: Bitmap, sx: Float, sy: Float, sw: Float, sh: Float, x: Float, y: Float, w: Float, h: Float) {
        src.set(sx.toInt(), sy.toInt(), (sx + sw).roundToInt(), (sy + sh).roundToInt())
        dst.set(x, y, x + w, y + h)
        canvas.drawBitmap(image, src, dst, tilePaint)
    }

    fun draw(canvas: Canvas, widthPx: Int, heightPx: Int, density: Float, props: MapProps) {
        val p = props
        val definition = p.definition
        val frame = p.frame
        if (definition == null || frame == null || definition.name != frame.map) return
        if (preparedFor !== definition) {
            preparedFor = definition
            prepared = prepareMap(definition)
        }
        val map = prepared ?: return
        val ratio = min(density, 2f).coerceAtLeast(1f)
        val width = widthPx / density
        val height = heightPx / density
        val now = System.currentTimeMillis()
        canvas.save()
        canvas.scale(density, density)
        // Outdoor maps use water as their default tile: paint it in screen
        // space first so no gap can expose black void around an island.
        val defaultTile = definition.defaultTile
        fill.shader = null
        fill.color = if (defaultTile?.set == "water") 0xFF2D7FB3.toInt() else 0xFF07110F.toInt()
        canvas.drawRect(0f, 0f, width, height, fill)
        var scale = p.scale
        if (p.fullMap) scale = min(width / (definition.maxX - definition.minX + 100), height / (definition.maxY - definition.minY + 100))
        pattern(definition, definition.default)?.let { shader ->
            shader.setLocalMatrix(Matrix().apply { setScale(scale.toFloat(), scale.toFloat()) })
            fill.shader = shader
            canvas.drawRect(0f, 0f, width, height, fill)
            fill.shader = null
        }
        val alpha = ((SystemClock.uptimeMillis() - p.receivedAt) / 100.0).coerceIn(0.0, 1.0)
        val old = p.previous?.takeIf { it.map == frame.map } ?: frame
        val cameraX = if (p.fullMap) (definition.minX + definition.maxX) / 2 else old.x + (frame.x - old.x) * alpha
        val cameraY = if (p.fullMap) (definition.minY + definition.maxY) / 2 else old.y + (frame.y - old.y) * alpha
        val left = cameraX - width / (2 * scale)
        val top = cameraY - height / (2 * scale)
        val right = left + width / scale
        val bottom = top + height / scale
        viewport = Viewport(left, top, scale)
        val s = scale.toFloat()
        canvas.save()
        canvas.scale(s, s)
        canvas.translate(-left.toFloat(), -top.toFloat())

        fun drawPlacement(prepared: PreparedPlacement) {
            val range = visibleTiles(prepared, left, top, right, bottom) ?: return
            val tile = definition.tiles.getOrNull(prepared.placement.tile) ?: return
            val image = image(definition.tilesets[tile.set]?.file.orEmpty()) ?: return
            var y = range.top
            while (y <= range.bottom) {
                var x = range.left
                while (x <= range.right) {
                    drawBitmap(canvas, image, tile.x.toFloat(), tile.y.toFloat(), tile.width.toFloat(), tile.height.toFloat(), x.toFloat(), y.toFloat(), tile.width + 0.35f / s, tile.height + 0.35f / s)
                    x += tile.width
                }
                y += tile.height
            }
        }

        pattern(definition, definition.default)?.let { shader ->
            val tw = defaultTile!!.width
            val th = defaultTile.height
            fill.shader = shader
            canvas.drawRect((left - tw * 2).toFloat(), (top - th * 2).toFloat(), (right + tw * 2).toFloat(), (bottom + th * 2).toFloat(), fill)
            fill.shader = null
        }
        map.placements.forEach(::drawPlacement)

        val layers = mutableListOf<Pair<Double, () -> Unit>>()
        for (decoration in definition.decorations) layers += decoration.y to {
            canvas.save()
            canvas.translate(decoration.x.toFloat(), decoration.y.toFloat())
            drawDreamsGate(canvas, definition, now)
            canvas.restore()
        }
        for (group in map.groups) layers += group.y to { group.placements.forEach(::drawPlacement) }
        val priorEntities = old.entities.associateBy { it.id }
        for (entity in frame.entities) {
            val prior = priorEntities[entity.id] ?: entity
            val x = prior.x + (entity.x - prior.x) * alpha
            val y = prior.y + (entity.y - prior.y) * alpha
            layers += y to { drawEntity(canvas, p, frame, entity, x, y, s, ratio, now) }
        }
        layers.sortedBy { it.first }.forEach { it.second() }

        // Past the world's edges the game camera never looks; replace that
        // space with the map's water (ocean forever) after terrain renders.
        if (defaultTile?.set == "water") pattern(definition, definition.default)?.let { water ->
            val tw = defaultTile.width
            val th = defaultTile.height
            val edge = 1 / scale
            fill.shader = water
            if (left < definition.minX + edge) canvas.drawRect((left - tw).toFloat(), (top - th).toFloat(), (definition.minX + edge).toFloat(), (bottom + th).toFloat(), fill)
            if (right > definition.maxX - edge) canvas.drawRect((definition.maxX - edge).toFloat(), (top - th).toFloat(), (right + tw).toFloat(), (bottom + th).toFloat(), fill)
            if (top < definition.minY + edge) canvas.drawRect((left - tw).toFloat(), (top - th).toFloat(), (right + tw).toFloat(), (definition.minY + edge).toFloat(), fill)
            if (bottom > definition.maxY - edge) canvas.drawRect((left - tw).toFloat(), (definition.maxY - edge).toFloat(), (right + tw).toFloat(), (bottom + th).toFloat(), fill)
            fill.shader = null
        }

        if (p.detailed) for (event in frame.events) {
            val age = now - event.at
            if (age > 1100) continue
            val targetId = event.string("target").ifEmpty { event.string("id") }
            val target = frame.entities.find { it.id == targetId } ?: continue
            val fade = (1 - age / 1100).toFloat().coerceIn(0f, 1f)
            stroke.color = if (event.kind == "hit") 0xFFFBBF24.toInt() else 0xFFA78BFA.toInt()
            stroke.alpha = (fade * 255).toInt()
            stroke.strokeWidth = 3f
            canvas.drawCircle(target.x.toFloat(), (target.y - 12).toFloat(), (8 + age / 35).toFloat(), stroke)
            val heal = event.string("heal")
            val amount = event.string("damage").ifEmpty { heal }
            if (amount.isNotEmpty() && amount != "0" && amount != "false") {
                text.color = if (heal.isNotEmpty() && heal != "0") 0xFF4ADE80.toInt() else 0xFFF87171.toInt()
                text.alpha = (fade * 255).toInt()
                text.typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
                text.textSize = 13f
                text.style = Paint.Style.FILL
                canvas.drawText(amount, target.x.toFloat(), (target.y - 35 - age / 30).toFloat(), text)
            }
            stroke.alpha = 255
            text.alpha = 255
        }
        p.area?.let { area ->
            area.boundary?.takeIf { it.size >= 4 }?.let { (x1, y1, x2, y2) ->
                fill.color = 0x3822D3EE
                canvas.drawRect(x1.toFloat(), y1.toFloat(), x2.toFloat(), y2.toFloat(), fill)
                stroke.color = 0xFF67E8F9.toInt()
                stroke.strokeWidth = 2 / s
                canvas.drawRect(x1.toFloat(), y1.toFloat(), x2.toFloat(), y2.toFloat(), stroke)
            }
            stroke.color = 0xFFFCD34D.toInt()
            stroke.strokeWidth = 2 / s
            stroke.pathEffect = DashPathEffect(floatArrayOf(6 / s, 4 / s), 0f)
            canvas.drawCircle(area.x.toFloat(), area.y.toFloat(), (p.huntRadius ?: 400.0).toFloat(), stroke)
            stroke.pathEffect = null
            fill.color = 0xFFFFFFFF.toInt()
            canvas.drawCircle(area.x.toFloat(), area.y.toFloat(), 5 / s, fill)
        }
        val labels = mutableListOf<RectF>()
        for (pin in p.pins) {
            fill.color = pin.color
            canvas.drawCircle(pin.x.toFloat(), pin.y.toFloat(), 6 / s, fill)
            stroke.color = 0xFF000000.toInt()
            stroke.strokeWidth = 2 / s
            canvas.drawCircle(pin.x.toFloat(), pin.y.toFloat(), 6 / s, stroke)
            text.typeface = Typeface.SANS_SERIF
            text.textSize = 12 / s
            val half = text.measureText(pin.label) / 2
            val px = pin.x.toFloat()
            var y = pin.y.toFloat() - 10 / s
            for (attempt in 0 until 8) {
                if (labels.none { px + half > it.left && px - half < it.right && y > it.top && y - 14 / s < it.bottom }) break
                y -= 15 / s
            }
            labels += RectF(px - half, y - 14 / s, px + half, y)
            outlinedText(canvas, pin.label, px, y, 0xFF000000.toInt(), pin.color, 2 / s)
        }
        canvas.restore()
        canvas.restore()
    }

    private fun outlinedText(canvas: Canvas, label: String, x: Float, y: Float, outline: Int, color: Int, width: Float) {
        text.style = Paint.Style.STROKE
        text.strokeWidth = width
        text.color = outline
        canvas.drawText(label, x, y, text)
        text.style = Paint.Style.FILL
        text.color = color
        canvas.drawText(label, x, y, text)
    }

    private fun bar(canvas: Canvas, x: Float, y: Float, width: Float, height: Float, fraction: Double, back: Int, front: Int) {
        fill.color = back
        canvas.drawRect(x, y, x + width, y + height, fill)
        fill.color = front
        canvas.drawRect(x, y, x + width * fraction.coerceIn(0.0, 1.0).toFloat(), y + height, fill)
    }

    private fun drawEntity(canvas: Canvas, p: MapProps, frame: MapFrame, entity: MapEntity, x: Double, y: Double, s: Float, ratio: Float, now: Long) {
        val targeted = frame.targetId == entity.id
        val threatening = entity.targetId == frame.name
        val eventMarker = frame.eventCombat || frame.queue.any { it.state == "event" || it.state == "scatter" }
        val rank = if (frame.grouped || eventMarker) frame.queue.indexOfFirst { it.id == entity.id && it.map == frame.map && it.visible != false } else -1
        if (rank >= 0 || (!frame.grouped && !eventMarker && (targeted || threatening))) {
            val style = if (rank >= 0) frame.queue[rank].let { markerStyle(it.role, it.state, rank) } else MarkerStyle(0xFFEF4444.toInt(), false)
            stroke.color = style.color
            stroke.strokeWidth = 3 / s
            val radius = if (rank >= 0) (frame.queue[rank].radius?.takeIf { it != 0.0 } ?: 18.0).toFloat() else 18f
            canvas.drawCircle(x.toFloat(), y.toFloat(), radius, stroke)
            if (style.double) canvas.drawCircle(x.toFloat(), y.toFloat(), radius + 6 / s, stroke)
        }
        val recentAttack = frame.events.lastOrNull { event ->
            event.kind == "action" && event.string("actor").ifEmpty { event.string("attacker") } == entity.id && now - event.at < 220
        }
        val attackAge = recentAttack?.let { now - it.at } ?: 999.0
        val attackTarget = recentAttack?.let { attack -> frame.entities.find { it.id == attack.string("target") } }
        val attackAmount = if (attackAge < 120) (1 - attackAge / 120) * 7 else if (attackAge < 220) ((attackAge - 120) / 100) * 3 else 0.0
        val attackLength = attackTarget?.let { hypot(it.x - x, it.y - y).takeIf { d -> d != 0.0 } } ?: 1.0
        val drawX = x + (attackTarget?.let { (it.x - x) / attackLength * attackAmount } ?: 0.0)
        val drawY = y + (attackTarget?.let { (it.y - y) / attackLength * attackAmount } ?: 0.0)
        var drewDoll = false
        entity.dollHtml?.takeIf { it.isNotEmpty() }?.let { html ->
            val outerLeft = drawX - 13.5
            val outerTop = drawY - 38
            for (layer in dollLayers(html)) {
                val image = image(layer.url) ?: continue
                val clipX = (outerLeft + layer.left).toFloat()
                val clipY = (outerTop + 38 - layer.bottom - layer.height).toFloat()
                canvas.save()
                canvas.clipRect(clipX, clipY, clipX + layer.width, clipY + layer.height)
                dst.set(clipX + layer.marginLeft, clipY + layer.marginTop, clipX + layer.marginLeft + layer.imageWidth, clipY + layer.marginTop + layer.imageHeight)
                canvas.drawBitmap(image, null, dst, tilePaint)
                canvas.restore()
                drewDoll = true
            }
        }
        val sprite = entity.sprite
        val spriteImage = sprite?.let { image(it.url) }
        if (!drewDoll) {
            if (sprite != null && spriteImage != null && sprite.columns > 0 && sprite.rows > 0) {
                val sw = spriteImage.width.toFloat() / sprite.columns
                val sh = spriteImage.height.toFloat() / sprite.rows
                val dw = sw / max(1, sprite.tileSize)
                val dh = sh / max(1, sprite.tileSize)
                val walkFrame = if (entity.moving) (if (floor(now / 160.0).toLong() % 2 != 0L) -1 else 1) else 0
                val sourceX = (sprite.x + walkFrame).coerceIn(0, sprite.columns - 1)
                val sourceY = (sprite.y + entity.direction).coerceIn(0, sprite.rows - 1)
                // Atlas cells touch: crop half a source pixel on every edge so a
                // neighbouring frame never flashes at a fractional scale.
                val inset = 0.5f
                val snappedX = ((drawX * s * ratio).roundToInt() / (s * ratio)).toFloat()
                val snappedY = ((drawY * s * ratio).roundToInt() / (s * ratio)).toFloat()
                drawBitmap(canvas, spriteImage, sourceX * sw + inset, sourceY * sh + inset, sw - inset * 2, sh - inset * 2, snappedX - dw / 2 + inset, snappedY - dh + inset, dw - inset * 2, dh - inset * 2)
            } else {
                fill.color = when (entity.type) { "monster" -> 0xFFFB7185.toInt(); "npc" -> 0xFFFACC15.toInt(); else -> 0xFF5EEAD4.toInt() }
                canvas.drawRect((x - 4).toFloat(), (y - 8).toFloat(), (x + 4).toFloat(), y.toFloat(), fill)
            }
        }
        for (weapon in entity.weapons) {
            val ws = weapon.sprite ?: continue
            val wi = image(ws.url) ?: continue
            if (ws.columns <= 0 || ws.rows <= 0) continue
            val sw = wi.width.toFloat() / ws.columns
            val sh = wi.height.toFloat() / ws.rows
            canvas.save()
            canvas.translate((drawX + if (weapon.hand == "offhand") 6 else -6).toFloat(), (drawY - 5).toFloat())
            if (weapon.hand == "offhand") canvas.scale(-1f, 1f)
            drawBitmap(canvas, wi, ws.x * sw + 0.5f, ws.y * sh + 0.5f, sw - 1, sh - 1, -8f, -16f, 16f, 16f)
            canvas.restore()
        }
        val stand = entity.standSprite
        if (entity.hasStand && stand != null && stand.columns > 0 && stand.rows > 0) {
            image(stand.url)?.let { si ->
                val sw = si.width.toFloat() / stand.columns
                val sh = si.height.toFloat() / stand.rows
                // Anchor the official stand texture at the merchant's feet.
                drawBitmap(canvas, si, stand.x * sw + 0.5f, stand.y * sh + 0.5f, sw - 1, sh - 1, (drawX - sw / 2).toFloat(), (drawY + 3 - sh).toFloat(), sw, sh)
            }
        }
        if (entity.type == "character") {
            val barW = if (p.detailed) 42f else 30f
            val barY = (y - 47).toFloat()
            bar(canvas, (x - barW / 2).toFloat(), barY, barW, 4f, entity.hp / (entity.maxHp.takeIf { it != 0.0 } ?: 1.0), 0xFF1F1515.toInt(), 0xFFEF4444.toInt())
            bar(canvas, (x - barW / 2).toFloat(), barY + 5, barW, 3f, entity.mp / (entity.maxMp.takeIf { it != 0.0 } ?: 1.0), 0xFF111827.toInt(), 0xFF3B82F6.toInt())
        }
        if (targeted && entity.type == "monster") {
            val barW = if (p.detailed) 52f else 36f
            bar(canvas, (x - barW / 2).toFloat(), (y - 40).toFloat(), barW, if (p.detailed) 6f else 4f, entity.hp / (entity.maxHp.takeIf { it != 0.0 } ?: 1.0), 0xFF260D12.toInt(), 0xFFF43F5E.toInt())
        }
        if (p.detailed && entity.type != "monster") {
            text.typeface = Typeface.MONOSPACE
            text.textSize = 11f
            outlinedText(canvas, entity.name, x.toFloat(), (y + 14).toFloat(), 0xFF020807.toInt(), 0xFFECFDF5.toInt(), 3f)
        }
    }

    /** dreams-gate.ts: the native dreams_gate composite at 120 ms cadence. */
    private fun drawDreamsGate(canvas: Canvas, definition: MapDefinition, now: Long) {
        fun piece(sheet: String, sx: Int, sy: Int, w: Int, h: Int, x: Int, y: Int) {
            val image = image(definition.tilesets[sheet]?.file.orEmpty()) ?: return
            drawBitmap(canvas, image, sx.toFloat(), sy.toFloat(), w.toFloat(), h.toFloat(), x.toFloat(), y.toFloat(), w.toFloat(), h.toFloat())
        }
        fun stone(x: Int, y: Int, w: Int, h: Int, left: Boolean, right: Boolean, sx: Int = 224) {
            val l = if (left) 4 else 0
            val r = if (right) 4 else 0
            piece("dungeon", sx + l, 176, w - l - r, 4, x + l, y)
            piece("dungeon", sx, 180, w, h - 4, x, y + 4)
            if (left) piece("dungeon", 226, 130, 4, 4, x, y)
            if (right) piece("dungeon", 266, 130, 4, 4, x + w - 4, y)
        }
        for (side in listOf(-1, 1)) {
            var y = -24
            while (y < 8) {
                val sx = 224 + if (y % 16 == 0) 0 else 8
                val x = if (side < 0) -32 else 24
                if (y == -24) stone(x, y, 8, 8, side < 0, side > 0, sx) else piece("dungeon", sx, 176, 8, 8, x, y)
                y += 8
            }
            y = -32
            while (y < 8) { piece("dungeon", 224, 184, 8, 8, if (side < 0) -24 else 16, y); y += 8 }
            stone(if (side < 0) -24 else 8, -40, 16, 16, side < 0, side > 0)
            stone(if (side < 0) -16 else 0, -48, 16, 16, side < 0, side > 0)
        }
        stone(-8, -52, 16, 8, true, true)
        for (x in listOf(-30, 17)) piece("outside", 736, 560, 16, 32, x, -43)
        piece("outside", 736, 560, 16, 32, -8, -60)
        val frame = (now / 120).toInt()
        portal(canvas, frame)
        listOf(-48, 32).forEachIndexed { i, x ->
            piece("dungeon", 16, 304, 16, 32, x, -12)
            piece("custom_a", ((frame + i) % 3) * 16, 0, 16, 16, x, -12)
        }
    }

    private fun portal(canvas: Canvas, frame: Int) {
        val points = listOf(-16 to 0, -16 to -24, -12 to -24, -12 to -32, -6 to -32, -6 to -36, 6 to -36, 6 to -32, 12 to -32, 12 to -24, 16 to -24, 16 to 0)
        val path = Path()
        points.forEachIndexed { i, (x, y) -> if (i == 0) path.moveTo(x.toFloat(), y.toFloat()) else path.lineTo(x.toFloat(), y.toFloat()) }
        path.close()
        fill.color = 0xFF222638.toInt()
        canvas.drawPath(path, fill)
        fill.color = 0xFF30354D.toInt()
        canvas.drawRect(-14f, -22f, -12f, 0f, fill)
        canvas.drawRect(12f, -22f, 14f, 0f, fill)
        val colors = intArrayOf(0xFF729D9E.toInt(), 0xFFA7D3D0.toInt(), 0xFF686C9C.toInt(), 0xFFD8EBCF.toInt())
        for (i in 0 until 16) {
            val x = ((i * 17 + frame) % 26) - 13
            val y = -30 + ((i * 11 + frame) % 28)
            if (y < -24 && abs(x) > 6) continue
            fill.color = colors[(i + frame) % 4]
            canvas.drawRect(x.toFloat(), y.toFloat(), x + 1f, y + 1f, fill)
        }
    }
}

/** MapCanvas.tsx as a composable. Live views pass a [buffer] (redrawn at
 *  [fps] while [active]); static ones (the farming-area preview) pass the
 *  frame in [props]. [onWaypoint] receives a tap in map coordinates. */
@Composable
fun MapCanvas(
    props: MapProps,
    modifier: Modifier = Modifier,
    buffer: MapRenderBuffer? = null,
    fps: Int? = null,
    active: Boolean = true,
    onWaypoint: ((MapPoint) -> Unit)? = null,
) {
    val context = LocalContext.current
    val density = LocalDensity.current.density
    val renderer = remember { MapRenderer(context) }
    val imagesVersion by MapImages.version.collectAsState()
    var tick by remember { androidx.compose.runtime.mutableLongStateOf(0L) }
    val currentProps by rememberUpdatedState(props)
    val waypoint by rememberUpdatedState(onWaypoint)
    LaunchedEffect(active, fps, buffer) {
        if (!active || (buffer == null && fps == null)) return@LaunchedEffect
        var last = Long.MIN_VALUE / 2
        while (true) withFrameMillis { now -> if (drawDue(now, last, fps)) { last = now; tick = now } }
    }
    androidx.compose.foundation.layout.Box(
        modifier = modifier
            .fillMaxSize()
            .pointerInput(Unit) { detectTapGestures { offset -> waypoint?.invoke(renderer.toMap(offset.x / density, offset.y / density)) } }
            .drawBehind {
                tick; imagesVersion
                val p = if (buffer != null) currentProps.copy(frame = buffer.frame, previous = buffer.previous, receivedAt = buffer.receivedAt) else currentProps
                drawIntoCanvas { renderer.draw(it.nativeCanvas, size.width.toInt(), size.height.toInt(), density, p) }
            },
    )
}
