import type { Condition, EquippedEntry, InventoryEntry } from './item'

/** A character's live vitals. ctype/level are not in the live stream;
 *  they default to blank/0 and are filled in from the roster. */
export interface CharacterVitals {
  name: string
  ctype: string
  level: number
  hp: number
  max_hp: number
  mp: number
  max_mp: number
  gold: number
  map: string
  x: number
  y: number
  rip: boolean
  xp?: number
  max_xp?: number
  target?: string
  server?: string
  ping?: number
  // Code call cost, 0-200 (connected-character-card.tsx CC meter).
  cc?: number
  primaryStat?: string
  banking?: boolean
  bankQueued?: boolean
  stocking?: boolean
  upgrading?: boolean
  farmingMode?: string
  conditions?: Condition[]
  inventorySize?: number
  // Whether the merchant's stand is open.
  standOpen?: boolean
  // The live local lucky-slot evidence stream, when the record carries it.
  luckySlotTracking?: unknown
  // Console 1.4: bag slots held by a gear set or by gear swapped out for
  // one; automatic rules skip them (inventory/swap-reservations.ts).
  reservedInventory?: { slot: number; item: { name?: string; level?: number } | null }[]
}

/** Carried items and equipment. Updates independently of vitals. */
export interface CharacterInventory {
  items: (InventoryEntry | null)[]
  slots: Record<string, EquippedEntry | null>
}

/** One character's full known state as the app holds it. */
export interface CharacterState {
  vitals: CharacterVitals | null
  inventory: CharacterInventory | null
}

export const isOnline = (state: CharacterState): boolean => state.vitals != null

/** Console 1.5: an account character that is not loaded, from config
 *  characterSnapshots (its last observation) or GET /characters/:name/inspection
 *  (its saved game profile, with `inspection`). Stats fields match the live status. */
export interface OfflineCharacter extends CharacterVitals {
  items: (InventoryEntry | null)[]
  slots: Record<string, EquippedEntry | null>
  skin?: string
  characterSprite?: unknown
  characterDollHtml?: string
  updatedAt?: number
  inspection?: { source: string; calculated: boolean; synchronizedAt: string | null; note: string }
  [field: string]: unknown
}
