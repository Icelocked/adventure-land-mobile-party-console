import { useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { SpriteIcon } from '@/components/SpriteIcon'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { ItemOperationOverlay, LuckySlotOutline, MluckClover, SuggestedPriceDetails, itemLevelLabelClass } from '@/components/ItemTileParts'
import { compactInventory, itemActionBanner, physicalInventory, statBadgeClass, validLuckySlot } from '@/lib/itemActionBanner'
import { aggregateSlotTracking, luckySlotSearch } from '@/lib/luckySlot'
import { TapRow } from '@/screens/itempanel/ItemActionPanel'
import { automaticCommerceRuleKey, sameMarkedItem } from '@/models'
import type { CatalogItem, InventoryEntry, Item, PartyStateDynamic } from '@/models'

type Mark = { slot?: number; item?: Item } | Item
const markedIn = (list: Mark[], entry: InventoryEntry) =>
  list.some((mark) => ('item' in mark && mark.item ? mark.slot === entry.slot && sameMarkedItem(mark.item, entry.item) : sameMarkedItem(mark as Item, entry.item)))

interface TileDetails {
  entry: InventoryEntry
  lucky: boolean
  banner: { label: string; title?: string } | null
  deconstruction: string | null
  npcSaleDetails: string | null
}

/** inventory-panel.tsx's inventory grid: a collapsible header with the
 *  occupied/total counter, the merchant's physical 42-slot layout (with the
 *  lucky upgrade slot outlined) or a compact list for everyone else, and
 *  per tile the sprite (or name), operation overlay, +level, stat badge,
 *  quantity, mluck clover and the one item-action banner. A long press
 *  shows what the dashboard's hover tooltip does. */
export function InventorySection({
  characterName,
  isMerchant,
  items,
  inventorySize,
  loaded,
  dynamicState: state,
  catalogFor,
  onItemTap,
  onLuckySlotData,
}: {
  characterName: string
  isMerchant: boolean
  items: (InventoryEntry | null)[]
  inventorySize?: number
  loaded: boolean
  dynamicState: PartyStateDynamic
  catalogFor: (id: string) => CatalogItem | undefined
  onItemTap: (entry: InventoryEntry, lucky: boolean) => void
  onLuckySlotData: () => void
}) {
  const [open, setOpen] = useState(true)
  const [details, setDetails] = useState<TileDetails | null>(null)
  const [luckyMenu, setLuckyMenu] = useState<{ slot: number } | null>(null)

  // connected-inventory.tsx: missing inventory is still loading, not an empty bag.
  if (!loaded)
    return (
      <section aria-label="Inventory" className="mx-3 my-1.5 rounded-lg border border-border bg-card p-4">
        <output className="text-sm text-muted-foreground">Loading inventory…</output>
      </section>
    )

  const merchant = state.merchantCharacter ?? null
  const sharedRules = !!state.merchantRules
  const ruleName = sharedRules ? String(merchant) : characterName
  const autoItemMarks = state.autoItemMarks[ruleName] ?? {}
  const autoDeconstruction = state.autoDeconstruction[ruleName] ?? {}
  const autoCompoundMarks = state.autoCompounds[ruleName] ?? []
  const bankMarked = (state.marked[characterName] ?? []) as Mark[]
  const merchantMarked = (state.merchantMarked[characterName] ?? []) as Mark[]
  const upgradeMarks = state.upgrades[characterName] ?? []
  const statScrollMarks = state.statScrolls[characterName] ?? []
  const compoundGroups = state.compounds[characterName] ?? []
  const occupiedSlots = items.filter(Boolean).length
  const totalSlots = inventorySize || items.length
  const freeSlots = totalSlots - occupiedSlots
  const capacityColor = freeSlots < 5 ? 'text-rose-400' : freeSlots <= 10 ? 'text-orange-400' : 'text-muted-foreground'
  const luckyUpgradeSlot = state.luckyUpgradeSlots[characterName]
  const nextUpgradeSlot = validLuckySlot(luckyUpgradeSlot) ? luckyUpgradeSlot : luckySlotSearch(aggregateSlotTracking(state.luckySlotTracking[characterName] ?? {})).nextSlot
  const luckySlotLabel = validLuckySlot(luckyUpgradeSlot) ? 'Verified lucky upgrade slot' : 'Next upgrade will test for lucky upgrade'

  return (
    <section aria-label="Inventory" className="mx-3 my-1.5 rounded-lg border border-border bg-card p-4">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="mb-2 flex w-full items-center justify-between text-left">
        <span className="flex items-center gap-1 text-sm font-semibold">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Inventory
        </span>
        <span className={`font-mono text-xs ${capacityColor}`} title={`${freeSlots} slots free`}>
          {occupiedSlots}/{totalSlots}
        </span>
      </button>
      {open && (
        <div className="grid grid-cols-5 gap-1.5">
          {(isMerchant ? physicalInventory(items) : compactInventory(items)).map((entry, i) => {
            const lucky = isMerchant && i === nextUpgradeSlot
            if (!entry)
              return lucky ? (
                <button
                  key={`empty-${i}`}
                  type="button"
                  data-testid={`inventory-slot-${i}`}
                  aria-label={`${luckySlotLabel}, slot ${i}. Open lucky slot options`}
                  onClick={() => setLuckyMenu({ slot: i })}
                  className="relative rounded-md border border-amber-500 bg-background"
                  style={{ width: 60, height: 60 }}
                >
                  <LuckySlotOutline />
                </button>
              ) : (
                <div key={`empty-${i}`} data-testid={`inventory-slot-${i}`} className="rounded-md border border-dashed border-border" style={{ width: 60, height: 60 }} />
              )

            const catalog = catalogFor(entry.item.name)
            const meta = entry.meta ?? catalog?.meta ?? undefined
            const sprite = meta?.sprite ?? catalog?.sprite
            const itemName = String(meta?.definition.name || catalog?.name || entry.item.name)
            const autoRuleKey = `${entry.item.name}@+${Math.max(0, Number(entry.item.level) || 0)}`
            // Name-only rules are from older builds and intentionally apply only
            // to +0 items; upgraded copies must remain independent.
            const autoMarkMode = autoItemMarks[autoRuleKey] || ((Number(entry.item.level) || 0) === 0 ? autoItemMarks[entry.item.name] : undefined)
            const deliveryTarget = isMerchant ? Object.keys(state.merchantDeliveries).find((target) => markedIn((state.merchantDeliveries[target] ?? []) as Mark[], entry)) : undefined
            const standMarked = isMerchant && state.standListings.some((mark) => !mark.bankPack && mark.slot === entry.slot && sameMarkedItem(mark.item, entry.item))
            const merchantWeaponMarked = isMerchant && !!state.merchantWeapon?.item && sameMarkedItem(state.merchantWeapon.item, entry.item)
            const upgradeMark = meta?.upgradeable ? upgradeMarks.find((mark) => !mark.equipped && mark.slot === entry.slot && sameMarkedItem(mark.item, entry.item)) : undefined
            const inventoryStatScrollMark = isMerchant ? statScrollMarks.find((mark) => !mark.equipped && mark.slot === entry.slot && sameMarkedItem(mark.item, entry.item)) : undefined
            const compoundGroup = compoundGroups.find((group) => group.items.some((mark) => mark.slot === entry.slot && sameMarkedItem(mark.item, entry.item)))
            const autoCompoundMark = autoCompoundMarks.find((mark) => mark.name === entry.item.name)
            const autoCompoundPending = !!autoCompoundMark && Number(entry.item.level || 0) < autoCompoundMark.targetTier && Number(autoCompoundMark.quantity) !== 0
            const autoExchangeMarked = isMerchant && !!state.autoExchanges[`${entry.item.name}@${entry.item.level || 0}`]
            const automaticSaleKey = automaticCommerceRuleKey(entry.item)
            const autoNpcSaleMarked = !!state.autoNpcSales[sharedRules || isMerchant ? automaticSaleKey : JSON.stringify([characterName, automaticSaleKey])]
            const npcSale = state.npcSaleMarks.find(
              (mark) =>
                (isMerchant ? mark.source === 'merchant' : mark.source === 'character' && mark.character === characterName) &&
                mark.slot === entry.slot &&
                automaticCommerceRuleKey(mark.item) === automaticSaleKey,
            )
            const npcSaleDetails = npcSale
              ? [`NPC sale: ${npcSale.state || 'queued'}`, npcSale.error, npcSale.retryAt ? `Retry after ${new Date(npcSale.retryAt).toLocaleTimeString()}` : null].filter(Boolean).join(' · ')
              : null
            const deconstruction = state.deconstructionMarks.find(
              (mark) => mark.owner === characterName && mark.slot === entry.slot && mark.state !== 'complete' && sameMarkedItem(entry.item, mark.item),
            )
            const autoDeconstruct = !!autoDeconstruction[automaticSaleKey]
            const autoStandMarked = isMerchant && state.autoStandMarks[automaticSaleKey]
            const upgradeLevel = Number(upgradeMark?.item.level || 0)
            const upgradeTarget = upgradeLevel + Number(upgradeMark?.tiers || 1)
            const banner = itemActionBanner(
              [
                !!deconstruction && { action: 'deconstruction', label: 'Deconstruction' },
                !!npcSale && { action: 'npc', label: 'NPC sale', automatic: !!npcSale.auto, title: npcSaleDetails || undefined },
                !!inventoryStatScrollMark && { action: 'stat', label: 'Stat scroll' },
                !!upgradeMark && { action: 'upgrade', automatic: !!upgradeMark.auto, label: upgradeMark.auto ? `Auto → +${upgradeTarget}` : `+${upgradeLevel} → +${upgradeTarget}` },
                !!compoundGroup && { action: 'compound', label: `+${entry.item.level || 0} → +${Number(entry.item.level || 0) + 1}` },
                standMarked && { action: 'stand', label: 'Stand sale' },
                autoCompoundPending && { action: 'compound', automatic: true, label: `Auto compound → +${autoCompoundMark!.targetTier}` },
                autoDeconstruct && { action: 'deconstruction', automatic: true, label: 'Auto deconstruction' },
                autoNpcSaleMarked && { action: 'npc', automatic: true, label: 'NPC sale', title: npcSaleDetails || 'Auto NPC sale' },
                !!autoStandMarked && { action: 'stand', automatic: true, label: 'Auto stand' },
                autoExchangeMarked && { action: 'exchange', automatic: true, label: 'Auto exchange' },
                !!deliveryTarget && { action: 'delivery', label: `To ${deliveryTarget}` },
                (autoMarkMode === 'bank' || markedIn(bankMarked, entry)) && { action: 'bank', label: autoMarkMode === 'bank' ? 'Auto bank' : 'Bank' },
                (autoMarkMode === 'merchant' || markedIn(merchantMarked, entry)) && { action: 'merchant', label: autoMarkMode === 'merchant' ? 'Auto merchant' : 'Mark for merchant' },
                merchantWeaponMarked && { action: 'weapon', label: 'Merchant weapon' },
              ],
              isMerchant,
            )
            const tileDetails: TileDetails | null =
              isMerchant || banner?.title
                ? {
                    entry: { ...entry, meta },
                    lucky,
                    banner,
                    deconstruction: deconstruction || autoDeconstruct ? `Deconstruction${autoDeconstruct ? ' · automatic' : ''}${deconstruction ? ' · ' + deconstruction.state : ''}` : null,
                    npcSaleDetails,
                  }
                : null

            return (
              <ItemTile
                key={entry.slot}
                testId={`inventory-slot-${i}`}
                label={itemName}
                className={`${lucky ? 'overflow-visible' : 'overflow-hidden'} ${banner?.border || 'border-border'}`}
                // Tap is the dashboard's item menu; on the lucky slot it also offers the lucky slot data.
                onTap={() => onItemTap(entry, lucky)}
                onLongPress={tileDetails ? () => setDetails(tileDetails) : undefined}
              >
                {lucky ? <LuckySlotOutline /> : null}
                {sprite ? <SpriteIcon sprite={sprite} size={58} /> : <span className="block truncate p-1 font-mono text-[10px]">{entry.item.name}</span>}
                {entry.operation ? <ItemOperationOverlay operation={entry.operation} size={58} /> : null}
                {!entry.operation && entry.item.level ? <span className={`${itemLevelLabelClass} left-1`}>+{entry.item.level}</span> : null}
                {entry.item.stat_type ? (
                  <span className={`absolute left-1 top-1 z-10 rounded px-1 font-mono text-[9px] ring-1 ${statBadgeClass(entry.item.stat_type)}`}>{entry.item.stat_type}</span>
                ) : null}
                {entry.item.q && entry.item.q > 1 ? <span className="absolute bottom-1 right-1 z-10 rounded bg-black/70 px-1 text-[10px] text-amber-300">{entry.item.q}</span> : null}
                <MluckClover item={entry.item} />
                {banner && (
                  <span data-item-action-banner title={banner.title} className={`absolute inset-x-0 top-0 z-10 whitespace-normal break-words px-0.5 text-center text-[8px] leading-tight ${banner.colors}`}>
                    {banner.label}
                  </span>
                )}
              </ItemTile>
            )
          })}
        </div>
      )}

      {luckyMenu && (
        <Sheet open onOpenChange={(value) => !value && setLuckyMenu(null)}>
          <SheetContent side="bottom" aria-label="Lucky slot options" className="p-4">
            <p className="text-xs text-muted-foreground">
              {luckySlotLabel} · slot {luckyMenu.slot}
            </p>
            <TapRow
              label="Show lucky slot data"
              onClick={() => {
                setLuckyMenu(null)
                onLuckySlotData()
              }}
            />
          </SheetContent>
        </Sheet>
      )}

      {details && (
        <Sheet open onOpenChange={(value) => !value && setDetails(null)}>
          <SheetContent side="bottom" aria-label="Item tile details" className="max-h-[85vh] overflow-y-auto p-4 font-mono text-[11px] leading-relaxed">
            {details.lucky ? (
              <p className="mb-2 text-amber-500">
                {luckySlotLabel} · slot {nextUpgradeSlot}.
              </p>
            ) : null}
            {!isMerchant && details.banner?.title ? (
              <p className="mb-2">
                {details.banner.label}: {details.banner.title}
              </p>
            ) : null}
            {isMerchant && (
              <>
                <SuggestedPriceDetails entry={details.entry} buyable={state.merchantCatalog?.buyable ?? []} observed={state.standPriceHistory?.[details.entry.item.name]} />
                {details.deconstruction ? <p className="mt-1 text-orange-400">{details.deconstruction}</p> : null}
                {details.npcSaleDetails ? <p className="mt-1 text-rose-400">{details.npcSaleDetails}</p> : null}
                {details.banner?.title && !details.npcSaleDetails ? <p className="mt-1">{details.banner.label}: {details.banner.title}</p> : null}
              </>
            )}
          </SheetContent>
        </Sheet>
      )}
    </section>
  )
}

/** One tile: tap opens the item's options; a long press (or right click)
 *  opens the tooltip details. */
export function ItemTile({
  testId,
  label,
  className,
  onTap,
  onLongPress,
  children,
}: {
  testId?: string
  label: string
  className: string
  onTap: () => void
  onLongPress?: () => void
  children: ReactNode
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fired = useRef(false)
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      onPointerDown={() => {
        fired.current = false
        if (!onLongPress) return
        cancel()
        timer.current = setTimeout(() => {
          fired.current = true
          onLongPress()
        }, 500)
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(event) => {
        if (!onLongPress) return
        event.preventDefault()
        cancel()
        fired.current = true
        onLongPress()
      }}
      onClick={() => {
        if (fired.current) {
          fired.current = false
          return
        }
        onTap()
      }}
      className={`relative rounded-md border bg-background transition hover:border-primary/40 ${className}`}
      style={{ width: 60, height: 60 }}
    >
      {children}
    </button>
  )
}
