package com.partyconsole.companion.data

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** The data domains the dashboard polls separately (query-cache.tsx). */
enum class Domain { CORE, CONFIG, FAST, INVENTORY, LOGS, BANK, MARKET, CATALOG, MAIL, ESCAPE }

private val CORE = listOf(Domain.CORE, Domain.CONFIG)
private val INVENTORY = listOf(Domain.CORE, Domain.CONFIG, Domain.INVENTORY, Domain.FAST)
private val COMMERCE = listOf(Domain.CORE, Domain.CONFIG, Domain.INVENTORY, Domain.FAST, Domain.BANK, Domain.MARKET)

/** dashboard/features/party/query-actions.ts (party-console v1.2.0), ported
 *  verbatim (same as the PWA's data/queryActions.ts): which data domains
 *  each action can change. After an action the repository refreshes exactly
 *  these. Re-sync on every console release - an unknown path refreshes
 *  core + config. */
val ACTION_DOMAINS: Map<String, List<Domain>> = mapOf(
    "/daily-dungeons" to CORE,
    "/merchant/bank-sort" to CORE,
    "/config" to CORE,
    "/formation" to CORE,
    "/focus" to CORE,
    "/farming-mode" to CORE,
    "/hunt-blacklist" to CORE,
    "/hunt-settings" to CORE,
    "/rare-hunting" to CORE,
    "/navigate-to-monster" to CORE,
    "/town-party" to CORE,
    "/restock" to CORE,
    "/escape" to CORE,
    "/bank-party" to listOf(Domain.CORE, Domain.CONFIG, Domain.BANK),
    "/realm/switch" to INVENTORY,
    "/steam/action" to INVENTORY,
    "/steam/recover" to INVENTORY,
    "/roster/create" to CORE,
    "/bankbois/create" to listOf(Domain.CORE, Domain.CONFIG, Domain.BANK),
    "/bank/unlock" to listOf(Domain.BANK, Domain.CORE, Domain.CONFIG),
    "/merchant/clear" to CORE,
    "/merchant/force-stand" to CORE,
    "/merchant/stand-location" to CORE,
    "/merchant/gather" to CORE,
    "/merchant/job/cancel" to COMMERCE,
    "/merchant/job/retry" to COMMERCE,
    "/merchant/routine-priorities" to CORE,
    "/merchant/blacklist" to CORE,
    "/merchant/stale-orders/clear" to COMMERCE,
    "/merchant/activity/clear" to listOf(Domain.LOGS),
    "/merchant/auto-npc-sale" to CORE,
    "/merchant/rule-conflict" to COMMERCE,
    "/deconstruction/mark" to CORE,
    "/deconstruction/auto" to CORE,
    "/merchant/auto-stand" to CORE,
    "/merchant/stand" to COMMERCE,
    "/merchant/bid" to COMMERCE,
    "/merchant/native-stand" to COMMERCE,
    "/merchant/npc-sale" to COMMERCE,
    "/merchant/order" to COMMERCE,
    "/merchant/exchange-order" to COMMERCE,
    "/merchant/aldata-order" to COMMERCE,
    "/merchant/aldata-sale" to COMMERCE,
    "/merchant/ponty-order" to COMMERCE,
    "/merchant/donate" to INVENTORY,
    "/merchant/join-giveaway" to INVENTORY,
    "/merchant/send-mail" to COMMERCE + Domain.MAIL,
    "/mail/collect" to listOf(Domain.MAIL, Domain.INVENTORY, Domain.CONFIG, Domain.BANK, Domain.CORE),
    "/mail/delete" to listOf(Domain.MAIL),
    "/mail/refresh" to listOf(Domain.MAIL),
    "/aldata/key" to CORE,
    "/aldata/refresh" to listOf(Domain.MARKET, Domain.CORE, Domain.CONFIG),
    "/anniversary/chat-advertise" to CORE,
)

private val SLOT_ACTION = Regex("""^/slots/\d+/(spawn|logout)$""")
private val BANKBOI_DELETE = Regex("""^/bankbois/[^/]+/delete$""")
private val COMBAT_LOG_CLEAR = Regex("""^/combat-log/[^/]+/clear$""")
private val CORE_COMMANDS = Regex("travel|town|gold-target")

fun affectedDomains(path: String, body: JsonObject?): List<Domain> {
    if (path == "/command") {
        val type = (body?.get("type") as? JsonPrimitive)?.content.orEmpty()
        if (type == "withdraw") return COMMERCE
        return if (CORE_COMMANDS.containsMatchIn(type)) CORE else INVENTORY
    }
    if (SLOT_ACTION.matches(path)) return INVENTORY
    if (BANKBOI_DELETE.matches(path)) return listOf(Domain.CORE, Domain.CONFIG, Domain.BANK)
    if (COMBAT_LOG_CLEAR.matches(path)) return listOf(Domain.LOGS)
    // The dashboard throws here (a missing cache policy is a bug in its own
    // code); the app may call routes it hasn't mapped yet, so fall back to
    // core + config, the dashboard's default group.
    return ACTION_DOMAINS[path] ?: CORE
}
