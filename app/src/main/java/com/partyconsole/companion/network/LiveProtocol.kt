package com.partyconsole.companion.network

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * The dashboard-stream protocol: snapshot/delta/heartbeat messages
 * reconciled by epoch and sequence. Keep in sync with party-console's
 * dashboard/features/party/live-protocol.ts.
 *
 * vitals/items/slots stay raw JSON merged key-by-key so new server fields
 * pass through without an app update.
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

/** Shallow merge; `incoming` wins on conflict. */
private fun mergeJsonObjects(previous: JsonObject, incoming: JsonObject): JsonObject =
    JsonObject(previous + incoming)

class LiveReceiver(private val write: (name: String, record: LiveRecordWire?) -> Unit) {
    private var epoch = ""
    private var sequence = -1L
    private val records = mutableMapOf<String, LiveRecordWire>()

    /** True if the message was a recognized, in-order protocol message
     *  (whether or not it changed anything); false means malformed or stale,
     *  and not a sign of a healthy connection. */
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
            // Ignore an older sample from the same generation rather than
            // rolling the state backward.
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

/** Read one scalar from raw vitals/slots JSON without decoding the full
 *  model. */
fun JsonObject.stringField(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content
fun JsonObject.intField(key: String): Int? = (this[key] as? JsonPrimitive)?.content?.toIntOrNull()
fun JsonObject.longField(key: String): Long? = (this[key] as? JsonPrimitive)?.content?.toLongOrNull()
fun JsonObject.boolField(key: String): Boolean? = (this[key] as? JsonPrimitive)?.content?.toBooleanStrictOrNull()
