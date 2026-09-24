package com.partyconsole.companion.ui.itemicon

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.partyconsole.companion.model.Sprite

/** Renders one tile out of a shared sprite sheet (adventure.land serves
 *  every item's icon as one tile in a big shared PNG, addressed by grid
 *  column/row - see model/Sprite.kt) as a fixed-size icon, CSS-sprite
 *  style: load the sheet at its own NATIVE size (tileSize*columns,
 *  tileSize*rows - not an arbitrarily inflated display size, which risks
 *  a silent decode failure for sheets with many rows), then scale the
 *  already-decoded image up/down to fit [size] with graphicsLayer/scale
 *  instead of asking Coil to decode at the inflated size directly. Coil
 *  caches the sheet itself, so rendering many items off the same sheet
 *  only fetches/decodes it once. */
@Composable
fun SpriteIcon(sprite: Sprite?, size: Dp = 40.dp, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(4.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.TopStart,
    ) {
        if (sprite != null) {
            val nativeTile = sprite.tileSize.dp
            val scaleFactor = size / nativeTile
            AsyncImage(
                model = sprite.url,
                contentDescription = null,
                contentScale = ContentScale.FillBounds,
                modifier = Modifier
                    .size(nativeTile * sprite.columns, nativeTile * sprite.rows)
                    .scale(scaleFactor)
                    .offset(x = -(nativeTile * sprite.x), y = -(nativeTile * sprite.y)),
            )
        }
    }
}
