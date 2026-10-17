package com.partyconsole.companion.ui.components

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.partyconsole.companion.domain.CardExtra
import com.partyconsole.companion.domain.CardLine
import com.partyconsole.companion.domain.GAME_BOX_BORDER
import com.partyconsole.companion.domain.GAME_BOX_TEXT
import com.partyconsole.companion.domain.PropLine
import com.partyconsole.companion.domain.TextLine
import com.partyconsole.companion.domain.cssColorArgb
import com.partyconsole.companion.domain.monsterAtLevel
import com.partyconsole.companion.domain.monsterCardLines
import com.partyconsole.companion.domain.monsterExtras
import com.partyconsole.companion.domain.monsterLevelNote
import com.partyconsole.companion.domain.skillCardLines
import com.partyconsole.companion.domain.skillExtras
import kotlinx.serialization.json.JsonElement
import kotlin.math.roundToInt

// The game's boxes for every game-style card (app/docs/cards.md): a black box with a
// 5px gray border and monospace lines, as render_item in the game's js/html.js draws
// them. PWA: web/src/components/GameBox.tsx, ItemCard.tsx, SkillCards.tsx and
// MonsterCards.tsx.

/** A card color ("#RRGGBB" or a CSS name) as a Compose color. */
fun cardColor(value: String): Color = Color(cssColorArgb(value))

private val BoxText = cardColor(GAME_BOX_TEXT)
private val BoxBorder = cardColor(GAME_BOX_BORDER)

/** The game's box. [label] names it for accessibility and tests ("Item card"). */
@Composable
fun GameBox(label: String, modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = modifier
            .semantics { contentDescription = label }
            .background(Color.Black)
            .border(5.dp, BoxBorder)
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        CompositionLocalProvider(LocalTextStyle provides TextStyle(fontFamily = FontFamily.Monospace, fontSize = 13.sp, lineHeight = 20.sp, color = BoxText)) {
            content()
        }
    }
}

/** "Label: value" with the label in its color, the value in [valueColor] or the box's
 *  text color, and an optional colored suffix such as a "[C]" tag. */
fun gameLineText(label: String, value: String, color: String, valueColor: String? = null, suffix: String? = null, suffixColor: String? = null, link: Boolean = false): AnnotatedString =
    buildAnnotatedString {
        withStyle(SpanStyle(color = cardColor(color))) { append(label) }
        append(": ")
        withStyle(SpanStyle(color = valueColor?.let { cardColor(it) } ?: Color.Unspecified, textDecoration = if (link) TextDecoration.Underline else null)) { append(value) }
        if (!suffix.isNullOrEmpty()) withStyle(SpanStyle(color = suffixColor?.let { cardColor(it) } ?: Color.Unspecified)) { append(suffix) }
    }

/** One card line. A skill or spawn value opens its details when [onSkill] or [onMonster]
 *  is given; the whole line is the tap target. */
@Composable
fun GameLine(line: CardLine, onSkill: ((String) -> Unit)? = null, onMonster: ((String) -> Unit)? = null) {
    when (line) {
        is TextLine -> Text(line.text, color = cardColor(line.color))
        is PropLine -> {
            val action: (() -> Unit)? = when {
                line.skill != null && onSkill != null -> { { onSkill(line.skill) } }
                line.monster != null && onMonster != null -> { { onMonster(line.monster) } }
                else -> null
            }
            Text(
                gameLineText(line.label, line.value, line.color, line.valueColor, line.suffix, line.suffixColor, link = action != null),
                modifier = if (action != null) Modifier.clickable(role = Role.Button, onClickLabel = "Open ${line.value}", onClick = action) else Modifier,
            )
        }
    }
}

@Composable
fun GameExtraLine(extra: CardExtra) {
    Text(gameLineText(extra.label, extra.value, extra.color))
}

/** The game box beside its extras box when the sheet has room ([wideAt]), and the extras
 *  box below it on a phone. Both boxes keep their own height, tops aligned. */
@Composable
fun CardPair(
    modifier: Modifier = Modifier,
    wideAt: Dp = 480.dp,
    first: @Composable (Modifier) -> Unit,
    second: (@Composable (Modifier) -> Unit)?,
) {
    BoxWithConstraints(modifier = modifier.fillMaxWidth()) {
        when {
            second == null -> first(Modifier.fillMaxWidth())
            maxWidth >= wideAt -> Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top, modifier = Modifier.fillMaxWidth()) {
                first(Modifier.weight(1f))
                second(Modifier.weight(1f))
            }
            else -> Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                first(Modifier.fillMaxWidth())
                second(Modifier.fillMaxWidth())
            }
        }
    }
}

