package com.partyconsole.companion.ui

import com.partyconsole.companion.model.CharacterVitals

/** The "what are they actively doing" one-line readout, shared by the
 *  party overview list and the character detail header so both always
 *  agree on it. Mirrors the priority order a person would actually care
 *  about: dead first, then a named activity flag the server reports,
 *  then whatever they're fighting, then a generic location fallback. */
fun activityLine(vitals: CharacterVitals): String = when {
    vitals.rip -> "dead"
    vitals.banking -> "banking"
    vitals.bankQueued -> "waiting for bank"
    vitals.stocking -> "stocking up"
    vitals.upgrading -> "upgrading"
    vitals.farmingMode != null -> "farming (${vitals.farmingMode})"
    !vitals.target.isNullOrBlank() -> "fighting ${vitals.target}"
    else -> "at ${vitals.map} ${vitals.x.toInt()},${vitals.y.toInt()}"
}
