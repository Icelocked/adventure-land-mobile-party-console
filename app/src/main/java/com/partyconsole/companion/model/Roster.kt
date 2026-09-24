package com.partyconsole.companion.model

import kotlinx.serialization.Serializable

/** party-console's account-wide character roster - relatively static
 *  (name/class/level/home realm), unlike the fast-changing vitals stream.
 *  Fetched once via GET /party-api/state and merged into CharacterVitals
 *  (see data/PartyRepository.kt) so ctype/level are always real values
 *  instead of the vitals stream's defaulted placeholders. */
@Serializable
data class RosterMember(
    val name: String,
    val ctype: String,
    val level: Int,
    val id: String? = null,
    val online: Boolean = false,
    val home: String? = null,
    val server: String? = null,
)

/** Only the roster slice this app currently reads out of GET /party-api/state -
 *  that endpoint returns much more (merchant queue, hunts, marks, ...);
 *  ignoreUnknownKeys means the rest is simply skipped, not an error. */
@Serializable
data class PartyStateRoster(
    val roster: List<RosterMember> = emptyList(),
)
