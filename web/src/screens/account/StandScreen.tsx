import { useState } from 'react'
import { usePartyApi, useDynamicState, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { useCatalogLookup, displayName } from '@/lib/catalogLookup'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AccountScreenScaffold, EmptyState } from './AccountScreenScaffold'
import type { CatalogItem, StandListing } from '@/models'

/** The merchant's own 16 stand slots - ported from ui/account/
 *  StandScreen.kt. Listing a new item happens from the item action
 *  panel on the merchant's own Inventory (Mark for Stand); this screen
 *  shows what's live and can remove a listing. */
export function StandScreen() {
  const dynamicState = useDynamicState()
  const refreshNow = useRefreshDynamicStateNow()
  const catalogFor = useCatalogLookup(dynamicState.merchantCatalog)

  return (
    <AccountScreenScaffold title={`Inspect Stand · ${dynamicState.standListings.length}/16`} onRefresh={() => void refreshNow()}>
      {dynamicState.standListings.length === 0 ? (
        <EmptyState message="Nothing listed on the stand." />
      ) : (
        <div className="flex flex-col gap-1.5 p-3">
          {dynamicState.standListings.map((listing, index) => (
            <StandRow key={listing.id ?? index} listing={listing} catalogFor={catalogFor} />
          ))}
        </div>
      )}
    </AccountScreenScaffold>
  )
}

function StandRow({ listing, catalogFor }: { listing: StandListing; catalogFor: (id: string) => CatalogItem | undefined }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const [editing, setEditing] = useState(false)
  const [price, setPrice] = useState(String(listing.price))

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {displayName(listing.item.name, catalogFor)}
          {listing.item.level != null ? ` +${listing.item.level}` : ''}
        </span>
        <span className="text-xs text-muted-foreground">
          {listing.price}g × {listing.quantity}
        </span>
      </div>
      {listing.slot != null && (
        <div className="flex items-center gap-3">
          <button className="text-xs text-primary underline" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Cancel' : 'Edit price'}
          </button>
          <button
            className="text-xs text-primary underline"
            onClick={async () => {
              await api.markForStand(listing.item, listing.slot!, listing.price, { remove: true })
              await refreshNow()
            }}
          >
            Remove
          </button>
        </div>
      )}
      {editing && listing.slot != null && (
        <div className="flex items-end gap-2">
          <label className="flex-1 text-xs text-muted-foreground">
            Price
            <Input value={price} onChange={(e) => /^\d*$/.test(e.target.value) && setPrice(e.target.value)} className="mt-1" />
          </label>
          <Button
            size="sm"
            onClick={async () => {
              await api.markForStand(listing.item, listing.slot!, Number(price) || 0, { quantity: listing.quantity, id: listing.id })
              setEditing(false)
              await refreshNow()
            }}
          >
            Save
          </Button>
        </div>
      )}
    </div>
  )
}
