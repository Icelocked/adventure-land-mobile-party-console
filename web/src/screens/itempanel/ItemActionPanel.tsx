import { useMemo, useState } from 'react'
import { useCharacters, useDynamicState, usePartyApi, useRefreshDynamicStateNow, useConfigLoaded } from '@/data/PartyDataProvider'
import { useCatalogLookup } from '@/lib/catalogLookup'
import { itemMaximumLevel, upgradeScrollCost, compoundPassCost, statScrollQuantity, primaryStatScrollCost, STAT_SCROLLS, isEquipment } from '@/lib/itemFormulas'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { ItemDetailBrowser } from '@/screens/itemdetail/ItemDetailBrowser'
import { NpcSaleSheet } from '@/components/NpcSaleSheet'
import { GearComparisonSheet } from './GearComparisonSheet'
import type { ApiResult, CommandResult } from '@/api/partyApi'
import { automaticCommerceRuleKey, sameMarkedItem } from '@/models'
import { StandListingForm } from '@/components/StandListingForm'
import type { BestiaryMonster, Item, ItemMeta, MerchantCatalog, RosterMember } from '@/models'

export type ItemActionTarget = { kind: 'inventory'; slot: number; item: Item } | { kind: 'equipment'; slotName: string; item: Item }

/** The bottom-docked item panel replacing desktop's left-click-details/
 *  right-click-menu split - ported from ui/itempanel/ItemActionPanel.kt.
 *  Item details are the first thing shown (the full ItemDetailBrowser),
 *  mutating actions follow as a single tap-only list below them. */
export function ItemActionPanel({
  target,
  characterName,
  isMerchant,
  roster,
  catalog,
  monsters,
  onClose,
}: {
  target: ItemActionTarget
  characterName: string
  isMerchant: boolean
  roster: Record<string, RosterMember>
  catalog: MerchantCatalog | null | undefined
  monsters: BestiaryMonster[]
  onClose: () => void
}) {
  const refreshNow = useRefreshDynamicStateNow()
  const characters = useCharacters()
  const dynamicState = useDynamicState()
  const catalogFor = useCatalogLookup(catalog)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [comparing, setComparing] = useState(false)

  const run = async (action: () => Promise<ApiResult<CommandResult>>) => {
    const result = await action()
    if (result.kind === 'failure') {
      setError(result.message)
    } else {
      await refreshNow()
      onClose()
    }
  }

  const item = target.item
  const meta = catalogFor(item.name)?.meta ?? undefined
  const slotLabel = target.kind === 'inventory' ? `slot ${target.slot}` : target.slotName

  // stat-scroll-mark needs to know which secondary-stat scrolls are
  // actually held (use-party-console.tsx's statScrollInventory) - summed
  // across the merchant character's own inventory plus the shared bank,
  // since that's who/where a stat-scroll-mark command actually draws from.
  const statScrollInventory = useMemo(() => {
    const quantities: Record<string, number> = {}
    const add = (entryItem?: Item | null) => {
      if (entryItem && STAT_SCROLLS.some((s) => s.scroll === entryItem.name)) {
        quantities[entryItem.name] = (quantities[entryItem.name] ?? 0) + Math.max(1, entryItem.q ?? 1)
      }
    }
    const merchant = dynamicState.merchantCharacter ? characters[dynamicState.merchantCharacter] : undefined
    for (const entry of merchant?.inventory?.items ?? []) add(entry?.item)
    for (const pack of Object.values(dynamicState.bank?.packs ?? {})) {
      for (const entry of pack) add(entry?.item)
    }
    return quantities
  }, [characters, dynamicState.bank])

  return (
    <>
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-4">
        <div className="pb-1 pt-1">
          <div className="text-sm text-muted-foreground">
            {characterName} · {slotLabel}
          </div>
          <div className="flex gap-3">
            {item.stat_type && <span className="text-sm">{item.stat_type}</span>}
            {item.q != null && item.q > 1 && <span className="text-sm">x{item.q}</span>}
            {item.p && <span className="text-sm text-primary">{item.p}</span>}
          </div>
        </div>

        <ItemDetailBrowser
          rootItemId={item.name}
          rootLevel={item.level ?? 0}
          rootStatType={item.stat_type}
          rootGift={item.gift === true}
          rootExpires={item.expires}
          catalog={catalog}
          monsters={monsters}
        />

        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <div className="my-2 border-t border-border" />

        {target.kind === 'inventory' ? (
          <InventoryActions
            target={target}
            meta={meta}
            characterName={characterName}
            isMerchant={isMerchant}
            roster={roster}
            buyable={catalog?.buyable ?? []}
            statScrollInventory={statScrollInventory}
            expanded={expanded}
            onExpand={setExpanded}
            run={run}
            onCompare={isEquipment(meta?.definition) ? () => setComparing(true) : undefined}
          />
        ) : (
          <EquipmentActions target={target} meta={meta} characterName={characterName} isMerchant={isMerchant} run={run} />
        )}
      </SheetContent>
    </Sheet>

    {comparing && (
      <GearComparisonSheet
        item={item}
        meta={meta}
        characterCtype={roster[characterName]?.ctype ?? ''}
        equippedSlots={characters[characterName]?.inventory?.slots ?? {}}
        catalogFor={catalogFor}
        onClose={() => setComparing(false)}
      />
    )}
    </>
  )
}

function TapRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full rounded-md py-2 text-left text-sm hover:bg-accent">
      {label}
    </button>
  )
}

function InventoryActions({
  target,
  meta,
  characterName,
  isMerchant,
  roster,
  buyable,
  statScrollInventory,
  expanded,
  onExpand,
  run,
  onCompare,
}: {
  target: Extract<ItemActionTarget, { kind: 'inventory' }>
  meta: ItemMeta | undefined
  characterName: string
  isMerchant: boolean
  roster: Record<string, RosterMember>
  buyable: { id: string; cost: number }[]
  statScrollInventory: Record<string, number>
  expanded: string | null
  onExpand: (value: string | null) => void
  run: (action: () => Promise<ApiResult<CommandResult>>) => void
  onCompare?: () => void
}) {
  const api = usePartyApi()
  const dynamicState = useDynamicState()
  const { item, slot } = target
  const level = item.level ?? 0
  // use-party-console.tsx: bankbois are storage workers, never delivery targets.
  const bankboiNames = new Set(dynamicState.bankbois.map((bankboi) => bankboi.name))
  const others = Object.keys(roster).filter((name) => name !== characterName && !bankboiNames.has(name))
  const toggle = (key: string) => onExpand(expanded === key ? null : key)
  // inventory-panel.tsx only offers upgrade/compound actions when the
  // account has a merchant character at all (upgrading always routes
  // through them), independent of which character's item this is.
  const hasMerchant = !!dynamicState.merchantCharacter
  const canUpgrade = hasMerchant && !!meta?.upgradeable && itemMaximumLevel(meta) > level
  const canCompound = hasMerchant && !!meta?.compoundable
  const canStatScroll = isMerchant && !!meta?.definition.stat
  // "Buy another level 0" (upgrade-actions.tsx) only for non-merchant holders - the merchant buys
  // directly via the commerce screen instead.
  const canBuyAnother = !isMerchant && !!meta?.buyable
  // exchangeable/autoExchangeMarked (inventory-panel.tsx) - NPC exchange only runs off the merchant's own inventory.
  // merchant-item-commands.ts only accepts auto-exchange on the configured merchant.
  const exchangeable = characterName === dynamicState.merchantCharacter && Number((meta?.definition.e as number | undefined) ?? 0) > 0
  const configLoaded = useConfigLoaded()
  const autoExchangeMarked = exchangeable && !!dynamicState.autoExchanges[`${item.name}@${level}`]
  const canEquipOnDelivery = isMerchant && isEquipment(meta?.definition)
  const standListing = dynamicState.standListings.find((listing) => listing.bankPack == null && listing.slot === slot && sameMarkedItem(listing.item, item))
  // A delivery's `slot` refers to the SENDER's own inventory (the item
  // stays right where it is, still visible/actionable, until the
  // merchant actually travels there and hands it off) - only meaningful
  // for the merchant's own items, matching inventory-panel.tsx's
  // deliveryTarget, which is the only place the dashboard tracks this.
  const deliveryTarget = isMerchant
    ? Object.entries(dynamicState.merchantDeliveries).find(([, marks]) => marks.some((mark) => mark.slot === slot && sameMarkedItem(mark.item, item)))?.[0]
    : undefined

  return (
    <div>
      <TapRow label="Equip" onClick={() => run(() => api.itemCommand('equip', characterName, item))} />
      {onCompare && <TapRow label="Compare with equipped" onClick={onCompare} />}
      <TapRow label="Use item" onClick={() => run(() => api.itemCommand('use-item', characterName, item, slot))} />
      <TapRow label="Mark for Bank" onClick={() => run(() => api.itemCommand('mark', characterName, item, slot))} />
      <TapRow label="Auto-mark for Bank" onClick={() => run(() => api.itemCommand('auto-item-mark', characterName, item, undefined, { mode: 'bank' }))} />
      <TapRow label="Mark for Merchant" onClick={() => run(() => api.itemCommand('merchant-mark', characterName, item, slot))} />
      <TapRow label="Auto-mark for Merchant" onClick={() => run(() => api.itemCommand('auto-item-mark', characterName, item, undefined, { mode: 'merchant' }))} />

      {isMerchant && (
        <>
          <TapRow
            label="Mark for Stand"
            onClick={() => {
              // connected-inventory.tsx onStand: a new listing needs a free slot.
              if (!standListing && dynamicState.standListings.length >= 16) return run(async () => ({ kind: 'failure', message: 'Merchant stand is full (16/16)' }))
              toggle('stand')
            }}
          />
          {expanded === 'stand' && (
            <StandListingForm
              item={item}
              itemValue={meta?.definition.g as number | undefined}
              existing={standListing}
              onSubmit={({ price, quantity, markAll }) => run(() => api.markForStand(item, slot, price, { id: standListing?.id, quantity, markAll }))}
            />
          )}
          <TapRow label="Auto-stand this item" onClick={() => toggle('autostand')} />
          {expanded === 'autostand' && (
            <StandListingForm
              auto
              item={item}
              itemValue={meta?.definition.g as number | undefined}
              existing={dynamicState.autoStandMarks[automaticCommerceRuleKey(item)] as { price?: number } | undefined}
              onSubmit={({ price }) => run(() => api.autoStand(item, price))}
            />
          )}
        </>
      )}

      <TapRow label="Mark for NPC Sale" onClick={() => toggle('npcsale')} />
      {expanded === 'npcsale' && (
        <NpcSaleSheet
          item={item}
          meta={meta}
          location={`${isMerchant ? 'Merchant inventory' : `${characterName} inventory - the merchant will collect it`} · slot ${slot}`}
          available={Number(item.q || 1)}
          onCancel={() => onExpand(null)}
          onConfirm={async (quantity, acknowledged) => {
            const result = await api.markForNpcSale(characterName, item, slot, { isMerchant, quantity, acknowledged })
            if (result.kind === 'failure') return result.message
            run(async () => result)
            return null
          }}
        />
      )}
      <TapRow
        label="Auto-sell to NPC"
        onClick={() => configLoaded && run(() => api.autoNpcSale(characterName === dynamicState.merchantCharacter ? undefined : characterName, item))}
      />
      <TapRow label="Mark for Deconstruction" onClick={() => run(() => api.markForDeconstruction(characterName, item, slot))} />
      <TapRow label="Auto-deconstruct" onClick={() => run(() => api.autoDeconstruct(characterName, item))} />

      {canUpgrade && (
        <>
          <TapRow label="Mark for Upgrade" onClick={() => toggle('upgrade')} />
          {expanded === 'upgrade' && (
            <UpgradeTierPicker meta={meta} level={level} onPick={(tiers) => run(() => api.itemCommand('upgrade-mark', characterName, item, slot, { tiers }))} />
          )}
          <TapRow label="Auto-mark for Upgrade" onClick={() => toggle('autoupgrade')} />
          {expanded === 'autoupgrade' && (
            <UpgradeTierPicker meta={meta} level={level} onPick={(tiers) => run(() => api.itemCommand('auto-upgrade-mark', characterName, item, slot, { tiers }))} />
          )}
        </>
      )}
      {canCompound && (
        <>
          <TapRow label="Mark for Compound" onClick={() => run(() => api.itemCommand('compound-mark', characterName, item, slot))} />
          {/* automatic-item-actions.tsx: only while below the +7 auto-compound cap. */}
          {level < Math.min(7, itemMaximumLevel(meta)) && <TapRow label="Auto-mark for Compound" onClick={() => toggle('autocompound')} />}
          {expanded === 'autocompound' && (
            <CompoundTierPicker
              meta={meta}
              level={level}
              buyable={buyable}
              onPick={(targetTier) => run(() => api.itemCommand('auto-compound-mark', characterName, item, null, { targetTier }))}
            />
          )}
        </>
      )}
      {canStatScroll && (
        <>
          <TapRow label={item.stat_type ? `Change stat scroll · ${item.stat_type.toUpperCase()}` : 'Add stat scroll'} onClick={() => toggle('statscroll')} />
          {expanded === 'statscroll' && (
            <StatScrollPicker
              meta={meta}
              item={item}
              statScrollInventory={statScrollInventory}
              onPick={(statType) => run(() => api.itemCommand('stat-scroll-mark', characterName, item, slot, { statType }))}
            />
          )}
        </>
      )}
      {canBuyAnother && <TapRow label="Buy another level 0" onClick={() => run(() => api.itemCommand('buy-copy', characterName, item))} />}

      {exchangeable && (
        <TapRow
          // The server toggles this rule (merchant-item-commands.ts), so a tap
          // before autoExchanges has loaded could silently remove it.
          label={!configLoaded ? 'Auto exchange · loading settings…' : autoExchangeMarked ? 'Auto exchange · already marked' : 'Auto exchange'}
          onClick={() => configLoaded && !autoExchangeMarked && run(() => api.itemCommand('auto-exchange', characterName, item, slot))}
        />
      )}

      {others.length > 0 && (
        <>
          <TapRow label={deliveryTarget ? `Deliver to... · queued for ${deliveryTarget}` : 'Deliver to...'} onClick={() => toggle('give')} />
          {expanded === 'give' &&
            (canEquipOnDelivery
              ? others.map((other) => (
                  <div key={other} className="py-1 pl-4">
                    <div className="py-1 text-xs text-muted-foreground">
                      → {other}
                      {other === deliveryTarget ? ' ✓' : ''}
                    </div>
                    <TapRow
                      label="  Don't equip"
                      onClick={() => run(() => api.itemCommand('give', characterName, item, slot, { target: other, equipOnDelivery: false }))}
                    />
                    <TapRow
                      label="  Equip"
                      onClick={() => run(() => api.itemCommand('give', characterName, item, slot, { target: other, equipOnDelivery: true }))}
                    />
                  </div>
                ))
              : others.map((other) => (
                  <TapRow
                    key={other}
                    label={`  → ${other}${other === deliveryTarget ? ' ✓' : ''}`}
                    onClick={() => run(() => api.itemCommand('give', characterName, item, slot, { target: other }))}
                  />
                )))}
        </>
      )}
      <TapRow label="Clear marks" onClick={() => run(() => api.itemCommand('clear-item-marks', characterName, item, slot))} />
    </div>
  )
}

