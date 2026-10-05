package com.partyconsole.companion.ui

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color as AndroidColor
import androidx.compose.material3.Text
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.click
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.test.core.app.ApplicationProvider
import com.partyconsole.companion.domain.Area
import com.partyconsole.companion.model.CavePoint
import com.partyconsole.companion.model.CaveState
import com.partyconsole.companion.model.MapDefinition
import com.partyconsole.companion.model.MapEntity
import com.partyconsole.companion.model.MapEvent
import com.partyconsole.companion.model.MapFrame
import com.partyconsole.companion.testing.FakeConsole
import com.partyconsole.companion.testing.eventually
import com.partyconsole.companion.ui.characterdetail.sections.MapSection
import com.partyconsole.companion.ui.dungeon.CaveMap
import com.partyconsole.companion.ui.map.FarmingAreaPreview
import com.partyconsole.companion.ui.map.MapImages
import com.partyconsole.companion.ui.map.MapProps
import com.partyconsole.companion.ui.map.MapRenderBuffer
import com.partyconsole.companion.ui.map.MapRenderer
import com.partyconsole.companion.ui.map.dollLayers
import com.partyconsole.companion.ui.map.markerStyle
import com.partyconsole.companion.ui.map.prepareMap
import com.partyconsole.companion.ui.map.receiveMapFrame
import com.partyconsole.companion.ui.map.rememberTargetMonsterType
import com.partyconsole.companion.ui.map.visibleTiles
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.GraphicsMode

/** The native map: definitions, frames, the renderer and the screens using it. */
@RunWith(RobolectricTestRunner::class)
class MapTest {
    @get:Rule val compose = createComposeRule()
    private val console = FakeConsole()
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    @After fun stop() = console.close()

    private fun definition(name: String) =
        """{"name":"$name","min_x":-100,"min_y":-100,"max_x":100,"max_y":100,"default":0,
            "tiles":[["water",0,0,16],["inside",0,0,16,16]],
            "placements":[[1,-50,-50,50,50]],"groups":[[[1,0,60]]],
            "tilesets":{"water":{"file":"https://img.test/water.png"},"inside":{"file":"https://img.test/inside.png"}}}"""

    private fun frame(name: String, map: String, withDefinition: Boolean = false, at: Long = System.currentTimeMillis()) =
        """{"name":"$name","map":"$map","at":$at,"x":0,"y":0,"target":"2951603",
            ${if (withDefinition) "\"definition\":${definition(map)}," else ""}
            "entities":[{"id":"2951603","name":"Crab","type":"monster","mtype":"crabx","x":0,"y":90,"hp":5,"max_hp":10,"mp":0,"max_mp":0},
                        {"id":"$name","name":"$name","type":"character","x":0,"y":0,"hp":10,"max_hp":10,"mp":5,"max_mp":10}]}"""

    /** Advance the (manual) clock a frame at a time until [condition] holds. */
    private fun frames(condition: () -> Boolean) = compose.waitUntil(10_000) {
        compose.mainClock.advanceTimeByFrame()
        condition()
    }

