import type { Sprite } from './sprite'

/** Mirrors model/ItemDetail.kt - the full per-item reference data behind
 *  party-console's "left-click an item" details dialog (item-details.tsx/
 *  item-meta.tsx). `definition` is the raw game data record (armor/
 *  attack/tier/etc., heterogeneous value types), `properties` is the
 *  server's own already-computed current-level stat block, `scaling` is
 *  the per-level stat delta used to preview other levels (see
 *  lib/itemFormulas.ts). Confirmed against a live GET /party-api/state
 *  capture - field names and nesting match exactly. */
export interface ItemMeta {
  definition: Record<string, unknown>
  upgradeable?: boolean
  compoundable?: boolean
  buyable?: boolean
  properties?: Record<string, unknown>
  scaling?: Record<string, unknown>
  maxLevel?: number
  usage?: ItemUsage
  world?: ItemWorldInfo
  sprite?: Sprite | null
}

export interface ItemUsage {
  classes: UsageClass[]
  hands: number[]
}

export interface UsageClass {
  id: string
  name: string
  hands?: number | null
}

/** The "where does this fit in the game world" section of an item - each
 *  independently optional (a plain stat scroll has none of these; a
 *  craftable armor piece might have recipe + drops + usedIn all at once). */
export interface ItemWorldInfo {
  recipe?: ItemRecipe | null
  set?: ItemSetInfo | null
  drops?: ItemDropSource[]
  usedIn?: ItemCraftUse[]
}

export interface ItemRecipe {
  cost: number
  quest?: string | null
  materials: CraftMaterial[]
}

export interface CraftMaterial {
  id: string
  name: string
  quantity: number
  level: number
  sprite?: Sprite | null
  drops?: ItemDropSource[]
}

export interface ItemDropSource {
  monsterId: string
  monsterName: string
  rate: number
  quantity: number
  originRate?: number | null
  sourceType?: string
  acquisitionPath?: string[]
  sprite?: Sprite | null
}

export interface ItemSetInfo {
  id: string
  name: string
  explanation?: string
  items: SetItem[]
  bonuses: SetBonus[]
}

export interface SetItem {
  id: string
  name: string
  quantity: number
  sprite?: Sprite | null
}

export interface SetBonus {
  pieces: number
  stats: Record<string, unknown>
}

export interface ItemCraftUse {
  id: string
  name: string
  quantity: number
  level: number
  cost: number
  sprite?: Sprite | null
}

/** A merchant NPC exchange/box entry (merchant-exchange-item.tsx) - either
 *  a straight exchange (`reward`/`rewardQuantity` set: pay [required] of
 *  [id] for a fixed reward) or a randomized table (`results`: opening this
 *  item rolls one of several outcomes by `chance`). */
export interface MerchantExchangeItem {
  key: string
  id: string
  level: number
  name: string
  cost: number
  required: number
  npc?: string
  sprite?: Sprite | null
  results: MerchantExchangeResult[]
  reward?: string | null
  rewardQuantity?: number | null
  currencyName?: string
  currencySprite?: Sprite | null
}

export interface MerchantExchangeResult {
  kind: string
  id: string
  name: string
  quantity: number
  chance: number
  sprite?: Sprite | null
}
