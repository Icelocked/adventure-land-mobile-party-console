/** item-action-banner.ts, verbatim: the one banner an item tile shows -
 *  a rule conflict first, then manual marks, automatic rules, delivery,
 *  bank, merchant and merchant weapon. */
export type ItemActionBanner = { label: string; colors: string; border: string; title?: string }
type Action = 'conflict' | 'upgrade' | 'compound' | 'npc' | 'stand' | 'exchange' | 'deconstruction' | 'delivery' | 'bank' | 'merchant' | 'weapon' | 'stat'
export type BannerCandidate = { action: Action; label: string; automatic?: boolean; title?: string }
const palette: Record<Action, [string, string]> = {
  conflict: ['bg-red-950 text-red-100', 'border-red-400'],
  upgrade: ['bg-violet-950 text-violet-200', 'border-violet-400'],
  compound: ['bg-fuchsia-950 text-fuchsia-200', 'border-fuchsia-400'],
  npc: ['bg-rose-950 text-rose-200', 'border-rose-400'],
  stand: ['bg-amber-950 text-amber-200', 'border-amber-400'],
  exchange: ['bg-cyan-950 text-cyan-200', 'border-cyan-400'],
  deconstruction: ['bg-orange-950 text-orange-200', 'border-orange-400'],
  delivery: ['bg-sky-950 text-sky-200', 'border-sky-400'],
  bank: ['bg-yellow-950 text-yellow-200', 'border-yellow-400'],
  merchant: ['bg-purple-950 text-purple-200', 'border-purple-400'],
  weapon: ['bg-emerald-950 text-emerald-200', 'border-emerald-400'],
  stat: ['bg-sky-950 text-sky-200', 'border-sky-400'],
}
function priority(candidate: BannerCandidate): number {
  const fixed: Partial<Record<Action, number>> = { conflict: 0, delivery: 3, bank: 4, merchant: 5, weapon: 6 }
  return fixed[candidate.action] ?? (candidate.automatic ? 2 : 1)
}
/** Collection/storage are supporting intents, never additional banners. */
export function itemActionBanner(candidates: (BannerCandidate | false | null | undefined)[], merchant: boolean): ItemActionBanner | null {
  const actions = candidates.filter((value): value is BannerCandidate => !!value && !(merchant && value.action === 'merchant'))
  const automatic = new Set(
    actions
      .filter((value) => value.automatic)
      .map((value) => (value.action === 'upgrade' || value.action === 'compound' ? 'processing' : value.action))
      .filter((value) => ['processing', 'npc', 'stand', 'deconstruction'].includes(value)),
  )
  if (automatic.size > 1) actions.unshift({ action: 'conflict', label: 'Rule conflict', title: [...automatic].join(' · ') })
  const choice = actions.sort((a, b) => priority(a) - priority(b))[0]
  if (!choice) return null
  const [colors, border] = palette[choice.action]
  return { label: choice.label, colors, border, title: choice.title }
}

/** stat-badge-class.tsx, verbatim. */
export function statBadgeClass(statType?: string) {
  switch (statType?.toLowerCase()) {
    case 'int':
      return 'bg-blue-950/90 text-blue-200 ring-blue-500/50'
    case 'str':
      return 'bg-red-950/90 text-red-200 ring-red-500/50'
    case 'dex':
      return 'bg-green-950/90 text-green-200 ring-green-500/50'
    case 'vit':
      return 'bg-amber-950/90 text-amber-200 ring-amber-500/50'
    default:
      return 'bg-slate-950/90 text-slate-200 ring-slate-500/50'
  }
}

/** equipment-slots.tsx, verbatim - the fixed slot order. */
export const equipmentSlots = ['helmet', 'amulet', 'earring1', 'earring2', 'cape', 'chest', 'mainhand', 'offhand', 'ring1', 'ring2', 'belt', 'pants', 'gloves', 'shoes', 'orb'] as const

/** compact-inventory.tsx, verbatim. */
export const compactInventory = <T,>(items: (T | null)[]) => {
  const occupied = items.filter((entry): entry is T => entry !== null)
  return [...occupied, ...Array<null>(Math.max(0, items.length - occupied.length)).fill(null)]
}

/** lucky-upgrade-slot.tsx physicalInventory / validLuckySlot, verbatim. */
export function physicalInventory<T extends { slot: number }>(items: (T | null)[], size = 42) {
  const slots: (T | null)[] = Array(Math.max(size, items.length)).fill(null)
  for (const entry of items) if (entry && Number.isInteger(entry.slot) && entry.slot >= 0 && entry.slot < slots.length) slots[entry.slot] = entry
  return slots
}
export function validLuckySlot(slot: unknown): slot is number {
  return Number.isInteger(slot) && Number(slot) >= 0 && Number(slot) < 42
}
