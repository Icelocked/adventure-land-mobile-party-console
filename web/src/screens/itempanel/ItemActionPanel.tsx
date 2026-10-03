import { useMemo, useState } from 'react'
import { useCharacters, useCharacterDiagnosticsMap, useDynamicState, usePartyApi, useRefreshDynamicStateNow, useConfigLoaded } from '@/data/PartyDataProvider'
import { useCatalogLookup } from '@/lib/catalogLookup'
import { itemMaximumLevel, upgradeScrollCost, compoundPassCost, statScrollQuantity, primaryStatScrollCost, STAT_SCROLLS, isEquipment, isUsable, comparisonSlotsFor, comparisonSlotLabel, upgradeRuleTiers } from '@/lib/itemFormulas'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { ItemDetailBrowser } from '@/screens/itemdetail/ItemDetailBrowser'
import { NpcSaleSheet } from '@/components/NpcSaleSheet'
import { standIsFull } from '@/lib/standInspection'
import { AutoNpcSaleConfirmation, DeconstructionConfirmation } from '@/components/ItemConfirmations'
import { AddUpgradeRule, OfferingRows } from '@/components/Offerings'
import { GearComparisonSheet } from './GearComparisonSheet'
import type { ApiResult, CommandResult } from '@/api/partyApi'
import { automaticCommerceRuleKey, canDeconstruct, sameMarkedItem } from '@/models'
import { StandListingForm } from '@/components/StandListingForm'
import type { BestiaryMonster, Item, ItemMeta, MerchantCatalog } from '@/models'

export type ItemActionTarget = { kind: 'inventory'; slot: number; item: Item } | { kind: 'equipment'; slotName: string; item: Item }

/** The bottom-docked item panel replacing desktop's left-click-details/
 *  right-click-menu split - ported from ui/itempanel/ItemActionPanel.kt.
 *  Tapping an item opens its options list; "Item details" is the first
 *  option and opens the full ItemDetailBrowser in its own sheet (owner's
 *  layout decision - the details pane no longer hosts the options). */
export function ItemActionPanel({
  target,
  characterName,
  isMerchant,
  catalog,
  monsters,
  onLuckySlotData,
  onClose,
}: {
  target: ItemActionTarget
  characterName: string
  isMerchant: boolean
  catalog: MerchantCatalog | null | undefined
  monsters: BestiaryMonster[]
  // lucky-slot-menu.tsx "Show lucky slot data", when this is the merchant's lucky slot.
  onLuckySlotData?: () => void
  onClose: () => void
}) {
  const refreshNow = useRefreshDynamicStateNow()
  const characters = useCharacters()
  const dynamicState = useDynamicState()
  const catalogFor = useCatalogLookup(catalog)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [comparing, setComparing] = useState<string | boolean>(false)
  const [showingDetails, setShowingDetails] = useState(false)

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

        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <div className="my-2 border-t border-border" />

        <TapRow label="Item details" onClick={() => setShowingDetails(true)} />
        {onLuckySlotData && (
          <TapRow
            label="Show lucky slot data"
            onClick={() => {
              onClose()
              onLuckySlotData()
            }}
          />
        )}

        {target.kind === 'inventory' ? (
          <InventoryActions
            target={target}
            meta={meta}
            characterName={characterName}
            isMerchant={isMerchant}
            buyable={catalog?.buyable ?? []}
            statScrollInventory={statScrollInventory}
            expanded={expanded}
            onExpand={setExpanded}
            run={run}
            onCompare={(slot) => setComparing(slot ?? true)}
          />
        ) : (
          <EquipmentActions target={target} meta={meta} characterName={characterName} run={run} />
        )}
      </SheetContent>
    </Sheet>

    {showingDetails && (
      <Sheet open onOpenChange={(open) => !open && setShowingDetails(false)}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-4">
          <ItemDetailBrowser
            rootItemId={item.name}
            rootLevel={item.level ?? 0}
            rootStatType={item.stat_type}
            rootGift={item.gift === true}
            rootExpires={item.expires}
            context={{ character: characterName, slot: target.kind === 'inventory' ? target.slot : -1 }}
            // connected-inventory.tsx: only the merchant's own inventory is a stand source.
            onAddStand={
              isMerchant && target.kind === 'inventory'
                ? () => {
                    setShowingDetails(false)
                    setExpanded('stand')
                  }
                : undefined
            }
            catalog={catalog}
            monsters={monsters}
          />
        </SheetContent>
      </Sheet>
    )}

    {comparing && (
      <GearComparisonSheet
        item={item}
        meta={meta}
        characterName={characterName}
        slot={typeof comparing === 'string' ? comparing : undefined}
        onClose={() => setComparing(false)}
      />
    )}
    </>
  )
}

