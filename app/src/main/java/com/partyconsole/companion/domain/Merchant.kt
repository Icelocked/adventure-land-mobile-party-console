package com.partyconsole.companion.domain

import com.partyconsole.companion.model.CatalogItem
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.MerchantJob
import com.partyconsole.companion.model.PartyStateDynamic
import com.partyconsole.companion.ui.account.routineFor
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import java.util.Locale
import kotlin.math.ceil
import kotlin.math.roundToLong

private val itemJson = Json { encodeDefaults = false; explicitNulls = false }
private fun JsonElement?.str(): String? = (this as? JsonPrimitive)?.takeIf { it.isString }?.content
private fun JsonElement?.num(): Double? = (this as? JsonPrimitive)?.content?.toDoubleOrNull()

/** One label per job for queue rows, tooltips and cancellation controls.
 *  PWA: web/src/lib/merchantJobLabel.ts. */
private val JOB_LABELS = mapOf(
    "party collection" to "Item collection",
    "manual visit" to "Manual visit",
    "deliveries" to "Marked deliveries",
    "withdrawals" to "Marked withdrawals",
    "inventory cleanout" to "Emergency cleanout",
    "gold threshold" to "Auto gold collection",
    "npc sales" to "NPC sales",
    "auto npc sales" to "Auto NPC sales",
    "manual marketplace purchases" to "Manual purchase",
    "stand bid purchases" to "Auto purchase",
    "manual crafting" to "Craft",
    "manual bank exchange" to "Bank exchange",
    "stand maintenance" to "Stand maintenance",
    "merchant idle" to "Idle",
    "restock" to "Party restock",
    "merchant donation" to "Donate gold",
    "merchant luck" to "Merchant's Luck",
)

private fun itemLabel(name: String?, level: Int?, catalog: List<CatalogItem>): String {
    if (name.isNullOrEmpty()) return ""
    val display = catalog.find { it.id == name }?.name?.ifEmpty { null } ?: name
    return display + (level?.let { " +$it" } ?: "")
}

private fun purchaseDetails(job: MerchantJob, catalog: List<CatalogItem>): List<String> {
    val items = linkedMapOf<String, Long>()
    val realms = linkedSetOf<String>()
    for (raw in job.listings) {
        val listing = raw as? JsonObject ?: continue
        val item = listing["item"] as? JsonObject
        val name = itemLabel(item?.get("name").str() ?: job.bidItemId, item?.get("level").num()?.toInt(), catalog)
        if (name.isNotEmpty()) items[name] = (items[name] ?: 0) + (listing["buyQuantity"].num() ?: listing["quantity"].num() ?: 1.0).toLong()
        val region = listing["serverRegion"].str()
        val identifier = listing["serverIdentifier"].str()
        if (!region.isNullOrEmpty() && !identifier.isNullOrEmpty()) realms += "$region $identifier"
    }
    return (if (job.reason == "Ponty purchases") listOf("Ponty") else emptyList()) +
        items.map { (name, quantity) -> if (quantity > 1) "${"%,d".format(quantity)} × $name" else name } +
        realms
}

fun merchantJobLabel(job: MerchantJob, catalog: List<CatalogItem> = emptyList()): String {
    if (job.operationStage == "retrieving") return "Bank retrieval"
    if (job.operationStage == "storing") return "Bank storage"
    val routine = routineFor(job)
    if (routine == "join giveaway") {
        val prize = itemLabel(job.expectedItem?.name, job.expectedItem?.level, catalog)
        return "Join ${job.seller?.let { "$it's " } ?: ""}giveaway${if (prize.isNotEmpty()) " for $prize" else ""}"
    }
    if (routine == "manual buying") {
        val buys = (job.order as? JsonObject)?.get("buys") as? JsonArray
        return if (buys?.any { ((it as? JsonObject)?.get("desiredLevel").num() ?: 0.0) > 0 } == true) "Buy and upgrade" else "Buy"
    }
    val label = JOB_LABELS[routine] ?: routine.replaceFirstChar { it.uppercase() }
    return if (routine in setOf("manual marketplace purchases", "stand bid purchases")) (listOf(label) + purchaseDetails(job, catalog)).joinToString(" · ") else label
}

/** format-duration.ts formatDuration + duration-label.tsx durationLabel
 *  (party-console v1.2.0), verbatim. */
fun formatDurationMs(ms: Double): String {
    if (!ms.isFinite()) return "Unknown"
    if (ms <= 0) return "0s"
    if (ms < 1) return "<0.001s"
    val total = ms.roundToLong()
    val hours = total / 3_600_000
    val minutes = (total % 3_600_000) / 60_000
    val seconds = (total % 60_000) / 1000.0
    val secondsText = if (seconds % 1.0 == 0.0) seconds.toLong().toString() else String.format(Locale.US, "%s", seconds)
    return listOfNotNull(
        if (hours > 0) "${hours}h" else null,
        if (minutes > 0) "${minutes}m" else null,
        if (seconds > 0) "${secondsText}s" else null,
    ).joinToString(" ").ifEmpty { "0s" }
}

fun durationLabel(ms: Long?): String = when {
    ms == null -> "Active"
    ms <= 0 -> "Expiring"
    else -> formatDurationMs(ceil(ms / 1000.0) * 1000)
}

data class PartyGroup(val id: String, val members: List<String>)

/** runtime/party-groups.ts (party-console v1.2.0), verbatim: the groups the
 *  merchant can be sent to - a leader with its followers, plus each
 *  independent character - never the merchant or bankbois. */
