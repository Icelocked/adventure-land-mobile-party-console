import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { npcSaleValue } from '@/lib/itemFormulas'
import type { Item, ItemMeta } from '@/models'

/** party-management-panels.tsx's "Sell to NPC?" dialog + use-party-
 *  console.tsx confirmNpcSale's checks, inline: the quantity defaults to
 *  the whole stack (or every matching copy for "sell all", where it's
 *  fixed), "You will receive" shows the proceeds, modified gear needs the
 *  acknowledgement, and nothing is sent until Sell is pressed. */
export function NpcSaleSheet({
  item,
  meta,
  location,
  collects = false,
  available,
  all = false,
  onConfirm,
  onCancel,
}: {
  item: Item
  meta: ItemMeta | undefined
  /** The dashboard's location line, e.g. "Bank · items0 · slot 3". */
  location: string
  /** The merchant collects it from another character first. */
  collects?: boolean
  available: number
  all?: boolean
  onConfirm: (quantity: number, acknowledged: boolean) => Promise<string | null>
  onCancel: () => void
}) {
  const [quantity, setQuantity] = useState(String(available))
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const each = npcSaleValue(item.level ?? 0, !!item.gift, item.expires, meta)
  const modified = Number(item.level || 0) > 0 || !!item.stat_type || !!item.p

  const confirm = async () => {
    setError(null)
    const n = Number(quantity)
    if (!Number.isSafeInteger(n) || n < 1 || n > available) return setError(`Enter a quantity from 1 to ${available}`)
    if (modified && !acknowledged) return setError('Confirm the modified-item warning')
    setBusy(true)
    const failure = await onConfirm(n, acknowledged)
    setBusy(false)
    if (failure) setError(failure)
  }

  return (
    <div role="group" aria-label="Sell to NPC" className="my-1.5 flex flex-col gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2.5 pl-4">
      <p className="text-sm font-medium">{all ? 'Sell all matching bank items to NPC?' : 'Sell to NPC?'}</p>
      <p className="text-xs text-muted-foreground">
        {collects
          ? 'The merchant will collect this item and sell it to an NPC. Once sold, the sale cannot be undone.'
          : 'The merchant will sell this item to an NPC. Once sold, the sale cannot be undone.'}
      </p>
      <div className="rounded border border-destructive/40 p-2">
        <p className="text-sm font-semibold">{String(meta?.definition?.name || item.name)}</p>
        <p className="font-mono text-xs text-muted-foreground">{location}</p>
      </div>
      <label className="text-xs text-muted-foreground">
        Quantity
        <Input aria-label="Sale quantity" inputMode="numeric" value={quantity} disabled={busy || all} onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ''))} className="mt-1" />
      </label>
      <p className="text-sm">
        You will receive: {(each * Math.max(0, Number(quantity) || 0)).toLocaleString()}g <span className="text-xs text-muted-foreground">({each.toLocaleString()}g each)</span>
      </p>
      {modified && (
        <label className="flex items-start gap-2 text-xs text-destructive">
          <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5 size-4 shrink-0" />
          I understand this is modified gear and selling it will permanently destroy it.
        </label>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" variant="destructive" disabled={busy} onClick={() => void confirm()}>
          {busy ? 'Queueing…' : all ? 'Sell all to NPC' : 'Sell to NPC'}
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
