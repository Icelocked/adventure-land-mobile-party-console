package com.partyconsole.companion.ui.dungeon

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.partyconsole.companion.model.CaveState
import com.partyconsole.companion.model.MapFrame
import com.partyconsole.companion.network.MapStreamEvent
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.map.MapCanvas
import com.partyconsole.companion.ui.map.MapPin
import com.partyconsole.companion.ui.map.MapPoint
import com.partyconsole.companion.ui.map.MapProps
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.launch

/** The full Cave floor map with party, room and waypoint pins, opened from
 *  the dungeon panel full-screen; every participant's map stream feeds it. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CaveMap(viewModel: PartyViewModel, participants: List<String>, cave: CaveState, error: String, onAction: suspend (Map<String, Any?>) -> Boolean) {
    var open by remember { mutableStateOf(false) }
    var adding by remember { mutableStateOf(false) }
    var waypoint by remember { mutableStateOf<MapPoint?>(null) }
    val frames = remember { mutableStateMapOf<String, MapFrame>() }
    var busy by remember { mutableStateOf(false) }
    var nativeSize by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val map = "zone_${cave.run}_${cave.floor}"
    LaunchedEffect(open, participants, map) {
        if (!open) return@LaunchedEffect
        merge(*participants.map { name -> viewModel.mapStreams.events(name) }.toTypedArray()).collect { event ->
            if (event is MapStreamEvent.Frame && event.frame.map == map) frames[event.frame.name] = event.frame
        }
    }
    val frame = frames[participants.firstOrNull()]?.takeIf { it.definition != null } ?: frames.values.find { it.definition?.name == map }
    val pins = cave.points.filter { it.map == map && !it.exit }.map {
        MapPin(it.x, it.y, it.label, if (it.done) 0xFF4ADE80.toInt() else if (it.required) 0xFFFB923C.toInt() else 0xFFFACC15.toInt())
    } + frames.values.map { MapPin(it.x, it.y, it.name, 0xFF67E8F9.toInt()) } +
        listOfNotNull(waypoint?.let { MapPin(it.x, it.y, "Waypoint", 0xFFF472B6.toInt()) })

    DungeonButton("View full map", modifier = Modifier.padding(top = 8.dp)) { open = true }
    if (!open) return
    Dialog(onDismissRequest = { open = false }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(modifier = Modifier.fillMaxSize().semantics { contentDescription = "Cave map" }, color = Color(0xFF081713)) {
            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.Top) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Cave of Many Dreams — Floor ${cave.floor + 1}", fontWeight = FontWeight.SemiBold, color = Emerald50)
                        Text("Cyan: party · Orange: required · Green: complete · Yellow: events · Pink: waypoint", color = Slate300, style = MaterialTheme.typography.labelSmall)
                    }
                    IconButton(onClick = { open = false }, modifier = Modifier.semantics { contentDescription = "Close cave map" }) {
                        Icon(Icons.Filled.Close, contentDescription = null, tint = Emerald50)
                    }
                }
                Box(modifier = Modifier.fillMaxWidth().weight(1f).border(1.dp, Color(0xFF065F46), RoundedCornerShape(4.dp)).background(Color(0xFF07110F))) {
                    val entities = frames.values.flatMap { it.entities }.associateBy { it.id }.values.toList()
                    MapCanvas(
                        MapProps(
                            definition = frame?.definition,
                            frame = frame?.copy(entities = entities),
                            previous = null,
                            receivedAt = 0,
                            scale = 1.0,
                            detailed = true,
                            fullMap = !nativeSize,
                            pins = pins,
                        ),
                        fps = 15,
                        active = open,
                        onWaypoint = if (adding) { point -> waypoint = point; adding = false } else null,
                    )
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    for (f in frames.values) Text(f.name, color = Emerald50, style = MaterialTheme.typography.bodySmall)
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    DungeonButton(if (nativeSize) "Fit full floor" else "Native-size view", enabled = frame != null) { nativeSize = !nativeSize }
                    DungeonButton("Add waypoint", enabled = frame != null) { adding = true }
                    DungeonButton("Set waypoint", enabled = waypoint != null && !busy && !cave.paused) {
                        val point = waypoint ?: return@DungeonButton
                        scope.launch {
                            busy = true
                            try {
                                if (onAction(mapOf("action" to "waypoint", "map" to map, "x" to point.x, "y" to point.y))) open = false
                            } finally {
                                busy = false
                            }
                        }
                    }
                }
                Text(
                    if (adding) "Tap the map to place your waypoint." else waypoint?.let { "${Math.round(it.x)}, ${Math.round(it.y)}" } ?: "One waypoint at a time.",
                    color = Slate300,
                    style = MaterialTheme.typography.bodySmall,
                )
                if (error.isNotEmpty()) Text(error, color = Color(0xFFFECACA), style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}
