package com.partyconsole.companion.ui.characterdetail.sections

import android.os.SystemClock
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.partyconsole.companion.model.MapDefinition
import com.partyconsole.companion.network.MapStreamEvent
import com.partyconsole.companion.ui.AppForeground
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.components.FreshnessBadge
import com.partyconsole.companion.ui.map.MapCanvas
import com.partyconsole.companion.ui.map.MapFrames
import com.partyconsole.companion.ui.map.MapProps
import com.partyconsole.companion.ui.map.MapRenderBuffer
import com.partyconsole.companion.ui.map.receiveMapFrame
import com.partyconsole.companion.ui.map.rememberMapDefinition

private val caveMap = Regex("^zone_[a-f0-9]+_\\d+$")
private val MapBackground = Color(0xFF07110F)

/** character-map-section.tsx (the PWA's MapSection.tsx): the collapsible
 *  live map under the character's header, at 20 fps while open and the
 *  app is visible, with a native-size view (names and hit/heal floaters).
 *  Caves send their definition on the stream. */
@Composable
fun MapSection(viewModel: PartyViewModel, name: String, map: String, x: Double, y: Double) {
    val cave = caveMap.matches(map)
    val mapLabel = if (cave) "Cave of Many Dreams" else map
    var open by remember { mutableStateOf(false) }
    var large by remember { mutableStateOf(false) }
    var streamDefinition by remember { mutableStateOf<MapDefinition?>(null) }
    val query = rememberMapDefinition(viewModel, map, open && !cave)
    val definition = if (cave) streamDefinition?.takeIf { it.name == map } else query.data
    val visible by AppForeground.visible.collectAsState()
    val buffer = remember { MapRenderBuffer() }
    var streamState by remember { mutableStateOf("loading") }
    var lastFrameAt by remember { mutableLongStateOf(0L) }
    val currentMap by rememberUpdatedState(map)
    MapFrames(viewModel, name, open && visible) { event ->
        when (event) {
            is MapStreamEvent.State -> streamState = event.state
            is MapStreamEvent.Frame -> {
                val next = event.frame
                if (next.map != currentMap) return@MapFrames
                next.definition?.takeIf { it.name == next.map }?.let { supplied -> if (streamDefinition?.name != supplied.name) streamDefinition = supplied }
                receiveMapFrame(buffer, next, SystemClock.uptimeMillis(), System.currentTimeMillis())
                // Recompose for the age badge at most once per second of frame time.
                val at = next.at.toLong()
                if (lastFrameAt / 1000 != at / 1000) lastFrameAt = at
            }
        }
    }
    val props = MapProps(definition, null, null, 0, 1.0 / 3, detailed = false)

    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(
                onClick = {
                    if (!open) { buffer.clear(); lastFrameAt = 0 }
                    open = !open
                },
                modifier = Modifier.size(28.dp).semantics { contentDescription = if (open) "Collapse live map" else "Expand live map" },
            ) {
                Icon(if (open) Icons.Filled.KeyboardArrowDown else Icons.Filled.KeyboardArrowRight, contentDescription = null, tint = Color(0xA6A5F3FC))
            }
            Text("$mapLabel [${Math.round(x)}, ${Math.round(y)}]", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Color(0xA6A5F3FC))
        }
        if (open) {
            Box(
                modifier = Modifier.padding(top = 8.dp).fillMaxWidth().aspectRatio(4f / 3f).clip(RoundedCornerShape(6.dp))
                    .border(1.dp, Color(0xCC065F46), RoundedCornerShape(6.dp)).background(MapBackground)
                    .semantics { contentDescription = "Live map" },
            ) {
                MapCanvas(props, buffer = buffer, fps = 20, active = open && visible && !large)
                IconButton(
                    onClick = { large = true },
                    modifier = Modifier.align(Alignment.TopEnd).padding(8.dp).size(32.dp).background(Color(0xE607110F), RoundedCornerShape(4.dp))
                        .semantics { contentDescription = "Open native-size map" },
                ) { Icon(Icons.Filled.Fullscreen, contentDescription = null, tint = Color(0xFFA7F3D0)) }
                if (streamState != "live") {
                    Text(streamState, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Color(0xFFFDE68A),
                        modifier = Modifier.align(Alignment.BottomStart).padding(8.dp).background(Color(0xB3000000), RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 4.dp))
                } else {
                    // Not on the dashboard: the console replays its last frame and keeps the stream open, so a hung character looks live without this.
                    Box(modifier = Modifier.align(Alignment.BottomEnd).padding(8.dp).background(Color(0xB3000000), RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 4.dp)) {
                        if (lastFrameAt > 0) FreshnessBadge(viewModel, lastFrameAt, "frame")
                        else Text("Waiting for the first frame…", style = MaterialTheme.typography.labelSmall, color = Color(0xFFCBD5E1))
                    }
                }
            }
        }
    }
    if (large) {
        Dialog(onDismissRequest = { large = false }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
            Surface(modifier = Modifier.fillMaxSize().semantics { contentDescription = "Native-size map" }, color = Color(0xFF081713)) {
                Column {
                    Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("$name — $mapLabel", fontWeight = FontWeight.Medium, color = Color(0xFFECFDF5), modifier = Modifier.weight(1f))
                        if (lastFrameAt > 0) FreshnessBadge(viewModel, lastFrameAt, "frame")
                        IconButton(onClick = { large = false }, modifier = Modifier.semantics { contentDescription = "Close native-size map" }) {
                            Icon(Icons.Filled.Close, contentDescription = null, tint = Color(0xFFD1FAE5))
                        }
                    }
                    Box(modifier = Modifier.fillMaxWidth().weight(1f).background(MapBackground)) {
                        MapCanvas(props.copy(scale = 1.0, detailed = true), buffer = buffer, fps = 20, active = open && visible && large)
                    }
                }
            }
        }
    }
}
