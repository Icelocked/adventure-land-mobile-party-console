package com.partyconsole.companion.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** GET /party-api/mail (mail-inbox.tsx / mail-query.ts) - a separate route
 *  from /party-api/state, not part of PartyStateDynamic. `count` is every
 *  known message, not an "unread" count - the wire protocol has no
 *  read/unread distinction, only `taken` (collected an attachment). */
@Serializable
data class MailSnapshot(
    val messages: List<ReceivedMail> = emptyList(),
    val count: Int = 0,
)

@Serializable
data class ReceivedMail(
    val id: String? = null,
    val from: String? = null,
    val to: String? = null,
    val subject: String? = null,
    val message: String? = null,
    val sent: String? = null,
    val item: Item? = null,
    // Boolean | "pending" on the wire - kept untyped so a non-boolean value
    // never fails the whole message's parse, matching this app's established
    // safe-default pattern for fields with more than one possible shape.
    val taken: JsonElement? = null,
)

/** escape-status.tsx's shape for GET/POST /party-api/escape - the party-wide
 *  emergency-recovery command (needs one online warrior/mage/priest; the server
 *  owns the whole staged rendezvous/convoy-fallback sequence, this app only
 *  triggers it and shows [stage]/[error]). */
@Serializable
data class EscapeStatus(
    val id: String,
    val stage: String,
    val error: String? = null,
    val progress: Map<String, EscapeProgress> = emptyMap(),
)

@Serializable
data class EscapeProgress(
    val error: String? = null,
)

@Serializable
data class EscapeResponse(
    val escape: EscapeStatus? = null,
)
