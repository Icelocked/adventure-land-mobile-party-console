import type { BankSnapshot, CharacterState } from '@/models'

/** lib/account-inventory.ts's inventoryCounts ported verbatim - total
 *  owned quantity per item (or per item+level when [byLevel]), summed
 *  across every character's carried inventory plus the shared bank. Used
 *  to check whether a craft/exchange has its required materials on hand
 *  before letting the merchant queue it. This app has no bankboi concept
 *  yet (see DEPLOYMENT/README's known-gaps list), so unlike the
 *  dashboard's version there's no `bankbois` source to add or exclude. */
export function inventoryCounts(characters: Record<string, CharacterState>, bank: BankSnapshot | null | undefined, byLevel = false): Record<string, number> {
  const totals: Record<string, number> = {}
  const add = (entry: { item?: { name?: string; level?: number; q?: number } | null } | null | undefined) => {
    const item = entry?.item
    if (!item?.name) return
    const key = byLevel ? `${item.name}@${item.level ?? 0}` : item.name
    totals[key] = (totals[key] ?? 0) + Math.max(1, item.q ?? 1)
  }
  for (const state of Object.values(characters)) {
    for (const entry of state.inventory?.items ?? []) add(entry)
  }
  for (const pack of Object.values(bank?.packs ?? {})) {
    for (const entry of pack) add(entry)
  }
  return totals
}
