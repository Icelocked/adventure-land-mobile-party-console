import { Clover, Coins } from 'lucide-react'
import { SpriteIcon } from '@/components/SpriteIcon'
import { abbreviatedGold } from '@/lib/gold'
import { exactLevelPrice, suggestedItemValue, type StandPriceHistory } from '@/lib/suggestedItemValue'
import type { InventoryEntry, Item, ItemOperation, MerchantBuyItem } from '@/models'

export const itemLevelLabelClass = 'absolute bottom-1 z-10 whitespace-nowrap text-[10px] text-emerald-300'

/** An upgrade/compound in progress: the pulsing result sprite, success %,
 *  and +from → +to. */
export function ItemOperationOverlay({ operation, size }: { operation: ItemOperation; size: number }) {
  const percent = operation.chance == null ? null : `${(operation.chance * 100).toFixed(2)}%`
  const chanceColor = `hsl(${Math.max(0, Math.min(1, operation.chance ?? 0)) * 120} 85% 65%)`
  return (
    <span
      className="pointer-events-none absolute inset-0 z-20"
      aria-label={`${operation.type}: +${operation.fromLevel} to +${operation.toLevel}${percent ? `, ${percent} success` : ''}`}
    >
      {operation.sprite ? (
        <span className="absolute inset-0 opacity-70 motion-safe:animate-pulse">
          <SpriteIcon sprite={operation.sprite} size={size} />
        </span>
      ) : null}
      {percent ? (
        <span
          className="absolute inset-x-0 top-[22%] bottom-[35%] flex items-center justify-center whitespace-nowrap font-mono text-[12px] font-bold leading-none"
          style={{ color: chanceColor, textShadow: '0 1px 2px #000' }}
        >
          {percent}
        </span>
      ) : null}
      <span className={`${itemLevelLabelClass} left-1`}>+{operation.fromLevel}</span>
      <span className={`${itemLevelLabelClass} left-1/2 -translate-x-1/2`}>→</span>
      <span className={`${itemLevelLabelClass} right-1`}>+{operation.toLevel}</span>
    </span>
  )
}

export function MluckClover({ item }: { item?: Item | null }) {
  return item?.m ? (
    <span
      title="Duplicated by Merchant's Luck"
      aria-label="Merchant's Luck duplicate"
      className="absolute right-0.5 top-1/2 z-20 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full border border-emerald-300 bg-emerald-950/95 text-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.65)]"
    >
      <Clover className="h-3.5 w-3.5 fill-emerald-500/35" />
    </span>
  ) : null
}

export function LuckySlotOutline() {
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute -inset-[5px] z-20 h-[calc(100%+10px)] w-[calc(100%+10px)] overflow-visible fill-none text-amber-300">
      <path
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        d="M8 4 Q14 0 20 4 T32 4 T44 4 T56 4 T68 4 T80 4 T92 4 Q96 4 96 8 Q100 14 96 20 T96 32 T96 44 T96 56 T96 68 T96 80 T96 92 Q96 96 92 96 Q86 100 80 96 T68 96 T56 96 T44 96 T32 96 T20 96 T8 96 Q4 96 4 92 Q0 86 4 80 T4 68 T4 56 T4 44 T4 32 T4 20 T4 8 Q4 4 8 4 Z"
      />
    </svg>
  )
}

/** The merchant tile's price evidence. */
export function SuggestedPriceDetails({ entry, buyable, observed }: { entry: InventoryEntry; buyable: MerchantBuyItem[]; observed?: StandPriceHistory }) {
  const valuation = suggestedItemValue(entry, buyable)
  const itemLevel = Number(entry.item.level) || 0
  const observedPrice = (price: number | undefined, level: number | undefined, fallback: string) =>
    exactLevelPrice(price, level, itemLevel) ? `${abbreviatedGold(price!)} gold (+${itemLevel})` : `${fallback} for +${itemLevel}`
  return (
    <>
      <span className="mb-3 block border-b border-amber-950/80 pb-2">
        {itemLevel === 0 && <span className="block text-muted-foreground">Default price: {abbreviatedGold(valuation.defaultPrice)} gold</span>}
        <span className="block text-cyan-400">Lowest price seen: {observedPrice(observed?.lowest, observed?.lowestLevel, 'Not observed')}</span>
        <span className="block text-cyan-400/75">Most recent price seen: {observedPrice(observed?.recent, observed?.recentLevel, 'Not observed')}</span>
        <span className="block text-cyan-400/75">Current market low: {observedPrice(observed?.marketLow, observed?.marketLowLevel, 'No fresh listing')}</span>
        <span className="block text-violet-400/80">Highest public WTB: {observedPrice(observed?.highestPublicWTB, observed?.highestPublicWTBLevel, 'Not advertised')}</span>
      </span>
      {valuation.sources.length ? (
        <span className="mb-2 block space-y-2">
          {valuation.sources.map((source) => (
            <span key={`${source.monsterId}:${source.mapId || ''}`} className="flex items-start gap-2 rounded border border-amber-950/80 bg-amber-950/15 p-2">
              <span className="relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center">
                {source.sprite ? <SpriteIcon sprite={source.sprite} size={32} /> : source.purchase ? <Coins className="h-5 w-5 text-amber-400" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-amber-500">
                  Suggested price ({source.worldDrop ? `world drop · ${source.monsterName}` : source.monsterName}): {abbreviatedGold(source.suggested)} gold
                </span>
                {source.purchase ? (
                  Number(entry.item.level || 0) > 0 ? (
                    <span className="block text-muted-foreground">
                      90% chance of producing +{entry.item.level} within this budget · approximately {(source.attempts || 0).toLocaleString()} base items ·{' '}
                      {(source.scrolls || []).reduce((sum, count) => sum + count, 0).toLocaleString()} scrolls
                    </span>
                  ) : (
                    <span className="block text-muted-foreground">Guaranteed vendor purchase</span>
                  )
                ) : (
                  <span className="block text-muted-foreground">
                    {source.kills.toLocaleString()} kills for 90% confidence · {(source.rate * 100).toPrecision(3)}% per kill
                    {source.luckMultiplier ? ` at ${(source.luckMultiplier * 100).toFixed(0)}% Luck` : ''}
                    {source.mapName ? ` · ${source.mapName}` : ''}
                  </span>
                )}
                {!source.purchase && source.paths?.length ? (
                  <span className="block truncate text-fuchsia-400/80" title={source.paths.join(' | ')}>
                    Via: {source.paths.join(' | ')}
                  </span>
                ) : null}
              </span>
            </span>
          ))}
        </span>
      ) : (
        <span className="block text-amber-500">No repeatably farmable source</span>
      )}
      {Number(entry.item.level || 0) > 0 && entry.meta?.upgradeable ? (
        <span className="mt-1 block text-violet-400/80">Includes the +{entry.item.level} 90%-confidence replacement estimate.</span>
      ) : null}
    </>
  )
}
