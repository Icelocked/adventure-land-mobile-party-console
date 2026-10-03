import type { EquippedEntry, Item, PartyStateDynamic, StandBid, StandListing } from '@/models'

/** The merchant as stand-inspection.ts needs it: its equipped slots (the
 *  trade1..16 stand slots live there) and whether the stand is open. */
export interface StandMerchant {
  slots?: Record<string, EquippedEntry | null>
  standOpen?: boolean
}
type NativeStand = PartyStateDynamic['nativeStand']
type NativeOffer = NonNullable<NativeStand>['offers'][string]

// stand-inspection.ts, verbatim from here down.
const validStandSlot = (slot: string) => /^trade(?:[1-9]|1[0-6])$/.test(slot)
const identity = (a: Item, b: Item) =>
  a.name === b.name &&
  Number(a.level || 0) === Number(b.level || 0) &&
  a.p === b.p &&
  a.stat_type === b.stat_type &&
  JSON.stringify((a as { data?: unknown }).data) === JSON.stringify((b as { data?: unknown }).data)
function standOccupants(listings: StandListing[], native: NativeStand, merchant?: StandMerchant) {
  const slots = new Map<string, { kind: 'sale' | 'buy'; item?: Item; itemId?: string; listing?: StandListing; offer?: NativeOffer }>()
  for (const [slot, entry] of Object.entries(merchant?.slots || {})) if (validStandSlot(slot) && entry) slots.set(slot, { kind: entry.item.b ? 'buy' : 'sale', item: entry.item })
  if (!merchant?.standOpen) {
    for (const offer of Object.values(native?.offers || {}))
      if (validStandSlot(offer.slot) && !slots.has(offer.slot) && ['live', 'removing'].includes(offer.phase)) slots.set(offer.slot, { kind: 'buy', itemId: offer.itemId, offer })
    for (const listing of listings)
      if (listing.tradeSlot && validStandSlot(listing.tradeSlot) && !slots.has(listing.tradeSlot) && listing.state === 'live') slots.set(listing.tradeSlot, { kind: 'sale', item: listing.item, listing })
  }
  return slots
}
export function standOccupancy(listings: StandListing[], native: NativeStand, merchant?: StandMerchant) {
  const slots = standOccupants(listings, native, merchant)
  const sales = [...slots.values()].filter((entry) => entry.kind === 'sale').length
  return { sales, buys: slots.size - sales, total: slots.size }
}
export function occupiedStandSlots(listings: StandListing[], native: NativeStand, merchant?: StandMerchant) {
  return standOccupancy(listings, native, merchant).total
}
export interface StandSaleRow {
  occupied: boolean
  configured: StandListing
  liveEntry?: EquippedEntry | null
  editable: boolean
  key: string
  status: 'Live' | 'Paused' | 'Queued'
}
export function standSaleRows(listings: StandListing[], merchant?: StandMerchant, native?: NativeStand): StandSaleRow[] {
  const slots = Object.entries(merchant?.slots || {}).filter(([slot, entry]) => validStandSlot(slot) && entry && !entry.item.b)
  const occupants = standOccupants(listings, native, merchant)
  const used = new Set<string>()
  const rows: StandSaleRow[] = listings.map((configured, index) => {
    const match = configured.state !== 'paused' ? slots.find(([slot, entry]) => !used.has(slot) && identity(configured.item, entry!.item) && (!configured.tradeSlot || configured.tradeSlot === slot)) : undefined
    const stored = !match && configured.state === 'live' && configured.tradeSlot && !used.has(configured.tradeSlot) && occupants.get(configured.tradeSlot)?.listing === configured
    if (match) used.add(match[0])
    else if (stored && configured.tradeSlot) used.add(configured.tradeSlot)
    return {
      occupied: !!match || !!stored,
      configured,
      liveEntry: match?.[1],
      editable: true,
      key: configured.id || `configured-${index}`,
      status: configured.state === 'paused' ? 'Paused' : merchant?.standOpen && match && Number(match[1]!.item.price) === configured.price ? 'Live' : 'Queued',
    }
  })
  for (const [slot, entry] of slots) {
    if (!entry || used.has(slot)) continue
    rows.push({
      occupied: true,
      configured: { slot: Number(slot.replace('trade', '')), item: entry.item, price: Number(entry.item.price || 0), quantity: Number(entry.item.q || 1) },
      liveEntry: entry,
      editable: false,
      key: slot,
      status: merchant?.standOpen ? 'Live' : 'Queued',
    })
  }
  return rows
}
export function standBuyRows(bids: Record<string, StandBid>, native: NativeStand, merchant?: StandMerchant, listings: StandListing[] = []) {
  const offers = Object.values(native?.offers || {})
  return [...standOccupants(listings, native, merchant)]
    .filter(([, occupant]) => occupant.kind === 'buy')
    .sort(([a], [b]) => Number(a.slice(5)) - Number(b.slice(5)))
    .map(([slot, occupant]) => {
      const observed = merchant?.slots?.[slot]
      const id = occupant.item?.name || occupant.itemId!
      const offer =
        occupant.offer ||
        offers.find((candidate) => candidate.slot === slot && candidate.itemId === id && Number(occupant.item?.level || 0) === candidate.level && Number(occupant.item?.price) === candidate.price)
      const level = Number(occupant.item?.level ?? offer?.level ?? 0)
      const price = Number(occupant.item?.price ?? offer?.price ?? 0)
      const quantity = Number(occupant.item?.q ?? (offer ? Math.max(0, Number(offer.quantity || 1) - Number(offer.acknowledged || 0)) : 1))
      const bid: StandBid | undefined = bids[id]
      return { key: slot, id, bid, offer, observed, level, price, quantity }
    })
}

/** stand-capacity.ts, verbatim: automatic buys yield their slots to sales;
 *  explicit buy orders reserve them. */
export function standIsFull(listings: StandListing[], bids: Record<string, StandBid> = {}): boolean {
  return listings.filter((listing) => listing.state !== 'paused').length + Object.values(bids).filter((bid) => bid.useStandSlot).length >= 16
}