export function TapRow({ label, onClick, disabled, title, className = '' }: { label: string; onClick: () => void; disabled?: boolean; title?: string; className?: string }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} className={`w-full rounded-md py-2 text-left text-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-50 ${className}`}>
      {label}
    </button>
  )
}

const CLEAR_MARKS_TITLE = 'Clear this item’s manual marks and matching shared automatic rules'

/** inventory-panel.tsx's item context menu, in its order and with its
 *  labels and gating, as this app's options list. */
function InventoryActions({
  target,
  meta,
  characterName,
  isMerchant,
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
  buyable: { id: string; cost: number }[]
  statScrollInventory: Record<string, number>
  expanded: string | null
  onExpand: (value: string | null) => void
  run: (action: () => Promise<ApiResult<CommandResult>>) => void
  onCompare: (slot?: string) => void
}) {
  const api = usePartyApi()
  const state = useDynamicState()
  const characters = useCharacters()
  const diagnostics = useCharacterDiagnosticsMap()
  const configLoaded = useConfigLoaded()
  const { item, slot } = target
  const level = Number(item.level) || 0
  const toggle = (key: string) => onExpand(expanded === key ? null : key)
  const merchant = state.merchantCharacter ?? null
  const sharedRules = !!state.merchantRules
  const ruleName = sharedRules ? String(merchant) : characterName
  const equipment = isEquipment(meta?.definition)
  const itemType = String(meta?.definition.type || '')
  const ownSlots = characters[characterName]?.inventory?.slots ?? {}
  const catalogFor = useCatalogLookup(state.merchantCatalog)
  const equippedName = (slotName: string) => {
    const equipped = ownSlots[slotName]
    return equipped ? String(equipped.meta?.definition.name || catalogFor(equipped.item.name)?.name || equipped.item.name) : 'Empty'
  }
  const comparisonSlots = comparisonSlotsFor(meta, characters[characterName]?.vitals?.ctype ?? '')
  const same = (mark: { slot?: number; item?: Item } | Item) =>
    'item' in mark && mark.item ? mark.slot === slot && sameMarkedItem(mark.item, item) : sameMarkedItem(mark as Item, item)

  // The same per-tile state InventorySection derives for its banner.
  const autoItemMarks = state.autoItemMarks[ruleName] ?? {}
  const autoRuleKey = `${item.name}@+${Math.max(0, level)}`
  const autoMarkMode = autoItemMarks[autoRuleKey] || (level === 0 ? autoItemMarks[item.name] : undefined)
  const bankMarked = (state.marked[characterName] ?? []).some(same)
  const merchantMarkedItem = (state.merchantMarked[characterName] ?? []).some(same)
  const deliveryTarget = isMerchant ? Object.keys(state.merchantDeliveries).find((name) => (state.merchantDeliveries[name] ?? []).some(same)) : undefined
  const standListing = isMerchant ? state.standListings.find((listing) => !listing.bankPack && listing.slot === slot && sameMarkedItem(listing.item, item)) : undefined
  // inventory-panel.tsx: standIsFull (sales + buy orders reserving a slot).
  const standFull = standIsFull(state.standListings, state.standBids)
  const merchantWeaponMarked = isMerchant && !!state.merchantWeapon?.item && sameMarkedItem(state.merchantWeapon.item, item)
  const upgradeMark = meta?.upgradeable ? (state.upgrades[characterName] ?? []).find((mark) => !mark.equipped && mark.slot === slot && sameMarkedItem(mark.item, item)) : undefined
  const autoUpgradeRule = (state.autoUpgradeMarks[ruleName] ?? {})[autoRuleKey]
  const autoUpgradeTiers = upgradeRuleTiers(autoUpgradeRule)
  const statScrollMark = isMerchant ? (state.statScrolls[characterName] ?? []).find((mark) => !mark.equipped && mark.slot === slot && sameMarkedItem(mark.item, item)) : undefined
  const compoundGroup = (state.compounds[characterName] ?? []).find((group) => group.items.some((mark) => mark.slot === slot && sameMarkedItem(mark.item, item)))
  const autoCompoundMark = (state.autoCompounds[ruleName] ?? []).find((mark) => mark.name === item.name)
  const autoExchangeMarked = isMerchant && !!state.autoExchanges[`${item.name}@${item.level || 0}`]
  const exchangeable = isMerchant && Number(meta?.definition.e || 0) > 0
  const automaticSaleKey = automaticCommerceRuleKey(item)
  const autoNpcSaleMarked = !!state.autoNpcSales[sharedRules || isMerchant ? automaticSaleKey : JSON.stringify([characterName, automaticSaleKey])]
  const npcSale = state.npcSaleMarks.find(
    (mark) => (isMerchant ? mark.source === 'merchant' : mark.source === 'character' && mark.character === characterName) && mark.slot === slot && automaticCommerceRuleKey(mark.item) === automaticSaleKey,
  )
  const deconstruction = state.deconstructionMarks.find((mark) => mark.owner === characterName && mark.slot === slot && mark.state !== 'complete' && sameMarkedItem(item, mark.item))
  const autoDeconstruct = !!(state.autoDeconstruction[ruleName] ?? {})[automaticSaleKey]
  const autoStandMarked = isMerchant && !!state.autoStandMarks[automaticSaleKey]
  const deconstructable = canDeconstruct(item, state.deconstructionCatalog)
  const upgradeMax = Math.max(0, itemMaximumLevel(meta) - level)
  const compoundMax = Math.min(7, itemMaximumLevel(meta))
  // use-party-console.tsx: online party members other than this one; bankbois are storage workers.
  const bankboiNames = new Set(state.bankbois.map((bankboi) => bankboi.name))
  const deliveryTargets = Object.entries(diagnostics)
    .filter(([name, detail]) => name !== characterName && Number(detail.seenAt) > 0 && !bankboiNames.has(name))
    .map(([name]) => name)
  const anyMark = Boolean(
    bankMarked ||
      merchantMarkedItem ||
      autoMarkMode ||
      upgradeMark ||
      autoUpgradeRule ||
      statScrollMark ||
      compoundGroup ||
      autoCompoundMark ||
      autoExchangeMarked ||
      merchantWeaponMarked ||
      npcSale ||
      autoNpcSaleMarked ||
      standListing ||
      autoStandMarked ||
      deconstruction ||
      autoDeconstruct,
  )
  const command = (type: string, itemSlot: number | null | undefined, extra?: Record<string, unknown>) => run(() => api.itemCommand(type, characterName, item, itemSlot, extra))
  // Inline confirmations keep their own error; success closes the panel.
  const confirmWith = async (action: () => Promise<ApiResult<CommandResult>>) => {
    const result = await action()
    if (result.kind === 'failure') return result.message
    run(async () => result)
    return null
  }

  return (
    <div>
      {equipment && <TapRow label="Equip" onClick={() => command('equip', undefined)} />}
      {isUsable(meta?.definition) && <TapRow label={itemType === 'elixir' ? 'Use elixir' : 'Use'} onClick={() => command('use-item', slot)} />}
      {equipment &&
        (comparisonSlots.length > 1 ? (
          <>
            <TapRow label="Compare with equipped" onClick={() => toggle('compare')} />
            {expanded === 'compare' && (
              <div className="py-1 pl-4">
                {comparisonSlots.map((comparisonSlot) => (
                  <button key={comparisonSlot} onClick={() => onCompare(comparisonSlot)} className="flex w-full items-center justify-between rounded-md px-1 py-1.5 text-left text-sm hover:bg-accent">
                    <span>{comparisonSlotLabel(comparisonSlot)}</span>
                    <span className="text-xs text-muted-foreground">{equippedName(comparisonSlot)}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <TapRow label="Compare with equipped" onClick={() => onCompare()} />
        ))}

      <TapRow label="Deliver to…" onClick={() => toggle('give')} />
      {expanded === 'give' && (
        <div className="py-1 pl-4">
          {!deliveryTargets.length && <p className="py-1 text-xs text-muted-foreground">No other character is online.</p>}
          {deliveryTargets.map((other) =>
            isMerchant && equipment ? (
              <div key={other}>
                <div className="py-1 text-xs text-muted-foreground">
                  {other}
                  {deliveryTarget === other ? ' ✓' : ''}
                </div>
                <TapRow label="Don't equip" onClick={() => command('give', slot, { target: other, equipOnDelivery: false })} />
                <TapRow label="Equip" onClick={() => command('give', slot, { target: other, equipOnDelivery: true })} />
              </div>
            ) : (
              <TapRow key={other} label={other} onClick={() => command('give', slot, { target: other })} />
            ),
          )}
        </div>
      )}

      {isMerchant && meta?.definition.stat ? (
        <>
          <TapRow
            label={statScrollMark ? `Stat scroll: ${statScrollMark.statType.toUpperCase()}` : item.stat_type ? `Change stat scroll · ${item.stat_type.toUpperCase()}` : 'Add stat scroll'}
            onClick={() => toggle('statscroll')}
          />
          {expanded === 'statscroll' && <StatScrollPicker meta={meta} item={item} statScrollInventory={statScrollInventory} onPick={(statType) => command('stat-scroll-mark', slot, { statType })} />}
        </>
      ) : null}

      {/* automatic-item-actions.tsx section="exchange". The server toggles this rule. */}
      {!!merchant && exchangeable && <TapRow label="Auto exchange" disabled={!configLoaded || autoExchangeMarked} onClick={() => command('auto-exchange', slot)} />}

      <TapRow label="Mark for bank" disabled={bankMarked} onClick={() => command('mark', slot)} />
      {!!merchant && <TapRow label="Auto mark for bank" disabled={autoMarkMode === 'bank'} onClick={() => command('auto-item-mark', undefined, { mode: 'bank' })} />}

      {isMerchant && (
        <>
          <TapRow label={standListing ? 'Edit stand listing' : 'Mark for stand'} disabled={standFull && !standListing} onClick={() => toggle('stand')} />
          {expanded === 'stand' && (
            <StandListingForm
              item={item}
              meta={meta}
              existing={standListing}
              onCancel={() => onExpand(null)}
              onSubmit={({ price, quantity, markAll }) => confirmWith(() => api.markForStand(item, slot, price, { id: standListing?.id, quantity, markAll }))}
            />
          )}
        </>
      )}
      {!!merchant && isMerchant && (
        <>
          <TapRow label={autoStandMarked ? 'Update auto mark for stand…' : 'Auto mark for stand…'} onClick={() => toggle('autostand')} />
          {expanded === 'autostand' && (
            <StandListingForm
              auto
              item={item}
              meta={meta}
              existing={state.autoStandMarks[automaticSaleKey] as { price?: number } | undefined}
              onCancel={() => onExpand(null)}
              onSubmit={({ price }) => confirmWith(() => api.autoStand(item, price))}
            />
          )}
        </>
      )}

      {/* upgrade-actions.tsx (offerings are U1). */}
      {!!merchant && meta?.upgradeable && upgradeMax > 0 && (
        <>
          <TapRow label={`Mark for upgrade${upgradeMark ? ` · ${upgradeMark.tiers || 1} tier${(upgradeMark.tiers || 1) === 1 ? '' : 's'}` : ''}`} onClick={() => toggle('upgrade')} />
          {expanded === 'upgrade' && (
            <>
              <UpgradeTierPicker meta={meta} level={level} onPick={(tiers) => command('upgrade-mark', slot, { tiers })} />
              <OfferingRows character={characterName} item={item} meta={meta} source={{ slot }} />
            </>
          )}
          <TapRow label={`Auto mark for upgrade${autoUpgradeTiers ? ` · ${autoUpgradeTiers} tier${autoUpgradeTiers === 1 ? '' : 's'}` : ''}`} onClick={() => toggle('autoupgrade')} />
          {expanded === 'autoupgrade' && (
            <>
              <UpgradeTierPicker meta={meta} level={level} current={autoUpgradeTiers} onPick={(tiers) => command('auto-upgrade-mark', slot, { tiers })} />
              <AddUpgradeRule character={characterName} item={item} meta={meta} />
            </>
          )}
        </>
      )}
      {!!merchant && !isMerchant && meta?.buyable && <TapRow label="Buy another level 0" onClick={() => command('buy-copy', undefined)} />}

      {!!merchant && meta?.compoundable && !compoundGroup && <TapRow label="Mark for compounding" onClick={() => command('compound-mark', slot)} />}
      {!!merchant && meta?.compoundable && level < compoundMax && (
        <>
          <TapRow label={autoCompoundMark?.targetTier ? `Auto compound to +${autoCompoundMark.targetTier}` : 'Auto compound'} onClick={() => toggle('autocompound')} />
          {expanded === 'autocompound' && <CompoundTierPicker meta={meta} level={level} buyable={buyable} onPick={(targetTier) => command('auto-compound-mark', null, { targetTier })} />}
        </>
      )}

      {!isMerchant && (
        <>
          <TapRow label="Mark for merchant" disabled={merchantMarkedItem} onClick={() => command('merchant-mark', slot)} />
          <TapRow label="Auto mark for merchant" disabled={autoMarkMode === 'merchant'} onClick={() => command('auto-item-mark', undefined, { mode: 'merchant' })} />
        </>
      )}

      {(!!merchant || deconstructable) && <div className="my-1 h-px bg-border" />}
      {deconstructable && (
        <>
          <TapRow label="Mark for deconstruction" disabled={!!deconstruction} className="text-orange-400" onClick={() => toggle('decon')} />
          {expanded === 'decon' && (
            <DeconstructionConfirmation
              item={item}
              auto={false}
              catalog={state.deconstructionCatalog}
              catalogFor={catalogFor}
              onCancel={() => onExpand(null)}
              onConfirm={() => confirmWith(() => api.markForDeconstruction(characterName, item, slot))}
            />
          )}
          <TapRow label="Auto mark for deconstruction" disabled={autoDeconstruct} className="text-orange-400" onClick={() => toggle('autodecon')} />
          {expanded === 'autodecon' && (
            <DeconstructionConfirmation
              item={item}
              auto
              catalog={state.deconstructionCatalog}
              catalogFor={catalogFor}
              onCancel={() => onExpand(null)}
              onConfirm={() => confirmWith(() => api.autoDeconstruct(characterName, item))}
            />
          )}
        </>
      )}

      {!!merchant && (
        <>
          <TapRow label="Sell to NPC…" className="text-rose-400" onClick={() => toggle('npcsale')} />
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
          <TapRow label={autoNpcSaleMarked ? 'Update auto sell to NPC…' : 'Auto sell to NPC…'} disabled={!configLoaded} onClick={() => toggle('autonpc')} />
          {expanded === 'autonpc' && (
            <AutoNpcSaleConfirmation
              item={item}
              meta={meta}
              name={String(meta?.definition.name || catalogFor(item.name)?.name || item.name)}
              character={isMerchant ? undefined : characterName}
              onCancel={() => onExpand(null)}
              onConfirm={() => confirmWith(() => api.autoNpcSale(isMerchant ? undefined : characterName, item))}
            />
          )}
        </>
      )}

      {anyMark && <TapRow label="Clear all marks" title={CLEAR_MARKS_TITLE} className="mt-2 text-red-500" onClick={() => command('clear-item-marks', slot)} />}
    </div>
  )
}

/** equip-slot.tsx's menu: Unequip (the elixir only shows its active
 *  effect), upgrade marks, and Clear all marks when anything matches. */
function EquipmentActions({
  target,
  meta,
  characterName,
  run,
}: {
  target: Extract<ItemActionTarget, { kind: 'equipment' }>
  meta: ItemMeta | undefined
  characterName: string
  run: (action: () => Promise<ApiResult<CommandResult>>) => void
}) {
  const api = usePartyApi()
  const state = useDynamicState()
  const { item, slotName } = target
  const level = Number(item.level) || 0
  const [expanded, setExpanded] = useState<string | null>(null)
  const toggle = (key: string) => setExpanded((current) => (current === key ? null : key))
  const upgradeMax = Math.max(0, itemMaximumLevel(meta) - level)
  const merchant = state.merchantCharacter ?? null
  const sharedRules = !!state.merchantRules
  const ruleName = sharedRules ? String(merchant) : characterName
  const isMerchant = characterName === merchant
  const key = `${item.name}@+${Math.max(0, level)}`
  const autoUpgradeRule = (state.autoUpgradeMarks[ruleName] ?? {})[key]
  const autoTiers = upgradeRuleTiers(autoUpgradeRule)
  const mark = (state.upgrades[characterName] ?? []).find((entry) => entry.equipped && entry.slot === slotName && sameMarkedItem(entry.item, item))
  const statScrollMark = (state.statScrolls[characterName] ?? []).find((entry) => entry.slot === slotName && sameMarkedItem(entry.item, item))
  // inventory-panel.tsx hasAutomaticMarks.
  const commerceKey = automaticCommerceRuleKey(item)
  const autoItemMarks = state.autoItemMarks[ruleName] ?? {}
  const hasAutomaticMarks = Boolean(
    autoItemMarks[key] ||
      (!item.level && autoItemMarks[item.name]) ||
      autoUpgradeRule ||
      (state.autoCompounds[ruleName] ?? []).some((rule) => rule.name === item.name) ||
      (state.autoDeconstruction[ruleName] ?? {})[commerceKey] ||
      state.autoNpcSales[sharedRules || isMerchant ? commerceKey : JSON.stringify([characterName, commerceKey])] ||
      (isMerchant && (state.autoStandMarks[commerceKey] || state.autoExchanges[`${item.name}@${item.level || 0}`] || (state.merchantWeapon?.item && sameMarkedItem(item, state.merchantWeapon.item)))),
  )

  return (
    <div>
      {slotName !== 'elixir' && !slotName.startsWith('trade') && <TapRow label="Unequip" onClick={() => run(() => api.itemCommand('unequip', characterName, item, slotName))} />}
      {slotName === 'elixir' && <TapRow label="Active elixir effect" disabled onClick={() => {}} />}
      {meta?.upgradeable && upgradeMax > 0 && (
        <>
          <TapRow label={`Mark for upgrade${mark ? ` · ${mark.tiers || 1} tier${(mark.tiers || 1) === 1 ? '' : 's'}` : ''}`} onClick={() => toggle('upgrade')} />
          {expanded === 'upgrade' && (
            <>
              <UpgradeTierPicker meta={meta} level={level} onPick={(tiers) => run(() => api.itemCommand('upgrade-mark', characterName, item, slotName, { equipped: true, tiers }))} />
              <OfferingRows character={characterName} item={item} meta={meta} source={{ slot: slotName, equipped: true }} />
            </>
          )}
          <TapRow label={`Auto mark for upgrade${autoTiers ? ` · ${autoTiers} tier${autoTiers === 1 ? '' : 's'}` : ''}`} onClick={() => toggle('autoupgrade')} />
          {expanded === 'autoupgrade' && (
            <UpgradeTierPicker
              meta={meta}
              level={level}
              current={autoTiers}
              onPick={(tiers) => run(() => api.itemCommand('auto-upgrade-mark', characterName, item, slotName, { equipped: true, tiers }))}
            />
          )}
          {expanded === 'autoupgrade' && <AddUpgradeRule character={characterName} item={item} meta={meta} />}
        </>
      )}
      {(hasAutomaticMarks || mark || statScrollMark) && (
        <TapRow
          label="Clear all marks"
          title={CLEAR_MARKS_TITLE}
          className="mt-2 text-red-500"
          onClick={() => run(() => api.itemCommand('clear-item-marks', characterName, item, slotName, { equipped: true }))}
        />
      )}
    </div>
  )
}

/** upgrade-actions.tsx's tier submenu ported as an inline expandable list
 *  (this panel's tap-only pattern has no context-menu submenu equivalent)
 *  - one row per achievable target tier, "+N → +N+tiers" with the scroll
 *  gold cost, instead of silently always marking a single tier. */
export function UpgradeTierPicker({ meta, level, current, onPick }: { meta: ItemMeta | undefined; level: number; current?: number; onPick: (tiers: number) => void }) {
  const max = Math.max(0, itemMaximumLevel(meta) - level)
  if (max <= 0) return null
  return (
    <div className="py-1 pl-4">
      {Array.from({ length: max }, (_, index) => index + 1).map((tiers) => (
        <button
          key={tiers}
          disabled={current === tiers}
          onClick={() => onPick(tiers)}
          className="flex w-full items-center justify-between rounded-md px-1 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
        >
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

