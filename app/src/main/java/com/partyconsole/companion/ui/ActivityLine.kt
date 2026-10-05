package com.partyconsole.companion.ui

import com.partyconsole.companion.model.BestiaryMonster
import com.partyconsole.companion.model.CharacterVitals

/** The "what are they actively doing" one-line readout, shared by the party
 *  list and the character header: dead first, then a named activity flag,
 *  then the fight, then the location. `vitals.target` is a per-instance
 *  entity id, so it is only named when it (or the live-resolved
 *  [resolvedTargetType]) matches a bestiary entry - never shown raw. */
fun activityLine(vitals: CharacterVitals, bestiaryCatalog: List<BestiaryMonster> = emptyList(), resolvedTargetType: String? = null): String = when {
    vitals.rip -> "dead"
    vitals.banking -> "banking"
    vitals.bankQueued -> "waiting for bank"
    vitals.stocking -> "stocking up"
    vitals.upgrading -> "upgrading"
    vitals.farmingMode != null -> "farming (${vitals.farmingMode})"
    !vitals.targetId.isNullOrBlank() -> {
        val monster = bestiaryCatalog.find { it.id == (resolvedTargetType ?: vitals.targetId) }
        if (monster != null) "fighting ${monster.name}" else "fighting"
    }
    else -> "at ${vitals.map} ${vitals.x.toInt()},${vitals.y.toInt()}"
}
