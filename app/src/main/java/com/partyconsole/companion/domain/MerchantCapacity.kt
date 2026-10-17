package com.partyconsole.companion.domain

import com.partyconsole.companion.model.InventoryEntry
import com.partyconsole.companion.model.MerchantJob

// Console 1.4: merchant-card-controls.tsx capacityBlocked, built on
// runtime/coordinator/merchant/job-policy.ts coordinatorMerchantTransferBlocked
// and pickup-jobs.ts. The server holds back item pickups from other
// characters while the merchant has three or fewer empty bag slots, and the
// dashboard applies the same limit to fishing and mining.
// PWA: web/src/lib/merchantCapacity.ts.

private val AUTOMATIC_PICKUPS = setOf("auto upgrade", "auto compound", "auto npc sale pickup")
private val TRANSFER_REASONS = setOf("marked items", "inventory cleanout", "exchange pickup")

private fun pickupReason(reason: String, target: String?, merchant: String?): String =
    if (!target.isNullOrEmpty() && target != merchant && (reason in AUTOMATIC_PICKUPS || reason == "deconstruction pickup")) "marked items" else reason

private fun collectsPartyItems(reason: String) = reason in setOf("party collection", "marked items", "inventory cleanout", "exchange pickup")
private fun gathering(reason: String) = reason == "fishing" || reason == "mining"

/** True once the merchant's bag has three or fewer empty slots. An unknown
 *  bag (merchant offline) never counts as full. */
fun merchantAtCapacity(items: List<InventoryEntry?>?): Boolean = items != null && items.count { it == null } <= 3

/** Whether a queued job waits on merchant bag space. */
fun merchantJobCapacityBlocked(job: MerchantJob, merchant: String?, atCapacity: Boolean): Boolean {
    if (gathering(job.reason)) return atCapacity
    val reason = pickupReason(job.reason, job.target, merchant)
    val normalized = if (collectsPartyItems(reason)) "marked items" else reason
    if (job.target == (merchant ?: "") || normalized !in TRANSFER_REASONS) return false
    return atCapacity
}

/** The queue row status: "BLOCKED" for gathering, "blocked" for a pickup. */
fun queuedJobStatus(job: MerchantJob, merchant: String?, atCapacity: Boolean): String = when {
    !merchantJobCapacityBlocked(job, merchant, atCapacity) -> "queued"
    gathering(job.reason) -> "BLOCKED"
    else -> "blocked"
}

/** Enabled gathering modes whose cooldown has passed and that have no job
 *  yet. The dashboard lists them as rows, so a full bag shows why they
 *  don't start. */
fun dueGatheringModes(modes: List<String>, own: Map<String, Long>, party: Map<String, Long>, jobs: List<MerchantJob?>, now: Long): List<String> =
    modes.filter { mode -> gathering(mode) && maxOf(own[mode] ?: 0L, party[mode] ?: 0L) <= now && jobs.none { it?.reason == mode } }