    @Test
    fun definitionsFramesMarkersAndDollsDecodeLikeTheDashboard() {
        val def = json.decodeFromString(MapDefinition.serializer(), definition("main"))
        assertEquals(16, def.tiles[0]!!.height) // height defaults to width
        assertEquals("water", def.defaultTile?.set)
        val prepared = prepareMap(def)
        assertEquals(-50.0, prepared.placements[0].left, 0.0)
        assertEquals(76.0, prepared.groups[0].y, 0.0) // the group's lowest edge sorts it
        val range = visibleTiles(prepared.placements[0], -20.0, -20.0, 20.0, 20.0)!!
        assertEquals(-34.0, range.left, 0.0) // first tile column that still reaches the view
        assertNull(visibleTiles(prepared.placements[0], 200.0, 200.0, 300.0, 300.0))

        val buffer = MapRenderBuffer()
        val now = 10_000L
        receiveMapFrame(buffer, MapFrame(map = "main", events = listOf(MapEvent("hit", 9_500.0), MapEvent("hit", 5_000.0))), 1, now)
        receiveMapFrame(buffer, MapFrame(map = "main", events = listOf(MapEvent("heal", 9_900.0))), 2, now)
        assertEquals(listOf(9_500.0, 9_900.0), buffer.frame!!.events.map { it.at }) // the stale hit is dropped
        assertNotNull(buffer.previous)
        receiveMapFrame(buffer, MapFrame(map = "cave"), 3, now)
        assertNull(buffer.previous) // a new map starts fresh

        assertEquals(0xFFEF4444.toInt(), markerStyle(null, "scatter").color)
        assertEquals(0xFFFACC15.toInt(), markerStyle(null, null, 1).color)
        assertTrue(markerStyle(null, null, 2).double)

        val layers = dollLayers("""<div style="position:absolute; left: 2px; bottom: 0px; width: 27px; height: 38px; overflow:hidden"><img src="https://adventure.land/images/a.png?x=1&amp;y=2" style="width: 104px; height: 152px; margin-left: -26px; margin-top: -38px"></div>""")
        assertEquals(1, layers.size)
        assertEquals("https://adventure.land/images/a.png?x=1&y=2", layers[0].url)
        assertEquals(2f, layers[0].left)
        assertEquals(-26f, layers[0].marginLeft) // not confused with "left"
        assertEquals(104f, layers[0].imageWidth)

        MapImages.debugAssetsBase = "http://debug"
        assertEquals("http://debug/debug-assets/images/a.png", MapImages.gameImageUrl("https://adventure.land/images/a.png"))
        MapImages.debugAssetsBase = null
    }

    @Test
    @GraphicsMode(GraphicsMode.Mode.NATIVE)
    fun rendererPaintsTerrainWaterBeyondTheEdgesAndEntities() {
        fun solid(color: Int) = Bitmap.createBitmap(16, 16, Bitmap.Config.ARGB_8888).apply { eraseColor(color) }
        MapImages.put("https://img.test/water.png", solid(AndroidColor.BLUE))
        MapImages.put("https://img.test/inside.png", solid(AndroidColor.GREEN))
        val def = json.decodeFromString(MapDefinition.serializer(), definition("main"))
        val frame = json.decodeFromString(MapFrame.serializer(), frame("Leada", "main"))
        val bitmap = Bitmap.createBitmap(300, 300, Bitmap.Config.ARGB_8888)
        val renderer = MapRenderer(ApplicationProvider.getApplicationContext())
        renderer.draw(Canvas(bitmap), 300, 300, 1f, MapProps(def, frame, null, 0, 1.0, detailed = false))
        assertEquals(AndroidColor.GREEN, bitmap.getPixel(150, 170)) // inside the placement
        assertEquals(AndroidColor.BLUE, bitmap.getPixel(3, 3)) // past min_x/min_y: water
        assertEquals(0xFFFB7185.toInt(), bitmap.getPixel(150, 236)) // the sprite-less monster
        // A tap maps back to world coordinates.
        val point = renderer.toMap(150f, 240f)
        assertEquals(0.0, point.x, 0.01)
        assertEquals(90.0, point.y, 0.01)
    }

