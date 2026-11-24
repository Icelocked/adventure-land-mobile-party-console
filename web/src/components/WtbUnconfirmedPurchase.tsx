import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import type { PartyStateDynamic } from '@/models'

type Purchases = NonNullable<NonNullable<PartyStateDynamic['nativeStand']>['purchases']>

/** Port of the console's wtb-unconfirmed-purchase.tsx (v1.5.0). A purchase whose
 *  merchant job ended without confirming it pauses this WTB until the player says
 *  whether it was bought. */
export function WtbUnconfirmedPurchase({ itemId, name, purchases }: { itemId: string; name: string; purchases?: Purchases }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const entry = Object.entries(purchases || {}).find(([, purchase]) => purchase.item.name === itemId)
  if (!entry) return null
  const [id, purchase] = entry
  const seller = id.split(':')[1]
  const resolve = async (bought: boolean) => {
    setBusy(true)
    setError(null)
    const result = await api.resolveWtbPurchase(id, bought)
    setBusy(false)
    if (result.kind === 'failure') setError(result.message || 'Could not resolve the purchase')
    else await refreshNow()
  }
  return (
    <fieldset aria-label={`Unconfirmed purchase of ${name}`} className="grid min-w-0 gap-2 rounded border border-amber-700 p-2 text-xs text-amber-200">
      <p>
        Purchase outcome unconfirmed: {purchase.quantity.toLocaleString()} × {name} at {Number(purchase.item.price || 0).toLocaleString()}
        {seller ? ` from ${seller}` : ''}. The merchant job ended before reporting it, so this WTB is paused.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void resolve(true)}>
          It was bought
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void resolve(false)}>
          It wasn&apos;t bought
        </Button>
      </div>
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </fieldset>
  )
}
