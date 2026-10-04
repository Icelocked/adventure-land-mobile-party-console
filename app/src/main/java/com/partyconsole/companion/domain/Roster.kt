package com.partyconsole.companion.domain

import com.partyconsole.companion.model.ActiveSlot
import com.partyconsole.companion.model.Bankboi
import com.partyconsole.companion.model.BankboiTransaction
import com.partyconsole.companion.model.CharacterConnection
import java.util.Locale

/** runtime/roster/character-order.ts (party-console v1.2.0), verbatim (the
 *  PWA's lib/characterOrder.ts): primary first, then Steam, then headless;
 *  merchants stay last unless primary. Ties: roster order, then name. */
fun <T> orderCharacters(
    characters: List<T>,
    roster: List<String>,
    primary: String?,
    merchant: String?,
    steam: Collection<String> = emptyList(),
    name: (T) -> String,
    ctype: (T) -> String?,
): List<T> {
    val order = roster.withIndex().associate { (index, member) -> member to index }
    val steamNames = steam.toSet()
    fun rank(member: T): Int = when {
        name(member) == primary -> 0
        name(member) == merchant || ctype(member) == "merchant" -> 3
        name(member) in steamNames -> 1
        else -> 2
    }
    return characters.sortedWith(
        compareBy<T>({ rank(it) }, { order[name(it)] ?: Int.MAX_VALUE }).thenBy { name(it) },
    )
}

/** pending-character-cards.tsx (party-console v1.2.0): status labels and
 *  which characters show a "pending" card instead of a live one. */
val PENDING_LABELS = mapOf(
    "loading" to "Loading in Steam",
    "code" to "CODE active — waiting for Party Console",
    "stopped" to "CODE stopped",
    "waiting" to "Waiting for Steam status",
    "lost" to "Connection lost",
    "connected" to "Connected",
)

data class PendingCharacter(val name: String, val primary: Boolean, val status: String, val delayed: Boolean, val error: String? = null)

fun pendingCharacters(
    bankbois: List<Bankboi>,
    bankboiTransaction: BankboiTransaction?,
    connections: List<CharacterConnection>,
    activeSlots: List<ActiveSlot>,
    liveNames: Collection<String>,
): List<PendingCharacter> {
    val excluded = bankbois.map { it.name }.toMutableSet()
    bankboiTransaction?.let { excluded += it.bankboi }
    val known = connections.map { it.name }.toSet()
    val live = liveNames.toSet()
    val waiting = activeSlots.filter { slot -> slot.character != null && slot.character !in excluded && slot.character !in known && slot.character !in live }
    return connections
        .filter { it.name !in excluded && (it.status != "connected" || it.name !in live) }
        .map { PendingCharacter(it.name, it.primary, it.status, it.delayed, it.error) } +
        waiting.map { PendingCharacter(it.character!!, it.primary, "waiting", delayed = false) }
}

/** The delayed-help text under a pending card. */
fun pendingHelp(status: String): String = when (status) {
    "stopped" -> "CODE is stopped. Click Engage in the game client when you want to resume."
    "lost" -> "The game client stopped reporting. Check that it is open and can reach Party Console."
    "code" -> "Party Console hasn’t received this character’s status yet. If it stays stuck, click Disengage, then Engage in the Steam client’s CODE window."
    else -> "Still waiting for the game client to finish loading. Check its window for a connection or loading error."
}

/** abbreviated-gold.tsx (party-console v1.2.0), verbatim. */
fun abbreviatedGold(value: Long): String = when {
    value >= 1_000_000_000 -> String.format(Locale.US, "%.3fb", value / 1_000_000_000.0)
    value >= 1_000_000 -> String.format(Locale.US, "%.3fm", value / 1_000_000.0)
    value >= 100_000 -> String.format(Locale.US, "%.1fK", value / 1_000.0)
    else -> String.format(Locale.getDefault(), "%,d", value)
}

/** party-gold.tsx partyGoldNames, verbatim: active, loaded slots only,
 *  never bankbois. */
fun partyGoldNames(activeSlots: List<ActiveSlot>, bankbois: List<Bankboi>): List<String> {
    val excluded = bankbois.map { it.name }.toSet()
    return activeSlots
        .filter { it.character != null && it.state !in setOf("empty", "offline", "failed") }
        .mapNotNull { it.character }
        .distinct()
        .filter { it !in excluded }
}

data class GoldTotals(val carried: Long?, val total: Long?)

/** party-gold.tsx goldTotals, verbatim: unknown if any balance is. */
fun goldTotals(bank: Long?, balances: List<Long?>): GoldTotals {
    val carried = if (balances.all { it != null }) balances.sumOf { it!! } else null
    return GoldTotals(carried = carried, total = if (bank != null && carried != null) bank + carried else null)
}

/** How recently a character last reported (lib/freshness.ts). Not a
 *  dashboard feature: shows a stuck character from the phone. `live`
 *  matches the 10s online window; past a minute it may be hung. */
enum class FreshnessLevel { LIVE, SLOW, STALE }
data class Freshness(val level: FreshnessLevel, val label: String)

fun ageLabel(ms: Long): String {
    val seconds = maxOf(0, ms / 1000)
    if (seconds < 60) return "${seconds}s"
    val minutes = seconds / 60
    if (minutes < 60) return "${minutes}m ${(seconds % 60).toString().padStart(2, '0')}s"
    return "${minutes / 60}h ${(minutes % 60).toString().padStart(2, '0')}m"
}

fun freshness(ageMs: Long, subject: String = "update"): Freshness = when {
    ageMs < 10_000 -> Freshness(FreshnessLevel.LIVE, "Live · last $subject ${ageLabel(ageMs)} ago")
    ageMs < 60_000 -> Freshness(FreshnessLevel.SLOW, "No $subject for ${ageLabel(ageMs)}")
    else -> Freshness(FreshnessLevel.STALE, "No $subject for ${ageLabel(ageMs)} — may be hung")
}
