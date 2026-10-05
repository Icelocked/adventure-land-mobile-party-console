package com.partyconsole.companion.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** GET /party-api/mail. `count` is every known message: there is no
 *  read/unread state, only `taken` (attachment collected). */
@Serializable
data class MailSnapshot(
    val messages: List<ReceivedMail> = emptyList(),
    val count: Int = 0,
    // Why the last refresh failed; the inbox is kept.
    val error: String? = null,
    val updatedAt: Long? = null,
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
    // Boolean | "pending" on the wire, so kept raw.
    val taken: JsonElement? = null,
    // A queued collection and why it failed, if it did.
    val collection: JsonElement? = null,
    val collectionError: String? = null,
)

/** Progress of the party-wide escape (GET/POST /party-api/escape). The
 *  server runs the sequence; the app only shows [stage] and [error]. */
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
