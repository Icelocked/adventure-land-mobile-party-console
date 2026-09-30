import type { LuckySlotStreams, LuckySlotTracking, SlotRollStatistics } from '@/models'

export const emptyRolls = (): SlotRollStatistics => ({ totalRolls: 0, sumRolls: 0, rollsAbove96_3: 0, perfectRolls: 0 })

/** Sums every evidence stream into one combined slot table - ported from
 *  runtime/lucky-slot-tracking.ts's aggregateSlotTracking. The real
 *  version also merges in a live, not-yet-persisted local stream from the
 *  character's own connection; this read-only display only has the
 *  already-persisted streams the server broadcasts, which is what every
 *  other client (including party-console's own dashboard, most of the
 *  time) actually shows too. */
export function aggregateSlotTracking(streams: LuckySlotStreams = {}): LuckySlotTracking {
  const slots: LuckySlotTracking['slots'] = {}
  for (const stream of Object.values(streams)) {
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

// Ported verbatim from runtime/lucky-slot-tracking.ts.
// Source: kaansoral/adventureland_mongodb node/server.js, upgrade handler.
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

/** Ranks all 42 slots by log-evidence for being the lucky one, ported
 *  verbatim from runtime/lucky-slot-tracking.ts's luckySlotSearch.
 *  Inference requires >=100 rolls in the leading slot and >=99.9%
 *  confidence under the published server model - below that, the next
 *  upgrade rotates through whichever slot has the fewest samples. */
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