/** The item card and its extras box. The sheet header already shows the name and the
 *  explanation, so the card starts at the first stat. */
@Composable
fun ItemCards(lines: List<CardLine>, extras: List<CardExtra>, onSkill: (String) -> Unit) {
    CardPair(
        first = { modifier -> GameBox("Item card", modifier) { lines.filter { it.key != "explanation" }.forEach { GameLine(it, onSkill = onSkill) } } },
        second = if (extras.isEmpty()) null else { modifier -> GameBox("Item extras", modifier) { extras.forEach { GameExtraLine(it) } } },
    )
}

/** The skill card and its extras box, shared by the Class skills screen and item details. */
@Composable
fun SkillCards(definition: Map<String, JsonElement>?, skillName: (String) -> String?) {
    val lines = skillCardLines(definition, skillName)
    val extras = skillExtras(definition)
    val card: (@Composable (Modifier) -> Unit)? = if (lines.isEmpty()) null else { modifier -> GameBox("Skill card", modifier) { lines.forEach { GameLine(it) } } }
    val extrasBox: (@Composable (Modifier) -> Unit)? = if (extras.isEmpty()) null else { modifier -> GameBox("Skill extras", modifier) { extras.forEach { GameExtraLine(it) } } }
    when {
        card != null -> CardPair(first = card, second = extrasBox)
        extrasBox != null -> CardPair(first = extrasBox, second = null)
    }
}

/** The game's monster card and its extras box with a level preview, shared by the
 *  Bestiary, Hunt settings and item details. A spawn or skill line opens its details
 *  where the caller passes [onMonster] or [onSkill]. */
@Composable
fun MonsterCards(
    definition: Map<String, JsonElement>,
    skillName: (String) -> String?,
    monsterName: (String) -> String?,
    onMonster: ((String) -> Unit)? = null,
    onSkill: ((String) -> Unit)? = null,
) {
    // A reference preview of a levelled copy; live monsters gain levels over time.
    var level by remember(definition) { mutableIntStateOf(1) }
    val lines = monsterCardLines(monsterAtLevel(definition, level), skillName, monsterName)
    val extras = monsterExtras(definition, skillName)
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(modifier = Modifier.fillMaxWidth().border(1.dp, Color(0xB34C1D95), androidx.compose.foundation.shape.RoundedCornerShape(4.dp)).padding(12.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("LEVEL PREVIEW", fontFamily = FontFamily.Monospace, fontSize = 11.sp, color = Color(0xFFC4B5FD))
                Text("Level $level", fontFamily = FontFamily.Monospace, fontSize = 11.sp, color = Color(0xFFDDD6FE))
            }
            Slider(
                value = level.toFloat(),
                onValueChange = { level = it.roundToInt().coerceIn(1, 20) },
                valueRange = 1f..20f,
                steps = 18,
                modifier = Modifier.semantics { contentDescription = "Monster level preview" },
            )
            Text(monsterLevelNote(level), fontSize = 11.sp, color = Color(0xFF94A3B8))
        }
        CardPair(
            first = { modifier -> GameBox("Monster card", modifier) { lines.forEach { GameLine(it, onSkill = onSkill, onMonster = onMonster) } } },
            second = if (extras.isEmpty()) null else { modifier -> GameBox("Monster extras", modifier) { extras.forEach { GameExtraLine(it) } } },
        )
    }
}

private const val CARD_PREFERENCES = "card_preferences"

/** A boolean kept in this device's SharedPreferences and shared by every composable that
 *  reads the same key, so a choice survives other screens and restarts. PWA:
 *  web/src/hooks/useStoredBoolean.ts. */
@Composable
fun rememberStoredBoolean(key: String, fallback: Boolean): Pair<Boolean, (Boolean) -> Unit> {
    val prefs = LocalContext.current.getSharedPreferences(CARD_PREFERENCES, Context.MODE_PRIVATE)
    var value by remember(key) { mutableStateOf(prefs.getBoolean(key, fallback)) }
    DisposableEffect(prefs, key) {
        val listener = SharedPreferences.OnSharedPreferenceChangeListener { shared, changed ->
            if (changed == key) value = shared.getBoolean(key, fallback)
        }
        prefs.registerOnSharedPreferenceChangeListener(listener)
        onDispose { prefs.unregisterOnSharedPreferenceChangeListener(listener) }
    }
    return value to { next -> value = next; prefs.edit().putBoolean(key, next).apply() }
}
