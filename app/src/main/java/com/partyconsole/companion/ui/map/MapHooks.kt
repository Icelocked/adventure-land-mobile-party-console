package com.partyconsole.companion.ui.map

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import com.partyconsole.companion.model.MapDefinition
import com.partyconsole.companion.network.MapStreamEvent
import com.partyconsole.companion.ui.AppForeground
import com.partyconsole.companion.ui.PartyViewModel

/** useMapDefinition: the map's definition (cached per reference revision)
 *  while [enabled] and the app is visible; [failed] once a load gave up. */
class MapDefinitionState(val data: MapDefinition?, val failed: Boolean)

@Composable
fun rememberMapDefinition(viewModel: PartyViewModel, map: String, enabled: Boolean = true): MapDefinitionState {
    val visible by AppForeground.visible.collectAsState()
    var data by remember { mutableStateOf<MapDefinition?>(null) }
    var failed by remember(map) { mutableStateOf(false) }
    LaunchedEffect(map, enabled, visible) {
        if (!visible || !enabled || map.isEmpty()) return@LaunchedEffect
        val value = viewModel.mapDefinition(map)
        if (value != null) data = value else failed = true
    }
    return MapDefinitionState(data?.takeIf { it.name == map }, failed)
}

/** useMapFrames: [onEvent] hears [character]'s map stream while [enabled]. */
@Composable
fun MapFrames(viewModel: PartyViewModel, character: String, enabled: Boolean, onEvent: (MapStreamEvent) -> Unit) {
    val listener by rememberUpdatedState(onEvent)
    LaunchedEffect(character, enabled) {
        if (!enabled) return@LaunchedEffect
        viewModel.mapStreams.events(character).collect { listener(it) }
    }
}

/** useTargetMonsterType: the live target's monster type (e.g. "crabx")
 *  from the character's latest map frame - `entities` carry both `id` and
 *  `mtype`. Null until a frame names it, never the raw id. */
@Composable
fun rememberTargetMonsterType(viewModel: PartyViewModel, character: String, target: String?): String? {
    var resolved by remember(character, target) { mutableStateOf<String?>(null) }
    MapFrames(viewModel, character, target != null) { event ->
        if (event is MapStreamEvent.Frame) resolved = event.frame.entities.find { it.id == target }?.mtype
    }
    return resolved
}
