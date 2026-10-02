/** routine-labels.tsx + automatic-routine-keys.tsx (party-console v1.2.0),
 *  ported verbatim - the merchant's schedulable work reasons and which ones
 *  have an on/off switch. Re-sync from the dashboard on every release; the
 *  server drops unknown keys (routine-priorities.ts). */
export const ROUTINE_LABELS: Record<string, string> = {
  'merchant luck': "Merchant's Luck",
  'inventory cleanout': 'Emergency inventory cleanout',
  'manual visit': 'Manual player visit',
  deliveries: 'Marked deliveries',
  withdrawals: 'Marked withdrawals',
  'party collection': 'Automatic item collection',
  restock: 'Party restock',
  'gold threshold': 'Automatic gold collection',
  'npc sales': 'Manual NPC sales',
  'manual marketplace purchases': 'Manual marketplace purchases',
  'auto npc sales': 'Auto NPC sales',
  'collect mail': 'Collect mail',
  'stand bid purchases': 'Automatic WTB fills',
  'upgrade preview': 'Refresh upgrade chances',
  'manual upgrades': 'Manual upgrades',
  'auto upgrade': 'Auto upgrade',
  'manual compounds': 'Manual compounds',
  'ALData marketplace sales': 'ALData marketplace sales',
  'auto compound': 'Auto compound',
  'manual buying': 'Manual buying',
  'manual crafting': 'Manual crafting',
  'manual exchange': 'Manual exchange',
  'automatic exchange': 'Automatic exchange',
  'merchant donation': 'Donate gold',
  'send mail': 'Send mail',
  'join giveaway': 'Join giveaways',
  'stand maintenance': 'Stand listing maintenance',
  fishing: 'Fishing',
  mining: 'Mining',
  'merchant idle': 'Idle at stand',
  'manual bank exchange': 'Manual bank exchange',
}

export const AUTOMATIC_ROUTINE_KEYS = new Set([
  'merchant luck',
  'restock',
  'gold threshold',
  'inventory cleanout',
  'auto compound',
  'auto upgrade',
  'automatic exchange',
  'stand bid purchases',
  'party collection',
  'auto npc sales',
  'join giveaway',
])

export const hasEnableToggle = (key: string): boolean => AUTOMATIC_ROUTINE_KEYS.has(key) || key === 'fishing' || key === 'mining'

/** runtime/coordinator/merchant/routines.ts routineFor (v1.2.0), verbatim -
 *  which routine a queued merchant job belongs to. */
export interface RoutineJob {
  reason: string
  manual?: boolean
  bidItemId?: string
  routine?: string
  order?: unknown
  autoExchangeKeys?: string[]
}
const purchases = new Set(['stand purchases', 'stand bid purchases', 'ALData marketplace purchases', 'Ponty purchases'])
const aliases: Record<string, string> = {
  'stand search': 'manual marketplace purchases',
  'marked items': 'party collection',
  'npc sale pickup': 'npc sales',
  'auto npc sale pickup': 'auto npc sales',
  'upgrades and compounds': 'manual upgrades',
}
function purchaseRoutine(job: RoutineJob): string {
  return job.manual === true || (!job.bidItemId && job.reason !== 'stand bid purchases') ? 'manual marketplace purchases' : 'stand bid purchases'
}
function exchangeRoutine(job: RoutineJob): string {
  return job.autoExchangeKeys?.length ? 'automatic exchange' : 'manual exchange'
}
export function routineFor(job: RoutineJob): string {
  if (job.reason === 'exchange') return exchangeRoutine(job)
  if (job.routine) return job.routine
  if (purchases.has(job.reason)) return purchaseRoutine(job)
  if (job.reason === 'merchant commerce') return (job.order as { crafts?: unknown[] })?.crafts?.length ? 'manual crafting' : 'manual buying'
  return aliases[job.reason] || job.reason
}
