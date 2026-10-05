import type { Sprite } from './sprite'
import type { ItemSuggestedPrice } from '@/lib/suggestedItemValue'

/** Per-item reference data behind the item details view. `definition` is
 *  the raw game record (mixed value types), `properties` the server's
 *  computed current-level stats, and `scaling` the per-level delta used to
 *  preview other levels (lib/itemFormulas.ts). */
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

/** Where an item fits in the game world; every part is optional. */
export interface ItemWorldInfo {
  recipe?: ItemRecipe | null
  set?: ItemSetInfo | null
  drops?: ItemDropSource[]
  usedIn?: ItemCraftUse[]
  // Precomputed per-source prices.
  suggestedPrices?: ItemSuggestedPrice[]
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

/** An NPC exchange/box entry: either a fixed exchange (`reward` set: pay
 *  [required] of [id] for the reward) or a random table (`results` rolled
 *  by `chance`). */
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