fun merchantPartyGroups(state: PartyStateDynamic, names: List<String>): List<PartyGroup> {
    val groups = linkedMapOf<String, MutableList<String>>()
    val storage = state.bankbois.map { it.name }.toSet()
    for (name in names.distinct()) {
        if (name == state.merchantCharacter || name in storage) continue
        val leader = state.leader
        val owner = if (leader != null && (name == leader || state.followers[name] == true)) leader else name
        groups.getOrPut(owner) { mutableListOf() } += name
    }
    return groups.map { (id, members) ->
        PartyGroup(id, members.sortedWith { a, b -> if (a == id) -1 else if (b == id) 1 else a.compareTo(b) })
    }
}

/** automatic-commerce-rule-key.tsx, verbatim: the key the server stores
 *  automatic NPC-sale / stand / deconstruction rules under. */
fun automaticCommerceRuleKey(item: Item): String = buildJsonObject {
    put("name", item.name)
    put("level", maxOf(0, item.level ?: 0))
    put("p", item.p?.ifEmpty { null }?.let { JsonPrimitive(it) } ?: JsonNull)
    put("stat_type", item.statType?.ifEmpty { null }?.let { JsonPrimitive(it) } ?: JsonNull)
}.toString()

// runtime/coordinator/inventory/item-identity.ts sameMarkedItem, verbatim:
// marks are partial identities; a changing stack quantity doesn't count.
private val TRANSIENT = setOf("q", "price", "rid", "b", "giveaway")
private fun itemObject(item: Item): JsonObject = itemJson.encodeToJsonElement(Item.serializer(), item).jsonObject
private fun sameIdentity(first: JsonObject, second: JsonObject): Boolean =
    second.keys.filter { it !in TRANSIENT }.all { first[it] == second[it] }

/** Rule-conflict detection. Console: runtime/coordinator/inventory/shared-rules.ts. */
private fun ruleOwner(state: PartyStateDynamic, name: String) = if (state.merchantRules?.version == 1) state.merchantCharacter.toString() else name

private fun withLevel(item: JsonObject, level: Int) = JsonObject(item + ("level" to JsonPrimitive(level)))

private fun unfinishedUpgrade(passId: String?, tiers: Int?, original: JsonObject, item: Item): Boolean {
    val start = original["level"].num()?.toInt() ?: 0
    val level = item.level ?: 0
    return passId != null && level >= start && level < start + (tiers ?: 0) && sameIdentity(withLevel(itemObject(item), start), withLevel(original, start))
}

private fun offeringUpgradePending(state: PartyStateDynamic, item: Item): Boolean =
    state.upgrades.values.flatten().any { mark ->
        val original = itemObject(mark.item)
        val waiting = mark.waitingOffering as? JsonObject
        mark.auto && mark.item.name == item.name &&
            (waiting?.get("level").num()?.toInt() == (item.level ?: 0) || unfinishedUpgrade(mark.passId, mark.tiers, original, item))
    }

private fun activeUpgrade(value: JsonElement?): Boolean {
    if (value == null || value is JsonNull) return false
    if (value is JsonPrimitive) return value.content != "false" && value.content != "0" && value.content.isNotEmpty()
    return (value as? JsonObject)?.get("quantity").num() != 0.0
}

private fun processingPending(state: PartyStateDynamic, item: Item): Boolean {
    val owner = ruleOwner(state, state.merchantCharacter.toString())
    return offeringUpgradePending(state, item) ||
        activeUpgrade(state.autoUpgradeMarks[owner]?.get("${item.name}@+${item.level ?: 0}")) ||
        state.autoCompounds[owner].orEmpty().any { it.name == item.name && it.quantity != 0 && (item.level ?: 0) < it.targetTier }
}

fun itemRuleConflicts(state: PartyStateDynamic, item: Item): List<String> {
    if (state.merchantRules == null) return emptyList()
    val owner = state.merchantCharacter.toString()
    val key = automaticCommerceRuleKey(item)
    val actions = mutableListOf<String>()
    if (processingPending(state, item)) actions += "Processing"
    if (state.autoNpcSales.containsKey(key)) actions += "NPC sale"
    if (state.autoStandMarks.containsKey(key)) actions += "Stand sale"
    if (state.autoDeconstruction[owner]?.containsKey(key) == true) actions += "Deconstruction"
    return if (actions.size > 1) actions else emptyList()
}

data class ItemConflict(val item: Item, val actions: List<String>)

/** Items whose automatic rules conflict with each other. */
fun conflictingItems(state: PartyStateDynamic): List<ItemConflict> {
    val owner = state.merchantCharacter.toString()
    val rules = state.autoNpcSales.values.map { it.item } + state.autoStandMarks.values.map { it.item } + state.autoDeconstruction[owner].orEmpty().values.map { it.item }
    val items = linkedMapOf<String, Item>()
    for (item in rules) items["${item.name}:${item.level ?: 0}"] = item
    return items.values.map { ItemConflict(it, itemRuleConflicts(state, it)) }.filter { it.actions.isNotEmpty() }
}

/** A short human description of one rule value. */
fun describeRule(value: JsonElement?): String {
    val rule = value as? JsonObject ?: return (value as? JsonPrimitive)?.content ?: "null"
    fun remaining(): String {
        val quantity = rule["quantity"].num()
        return if (quantity == null || quantity == -1.0) "Unlimited" else "${quantity.toLong()} remaining"
    }
    rule["tiers"].num()?.takeIf { it != 0.0 }?.let { return "${it.toLong()} upgrade levels · ${remaining()}" }
    rule["targetTier"].num()?.takeIf { it != 0.0 }?.let { return "Compound to +${it.toLong()} · ${remaining()}" }
    rule["price"].num()?.takeIf { it != 0.0 }?.let { return "${"%,d".format(it.toLong())}g" }
    return "Automatic rule"
}
