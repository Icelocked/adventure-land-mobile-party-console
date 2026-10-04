package com.partyconsole.companion.model

import com.partyconsole.companion.testing.fixture
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Test

/** Every section the console serves must decode into the app's model - one
 *  mismatched field type would otherwise freeze the whole state. */
class FixtureDecodeTest {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    private fun decodeEachField(name: String) {
        val section = fixture(name)
        // Decode field by field so a failure names the field.
        for ((key, value) in section) {
            runCatching { json.decodeFromJsonElement(PartyStateDynamic.serializer(), JsonObject(mapOf(key to value))) }
                .onFailure { throw AssertionError("$name.$key does not decode: ${it.message}", it) }
        }
    }

    @Test fun core() = decodeEachField("section-core")
    @Test fun config() = decodeEachField("section-config")
    @Test fun bank() = decodeEachField("section-bank")
    @Test fun market() = decodeEachField("section-market")
    @Test fun logs() = decodeEachField("section-logs")
    @Test fun catalog() = decodeEachField("section-catalog")
    @Test fun full() = decodeEachField("state-full")
}
