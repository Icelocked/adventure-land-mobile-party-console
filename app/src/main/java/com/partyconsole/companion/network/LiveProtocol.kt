package com.partyconsole.companion.network

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Faithful Kotlin port of party-console's own
 * dashboard/features/party/live-protocol.ts - same message shape, same
 * snapshot/delta/heartbeat/epoch/sequence reconciliation rules, so this
 * app's view of a character's state can never drift from what the actual
 * web dashboard shows for the same server. Ported deliberately close to
 * the original rather than "improved", including keeping vitals/items/
 * slots as raw JSON objects merged key-by-key - the server can add new
 * fields over time and this keeps working without a matching app update,
 * exactly like the original's `Record<string, unknown>` typing intends.
 *
 * If party-console's own live-protocol.ts ever changes, re-port from the
 * new source rather than guessing - this file's job is to match theirs,
 * not to reinterpret it.
 */
@Serializable
data class LiveRecordWire(
    val generation: String,
    val sample: Long,
    val sampledAt: Long,
    val vitals: JsonObject = JsonObject(emptyMap()),
    val items: JsonObject = JsonObject(emptyMap()),
    val slots: JsonObject = JsonObject(emptyMap()),
)

@Serializable
data class LiveMessage(
    val type: String, // "snapshot" | "delta" | "heartbeat"
    val epoch: String,
    val sequence: Long,
    val characters: Map<String, LiveRecordWire?>? = null,
)

/** Merges two JSON objects key-by-key, `incoming` winning on conflict -
 *  the Kotlin equivalent of the original's `{...previous, ...incoming}`
 *  spread merge. */
private fun mergeJsonObjects(previous: JsonObject, incoming: JsonObject): JsonObject =
    JsonObject(previous + incoming)

class LiveReceiver(private val write: (name: String, record: LiveRecordWire?) -> Unit) {
    private var epoch = ""
    private var sequence = -1L
    private val records = mutableMapOf<String, LiveRecordWire>()

    /** Returns true if the message was a recognized, in-order protocol
     *  message (whether or not it changed anything) - false means it was
     *  malformed or stale and the caller should not treat it as a sign of
     *  a healthy connection. Mirrors the original's boolean return used
     *  by dashboard-live.tsx to decide whether to reset its own heartbeat
     *  watchdog timer. */
    fun accept(message: LiveMessage): Boolean {
        if (message.sequence < 0) return false
        if (message.type == "heartbeat") return message.epoch == epoch
        if (message.type != "snapshot" && message.type != "delta") return false
        if (message.type == "delta" && (message.epoch != epoch || message.sequence <= sequence)) return false

        if (message.type == "snapshot") {
            val present = message.characters?.keys ?: emptySet()
            for (name in records.keys.toList()) {
                if (name !in present) write(name, null)
            }
            records.clear()
            epoch = message.epoch
        }
        sequence = message.sequence

        for ((name, incoming) in message.characters.orEmpty()) {
            if (incoming == null) {
                records.remove(name)
                write(name, null)
                continue
            }
            val previous = records[name]
            // Stale-sample guard: a delta that arrived out of order for
            // the SAME character generation, carrying an older sample
            // number than what's already held, is ignored rather than
            // rolling the displayed state backward.
            if (previous != null && previous.generation == incoming.generation && incoming.sample < previous.sample) {
                continue
            }
            val same = previous != null && previous.generation == incoming.generation
            val next = incoming.copy(
                vitals = mergeJsonObjects(if (same) previous!!.vitals else JsonObject(emptyMap()), incoming.vitals),
                items = mergeJsonObjects(if (same) previous!!.items else JsonObject(emptyMap()), incoming.items),
                slots = mergeJsonObjects(if (same) previous!!.slots else JsonObject(emptyMap()), incoming.slots),
            )
            records[name] = next
            write(name, next)
        }
        return true
    }
}

/** Small helpers for reading a scalar out of the raw vitals/slots JSON
 *  objects without pulling in the full typed model - used where the UI
 *  only needs one or two fields (e.g. a list row showing HP/MP) and
 *  parsing the whole CharacterVitals would be wasted work. */
fun JsonObject.stringField(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content
fun JsonObject.intField(key: String): Int? = (this[key] as? JsonPrimitive)?.content?.toIntOrNull()
fun JsonObject.longField(key: String): Long? = (this[key] as? JsonPrimitive)?.content?.toLongOrNull()
fun JsonObject.boolField(key: String): Boolean? = (this[key] as? JsonPrimitive)?.content?.toBooleanStrictOrNull()
