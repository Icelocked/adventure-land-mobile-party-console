package com.partyconsole.companion.model

import kotlinx.serialization.Serializable

/** One account roster entry. Supplies ctype/level, which the live vitals
 *  stream doesn't carry. */
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

/** Just the roster slice of GET /party-api/state. */
@Serializable
data class PartyStateRoster(
    val roster: List<RosterMember> = emptyList(),
)
