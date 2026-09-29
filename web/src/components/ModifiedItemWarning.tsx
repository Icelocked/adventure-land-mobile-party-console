import { useState } from 'react'
import { Button } from '@/components/ui/button'

/** npc-sale.ts's modified-item confirmation, ported from party-management-
 *  panels.tsx's rose warning checkbox - NPC-selling an upgraded/stat-
 *  scrolled/shiny item destroys that investment permanently, and the
 *  server refuses the sale outright without `acknowledged: true`. Shown
 *  in place of an instant one-tap sale whenever isModifiedItem(item) is
 *  true; unmodified items skip this and sell immediately, same as the
 *  dashboard. */
export function ModifiedItemWarning({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const [acknowledged, setAcknowledged] = useState(false)

  return (
    <div className="my-1.5 flex flex-col gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2.5 pl-4">
      <label className="flex items-start gap-2 text-xs text-destructive">
        <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5 size-4 shrink-0" />
        I understand this is modified gear and selling it will permanently destroy it.
      </label>
      <div className="flex gap-2">
        <Button size="sm" variant="destructive" disabled={!acknowledged} onClick={onConfirm}>
          Confirm sale
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
