package com.partyconsole.companion.ui.characterdetail

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.CharacterState

/** Lets you jump straight to another character's focus without backing
 *  out to the party list first - the "way to change which slot you're
 *  viewing" from the mobile-redesign plan. Pinned just under the top bar,
 *  above the sticky vitals header. */
@Composable
fun CharacterSwitcherRow(
    characters: Map<String, CharacterState>,
    currentName: String,
    onSelect: (String) -> Unit,
) {
    val others = characters.keys.filter { it != currentName }
    if (others.isEmpty()) return
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        for (name in others) {
            SuggestionChip(
                onClick = { onSelect(name) },
                label = {
                    Text(
                        "$name" + (characters[name]?.vitals?.let { " Lv${it.level}" } ?: ""),
                        style = MaterialTheme.typography.labelMedium,
                    )
                },
            )
        }
    }
}
