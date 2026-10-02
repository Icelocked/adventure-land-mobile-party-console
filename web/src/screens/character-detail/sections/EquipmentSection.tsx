import { SpriteIcon } from '@/components/SpriteIcon'
import { MluckClover } from '@/components/ItemTileParts'
import { equipmentSlots, itemActionBanner, statBadgeClass } from '@/lib/itemActionBanner'
import { SectionCard } from '../SectionCard'
import { sameMarkedItem } from '@/models'
import type { CatalogItem, EquippedEntry, StatScrollMark, UpgradeMark } from '@/models'

/** equipment.tsx + equip-slot.tsx: the 15 fixed slots in the dashboard's
 *  order (then any other non-stand slot), "Empty" tiles, the slot label,
 *  +level / stat / mluck badges, set progress current/total, and the
 *  upgrade / stat-scroll banner. A merchant's trade1..N slots are its
 *  stand, not gear. */
export function EquipmentSection({
  slots,
  upgradeMarks = [],
  statScrollMarks = [],
  isMerchant,
  catalogFor,
  onSlotTap,
}: {
  slots: Record<string, EquippedEntry | null>
  upgradeMarks?: UpgradeMark[]
  statScrollMarks?: StatScrollMark[]
  isMerchant: boolean
  catalogFor: (id: string) => CatalogItem | undefined
  onSlotTap: (slotName: string, entry: EquippedEntry) => void
}) {
  const known = new Set<string>(equipmentSlots)
  const entries = [
    ...equipmentSlots.map((slot) => [slot, slots[slot] || null] as const),
    ...Object.entries(slots).filter(([slot]) => !known.has(slot) && !slot.startsWith('trade')),
  ]
  const metaFor = (entry: EquippedEntry) => entry.meta ?? catalogFor(entry.item.name)?.meta ?? undefined
  const equippedSetCounts = Object.entries(slots).reduce<Record<string, number>>((counts, [slot, entry]) => {
    if (slot.startsWith('trade') || !entry) return counts
    const setId = metaFor(entry)?.world?.set?.id
    if (setId) counts[setId] = (counts[setId] || 0) + 1
    return counts
  }, {})

  return (
    <SectionCard title="Equipment">
      <div className="grid grid-cols-2 gap-2">
        {entries.map(([slot, equipped]) => {
          const meta = equipped ? metaFor(equipped) : undefined
          const mark = equipped ? upgradeMarks.find((entry) => entry.equipped && entry.slot === slot && sameMarkedItem(entry.item, equipped.item)) : undefined
          const statScrollMark = equipped ? statScrollMarks.find((entry) => entry.slot === slot && sameMarkedItem(entry.item, equipped.item)) : undefined
          const set = meta?.world?.set
          const setProgress = set ? { current: equippedSetCounts[set.id] || 0, total: set.items.reduce((sum, item) => sum + (item.quantity || 1), 0) } : undefined
          const banner = itemActionBanner(
            [
              !!statScrollMark && { action: 'stat', label: 'Stat scroll' },
              !!mark && { action: 'upgrade', automatic: !!mark.auto, label: `${mark.auto ? 'Auto' : '+' + (mark.item.level || 0)} → +${Number(mark.item.level || 0) + Number(mark.tiers || 1)}` },
            ],
            isMerchant,
          )
          const sprite = meta?.sprite ?? (equipped ? catalogFor(equipped.item.name)?.sprite : null)
          return (
            <button
              key={slot}
              type="button"
              disabled={!equipped}
              aria-label={`${slot.replace(/(\d+)$/, ' $1')}: ${equipped ? String(meta?.definition.name || catalogFor(equipped.item.name)?.name || equipped.item.name) : 'Empty'}`}
              onClick={() => equipped && onSlotTap(slot, equipped)}
              className={`relative flex min-w-0 items-center gap-2 rounded-md border bg-background p-1.5 text-left transition hover:border-primary/40 disabled:cursor-default disabled:border-dashed disabled:opacity-55 ${banner?.border || 'border-border'}`}
            >
              <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded border border-border bg-black">
                {sprite && <SpriteIcon sprite={sprite} size={40} />}
                {equipped && (
                  <span className="absolute bottom-0.5 right-0.5 z-10 min-w-4 rounded bg-black/85 px-1 text-center font-mono text-[10px] leading-4 text-emerald-300">+{equipped.item.level || 0}</span>
                )}
                {equipped?.item.stat_type ? (
                  <span className={`absolute left-0.5 top-0.5 z-10 rounded px-1 font-mono text-[8px] ring-1 ${statBadgeClass(equipped.item.stat_type)}`}>{equipped.item.stat_type}</span>
                ) : null}
                {banner && <span data-item-action-banner className={`absolute inset-x-0 top-0 z-10 text-center text-[8px] leading-tight ${banner.colors}`}>{banner.label}</span>}
                <MluckClover item={equipped?.item} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs capitalize text-muted-foreground">{slot.replace(/(\d+)$/, ' $1')}</span>
                <span className="block truncate text-xs">
                  {equipped ? `${String(meta?.definition.name || catalogFor(equipped.item.name)?.name || equipped.item.name)}${equipped.item.level ? ` +${equipped.item.level}` : ''}` : 'Empty'}
                </span>
              </span>
              {setProgress ? (
                <span className="absolute right-1.5 top-1.5 z-10 rounded bg-amber-950/95 px-1 font-mono text-[8px] font-semibold leading-4 text-amber-200 ring-1 ring-amber-500/70">
                  {setProgress.current}/{setProgress.total}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </SectionCard>
  )
}
