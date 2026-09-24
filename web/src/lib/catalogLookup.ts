import { useMemo } from 'react'
import type { CatalogItem, MerchantCatalog } from '@/models'

/** Builds an id->catalog-entry lookup once per catalog update instead of
 *  a linear scan per icon (the catalog can hold thousands of items) - an
 *  item instance's `.name` field is the game's internal identifier and
 *  matches a catalog entry's `.id`, NOT its `.name` - `.name` on the
 *  catalog entry is the human-readable display name ("Ring of Strength"
 *  vs. the instance's internal "strearring"). Ported from ui/itemicon/
 *  SpriteLookup.kt. */
export function useCatalogLookup(catalog: MerchantCatalog | null | undefined): (id: string) => CatalogItem | undefined {
  const byId = useMemo(() => {
    const map = new Map<string, CatalogItem>()
    for (const item of catalog?.allItems ?? []) map.set(item.id, item)
    return map
  }, [catalog])
  return (id: string) => byId.get(id)
}

/** Human-readable display name for an item instance's internal
 *  identifier, falling back to the raw identifier itself when it isn't
 *  (yet) present in the catalog. */
export function displayName(internalName: string, catalogFor: (id: string) => CatalogItem | undefined): string {
  return catalogFor(internalName)?.name ?? internalName
}
