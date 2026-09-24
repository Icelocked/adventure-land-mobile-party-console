import { SpriteIcon } from '@/components/SpriteIcon'
import { markBadgeFor } from '@/lib/markBadge'
import { SectionCard } from '../SectionCard'
import type { BankMark, CatalogItem, InventoryEntry } from '@/models'

/** Inventory grid - real sprite icons (cross-referenced from the
 *  merchant catalog by item id) with bank/merchant mark badges overlaid,
 *  ported from ui/characterdetail/sections/InventorySection.kt. */
export function InventorySection({
  items,
  merchantMarks = [],
  bankMarks = [],
  catalogFor,
  onItemTap,
}: {
  items: (InventoryEntry | null)[]
  merchantMarks?: BankMark[]
  bankMarks?: BankMark[]
  catalogFor: (id: string) => CatalogItem | undefined
  onItemTap: (index: number, entry: InventoryEntry | null) => void
}) {
  if (items.length === 0) return null

  return (
    <SectionCard title="Inventory">
      <div className="grid grid-cols-5 gap-1.5">
        {items.map((entry, index) => {
          const badge = markBadgeFor(index, merchantMarks, bankMarks)
          return (
            <button
              key={index}
              onClick={() => onItemTap(index, entry)}
              className="relative overflow-hidden rounded-md border border-border bg-background transition hover:border-primary/40"
              style={{ width: 60, height: 60 }}
            >
              <SpriteIcon sprite={entry ? catalogFor(entry.item.name)?.sprite : null} size={60} />
              {entry?.item.level != null && <span className="absolute left-1 top-0.5 text-[10px]">+{entry.item.level}</span>}
              {entry?.item.q != null && entry.item.q > 1 && <span className="absolute right-1 top-0.5 text-[10px]">x{entry.item.q}</span>}
              {badge && (
                <span
                  className="absolute inset-x-0 bottom-0 truncate px-0.5 text-center text-[8px] leading-tight text-black"
                  style={{ backgroundColor: `${badge.color}D9` }}
                >
                  {badge.label}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </SectionCard>
  )
}
