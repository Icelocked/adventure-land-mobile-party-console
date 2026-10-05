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
