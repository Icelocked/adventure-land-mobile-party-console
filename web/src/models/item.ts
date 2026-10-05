import type { ItemMeta } from './itemDetail'
import type { Sprite } from './sprite'

/** An item as the server sends it. Fields with several possible wire
 *  shapes (string|boolean|number) are `unknown`; callers narrow them. */
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

/** Selling to an NPC destroys an upgrade/stat-scroll/shiny investment,
 *  so the server refuses these without `acknowledged: true`. */
export function isModifiedItem(item: Item): boolean {
  return Number(item.level ?? 0) > 0 || !!item.stat_type || !!item.p
}

/** An upgrade/compound in progress on this slot. */
export interface ItemOperation {
  type: string
  fromLevel: number
  toLevel: number
  chance?: number | null
  sprite?: Sprite | null
}

export interface InventoryEntry {
  slot: number
  item: Item
  // Live item meta, when the server attaches it.
  meta?: ItemMeta | null
  operation?: ItemOperation | null
}

export interface EquippedEntry {
  item: Item
  meta?: ItemMeta | null
}

/** One live status effect (buff/debuff) on a character. */
export interface Condition {
  id: string
  name: string
  explanation?: string
  remainingMs?: number
  stacks?: unknown
  source?: unknown
  // The status sprite, its G definition and live fields.
  sprite?: Sprite | null
  definition?: Record<string, unknown>
  live?: Record<string, unknown>
}
