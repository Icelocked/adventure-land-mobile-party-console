type Entry = { item?: { name?: string; level?: number; q?: number } | null } | null | undefined
type Inventory = { name: string; items?: Entry[] }

/** Owned quantity per item (or item+level when [byLevel]) across
 *  characters, the bank and bankbois. Persisted storage-worker snapshots
 *  supersede their stale online inventories. */
export function inventoryCounts(
  characters: Inventory[] = [],
  bank: { packs?: Record<string, Entry[] | undefined> } | null | undefined = null,
  bankbois: Inventory[] = [],
  byLevel = false,
): Record<string, number> {
  const totals: Record<string, number> = {}
  const storageNames = new Set(bankbois.map((entry) => entry.name))
  const add = (entry: Entry) => {
    if (!entry?.item) return
    const item = entry.item
    const key = byLevel ? `${item.name}@${item.level || 0}` : String(item.name)
    totals[key] = (totals[key] || 0) + Math.max(1, Number(item.q) || 1)
  }
  characters.filter((entry) => entry && !storageNames.has(entry.name)).forEach((entry) => (entry.items || []).forEach(add))
  Object.values(bank?.packs || {}).forEach((pack) => (pack || []).forEach(add))
  bankbois.forEach((entry) => (entry.items || []).forEach(add))
  return totals
}
