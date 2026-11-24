import { previewProperties } from '@/lib/itemFormulas'
import type { Item, ItemMeta } from '@/models'

/** Console v1.5.0 item-card.tsx "Item information": the JSON of the item at the card's level, its
 *  G.items definition and the card's properties. The properties are the item details card's
 *  `{...meta.properties, ...previewProperties}` at the item's own level. */
export function itemJson(item: Item, meta: ItemMeta | null | undefined): string {
  const level = item.level || 0
  const properties = { ...meta?.properties, ...previewProperties(meta ?? undefined, level, level, item.stat_type, item.p) }
  return JSON.stringify({ item: { ...item, level }, definition: meta?.definition || {}, properties }, null, 2)
}
