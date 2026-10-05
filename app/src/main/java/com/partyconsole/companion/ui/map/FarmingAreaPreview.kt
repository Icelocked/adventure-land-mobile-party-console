package com.partyconsole.companion.ui.map

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.domain.Area
import com.partyconsole.companion.model.MapFrame
import com.partyconsole.companion.ui.PartyViewModel
import kotlin.math.max
import kotlin.math.min

/** farming-area-preview.tsx: the area's map, scaled to fit the spawn
 *  boundary and hunt radius, with the area overlay and waypoint. */
@Composable
fun FarmingAreaPreview(viewModel: PartyViewModel, area: Area, radius: Int, modifier: Modifier = Modifier) {
    val query = rememberMapDefinition(viewModel, area.map)
    val definition = query.data
    BoxWithConstraints(
        modifier = modifier.fillMaxWidth().height(288.dp).border(2.dp, Color(0xFF047857)).background(Color(0xFF07110F))
            .semantics { contentDescription = "Farming area map" },
    ) {
        if (definition != null) {
            val box = area.boundary?.takeIf { it.size >= 4 }
            val width = max(radius * 2.0, box?.let { it[2] - it[0] } ?: 0.0) + 120
            val height = max(radius * 2.0, box?.let { it[3] - it[1] } ?: 0.0) + 120
            val scale = max(0.01, min(maxWidth.value / width, maxHeight.value / height))
            MapCanvas(
                MapProps(
                    definition = definition,
                    frame = MapFrame(name = "Farming area", map = area.map, x = area.x, y = area.y),
                    previous = null,
                    receivedAt = 0,
                    scale = scale,
                    detailed = false,
                    area = MapArea(area.x, area.y, area.boundary),
                    huntRadius = radius.toDouble(),
                ),
            )
        } else {
            Text(
                if (query.failed) "Map preview unavailable. You can still choose this area." else "Loading map…",
                color = Color(0xFFD1FAE5),
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(20.dp),
            )
        }
    }
}
