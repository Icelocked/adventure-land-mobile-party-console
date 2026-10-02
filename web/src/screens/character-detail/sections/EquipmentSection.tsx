import { SpriteIcon } from '@/components/SpriteIcon'
import { displayName } from '@/lib/catalogLookup'
import { markBadgeFor } from '@/lib/markBadge'
import { SectionCard } from '../SectionCard'
import type { CatalogItem, EquippedEntry, UpgradeMark } from '@/models'

/** Equipment grid - real sprite icons per slot (cross-referenced from the
 *  merchant catalog by item id), ported from ui/characterdetail/
 *  sections/EquipmentSection.kt. Also surfaces a pending one-time upgrade
 *  mark, the equipped-item equivalent of InventorySection's mark badges. */
export function EquipmentSection({
  slots,
  upgradeMarks = [],
  catalogFor,
  onSlotTap,
}: {
  slots: Record<string, EquippedEntry | null>
  upgradeMarks?: UpgradeMark[]
  catalogFor: (id: string) => CatalogItem | undefined
  onSlotTap: (slotName: string, entry: EquippedEntry | null) => void
}) {
  // equipment.tsx: a merchant's trade1..N slots are its stand, not gear -
  // unequipping one would close the stand and pull the listing.
  const entries = Object.entries(slots).filter(([slot]) => !slot.startsWith('trade'))
  if (entries.length === 0) return null

  return (
    <SectionCard title="Equipment">
      <div className="grid grid-cols-2 gap-2">
        {entries.map(([slotName, entry]) => {
          const badge = markBadgeFor(slotName, entry?.item, [], [], [], upgradeMarks, [])
          return (
            <button
              key={slotName}
              onClick={() => onSlotTap(slotName, entry)}
              className="flex items-center gap-2 rounded-md border border-border bg-background p-2 text-left transition hover:border-primary/40"
            >
              <SpriteIcon sprite={entry ? catalogFor(entry.item.name)?.sprite : null} size={40} />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">{slotName}</div>
                {entry ? (
                  <>
                    <div className="truncate text-sm">{displayName(entry.item.name, catalogFor)}</div>
                    {entry.item.level != null && <div className="text-xs text-muted-foreground">+{entry.item.level}</div>}
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">empty</div>
                )}
                {badge && (
                  <div className="truncate text-xs" style={{ color: badge.color }}>
                    {badge.label}
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </SectionCard>
  )
}
