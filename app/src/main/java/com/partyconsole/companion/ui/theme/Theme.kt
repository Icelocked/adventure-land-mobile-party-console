package com.partyconsole.companion.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColors = darkColorScheme(
    primary = Color(0xFF7CFC00),
    secondary = Color(0xFF66CCFF),
    background = Color(0xFF11161C),
    surface = Color(0xFF1B2735),
)

private val LightColors = lightColorScheme(
    primary = Color(0xFF3E7D00),
    secondary = Color(0xFF0077A8),
)

@Composable
fun PartyConsoleTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content,
    )
}
