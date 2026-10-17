package com.partyconsole.companion.testing

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import java.io.File

/** Writes what the screen shows to app/build/card-shots/[name].png, for a visual check of
 *  the game-style cards without a device. Compose's captureToImage waits for a frame
 *  Robolectric never delivers, so this draws every window (the activity and any bottom
 *  sheet) onto one bitmap through Robolectric's native graphics. A capture failure only
 *  skips the picture; the assertions decide the test. */
@Suppress("UNCHECKED_CAST")
fun cardShot(name: String) {
    runCatching {
        val global = Class.forName("android.view.WindowManagerGlobal").getMethod("getInstance").invoke(null)
        val views = global.javaClass.getDeclaredField("mViews").apply { isAccessible = true }.get(global) as List<View>
        val bitmap = Bitmap.createBitmap(views.maxOf { it.width }, views.maxOf { it.height }, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        for (view in views) {
            val at = IntArray(2).also { view.getLocationOnScreen(it) }
            canvas.save()
            canvas.translate(at[0].toFloat(), at[1].toFloat())
            view.draw(canvas)
            canvas.restore()
        }
        val dir = File("build/card-shots").apply { mkdirs() }
        File(dir, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }.onFailure { println("card shot $name skipped: $it") }
}
