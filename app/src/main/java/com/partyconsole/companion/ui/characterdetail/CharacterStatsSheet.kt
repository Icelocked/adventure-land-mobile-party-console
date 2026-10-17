package com.partyconsole.companion.ui.characterdetail

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.partyconsole.companion.domain.CharacterExtra
import com.partyconsole.companion.domain.characterCardLines
import com.partyconsole.companion.domain.characterExtras
import com.partyconsole.companion.model.CharacterDiagnostics
import com.partyconsole.companion.model.CharacterVitals
import com.partyconsole.companion.model.EquippedEntry
import com.partyconsole.companion.ui.components.GameBox
import com.partyconsole.companion.ui.components.GameLine
import com.partyconsole.companion.ui.components.cardColor
import com.partyconsole.companion.ui.components.gameLineText
import com.partyconsole.companion.ui.components.rememberStoredBoolean
import kotlinx.serialization.json.JsonObject

private val Muted = Color(0xFF808080)

/** One extras entry. A breakdown starts open and keeps its open or closed state across
 *  characters and restarts, one key per attribute (the PWA's useStoredBoolean). */
@Composable
private fun ExtraEntry(entry: CharacterExtra) {
    val line = entry.line
    val heading = gameLineText(line.label, line.value, line.color, suffix = line.suffix, suffixColor = line.suffixColor)
    if (entry.effects.isEmpty()) {
        Text(heading, modifier = Modifier.padding(start = 16.dp))
        return
    }
    val (open, setOpen) = rememberStoredBoolean("party-character-effects-${line.key}", true)
    Column {
        Text(
            buildAnnotatedString {
                withStyle(SpanStyle(color = Muted)) { append(if (open) "▾ " else "▸ ") }
                append(heading)
            },
            modifier = Modifier
                .clickable(role = Role.Button, onClickLabel = if (open) "Collapse ${line.label}" else "Expand ${line.label}") { setOpen(!open) }
                .semantics { stateDescription = if (open) "Expanded" else "Collapsed" },
        )
        if (open) {
            for (effect in entry.effects) {
                Text(
                    buildAnnotatedString {
                        withStyle(SpanStyle(color = cardColor(effect.color))) { append(effect.value) }
                        effect.detail?.let { withStyle(SpanStyle(color = Muted)) { append(" $it") } }
                    },
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    modifier = Modifier.padding(start = 28.dp),
                )
            }
        }
    }
}

/** The game's character panel beside an extras box: the attributes with their
 *  collapsible effects, armor and resistance with their damage reduction, the
 *  unrestricted run speed, luck and the combat stats. app/docs/cards.md. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CharacterStatsSheet(name: String, vitals: CharacterVitals, diagnostics: CharacterDiagnostics?, slots: Map<String, EquippedEntry?>, onClose: () -> Unit) {
    val raw = diagnostics?.raw ?: JsonObject(emptyMap())
    val level = vitals.level.takeIf { it != 0 } ?: diagnostics?.level ?: 0
    val lines = characterCardLines(name, vitals, raw)
    val extras = characterExtras(vitals, raw, slots)
    ModalBottomSheet(onDismissRequest = onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp).semantics { contentDescription = "$name stats" }) {
            Text(name, fontWeight = FontWeight.SemiBold)
            Text(
                "Level $level ${vitals.ctype.ifEmpty { diagnostics?.ctype.orEmpty() }} ${(vitals.primaryStat ?: diagnostics?.primaryStat).orEmpty()}".uppercase(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 12.dp),
            )
            val card: @Composable (Modifier) -> Unit = { modifier -> GameBox("Character card", modifier) { lines.forEach { GameLine(it) } } }
            val extrasBox: @Composable (Modifier) -> Unit = { modifier ->
                GameBox("Character extras", modifier) {
                    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
                        // Two columns when the box has room, as the PWA's sm:columns-2. The
                        // split balances the line counts with every breakdown open.
                        if (maxWidth >= 480.dp) {
                            val weights = extras.map { 1 + it.effects.size }
                            val half = (weights.sum() + 1) / 2
                            val split = weights.runningFold(0) { total, weight -> total + weight }.indexOfFirst { it >= half }.coerceIn(1, extras.size)
                            Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                                Column(modifier = Modifier.weight(1f)) { extras.take(split).forEach { ExtraEntry(it) } }
                                Column(modifier = Modifier.weight(1f)) { extras.drop(split).forEach { ExtraEntry(it) } }
                            }
                        } else {
                            Column { extras.forEach { ExtraEntry(it) } }
                        }
                    }
                }
            }
            BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
                if (maxWidth >= 560.dp) {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                        card(Modifier.width(224.dp))
                        extrasBox(Modifier.weight(1f))
                    }
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        card(Modifier.fillMaxWidth())
                        extrasBox(Modifier.fillMaxWidth())
                    }
                }
            }
        }
    }
}
