import { useState } from 'react'
import { usePartyApi, useDynamicState, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { useCatalogLookup, displayName } from '@/lib/catalogLookup'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AccountScreenScaffold, EmptyState } from './AccountScreenScaffold'
import type { CatalogItem, MarketListing, StandSearchListing } from '@/models'

/** Public market browse - ported from ui/account/MarketScreen.kt: ALData/
 *  Ponty aggregated listings (buyable) plus a live player-stand search. */
export function MarketScreen() {
  const dynamicState = useDynamicState()
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const catalogFor = useCatalogLookup(dynamicState.merchantCatalog)
  const [searchTerm, setSearchTerm] = useState('')

  const listings = [...(dynamicState.aldata?.listings ?? []), ...(dynamicState.ponty?.listings ?? [])]
  const search = dynamicState.standSearch

  return (
    <AccountScreenScaffold title="Market" onRefresh={() => void refreshNow()}>
      <div className="flex items-end gap-2 p-3">
        <label className="flex-1 text-xs text-muted-foreground">
          Search a live player stand for an item id
          <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="mt-1" />
        </label>
        <Button onClick={() => void api.standSearch(searchTerm.trim())}>Search</Button>
      </div>

      {search.listings.length > 0 ? (
        <>
          <div className="px-3 pb-1 text-sm font-medium">Live stand results for {search.itemId}</div>
          <div className="flex flex-col gap-1.5 px-3">
            {search.listings.map((listing, index) => (
              <StandSearchRow key={index} listing={listing} catalogFor={catalogFor} />
            ))}
          </div>
        </>
      ) : search.status === 'searching' ? (
        <p className="p-3 text-sm text-muted-foreground">Searching nearby stands...</p>
      ) : null}

      <div className="px-3 pb-1 pt-2 text-sm font-medium">Market (ALData / Ponty)</div>
      {listings.length === 0 ? (
        <EmptyState message="No market listings loaded yet." />
      ) : (
        <div className="flex flex-col gap-1.5 px-3">
          {listings.map((listing, index) => (
            <MarketRow key={index} listing={listing} catalogFor={catalogFor} />
          ))}
        </div>
      )}
    </AccountScreenScaffold>
  )
}

function MarketRow({ listing, catalogFor }: { listing: MarketListing; catalogFor: (id: string) => CatalogItem | undefined }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const [quantity, setQuantity] = useState(String(listing.quantity))
  const suffix = listing.seller ? ` (${listing.seller})` : listing.source ? ` [${listing.source}]` : ''

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {displayName(listing.item.name, catalogFor)}
          {listing.item.level != null ? ` +${listing.item.level}` : ''}
          {suffix}
        </span>
        <span className="text-xs text-muted-foreground">
          {listing.unitPrice ?? listing.price}g × {listing.quantity}
        </span>
      </div>
      {listing.key && (
        <div className="mt-1.5 flex items-end gap-2">
          <label className="flex-1 text-xs text-muted-foreground">
            Qty
            <Input value={quantity} onChange={(e) => /^\d*$/.test(e.target.value) && setQuantity(e.target.value)} className="mt-1" />
          </label>
          <Button
            size="sm"
            onClick={async () => {
              const qty = Number(quantity) || 1
              if (listing.source === 'ponty') await api.buyPonty(listing.key!, qty, listing.unitPrice ?? listing.price)
              else await api.buyAlData(listing.key!, qty)
              await refreshNow()
            }}
          >
            Buy
          </Button>
        </div>
      )}
    </div>
  )
}

function StandSearchRow({ listing, catalogFor }: { listing: StandSearchListing; catalogFor: (id: string) => CatalogItem | undefined }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const [quantity, setQuantity] = useState(String(listing.quantity))

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {displayName(listing.item.name, catalogFor)}
          {listing.item.level != null ? ` +${listing.item.level}` : ''} ({listing.seller})
        </span>
        <span className="text-xs text-muted-foreground">
          {listing.price}g × {listing.quantity}
        </span>
      </div>
      <div className="mt-1.5 flex items-end gap-2">
        <label className="flex-1 text-xs text-muted-foreground">
          Qty
          <Input value={quantity} onChange={(e) => /^\d*$/.test(e.target.value) && setQuantity(e.target.value)} className="mt-1" />
        </label>
        <Button
          size="sm"
          onClick={async () => {
            await api.buyFromStand(listing, Number(quantity) || 1)
            await refreshNow()
          }}
        >
          Buy
        </Button>
      </div>
    </div>
  )
}