    @Test
    fun liveMapStreamsFramesAndTheTargetResolvesOnlyFromAnOpenMap() {
        console.gets["/party-api/maps/main"] = definition("main")
        console.mapFrames["Leada"] = listOf(frame("Leada", "main"))
        val viewModel = PartyViewModel(console.settings)
        compose.setContent {
            androidx.compose.foundation.layout.Column {
                Text("target: " + (rememberTargetMonsterType(viewModel, "Leada", "2951603") ?: "none"))
                MapSection(viewModel, "Leada", "main", 12.4, 80.6)
            }
        }
        compose.onNodeWithText("main [12, 81]").assertExists()
        // Like the dashboard, nothing opens a map stream until a map is shown.
        Thread.sleep(1_500)
        compose.waitForIdle()
        compose.onNodeWithText("target: none").assertExists()
        assertTrue(console.requests.none { it.path.startsWith("/party-api/map-stream/") })
        // The open map redraws every frame: drive the clock by hand from here.
        compose.mainClock.autoAdvance = false
        compose.onNodeWithContentDescription("Expand live map").performClick()
        frames { compose.onAllNodes(androidx.compose.ui.test.hasText("target: crabx")).fetchSemanticsNodes().isNotEmpty() }
        frames { compose.onAllNodes(androidx.compose.ui.test.hasContentDescription("Live map")).fetchSemanticsNodes().isNotEmpty() }
        frames { compose.onAllNodes(androidx.compose.ui.test.hasText("Waiting for the first frame…")).fetchSemanticsNodes().isEmpty() }
        compose.onNodeWithText("reconnecting").assertDoesNotExist()
        eventually { console.requests.any { it.path.startsWith("/party-api/maps/main?revision=") } }
        compose.onNodeWithContentDescription("Open native-size map").performClick()
        frames { compose.onAllNodes(androidx.compose.ui.test.hasText("Leada — main")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithContentDescription("Close native-size map").performClick()
        frames { compose.onAllNodes(androidx.compose.ui.test.hasText("Leada — main")).fetchSemanticsNodes().isEmpty() }
    }

    @Test
    fun farmingAreaPreviewLoadsTheMapOrSaysItIsUnavailable() {
        console.gets["/party-api/maps/main"] = definition("main")
        val viewModel = PartyViewModel(console.settings)
        val map = androidx.compose.runtime.mutableStateOf("main")
        compose.setContent { FarmingAreaPreview(viewModel, Area(map = map.value, x = 0.0, y = 0.0, boundary = listOf(-40.0, -40.0, 40.0, 40.0)), 100) }
        compose.waitUntil(10_000) { compose.onAllNodes(androidx.compose.ui.test.hasText("Loading map…")).fetchSemanticsNodes().isEmpty() }
        compose.onNodeWithContentDescription("Farming area map").assertExists()
        compose.onNodeWithText("Map preview unavailable. You can still choose this area.").assertDoesNotExist()
        map.value = "nowhere"
        compose.waitUntil(10_000) { compose.onAllNodes(androidx.compose.ui.test.hasText("Map preview unavailable. You can still choose this area.")).fetchSemanticsNodes().isNotEmpty() }
    }

    @Test
    fun caveMapShowsTheFloorAndSetsAWaypoint() {
        console.mapFrames["Leada"] = listOf(frame("Leada", "zone_ab12_0", withDefinition = true))
        val viewModel = PartyViewModel(console.settings)
        val cave = CaveState(run = "ab12", floor = 0, points = listOf(CavePoint(id = "r1", label = "Room 1", map = "zone_ab12_0", x = 10.0, y = 10.0, required = true)))
        val sent = mutableListOf<Map<String, Any?>>()
        compose.setContent { androidx.compose.foundation.layout.Column { CaveMap(viewModel, listOf("Leada"), cave, "") { body -> sent += body; true } } }
        compose.mainClock.autoAdvance = false
        compose.onNodeWithText("View full map").performClick()
        frames { compose.onAllNodes(androidx.compose.ui.test.hasText("Cave of Many Dreams — Floor 1")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Set waypoint").assertIsNotEnabled()
        frames { compose.onAllNodes(androidx.compose.ui.test.hasText("Leada")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Add waypoint").performClick()
        frames { compose.onAllNodes(androidx.compose.ui.test.hasText("Tap the map to place your waypoint.")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithContentDescription("Cave map").performTouchInput { click(center) }
        frames { compose.onAllNodes(androidx.compose.ui.test.hasText("One waypoint at a time.")).fetchSemanticsNodes().isEmpty() && compose.onAllNodes(androidx.compose.ui.test.hasText("Tap the map", substring = true)).fetchSemanticsNodes().isEmpty() }
        compose.onNodeWithText("Set waypoint").performClick()
        frames { sent.isNotEmpty() }
        assertEquals("waypoint", sent[0]["action"])
        assertEquals("zone_ab12_0", sent[0]["map"])
        assertTrue(sent[0]["x"] is Double)
        frames { compose.onAllNodes(androidx.compose.ui.test.hasText("Cave of Many Dreams — Floor 1")).fetchSemanticsNodes().isEmpty() } // closed after a successful save
    }

}