function EquipmentActions({
  target,
  meta,
  characterName,
  isMerchant,
  run,
}: {
  target: Extract<ItemActionTarget, { kind: 'equipment' }>
  meta: ItemMeta | undefined
  characterName: string
  isMerchant: boolean
  run: (action: () => Promise<ApiResult<CommandResult>>) => void
}) {
  const api = usePartyApi()
  const { item, slotName } = target
  const level = item.level ?? 0
  const [expanded, setExpanded] = useState<string | null>(null)
  const toggle = (key: string) => setExpanded((current) => (current === key ? null : key))
  const canUpgrade = !!meta?.upgradeable && itemMaximumLevel(meta) > level

  return (
    <div>
      {slotName !== 'elixir' && !slotName.startsWith('trade') && <TapRow label="Unequip" onClick={() => run(() => api.itemCommand('unequip', characterName, item, slotName))} />}
      {canUpgrade && (
        <>
          <TapRow label="Mark for Upgrade" onClick={() => toggle('upgrade')} />
          {expanded === 'upgrade' && (
            <UpgradeTierPicker meta={meta} level={level} onPick={(tiers) => run(() => api.itemCommand('upgrade-mark', characterName, item, slotName, { equipped: true, tiers }))} />
          )}
          <TapRow label="Auto-mark for Upgrade" onClick={() => toggle('autoupgrade')} />
          {expanded === 'autoupgrade' && (
            <UpgradeTierPicker
              meta={meta}
              level={level}
              onPick={(tiers) => run(() => api.itemCommand('auto-upgrade-mark', characterName, item, slotName, { equipped: true, tiers }))}
            />
          )}
        </>
      )}
      {isMerchant && <TapRow label="Buy copy" onClick={() => run(() => api.itemCommand('buy-copy', characterName, item))} />}
      <TapRow label="Clear marks" onClick={() => run(() => api.itemCommand('clear-item-marks', characterName, item, slotName, { equipped: true }))} />
    </div>
  )
}

