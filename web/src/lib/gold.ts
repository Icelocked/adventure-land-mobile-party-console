import type { PartyStateDynamic } from '@/models'

/** abbreviated-gold.tsx (party-console v1.2.0), verbatim. */
export function abbreviatedGold(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(3)}b`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(3)}m`
  if (value >= 100_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString()
}

/** party-gold.tsx partyGoldNames, verbatim: active, loaded slots only,
 *  never bankbois. */
export function partyGoldNames(state: Pick<PartyStateDynamic, 'activeSlots' | 'bankbois'>) {
  const excluded = new Set((state.bankbois || []).map((entry) => entry.name))
  return [
    ...new Set(
      (state.activeSlots || [])
        .filter((slot) => slot.character && !['empty', 'offline', 'failed'].includes(slot.state))
        .map((slot) => slot.character!),
    ),
  ].filter((name) => !excluded.has(name))
}

/** party-gold.tsx goldTotals, verbatim: unknown if any balance is. */
export function goldTotals(bank: number | null | undefined, balances: (number | null | undefined)[]) {
  const carried = balances.every((value) => value != null && Number.isFinite(value)) ? balances.reduce<number>((sum, value) => sum + value!, 0) : null
  return {
    carried,
    total: bank != null && carried != null ? bank + carried : null,
  }
}
