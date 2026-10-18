import type { Item, ItemMeta } from '@/models'
import { itemCardStat, titleCase } from '@/lib/itemCardLines'
import { STAT_COLORS } from '@/lib/statColors'

export const EQUIPMENT_TYPES = ['weapon', 'shield', 'source', 'quiver', 'misc_offhand', 'helmet', 'chest', 'pants', 'gloves', 'shoes', 'cape', 'ring', 'earring', 'amulet', 'belt', 'orb', 'elixir']

export type ComparisonSource = { slot: number; item: Item; meta?: ItemMeta | null }
export type CatalogComparisonEntry = { entry: ComparisonSource; level: number; stat: string }
export const comparisonEntry = (entry: ComparisonSource): CatalogComparisonEntry => ({ entry, level: Number(entry.item.level) || 0, stat: entry.item.stat_type || '' })

// The equipment comparison card's labels (GearComparisonSheet.tsx rows), keyed by item
// property instead of the projected character stat.
const COMPARISON_LABELS: Record<string, string> = {
  hp: 'HP', mp: 'MP', attack: 'Attack', frequency: 'Attack speed', range: 'Range', speed: 'Run speed', armor: 'Armor', resistance: 'Resistance',
  str: 'STR', int: 'INT', dex: 'DEX', vit: 'VIT', for: 'Fortitude', luck: 'Luck', gold: 'Gold', xp: 'XP', evasion: 'Evasion', reflection: 'Reflection',
  lifesteal: 'Lifesteal', manasteal: 'Manasteal', apiercing: 'Armor piercing', rpiercing: 'Resistance piercing', crit: 'Critical hit',
  dreturn: 'Damage return', mp_cost: 'MP cost reduction', output: 'Output',
}
// Piercing and MP costs share their stat's palette color, as on the equipment comparison.
const PALETTE_KEYS: Record<string, keyof typeof STAT_COLORS> = { apiercing: 'armor', rpiercing: 'resistance', mp_cost: 'mp', mp_reduction: 'mp' }

/** A catalog comparison line's label and color: the equipment comparison's name, then the
 *  item card's, then the key in title case; the shared palette color, then the item card's. */
export function comparisonStat(key: string): { label: string; color: string } {
  const card = itemCardStat(key)
  const paletteKey = PALETTE_KEYS[key] ?? key
  const color = paletteKey in STAT_COLORS ? STAT_COLORS[paletteKey as keyof typeof STAT_COLORS] : (card?.color ?? '#E4E4E4')
  return { label: COMPARISON_LABELS[key] ?? card?.label ?? titleCase(key), color }
}
