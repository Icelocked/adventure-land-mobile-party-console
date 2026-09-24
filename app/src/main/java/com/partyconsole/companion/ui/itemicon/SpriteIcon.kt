package com.partyconsole.companion.ui.itemicon

import android.graphics.drawable.BitmapDrawable
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.painter.BitmapPainter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImagePainter
import coil.compose.rememberAsyncImagePainter
import coil.request.ImageRequest
import coil.size.Size as CoilSize
import com.partyconsole.companion.model.Sprite

/** Renders one tile out of a shared sprite sheet (adventure.land serves
 *  every item's icon as one tile in a big shared PNG, addressed by grid
 *  column/row - see model/Sprite.kt) as a fixed-size icon.
 *
 *  This crops the tile from the loaded [android.graphics.Bitmap] directly
 *  via [BitmapPainter]'s srcOffset/srcSize, deriving the tile's pixel
 *  size from the bitmap's OWN dimensions divided by [Sprite.columns]/
 *  [Sprite.rows] - not from [Sprite.tileSize]. Verified against the real
 *  sheets this session: an item sheet's actual pixel dimensions do match
 *  tileSize*columns/rows exactly (e.g. raw_items.png is really 400x800
 *  for tileSize=20/columns=20/rows=40), but a MONSTER sheet's don't at
 *  all (monster2.png is really 720x512, while tileSize=1/columns=12/
 *  rows=8 implies 12x8) - tileSize isn't a reliable source of truth for
 *  every sheet this app renders, so this avoids depending on it for the
 *  actual crop math. An earlier version tried to composite Modifier.scale
 *  with Modifier.offset around an assumed dp-equivalent tileSize, which
 *  doesn't work either (scale's default transform origin is the
 *  composable's own center, not its top-left, so the two transforms don't
 *  compose the way naive CSS-sprite math expects) - cropping the bitmap
 *  directly sidesteps both problems at once. */
@Composable
fun SpriteIcon(sprite: Sprite?, size: Dp = 40.dp, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(4.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
    ) {
        if (sprite != null) {
            val context = LocalContext.current
            val painter = rememberAsyncImagePainter(
                model = ImageRequest.Builder(context).data(sprite.url).size(CoilSize.ORIGINAL).build(),
            )
            val bitmap = ((painter.state as? AsyncImagePainter.State.Success)?.result?.drawable as? BitmapDrawable)?.bitmap
            if (bitmap != null && sprite.columns > 0 && sprite.rows > 0) {
                val tileWidth = (bitmap.width / sprite.columns).coerceAtLeast(1)
                val tileHeight = (bitmap.height / sprite.rows).coerceAtLeast(1)
                val left = (sprite.x * tileWidth).coerceIn(0, bitmap.width - 1)
                val top = (sprite.y * tileHeight).coerceIn(0, bitmap.height - 1)
                val width = tileWidth.coerceAtMost(bitmap.width - left)
                val height = tileHeight.coerceAtMost(bitmap.height - top)
                Image(
                    painter = BitmapPainter(
                        image = bitmap.asImageBitmap(),
                        srcOffset = IntOffset(left, top),
                        srcSize = IntSize(width, height),
                    ),
                    contentDescription = null,
                    contentScale = ContentScale.FillBounds,
                    modifier = Modifier.size(size),
                )
            }
        }
    }
}
