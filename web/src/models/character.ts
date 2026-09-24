import type { Condition, EquippedEntry, InventoryEntry } from './item'

/** Mirrors model/Character.kt's CharacterVitals - a mirror of
 *  party-console's `Char` type (dashboard/features/party/char.tsx).
 *  ctype/level default to blank/0 because they're NOT part of the live
 *  vitals stream at all (live-protocol.ts's LiveRecord.vitals is an
 *  untyped bag of whatever changed) - the repository overwrites these
 *  from the roster fetch (models/roster.ts) once it completes. */
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
}

/** The character's carried items + what's equipped - arrives/updates
 *  independently from vitals (see live-protocol.ts), assembled together
 *  in the data layer, not sent as one message. */
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
