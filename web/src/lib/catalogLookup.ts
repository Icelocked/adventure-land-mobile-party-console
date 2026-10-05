import { useMemo } from 'react'
import type { CatalogItem, MerchantCatalog } from '@/models'

/** id -> catalog entry, built once per catalog update rather than scanning
 *  thousands of items per icon. An item's `.name` matches a catalog
 *  entry's `.id`; the entry's `.name` is the display name. */
export function useCatalogLookup(catalog: MerchantCatalog | null | undefined): (id: string) => CatalogItem | undefined {
  const byId = useMemo(() => {
    const map = new Map<string, CatalogItem>()
    for (const item of catalog?.allItems ?? []) map.set(item.id, item)
    return map
  }, [catalog])
  return (id: string) => byId.get(id)
}

/** Display name for an item id, or the id itself if not in the catalog. */
export function displayName(internalName: string, catalogFor: (id: string) => CatalogItem | undefined): string {
  return catalogFor(internalName)?.name ?? internalName
}
