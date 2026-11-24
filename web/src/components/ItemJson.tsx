import { useState } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { TapRow } from '@/screens/itempanel/ItemActionPanel'
import { itemJson } from '@/lib/itemJson'
import type { Item, ItemMeta } from '@/models'

/** The "Item JSON" option. The dashboard opens item-card.tsx's "Item information" dialog with I
 *  or the card's [i] line; the phone has no I key, so the item's options list carries it. */
export function ItemJsonRow({ item, meta }: { item: Item; meta: ItemMeta | null | undefined }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <TapRow label="Item JSON" onClick={() => setOpen(true)} />
      {open && (
        <Sheet open onOpenChange={(value) => !value && setOpen(false)}>
          <SheetContent side="bottom" aria-label="Item information" className="max-h-[85vh] overflow-y-auto p-4">
            <SheetTitle>Item information</SheetTitle>
            <SheetDescription>JSON for {item.name}</SheetDescription>
            <pre role="region" aria-label="Item JSON" className="mt-2 overflow-x-auto rounded border border-border bg-black p-3 text-xs">
              {itemJson(item, meta)}
            </pre>
            <Button variant="outline" className="mt-2 justify-self-end" onClick={() => setOpen(false)}>
              Close information
            </Button>
          </SheetContent>
        </Sheet>
      )}
    </>
  )
}
