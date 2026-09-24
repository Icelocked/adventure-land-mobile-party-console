import { SpriteIcon } from '@/components/SpriteIcon'
import { displayName } from '@/lib/catalogLookup'
import { SectionCard } from '../SectionCard'
import type { CatalogItem, EquippedEntry } from '@/models'

/** Equipment grid - real sprite icons per slot (cross-referenced from the
 *  merchant catalog by item id), ported from ui/characterdetail/
 *  sections/EquipmentSection.kt. */
export function EquipmentSection({
  slots,
  catalogFor,
  onSlotTap,
}: {
  slots: Record<string, EquippedEntry | null>
  catalogFor: (id: string) => CatalogItem | undefined
  onSlotTap: (slotName: string, entry: EquippedEntry | null) => void
}) {
  const entries = Object.entries(slots)
  if (entries.length === 0) return null

  return (
    <SectionCard title="Equipment">
      <div className="grid grid-cols-2 gap-2">
        {entries.map(([slotName, entry]) => (
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
            </div>
          </button>
        ))}
      </div>
    </SectionCard>
  )
}
