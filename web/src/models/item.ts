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

export interface InventoryEntry {
  slot: number
  item: Item
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
