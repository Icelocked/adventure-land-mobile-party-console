import { useMemo, useState } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Slider } from '@/components/ui/slider'
import { SpriteIcon } from '@/components/SpriteIcon'
import { displayName } from '@/lib/catalogLookup'
import { comparisonSlotsFor, itemMaximumLevel, previewProperties, formatStatValue, ITEM_DETAIL_PROPERTY_RANK, STAT_SCROLLS } from '@/lib/itemFormulas'
import type { CatalogItem, EquippedEntry, Item, ItemMeta, Sprite } from '@/models'

/** gear-comparison-dialog.tsx ported at ITEM-stat scope only: the dashboard's full version
 *  projects the character's own totals (HP/attack/armor/etc, from str/int/dex + set bonuses),
 *  but that needs base character stats (str/int/dex/vit, combatStats) this app's live vitals
 *  stream never sends (confirmed against a live capture: only hp/mp/gold/map/x/y/xp/conditions/
 *  inventorySize arrive) - dashboard-only `statuses[name]` presentation data this app doesn't
 *  poll. Comparing each side's own item-stat block (previewProperties, the same math behind
 *  the Overview tab) instead of full character totals is honest about what's actually known
 *  here, and still answers the real question: what does swapping this item change. */
export function GearComparisonSheet({
  item,
  meta,
  characterCtype,
  equippedSlots,
  catalogFor,
  onClose,
}: {
  item: Item
  meta: ItemMeta | undefined
  characterCtype: string
  equippedSlots: Record<string, EquippedEntry | null>
  catalogFor: (id: string) => CatalogItem | undefined
  onClose: () => void
}) {
  const candidates = useMemo(() => {
    const list = comparisonSlotsFor(meta, characterCtype)
    return list.length > 0 ? list : [String(meta?.definition.type ?? '')]
  }, [meta, characterCtype])
  const replacementSlot =
    candidates.find((slot) => equippedSlots[slot]?.item.name === item.name) ?? candidates.find((slot) => !equippedSlots[slot]) ?? candidates[0]
  const equipped = replacementSlot ? equippedSlots[replacementSlot] : null
  const equippedMeta = (equipped ? catalogFor(equipped.item.name)?.meta : undefined) ?? undefined

  const [leftLevel, setLeftLevel] = useState(Math.max(0, equipped?.item.level ?? 0))
  const [rightLevel, setRightLevel] = useState(Math.max(0, item.level ?? 0))
  const [leftStatType, setLeftStatType] = useState(equipped?.item.stat_type ?? 'none')
  const [rightStatType, setRightStatType] = useState(item.stat_type ?? 'none')

  const leftProps = previewProperties(equippedMeta, equipped?.item.level ?? 0, leftLevel, leftStatType === 'none' ? undefined : leftStatType)
  const rightProps = previewProperties(meta, item.level ?? 0, rightLevel, rightStatType === 'none' ? undefined : rightStatType)
  const rows = [...new Set([...Object.keys(leftProps), ...Object.keys(rightProps)])].sort((a, b) => {
    const rankDiff = (ITEM_DETAIL_PROPERTY_RANK.get(a) ?? Number.MAX_SAFE_INTEGER) - (ITEM_DETAIL_PROPERTY_RANK.get(b) ?? Number.MAX_SAFE_INTEGER)
    return rankDiff !== 0 ? rankDiff : a.localeCompare(b)
  })

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto p-4">
        <div className="mb-2">
          <div className="text-sm font-medium">Compare with equipped</div>
          <p className="text-xs text-muted-foreground">Move either slider or stat-scroll choice independently. Item stats only - nothing in inventory changes.</p>
        </div>

        <ComparisonPanel
          label={equipped ? `${displayName(equipped.item.name, catalogFor)} +${leftLevel}` : 'Empty slot'}
          detail={replacementSlot ?? ''}
          sprite={equipped ? catalogFor(equipped.item.name)?.sprite : undefined}
          meta={equippedMeta}
          level={leftLevel}
          onLevelChange={setLeftLevel}
          statType={leftStatType}
          onStatTypeChange={setLeftStatType}
          props={leftProps}
          otherProps={null}
          rows={rows}
        />
        <ComparisonPanel
          label={`${displayName(item.name, catalogFor)} +${rightLevel}`}
          detail={`Replaces ${replacementSlot ?? ''}`}
          sprite={catalogFor(item.name)?.sprite}
          meta={meta}
          level={rightLevel}
          onLevelChange={setRightLevel}
          statType={rightStatType}
          onStatTypeChange={setRightStatType}
          props={rightProps}
          otherProps={leftProps}
          rows={rows}
        />
      </SheetContent>
    </Sheet>
  )
}

function ComparisonPanel({
  label,
  detail,
  sprite,
  meta,
  level,
  onLevelChange,
  statType,
  onStatTypeChange,
  props,
  otherProps,
  rows,
}: {
  label: string
  detail: string
  sprite: Sprite | null | undefined
  meta: ItemMeta | undefined
  level: number
  onLevelChange: (level: number) => void
  statType: string
  onStatTypeChange: (statType: string) => void
  props: Record<string, number>
  otherProps: Record<string, number> | null
  rows: string[]
}) {
  const maxLevel = itemMaximumLevel(meta)
  const hasStatScroll = meta?.definition.stat != null

  return (
    <div className="my-2 rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <SpriteIcon sprite={sprite} size={32} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{label}</div>
          <div className="truncate text-xs text-muted-foreground">{detail}</div>
        </div>
      </div>

      {hasStatScroll && (
        <div className="mb-2 flex flex-wrap gap-1">
          {[{ stat: 'none', label: 'No stat' }, ...STAT_SCROLLS].map((choice) => (
            <button
              key={choice.stat}
              onClick={() => onStatTypeChange(choice.stat)}
              className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${statType === choice.stat ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'}`}
            >
              {choice.label}
            </button>
          ))}
        </div>
      )}

      {maxLevel > 0 && (
        <div className="mb-2">
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>Preview level</span>
            <span>+{level}</span>
          </div>
          <Slider value={level} min={0} max={maxLevel} step={1} onValueChange={(v) => onLevelChange(typeof v === 'number' ? v : v[0])} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-1.5">
        {rows.map((key) => {
          const value = props[key] ?? 0
          const original = otherProps ? (otherProps[key] ?? 0) : value
          const change = otherProps ? value - original : 0
          const changed = otherProps != null && Math.abs(change) > 0.0001
          if (value === 0 && !changed) return null
          return (
            <div key={key} className="rounded border border-border/60 p-1.5">
              <div className="text-[9px] uppercase text-muted-foreground">{key.replace(/_/g, ' ')}</div>
              <div className={`font-mono text-sm ${changed && change > 0 ? 'font-semibold text-emerald-500' : changed && change < 0 ? 'text-destructive' : ''}`}>
                {formatStatValue(key, value, meta?.definition.type as string | undefined)}
                {changed && <span className="ml-1 text-[10px]">({change > 0 ? '+' : ''}{formatStatValue(key, change, undefined)})</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
