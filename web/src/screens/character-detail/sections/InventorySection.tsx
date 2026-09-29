import { SpriteIcon } from '@/components/SpriteIcon'
import { markBadgeFor } from '@/lib/markBadge'
import { SectionCard } from '../SectionCard'
import type { BankMark, CatalogItem, CompoundGroup, DeconstructionMark, InventoryEntry, Item, NpcSaleMark, StatScrollMark, UpgradeMark } from '@/models'

/** Inventory grid - real sprite icons (cross-referenced from the
 *  merchant catalog by item id) with bank/merchant/upgrade/compound/
 *  stat-scroll/NPC-sale/deconstruction/delivery mark badges overlaid,
 *  ported from ui/characterdetail/sections/InventorySection.kt. */
export function InventorySection({
  items,
  merchantMarks = [],
  bankMarks = [],
  statScrollMarks = [],
  upgradeMarks = [],
  compoundGroups = [],
  npcSaleMarks = [],
  deconstructionMarks = [],
  deliveries = [],
  catalogFor,
  onItemTap,
}: {
  items: (InventoryEntry | null)[]
  merchantMarks?: BankMark[]
  bankMarks?: BankMark[]
  statScrollMarks?: StatScrollMark[]
  upgradeMarks?: UpgradeMark[]
  compoundGroups?: CompoundGroup[]
  npcSaleMarks?: NpcSaleMark[]
  deconstructionMarks?: DeconstructionMark[]
  deliveries?: { target: string; slot: number; item: Item }[]
  catalogFor: (id: string) => CatalogItem | undefined
  onItemTap: (index: number, entry: InventoryEntry | null) => void
}) {
  if (items.length === 0) return null

  return (
    <SectionCard title="Inventory">
      <div className="grid grid-cols-5 gap-1.5">
        {items.map((entry, index) => {
          const badge = markBadgeFor(index, entry?.item, merchantMarks, bankMarks, statScrollMarks, upgradeMarks, compoundGroups, npcSaleMarks, deconstructionMarks, deliveries)
          return (
            <button
              key={index}
              data-testid={`inventory-slot-${index}`}
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
