import type { LuckySlotStreams, LuckySlotTracking, SlotRollStatistics } from '@/models'

export const emptyRolls = (): SlotRollStatistics => ({ totalRolls: 0, sumRolls: 0, rollsAbove96_3: 0, perfectRolls: 0 })

// Console: runtime/lucky-slot-tracking.ts.

// A slot is replaced only by one with more rolls and no smaller counters.
export function mergeSlotStream(previous: LuckySlotTracking, incoming: LuckySlotTracking): boolean {
  let changed = false
  for (const [slot, stats] of Object.entries(incoming.slots)) {
    const old = previous.slots[slot]
    if (old && (stats.totalRolls <= old.totalRolls || !(['sumRolls', 'rollsAbove96_3', 'perfectRolls'] as const).every((key) => stats[key] >= old[key]))) continue
    previous.slots[slot] = { ...stats }
    changed = true
  }
  return changed
}
export function validSlotStatistics(value: unknown): value is SlotRollStatistics {
  if (!value || typeof value !== 'object') return false
  const stats = value as SlotRollStatistics
  return (
    Number.isSafeInteger(stats.totalRolls) &&
    stats.totalRolls > 0 &&
    Number.isFinite(stats.sumRolls) &&
    stats.sumRolls >= 0 &&
    stats.sumRolls < stats.totalRolls &&
    [stats.rollsAbove96_3, stats.perfectRolls].every((n) => Number.isSafeInteger(n) && n >= 0 && n <= stats.totalRolls) &&
    stats.rollsAbove96_3 + stats.perfectRolls <= stats.totalRolls
  )
}
function readStreamId(raw: object): string | undefined {
  return 'streamId' in raw && typeof raw.streamId === 'string' && /^[a-z0-9]{1,30}-[a-z0-9-]{1,60}$/.test(raw.streamId) ? raw.streamId : undefined
}
export function normalizeSlotTracking(raw: unknown): LuckySlotTracking {
  const result: LuckySlotTracking = { version: 1, slots: {} }
  if (!raw || typeof raw !== 'object' || !('slots' in raw) || !raw.slots || typeof raw.slots !== 'object') return result
  const streamId = readStreamId(raw)
  if (streamId) (result as LuckySlotTracking & { streamId?: string }).streamId = streamId
  for (const [slot, stats] of Object.entries(raw.slots as Record<string, unknown>)) {
    if (/^(?:[0-9]|[1-3][0-9]|4[01])$/.test(slot) && validSlotStatistics(stats)) result.slots[slot] = { ...stats }
  }
  return result
}

/** Sums every persisted stream, with the live local stream merged into its
 *  own stream id so replays and moves neither double-count nor drop rolls. */
export function aggregateSlotTracking(streams: LuckySlotStreams = {}, local?: LuckySlotTracking & { streamId?: string }): LuckySlotTracking {
  const combined = { ...streams }
  if (local?.streamId) {
    const merged = normalizeSlotTracking(combined[local.streamId])
    mergeSlotStream(merged, local)
    combined[local.streamId] = merged
  }
  const slots: LuckySlotTracking['slots'] = {}
  for (const stream of Object.values(combined)) {
    for (const [slot, stats] of Object.entries(stream.slots)) {
      const total = (slots[slot] ??= emptyRolls())
      total.totalRolls += stats.totalRolls
      total.sumRolls += stats.sumRolls
      total.rollsAbove96_3 += stats.rollsAbove96_3
      total.perfectRolls += stats.perfectRolls
    }
  }
  return { version: 1, slots }
}

// Roll model from kaansoral/adventureland_mongodb node/server.js, upgrade handler.
// 60%: max(U/10000, 0.975*R - 0.012), otherwise uniform R.
// q_data exposes floor(R*10000), so the >0.963 bucket starts at 0.9631.
const NORMAL = [0.0001, 0.0369, 0.963]
const LUCKY_ZERO = 0.4 * 0.0001 + 0.6 * (0.0121 / 0.975)
const LUCKY_HIGH = 0.4 * 0.0369
const LUCKY = [LUCKY_ZERO, LUCKY_HIGH, 1 - LUCKY_ZERO - LUCKY_HIGH]

export function slotLogEvidence(stats?: SlotRollStatistics): number {
  if (!stats) return 0
  const counts = [stats.perfectRolls, stats.rollsAbove96_3, stats.totalRolls - stats.perfectRolls - stats.rollsAbove96_3]
  return counts.reduce((sum, count, index) => sum + count * Math.log(LUCKY[index]! / NORMAL[index]!), 0)
}

export interface LuckySlotSearchResult {
  slot: number | null
  confidence: number
  samples: number
  total: number
  inferred: boolean
  nextSlot: number
}

/** Ranks all 42 slots by log-evidence for being the lucky one. Inference
 *  needs >=100 rolls in the leading slot and >=99.9% confidence; below
 *  that, the next upgrade goes to the slot with the fewest samples. */
export function luckySlotSearch(tracking: LuckySlotTracking): LuckySlotSearchResult {
  const ranked = Array.from({ length: 42 }, (_, slot) => ({
    slot,
    score: slotLogEvidence(tracking.slots[slot]),
    samples: tracking.slots[slot]?.totalRolls || 0,
  })).sort((a, b) => b.score - a.score || a.samples - b.samples || a.slot - b.slot)
  const best = ranked[0]!
  const confidence = 1 / ranked.reduce((sum, entry) => sum + Math.exp(entry.score - best.score), 0)
  const total = ranked.reduce((sum, entry) => sum + entry.samples, 0)
  const inferred = confidence >= 0.999 && best.samples >= 100
  const nextSlot = inferred ? best.slot : [...ranked].sort((a, b) => a.samples - b.samples || a.slot - b.slot)[0]!.slot
  return { slot: total ? best.slot : null, confidence, samples: best.samples, total, inferred, nextSlot }
}
