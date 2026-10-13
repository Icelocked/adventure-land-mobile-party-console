import type { MerchantJob } from '@/models'

// Console 1.4: merchant-card-controls.tsx capacityBlocked, built on
// runtime/coordinator/merchant/job-policy.ts coordinatorMerchantTransferBlocked
// and pickup-jobs.ts. The server holds back item pickups from other characters
// while the merchant has three or fewer empty bag slots; the dashboard
// applies the same limit to fishing and mining.

const automaticPickups = new Set(['auto upgrade', 'auto compound', 'auto npc sale pickup'])
const transferReasons = ['marked items', 'inventory cleanout', 'exchange pickup']

function pickupReason(reason: string, target: string | null | undefined, merchant: string | null | undefined): string {
  return target && target !== merchant && (automaticPickups.has(reason) || reason === 'deconstruction pickup') ? 'marked items' : reason
}
function collectsPartyItems(reason: string): boolean {
  return ['party collection', 'marked items', 'inventory cleanout', 'exchange pickup'].includes(reason)
}
const gathering = (reason: string) => reason === 'fishing' || reason === 'mining'

/** True once the merchant's bag has three or fewer empty slots. An unknown
 *  bag (merchant offline) never counts as full. */
export function merchantAtCapacity(items: readonly unknown[] | null | undefined): boolean {
  return Array.isArray(items) && items.filter((entry) => !entry).length <= 3
}

/** Whether a queued job waits on merchant bag space. */
export function merchantJobCapacityBlocked(job: MerchantJob, merchant: string | null | undefined, atCapacity: boolean): boolean {
  if (gathering(job.reason)) return atCapacity
  const reason = pickupReason(job.reason, job.target, merchant)
  const normalized = collectsPartyItems(reason) ? 'marked items' : reason
  if (job.target === (merchant || null) || !transferReasons.includes(normalized)) return false
  return atCapacity
}

/** The queue row status: "BLOCKED" for gathering, "blocked" for a pickup. */
export function queuedJobStatus(job: MerchantJob, merchant: string | null | undefined, atCapacity: boolean): 'queued' | 'blocked' | 'BLOCKED' {
  if (!merchantJobCapacityBlocked(job, merchant, atCapacity)) return 'queued'
  return gathering(job.reason) ? 'BLOCKED' : 'blocked'
}

/** Enabled gathering modes whose cooldown has passed and that have no job
 *  yet. The dashboard lists them as rows so a full bag shows why they
 *  don't start. */
export function dueGatheringModes(
  modes: readonly string[],
  cooldowns: { own?: Record<string, unknown>; party?: Record<string, unknown> },
  jobs: readonly (MerchantJob | null | undefined)[],
  now: number,
): ('fishing' | 'mining')[] {
  return modes.filter(
    (mode): mode is 'fishing' | 'mining' =>
      gathering(mode) &&
      Math.max(Number(cooldowns.own?.[mode] || 0), Number(cooldowns.party?.[mode] || 0)) <= now &&
      !jobs.some((job) => job?.reason === mode),
  )
}