/** upgrade-actions.tsx's tier submenu ported as an inline expandable list
 *  (this panel's tap-only pattern has no context-menu submenu equivalent)
 *  - one row per achievable target tier, "+N → +N+tiers" with the scroll
 *  gold cost, instead of silently always marking a single tier. */
function UpgradeTierPicker({ meta, level, onPick }: { meta: ItemMeta | undefined; level: number; onPick: (tiers: number) => void }) {
  const max = Math.max(0, itemMaximumLevel(meta) - level)
  if (max <= 0) return null
  return (
    <div className="py-1 pl-4">
      {Array.from({ length: max }, (_, index) => index + 1).map((tiers) => (
        <button key={tiers} onClick={() => onPick(tiers)} className="flex w-full items-center justify-between rounded-md px-1 py-1.5 text-left text-sm hover:bg-accent">
          <span>
            +{level} → +{level + tiers}
          </span>
          <span className="font-mono text-xs text-muted-foreground">{upgradeScrollCost(meta, level, tiers).toLocaleString()}g</span>
        </button>
      ))}
    </div>
  )
}

/** The compound equivalent of UpgradeTierPicker - inventory-panel.tsx's
 *  "Auto compound" submenu, one row per tier up to itemMaximumLevel (7 for
 *  compoundables) with the real compound-scroll cost (compoundPassCost),
 *  not a free-form number input the way this used to work. */
