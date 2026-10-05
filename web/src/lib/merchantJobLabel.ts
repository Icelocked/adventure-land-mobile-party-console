import type { MerchantJob } from '@/models'
import { routineFor } from './routineLabels'

/** One label for queue rows, tooltips and cancellation controls. */
const labels: Record<string, string> = {
  'party collection': 'Item collection',
  'manual visit': 'Manual visit',
  deliveries: 'Marked deliveries',
  withdrawals: 'Marked withdrawals',
  'inventory cleanout': 'Emergency cleanout',
  'gold threshold': 'Auto gold collection',
  'npc sales': 'NPC sales',
  'auto npc sales': 'Auto NPC sales',
  'manual marketplace purchases': 'Manual purchase',
  'stand bid purchases': 'Auto purchase',
  'manual crafting': 'Craft',
  'manual bank exchange': 'Bank exchange',
  'stand maintenance': 'Stand maintenance',
  'merchant idle': 'Idle',
  restock: 'Party restock',
  'merchant donation': 'Donate gold',
  'merchant luck': "Merchant's Luck",
}
type Catalog = readonly { id: string; name: string }[]
type Listing = { item?: { name?: string; level?: number }; buyQuantity?: number; quantity?: number; serverRegion?: string; serverIdentifier?: string }

function itemLabel(item: { name?: string; level?: number } | undefined, catalog: Catalog): string {
  if (!item?.name) return ''
  const name = catalog.find((entry) => entry.id === item.name)?.name || item.name
  return name + (item.level === undefined ? '' : ` +${item.level}`)
}
function purchaseDetails(job: MerchantJob, catalog: Catalog): string[] {
  const items = new Map<string, number>(),
    realms = new Set<string>()
  for (const listing of (job.listings || []) as Listing[]) {
    const name = itemLabel(listing.item || { name: job.bidItemId }, catalog)
    if (name) items.set(name, (items.get(name) || 0) + Number(listing.buyQuantity || listing.quantity || 1))
    if (listing.serverRegion && listing.serverIdentifier) realms.add(`${listing.serverRegion} ${listing.serverIdentifier}`)
  }
  return [...(job.reason === 'Ponty purchases' ? ['Ponty'] : []), ...[...items].map(([name, quantity]) => (quantity > 1 ? `${quantity.toLocaleString()} × ${name}` : name)), ...realms]
}

export function merchantJobLabel(job: MerchantJob, catalog: Catalog = []): string {
  if (job.operationStage === 'retrieving') return 'Bank retrieval'
  if (job.operationStage === 'storing') return 'Bank storage'
  const routine = routineFor(job)
  if (routine === 'join giveaway') {
    const prize = itemLabel(job.expectedItem, catalog)
    return `Join ${job.seller ? `${job.seller}'s ` : ''}giveaway${prize ? ` for ${prize}` : ''}`
  }
  if (routine === 'manual buying') return (job.order as { buys?: { desiredLevel?: number }[] } | undefined)?.buys?.some((item) => Number(item.desiredLevel) > 0) ? 'Buy and upgrade' : 'Buy'
  const label = labels[routine] || routine.charAt(0).toUpperCase() + routine.slice(1)
  return ['manual marketplace purchases', 'stand bid purchases'].includes(routine) ? [label, ...purchaseDetails(job, catalog)].join(' · ') : label
}
