import type { Item, ItemMeta } from '@/models'

export const EQUIPMENT_TYPES = ['weapon', 'shield', 'source', 'quiver', 'misc_offhand', 'helmet', 'chest', 'pants', 'gloves', 'shoes', 'cape', 'ring', 'earring', 'amulet', 'belt', 'orb', 'elixir']

export type ComparisonSource = { slot: number; item: Item; meta?: ItemMeta | null }
export type CatalogComparisonEntry = { entry: ComparisonSource; level: number; stat: string }
export const comparisonEntry = (entry: ComparisonSource): CatalogComparisonEntry => ({ entry, level: Number(entry.item.level) || 0, stat: entry.item.stat_type || '' })
