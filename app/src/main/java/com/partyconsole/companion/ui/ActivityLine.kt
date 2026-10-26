package com.partyconsole.companion.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import com.partyconsole.companion.domain.MonsterNames
import com.partyconsole.companion.domain.activityCharacter
import com.partyconsole.companion.domain.characterActivity
import com.partyconsole.companion.model.CharacterDiagnostics
import com.partyconsole.companion.model.CharacterVitals
import com.partyconsole.companion.model.PartyStateDynamic

/** Bestiary display names, the raw id when the bestiary lacks one
 *  (connected-character-card.tsx monsterName). */
fun monsterNamer(state: PartyStateDynamic): MonsterNames {
    val names = state.bestiaryCatalog.associate { it.id to it.name }
    return { id -> names[id]?.ifEmpty { null } ?: id }
}

/** The character's task and phase as one line, e.g. "Travelling to Hunt
 *  target - Croc". It merges live vitals over core's characterDetails like
 *  card-name-strip.tsx, and never reads `target` or the position.
 *  PWA: web/src/data/useCharacterActivity.ts. */
fun activityLabel(name: String, vitals: CharacterVitals, diagnostics: CharacterDiagnostics?, state: PartyStateDynamic, monster: MonsterNames = monsterNamer(state)): String =
    characterActivity(activityCharacter(name, diagnostics?.raw, vitals.raw), state.activitySource, monster, state.merchantCatalog?.allItems.orEmpty())

/** The activity label for [name], recomputed on every state and vitals update. */
@Composable
fun rememberCharacterActivity(viewModel: PartyViewModel, name: String, vitals: CharacterVitals): String {
    val state by viewModel.dynamicState.collectAsState()
    val details by viewModel.characterDetails.collectAsState()
    val monster = remember(state.bestiaryCatalog) { monsterNamer(state) }
    val diagnostics = details[name]
    return remember(state, vitals, diagnostics, monster) { activityLabel(name, vitals, diagnostics, state, monster) }
}
