import { useState } from 'react'
import { usePartyApi, useDynamicState, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { npcSaleValue } from '@/lib/itemFormulas'
import { SpriteIcon } from '@/components/SpriteIcon'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AccountScreenScaffold, EmptyState } from './AccountScreenScaffold'
import type { CatalogItem, StandBid } from '@/models'

/** wtborder-dialog.tsx (place/edit) + stand-sheet.tsx's "Manage WTB
 *  orders" list, ported as their own screen - previously entirely
 *  missing from both clients (Market only ever supported buying FROM a
 *  stand/ALData/Ponty, never placing a standing buy order of your own).
 *  Price presets are scoped down to NPC-sale-based only - the dashboard's
 *  Ponty/market-history presets need data (pontyPrice, standPriceHistory)
 *  this app hasn't ported; the actual order placement/editing/
 *  cancellation is fully real, just without every quick-fill shortcut. */
export function WtbScreen() {
  const dynamicState = useDynamicState()
  const refreshNow = useRefreshDynamicStateNow()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const catalog = dynamicState.merchantCatalog?.allItems ?? []
  const bids = Object.entries(dynamicState.standBids)
  const itemFor = (id: string): CatalogItem | undefined => catalog.find((c) => c.id === id)

  return (
    <AccountScreenScaffold title="WTB orders" onRefresh={() => void refreshNow()}>
      <div className="px-3 pb-2">
        <Button size="sm" onClick={() => setAdding(true)}>
          Add WTB order
        </Button>
      </div>

      {bids.length === 0 ? (
        <EmptyState message="No standing buy orders." />
      ) : (
        <div className="flex flex-col gap-1.5 px-3">
          {bids.map(([itemId, bid]) => {
            const catalogItem = itemFor(itemId)
            return (
              <div key={itemId} className="rounded-md border border-border bg-card p-2.5">
                <button className="flex w-full items-center gap-2.5 text-left" onClick={() => setEditingId(itemId)}>
                  <SpriteIcon sprite={catalogItem?.sprite} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {catalogItem?.name ?? itemId}
                      {bid.minimumQuality ? ` +${bid.minimumQuality}` : ''}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {bid.price.toLocaleString()}g × {bid.quantity}
                      {bid.priorityOverride != null ? ` · priority ${bid.priorityOverride}` : ''}
                    </div>
                  </div>
                </button>
              </div>
            )
          })}
        </div>
      )}

      {adding && <ItemPicker catalog={catalog} onCancel={() => setAdding(false)} onPick={(id) => { setAdding(false); setEditingId(id) }} />}
      {editingId && (
        <WtbForm
          itemId={editingId}
          catalogItem={itemFor(editingId)}
          existing={dynamicState.standBids[editingId]}
          onClose={() => setEditingId(null)}
        />
      )}
    </AccountScreenScaffold>
  )
}

function ItemPicker({ catalog, onCancel, onPick }: { catalog: CatalogItem[]; onCancel: () => void; onPick: (id: string) => void }) {
  const [search, setSearch] = useState('')
  const filtered = catalog.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())).slice(0, 100)

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border p-3">
        <span className="text-sm font-medium">Choose an item</span>
        <button className="text-sm text-muted-foreground" onClick={onCancel}>
          Close
        </button>
      </div>
      <div className="p-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items..." />
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {filtered.map((item) => (
          <button key={item.id} onClick={() => onPick(item.id)} className="flex w-full items-center gap-2.5 rounded-md p-2 text-left hover:bg-accent">
            <SpriteIcon sprite={item.sprite} size={28} />
            <span className="text-sm">{item.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function WtbForm({ itemId, catalogItem, existing, onClose }: { itemId: string; catalogItem: CatalogItem | undefined; existing: StandBid | undefined; onClose: () => void }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const [price, setPrice] = useState(existing ? String(existing.price) : '')
  const [quantity, setQuantity] = useState(existing ? String(existing.quantity) : '1')
  const [level, setLevel] = useState(String(existing?.minimumQuality ?? 0))
  const [priority, setPriority] = useState(existing?.priorityOverride != null ? String(existing.priorityOverride) : '')
  const [useStandSlot, setUseStandSlot] = useState(existing?.useStandSlot === true)
  const [acceptHigherLevels, setAcceptHigherLevels] = useState(existing?.acceptHigherLevels !== false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canLevel = catalogItem?.upgradeable || catalogItem?.compoundable
  const npcPrice = Math.max(1, npcSaleValue(Number(level) || 0, false, undefined, catalogItem?.meta ?? undefined))

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border p-3">
        <div className="flex items-center gap-2">
          <SpriteIcon sprite={catalogItem?.sprite} size={32} />
          <span className="text-sm font-medium">
            {catalogItem?.name ?? itemId}
            {canLevel ? ` +${level || 0}` : ''}
          </span>
        </div>
        <button className="text-sm text-muted-foreground" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-muted-foreground">
            Maximum price
            <Input value={price} onChange={(e) => /^\d*$/.test(e.target.value) && setPrice(e.target.value)} className="mt-1" />
          </label>
          <label className="text-xs text-muted-foreground">
            Quantity
            <Input value={quantity} onChange={(e) => /^\d*$/.test(e.target.value) && setQuantity(e.target.value)} className="mt-1" />
          </label>
          <label className="text-xs text-muted-foreground">
            Selected +level
            <Input value={level} disabled={!canLevel} onChange={(e) => /^\d*$/.test(e.target.value) && setLevel(e.target.value)} className="mt-1" />
          </label>
          <label className="text-xs text-muted-foreground">
            Priority override (0-100)
            <Input value={priority} onChange={(e) => /^\d*$/.test(e.target.value) && setPriority(e.target.value)} placeholder="routine priority" className="mt-1" />
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={useStandSlot} onChange={(e) => setUseStandSlot(e.target.checked)} className="size-4" />
          Use stand (advertise as a native stand order)
        </label>
        {canLevel && (
          <label className="mt-1.5 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={acceptHigherLevels} onChange={(e) => setAcceptHigherLevels(e.target.checked)} className="size-4" />
            Accept higher levels
          </label>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setPrice(String(Math.round(npcPrice * 1.1)))}>
            NPC sale +10% ({Math.round(npcPrice * 1.1).toLocaleString()}g)
          </Button>
          {Number(price) > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={() => setPrice(String(Math.round(Number(price) * 1.05)))}>
                Input +5%
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPrice(String(Math.round(Number(price) * 0.95)))}>
                Input -5%
              </Button>
            </>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
      <div className="border-t border-border p-3">
        <Button
          className="w-full"
          disabled={saving || !Number(price) || !Number(quantity)}
          onClick={async () => {
            setSaving(true)
            setError(null)
            const result = await api.saveBid(
              itemId,
              Number(price),
              Number(quantity),
              Math.max(0, Number(level) || 0),
              priority === '' ? null : Number(priority),
              useStandSlot,
              acceptHigherLevels,
            )
            setSaving(false)
            if (result.kind === 'failure') setError(result.message)
            else {
              await refreshNow()
              onClose()
            }
          }}
        >
          {saving ? 'Saving...' : 'Place WTB'}
        </Button>
        {existing && (
          <Button
            variant="destructive"
            className="mt-2 w-full"
            disabled={saving}
            onClick={async () => {
              setSaving(true)
              const result = await api.cancelBid(itemId)
              setSaving(false)
              if (result.kind === 'failure') setError(result.message)
              else {
                await refreshNow()
                onClose()
              }
            }}
          >
            Cancel WTB order
          </Button>
        )}
      </div>
    </div>
  )
}
