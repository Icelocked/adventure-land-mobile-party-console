import type { Bankboi, BankSnapshot, InventoryEntry, Item } from '@/models'

/** Every field the marked item carries (except quantity) matches. */
export const same = (current: Item, marked: Item): boolean =>
  Object.keys(marked)
    .filter((key) => key !== 'q')
    .every((key) => JSON.stringify(current[key as keyof Item]) === JSON.stringify(marked[key as keyof Item]))

/** Every unlocked copy of the item across bank packs and bankboi
 *  inventories, for "Sell all to NPC". */
export function bankSaleCopies(bank: BankSnapshot | null | undefined, workers: Bankboi[], selected: InventoryEntry) {
  const packs = [
    ...Object.entries(bank?.packs || {}),
    ...workers.map((worker) => [`bankboi:${worker.name}`, worker.items] as const),
  ]
  return packs.flatMap(([pack, entries]) =>
    (entries || []).flatMap((entry) =>
      entry && !entry.item.l && same(entry.item, selected.item) && same(selected.item, entry.item) ? [{ pack, entry }] : [],
    ),
  )
}