function CompoundTierPicker({ meta, level, buyable, onPick }: { meta: ItemMeta | undefined; level: number; buyable: { id: string; cost: number }[]; onPick: (tier: number) => void }) {
  // The server's validTier caps auto-compound targets at +7 (compound-commands.ts).
  const max = Math.max(0, Math.min(7, itemMaximumLevel(meta)) - level)
  if (max <= 0) return null
  const grades = meta?.definition.grades as number[] | undefined
  return (
    <div className="py-1 pl-4">
      {Array.from({ length: max }, (_, index) => level + index + 1).map((tier) => {
        const cost = compoundPassCost(grades, tier, buyable)
        return (
          <button key={tier} onClick={() => onPick(tier)} className="flex w-full items-center justify-between rounded-md px-1 py-1.5 text-left text-sm hover:bg-accent">
            <span>+{tier}</span>
            <span className="font-mono text-xs text-muted-foreground">{cost ? `${cost.gold.toLocaleString()}g` : 'Price unavailable'}</span>
          </button>
        )
      })}
    </div>
  )
}

/** stat-scroll-mark's option list, ported with the same purchasable-vs-
 *  owned split as inventory-panel.tsx: str/int/dex/vit are always shown
 *  (bought outright for gold), every other stat only shows up once you
 *  already own enough of its scroll - not as an always-visible chip with
 *  no indication of cost or whether you can actually do it. */
function StatScrollPicker({
  meta,
  item,
  statScrollInventory,
  onPick,
}: {
  meta: ItemMeta | undefined
  item: Item
  statScrollInventory: Record<string, number>
  onPick: (statType: string) => void
}) {
  const level = item.level ?? 0
  const required = statScrollQuantity(meta, level)
  const cost = primaryStatScrollCost(meta, level)
  const choices = STAT_SCROLLS.filter((choice) => choice.purchasable || (statScrollInventory[choice.scroll] ?? 0) >= required)
  return (
    <div className="flex flex-col py-1 pl-4">
      {choices.map((choice) => {
        const owned = statScrollInventory[choice.scroll] ?? 0
        const current = item.stat_type === choice.stat
        return (
          <button
            key={choice.stat}
            disabled={current}
            onClick={() => onPick(choice.stat)}
            className="flex w-full items-center justify-between rounded-md px-1 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
          >
            <span>
              {choice.label}
              {current ? ' · current' : ''}
            </span>
            <span className="font-mono text-xs text-muted-foreground">{choice.purchasable ? `${cost.toLocaleString()}g · ${required} scroll${required === 1 ? '' : 's'}` : `${owned}/${required} owned`}</span>
          </button>
        )
      })}
    </div>
  )
}

