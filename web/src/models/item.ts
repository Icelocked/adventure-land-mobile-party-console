/** Mirrors the Android app's model/Item.kt, itself a mirror of
 *  party-console's `Item` type (dashboard/features/party/item.tsx) -
 *  field names match the server's JSON exactly. `unknown` is used in
 *  place of Kotlin's JsonElement for fields with more than one possible
 *  wire shape (string|boolean|number); callers narrow as needed. */
export interface Item {
  l?: unknown // string | boolean - locked, or a lock reason
  gift?: boolean
  expires?: unknown // string | number
  name: string
  level?: number
  q?: number // quantity, for stackable items
  p?: string // special/"shiny" variant, e.g. "glitched", "lucky"
  stat_type?: string
  price?: number
  rid?: string
  b?: boolean
  m?: unknown // boolean | string | number
}

/** npc-sale.ts's `modified()`, ported verbatim - an NPC sale destroys an
 *  upgrade/stat-scroll/shiny-variant investment permanently, so the
 *  server refuses to sell one of these without `acknowledged: true`. */
export function isModifiedItem(item: Item): boolean {
  return Number(item.level ?? 0) > 0 || !!item.stat_type || !!item.p
}

export interface InventoryEntry {
  slot: number
  item: Item
  // An upgrade/compound in progress on this slot (item-operation-overlay.tsx).
  operation?: unknown
}

export interface EquippedEntry {
  item: Item
}

/** Mirrors `Condition` (dashboard/features/party/condition.tsx) - one live
 *  status effect (buff/debuff) on a character. */
export interface Condition {
  id: string
  name: string
  explanation?: string
  remainingMs?: number
  stacks?: unknown
  source?: unknown
}
