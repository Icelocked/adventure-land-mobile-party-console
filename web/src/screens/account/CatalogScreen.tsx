import { useState } from 'react'
import { useDynamicState, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { SpriteIcon } from '@/components/SpriteIcon'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { ItemDetailBrowser } from '@/screens/itemdetail/ItemDetailBrowser'
import { AccountScreenScaffold, EmptyState } from './AccountScreenScaffold'
import type { CatalogItem } from '@/models'

/** Equipment/item catalog browse - ported from ui/account/
 *  CatalogScreen.kt. Tapping a row opens the same full item-details
 *  view inventory/equipment items use, read-only (no action list, since
 *  there's no live instance/slot to act on here). */
export function CatalogScreen() {
  const dynamicState = useDynamicState()
  const refreshNow = useRefreshDynamicStateNow()
  const [query, setQuery] = useState('')
  const [inspecting, setInspecting] = useState<CatalogItem | null>(null)

  const items = (dynamicState.merchantCatalog?.allItems ?? []).filter((item) => !query.trim() || item.name.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <AccountScreenScaffold title="Catalog" onRefresh={() => void refreshNow()}>
      <div className="p-3">
        <Input placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {items.length === 0 ? (
        <EmptyState message="No catalog data yet." />
      ) : (
        <div className="flex flex-col gap-1.5 px-3">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => setInspecting(item)}
              className="flex items-center gap-2 rounded-md border border-border bg-card p-2.5 text-left hover:border-primary/40"
            >
              <SpriteIcon sprite={item.sprite} size={32} />
              <span className="text-sm">{item.name}</span>
              {item.maxLevel != null && item.maxLevel > 0 && <span className="text-xs text-muted-foreground">(max +{item.maxLevel})</span>}
            </button>
          ))}
        </div>
      )}

      {inspecting && (
        <Sheet open onOpenChange={(open) => !open && setInspecting(null)}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-4">
            <ItemDetailBrowser rootItemId={inspecting.id} rootLevel={0} catalog={dynamicState.merchantCatalog} monsters={dynamicState.bestiaryCatalog} className="pt-2" />
          </SheetContent>
        </Sheet>
      )}
    </AccountScreenScaffold>
  )
}
