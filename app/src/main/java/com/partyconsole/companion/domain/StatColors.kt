package com.partyconsole.companion.domain

// One color per stat for every game-style card, so a stat reads the same on the
// item, character, comparison, skill and monster cards. The hex values are the
// PWA's web/src/lib/statColors.ts, which copies the console's
// dashboard/features/party/stat-colors.ts (docs/stat-colors.md). Hues follow the
// game's colors (colors in js/old_common_functions.js and render_item); the palette
// brightens the shades the game draws too dark for black.
val STAT_COLORS: Map<String, String> = linkedMapOf(
    "hp" to "#FF2E46",
    "mp" to "#3A62CE",
    "attack" to "#DB2900",
    "frequency" to "#3BE681",
    "range" to "#93A6A2",
    "speed" to "#36B89E",
    "armor" to "#A3A9B0",
    "resistance" to "#8B74C9",
    "str" to "#F07F2F",
    "int" to "#3E6EED",
    "dex" to "#44B75C",
    "vit" to "#FF2E46",
    "for" to "#9A6BC9",
    "luck" to "#5DE376",
    "gold" to "gold",
    "xp" to "#1E73DE",
    "crit" to "#E52967",
    "critdamage" to "#C2366A",
    "evasion" to "#7AC0F5",
    "avoidance" to "#7AC0F5",
    "miss" to "#F36C6E",
    "reflection" to "#B484E5",
    "dreturn" to "#E94959",
    "lifesteal" to "#C8323E",
    "manasteal" to "#5C66D9",
    "output" to "#D93319",
    "heal" to "#CB83AC",
    "pnresistance" to "#68B84B",
    "firesistance" to "#D2473D",
    "fzresistance" to "#69B1B6",
    "phresistance" to "#69B1B6",
    "stresistance" to "#9FA7B6",
    "blastresistance" to "#8E72A8",
    "level" to "orange",
    "cooldown" to "#4EB7DE",
    "duration" to "#E1924D",
)

internal fun statColor(key: String): String = STAT_COLORS.getValue(key)

// The equipment comparison's improvement and reduction colors: the game's success
// and failure colors (console gear-comparison-dialog.tsx).
const val GAIN_COLOR = "#85C76B"
const val LOSS_COLOR = "#E13758"

// The game box's frame and default text (render_item in the game's js/html.js).
const val GAME_BOX_BORDER = "#808080"
const val GAME_BOX_TEXT = "#E4E4E4"

// The CSS color names the ported cards use, so Compose draws what the browser draws.
private val NAMED_COLORS = mapOf(
    "gold" to 0xFFFFD700L,
    "gray" to 0xFF808080L,
    "grey" to 0xFF808080L,
    "orange" to 0xFFFFA500L,
    "white" to 0xFFFFFFFFL,
    "black" to 0xFF000000L,
)

/** A card color ("#RRGGBB" or a CSS name) as opaque ARGB. Anything else falls back
 *  to the game box's text color instead of throwing mid-composition. */
fun cssColorArgb(value: String): Long {
    NAMED_COLORS[value.lowercase()]?.let { return it }
    val hex = value.removePrefix("#")
    val rgb = when (hex.length) {
        6 -> hex.toLongOrNull(16)
        3 -> hex.map { "$it$it" }.joinToString("").toLongOrNull(16)
        else -> null
    } ?: return 0xFFE4E4E4L
    return 0xFF000000L or rgb
}
