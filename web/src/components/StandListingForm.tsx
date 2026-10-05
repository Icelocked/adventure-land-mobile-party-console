import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StandPriceButton, pontyPrice } from '@/components/Wtb'
import { useDomainInterest, useDynamicState } from '@/data/PartyDataProvider'
import { abbreviatedGold } from '@/lib/gold'
import { npcSaleValue } from '@/lib/itemFormulas'
import { exactLevelPrice, type StandPriceHistory } from '@/lib/suggestedItemValue'
import type { Item, ItemMeta } from '@/models'

export interface StandListingDraft {
  price: number
  quantity: number
  markAll: boolean
}

/** Only observations recorded at this exact level. */
export function levelPriceHistory(history: StandPriceHistory | undefined, level: number) {
  return {
    lowest: exactLevelPrice(history?.lowest, history?.lowestLevel, level),
    recent: exactLevelPrice(history?.recent, history?.recentLevel, level),
    marketLow: exactLevelPrice(history?.marketLow, history?.marketLowLevel, level),
    highestPublicWTB: exactLevelPrice(history?.highestPublicWTB, history?.highestPublicWTBLevel, level),
  }
}

/** Stand listing form: buy-from-NPC and
 *  current market count, the price with its 13 presets (Market low −5 %
 *  disabled below the NPC price), quantity for stacks, "Mark all for stand",
 *  the automatic variant ("Set one fixed price…", prefilled from the rule),
 *  the 16-slot guard for a new listing, and an inline error. */
export function StandListingForm({
  item,
  meta,
  existing,
  auto = false,
  onSubmit,
  onCancel,
}: {
  item: Item
  meta: ItemMeta | null | undefined
  // An existing listing (has `id`) or automatic rule.
  existing?: { id?: string; price?: number; quantity?: number }
  auto?: boolean
  // Returns an error message to show inline, or nothing on success.
  onSubmit: (draft: StandListingDraft) => Promise<string | null | void> | void
  onCancel?: () => void
}) {
  // Price presets read the market section (stand price history, listings).
  useDomainInterest('market')
  const state = useDynamicState()
  // The item's value (definition.g), at least 1.
  const defaultPrice = Math.max(1, Number(meta?.definition.g) || 1)
  const [price, setPrice] = useState(String(existing?.price || defaultPrice))
  const [quantity, setQuantity] = useState(String(existing?.quantity || item.q || 1))
  const [markAll, setMarkAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const level = Number(item.level) || 0
  const observed = levelPriceHistory(state.standPriceHistory?.[item.name], level)
  const marketReference = observed.marketLow || observed.lowest || 0
  const npcSale = npcSaleValue(level, !!item.gift, item.expires, meta ?? undefined)
  const ponty = pontyPrice(item, meta)
  // Fresh, non-PVP ALData listings of this exact item.
  const freshAfter = Date.now() - 120000
  const marketCount = ((state.aldata?.listings ?? []) as unknown as { seenAt?: number; serverIdentifier?: string; quantity?: number; item: Item }[])
    .filter(
      (listing) =>
        Number(listing.seenAt || 0) >= freshAfter &&
        listing.serverIdentifier !== 'PVP' &&
        listing.item.name === item.name &&
        Number(listing.item.level || 0) === level &&
        (listing.item.p || null) === (item.p || null),
    )
    .reduce((sum, listing) => sum + Math.max(1, Number(listing.quantity) || 1), 0)
  const apply = (value: number) => setPrice(String(Math.max(1, Math.round(value))))
  const full = !existing?.id && !auto && state.standListings.length >= 16

  const presets: [string, number | undefined, boolean, 'emerald' | 'violet' | 'cyan' | 'slate'][] = [
    ['NPC sale +10%', npcSale * 1.1, false, 'emerald'],
    ['Ponty sells for', ponty, false, 'violet'],
    ['Default −10%', defaultPrice * 0.9, false, 'emerald'],
    ['Default', defaultPrice, false, 'emerald'],
    ['Default +10%', defaultPrice * 1.1, false, 'emerald'],
    ['Market low −5%', marketReference * 0.95, !marketReference || marketReference * 0.95 < defaultPrice, 'cyan'],
    ['Market price', Number(observed.marketLow), !observed.marketLow, 'cyan'],
    ['Highest WTB price', Number(observed.highestPublicWTB), !observed.highestPublicWTB, 'violet'],
    ['Recent +5%', Number(observed.recent) * 1.05, !observed.recent, 'violet'],
    ['Recent price', Number(observed.recent), !observed.recent, 'violet'],
    ['Recent −5%', Number(observed.recent) * 0.95, !observed.recent, 'violet'],
    ['Input −5%', Number(price) * 0.95, !Number(price), 'slate'],
    ['Input +5%', Number(price) * 1.05, !Number(price), 'slate'],
  ]

  return (
    <div role="group" aria-label={auto ? 'Automatic merchant stand listing' : 'Merchant stand listing'} className="my-1.5 flex flex-col gap-2 rounded-md border border-amber-800/60 p-2.5 pl-4">
      <p className="text-sm font-medium">{auto ? 'Automatic merchant stand listing' : 'Merchant stand listing'}</p>
      <p className="text-xs text-muted-foreground">
        {auto ? 'Set one fixed price. Every future matching item is marked for the stand at this price.' : 'Set the sale price and quantity. The merchant lists it when idle.'}
      </p>
      <div className="grid gap-1 rounded border border-amber-900/70 p-2 font-mono text-xs">
        <div className="text-muted-foreground">Buy from NPC: {!level && meta?.buyable ? `${abbreviatedGold(defaultPrice)} gold` : 'unavailable'}</div>
        <div className="text-cyan-500">Current number on market: {marketCount.toLocaleString()}</div>
      </div>
      <Input aria-label="Stand price" inputMode="numeric" placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ''))} />
      <div className="grid grid-cols-2 gap-2">
        {presets.map(([label, value, disabled, tone]) => (
          <StandPriceButton key={label} label={label} value={value} disabled={disabled} tone={tone} onClick={() => value && apply(value)} />
        ))}
      </div>
      <p className="font-mono text-[10px] text-muted-foreground">
        Market low uses the current fresh low, falling back to the lowest observed price. It is disabled when a 5% undercut would fall below the buy-from-NPC price.
      </p>
      {!auto && Number(item.q || 1) > 1 && (
        <Input aria-label="Stand quantity" inputMode="numeric" placeholder="Quantity" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ''))} />
      )}
      {!auto && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={markAll} onChange={(e) => setMarkAll(e.target.checked)} className="mt-0.5 size-4" />
          <span>
            Mark all for stand
            <span className="block text-xs text-muted-foreground">List every identical copy held by the merchant or stored in the bank at this price.</span>
          </span>
        </label>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        {onCancel && (
          <Button size="sm" variant="outline" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          size="sm"
          disabled={busy || full}
          onClick={async () => {
            setBusy(true)
            setError(null)
            const failure = await onSubmit({ price: Number(price), quantity: Number(quantity), markAll })
            setBusy(false)
            if (failure) setError(failure)
          }}
        >
          {auto ? 'Save auto mark' : 'Mark for stand'}
        </Button>
      </div>
    </div>
  )
}
