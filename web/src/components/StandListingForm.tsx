import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Item } from '@/models'

export interface StandListingDraft {
  price: number
  quantity: number
  markAll: boolean
}

/** The stand listing form from party-management-panels.tsx's stand dialog,
 *  inline: price defaults to the existing listing or the item's value
 *  (`existing?.price || max(1, definition.g)`), quantity to the existing
 *  listing or the whole stack, and "Mark all for stand" lists every
 *  identical copy. Auto-stand rules have a price only. */
export function StandListingForm({
  item,
  itemValue,
  existing,
  auto = false,
  markAll: initialMarkAll = false,
  onSubmit,
  onCancel,
}: {
  item: Item
  itemValue: number | undefined
  existing?: { price?: number; quantity?: number }
  auto?: boolean
  markAll?: boolean
  onSubmit: (draft: StandListingDraft) => void
  onCancel?: () => void
}) {
  const defaultPrice = Math.max(1, Number(itemValue) || 1)
  const [price, setPrice] = useState(String(existing?.price || defaultPrice))
  const [quantity, setQuantity] = useState(String(existing?.quantity || item.q || 1))
  const [markAll, setMarkAll] = useState(initialMarkAll)
  const stack = Number(item.q || 1) > 1

  return (
    <div className="flex flex-col gap-2 py-2 pl-4">
      <div className="flex items-end gap-2">
        <label className="flex-1 text-xs text-muted-foreground">
          Price
          <Input aria-label="Stand price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ''))} className="mt-1" />
        </label>
        {!auto && stack && (
          <label className="w-24 text-xs text-muted-foreground">
            Quantity
            <Input aria-label="Stand quantity" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ''))} className="mt-1" />
          </label>
        )}
      </div>
      {!auto && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={markAll} onChange={(e) => setMarkAll(e.target.checked)} className="mt-0.5 size-4" />
          <span>
            Mark all for stand
            <span className="block text-xs text-muted-foreground">List every identical copy held by the merchant or stored in the bank at this price.</span>
          </span>
        </label>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSubmit({ price: Number(price), quantity: Number(quantity), markAll })}>
          {auto ? 'Set' : 'List'}
        </Button>
        {onCancel && (
          <Button size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}
