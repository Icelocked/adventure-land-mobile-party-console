import { useState } from 'react'
import { usePartyApi, useDynamicState, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { useCatalogLookup, displayName } from '@/lib/catalogLookup'
import { Button } from '@/components/ui/button'
import { StandListingForm } from '@/components/StandListingForm'
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
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const act = async (action: () => Promise<{ kind: string; message?: string }>) => {
    setBusy(true)
    setError(null)
    const result = await action()
    setBusy(false)
    if (result.kind === 'failure') setError(result.message ?? 'Request failed')
    else {
      setEditing(false)
      setConfirmingRemove(false)
      await refreshNow()
    }
  }

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
      <div className="flex items-center gap-3">
        <Button variant="link" size="xs" disabled={busy} onClick={() => setEditing((v) => !v)}>
          {editing ? 'Cancel' : 'Edit price'}
        </Button>
        {/* stand-sheet.tsx removeSale: a second tap confirms. */}
        <Button
          variant="link"
          size="xs"
          className="text-destructive"
          disabled={busy}
          onClick={() => (confirmingRemove ? void act(() => api.removeStandListing(listing)) : setConfirmingRemove(true))}
        >
          {busy && confirmingRemove ? 'Removing…' : confirmingRemove ? 'Really remove?' : 'Remove'}
        </Button>
      </div>
      {editing && (
        // party-inventory-panels.tsx onStandEdit: same listing (id, bank
        // source) with its current price and quantity.
        <StandListingForm
          item={listing.item}
          meta={catalogFor(listing.item.name)?.meta}
          existing={listing}
          onSubmit={({ price, quantity, markAll }) =>
            void act(() => api.markForStand(listing.item, listing.slot, price, { id: listing.id, bankPack: listing.bankPack, quantity, markAll }))
          }
        />
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
