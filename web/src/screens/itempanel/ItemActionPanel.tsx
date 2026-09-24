import { useState } from 'react'
import { usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Chip } from '@/components/Chip'
import { ItemDetailBrowser } from '@/screens/itemdetail/ItemDetailBrowser'
import type { ApiResult, CommandResult } from '@/api/partyApi'
import type { BestiaryMonster, Item, MerchantCatalog, RosterMember } from '@/models'

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
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

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
  const slotLabel = target.kind === 'inventory' ? `slot ${target.slot}` : target.slotName

  return (
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
            characterName={characterName}
            isMerchant={isMerchant}
            roster={roster}
            expanded={expanded}
            onExpand={setExpanded}
            run={run}
          />
        ) : (
          <EquipmentActions target={target} characterName={characterName} isMerchant={isMerchant} run={run} />
        )}
      </SheetContent>
    </Sheet>
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
  characterName,
  isMerchant,
  roster,
  expanded,
  onExpand,
  run,
}: {
  target: Extract<ItemActionTarget, { kind: 'inventory' }>
  characterName: string
  isMerchant: boolean
  roster: Record<string, RosterMember>
  expanded: string | null
  onExpand: (value: string | null) => void
  run: (action: () => Promise<ApiResult<CommandResult>>) => void
}) {
  const api = usePartyApi()
  const { item, slot } = target
  const others = Object.keys(roster).filter((name) => name !== characterName)
  const toggle = (key: string) => onExpand(expanded === key ? null : key)

  return (
    <div>
      <TapRow label="Equip" onClick={() => run(() => api.itemCommand('equip', characterName, item))} />
      <TapRow label="Use item" onClick={() => run(() => api.itemCommand('use-item', characterName, item, slot))} />
      <TapRow label="Mark for Bank" onClick={() => run(() => api.itemCommand('mark', characterName, item, slot))} />
      <TapRow label="Auto-mark for Bank" onClick={() => run(() => api.itemCommand('auto-item-mark', characterName, item, undefined, { mode: 'bank' }))} />
      <TapRow label="Mark for Merchant" onClick={() => run(() => api.itemCommand('merchant-mark', characterName, item, slot))} />
      <TapRow label="Auto-mark for Merchant" onClick={() => run(() => api.itemCommand('auto-item-mark', characterName, item, undefined, { mode: 'merchant' }))} />

      {isMerchant && (
        <>
          <TapRow label="Mark for Stand" onClick={() => toggle('stand')} />
          {expanded === 'stand' && <StandForm item={item} slot={slot} run={run} />}
          <TapRow label="Auto-stand this item" onClick={() => toggle('autostand')} />
          {expanded === 'autostand' && <AutoStandForm characterName={characterName} item={item} run={run} />}
        </>
      )}

      <TapRow label="Mark for NPC Sale" onClick={() => run(() => api.markForNpcSale(characterName, item, slot))} />
      <TapRow label="Auto-sell to NPC" onClick={() => run(() => api.autoNpcSale(characterName, item))} />
      <TapRow label="Mark for Deconstruction" onClick={() => run(() => api.markForDeconstruction(characterName, item, slot))} />
      <TapRow label="Auto-deconstruct" onClick={() => run(() => api.autoDeconstruct(characterName, item))} />
      <TapRow label="Mark for Upgrade" onClick={() => run(() => api.itemCommand('upgrade-mark', characterName, item, slot, { tiers: 1 }))} />
      <TapRow label="Auto-mark for Upgrade" onClick={() => run(() => api.itemCommand('auto-upgrade-mark', characterName, item, slot, { tiers: 1 }))} />
      <TapRow label="Mark for Compound" onClick={() => run(() => api.itemCommand('compound-mark', characterName, item, slot))} />
      <TapRow label="Auto-mark for Compound" onClick={() => toggle('autocompound')} />
      {expanded === 'autocompound' && <AutoCompoundForm characterName={characterName} item={item} run={run} />}
      <TapRow label="Stat scroll mark" onClick={() => toggle('statscroll')} />
      {expanded === 'statscroll' && <StatScrollForm characterName={characterName} item={item} slot={slot} run={run} />}

      {others.length > 0 && (
        <>
          <TapRow label="Give to..." onClick={() => toggle('give')} />
          {expanded === 'give' &&
            others.map((other) => (
              <TapRow key={other} label={`  → ${other}`} onClick={() => run(() => api.itemCommand('give', characterName, item, slot, { target: other }))} />
            ))}
        </>
      )}
      <TapRow label="Clear marks" onClick={() => run(() => api.itemCommand('clear-item-marks', characterName, item, slot))} />
    </div>
  )
}

function EquipmentActions({
  target,
  characterName,
  isMerchant,
  run,
}: {
  target: Extract<ItemActionTarget, { kind: 'equipment' }>
  characterName: string
  isMerchant: boolean
  run: (action: () => Promise<ApiResult<CommandResult>>) => void
}) {
  const api = usePartyApi()
  const { item, slotName } = target
  return (
    <div>
      <TapRow label="Unequip" onClick={() => run(() => api.itemCommand('unequip', characterName, item, slotName))} />
      <TapRow label="Mark for Upgrade" onClick={() => run(() => api.itemCommand('upgrade-mark', characterName, item, null, { equipped: true, tiers: 1 }))} />
      <TapRow label="Auto-mark for Upgrade" onClick={() => run(() => api.itemCommand('auto-upgrade-mark', characterName, item, null, { equipped: true, tiers: 1 }))} />
      {isMerchant && <TapRow label="Buy copy" onClick={() => run(() => api.itemCommand('buy-copy', characterName, item))} />}
      <TapRow label="Clear marks" onClick={() => run(() => api.itemCommand('clear-item-marks', characterName, item, null, { equipped: true }))} />
    </div>
  )
}

/** All 22 server-accepted stat_type values - str/int/dex/vit need no
 *  scroll-quantity check, the rest require owning the matching scroll
 *  item. Primary four shown first since they're the common case. */
const PRIMARY_STAT_TYPES = ['str', 'int', 'dex', 'vit']
const OTHER_STAT_TYPES = ['for', 'evasion', 'reflection', 'gold', 'luck', 'xp', 'armor', 'resistance', 'speed', 'lifesteal', 'manasteal', 'rpiercing', 'apiercing', 'crit', 'dreturn', 'frequency', 'mp_cost', 'output']

function StatScrollForm({ characterName, item, slot, run }: { characterName: string; item: Item; slot: number; run: (action: () => Promise<ApiResult<CommandResult>>) => void }) {
  const api = usePartyApi()
  const [showMore, setShowMore] = useState(false)
  const mark = (stat: string) => run(() => api.itemCommand('stat-scroll-mark', characterName, item, slot, { statType: stat }))

  return (
    <div className="py-2 pl-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {PRIMARY_STAT_TYPES.map((stat) => (
          <Chip key={stat} selected={false} onClick={() => mark(stat)}>
            {stat}
          </Chip>
        ))}
        <button className="text-xs text-muted-foreground underline" onClick={() => setShowMore((v) => !v)}>
          {showMore ? 'less' : 'more'}
        </button>
      </div>
      {showMore && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {OTHER_STAT_TYPES.map((stat) => (
            <Chip key={stat} selected={false} onClick={() => mark(stat)}>
              {stat}
            </Chip>
          ))}
        </div>
      )}
    </div>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex-1 text-xs text-muted-foreground">
      {label}
      <Input value={value} onChange={(e) => /^\d*$/.test(e.target.value) && onChange(e.target.value)} className="mt-1" />
    </label>
  )
}

/** auto-compound-mark needs targetTier (1-7, the tier to compound UP TO)
 *  and quantity (how many finished copies to maintain) rather than a
 *  slot - it's a standing rule for the item type, not one instance. */
function AutoCompoundForm({ characterName, item, run }: { characterName: string; item: Item; run: (action: () => Promise<ApiResult<CommandResult>>) => void }) {
  const api = usePartyApi()
  const [targetTier, setTargetTier] = useState('1')
  const [quantity, setQuantity] = useState('1')
  return (
    <div className="flex items-end gap-2 py-2 pl-4">
      <NumberField label="Target tier (1-7)" value={targetTier} onChange={setTargetTier} />
      <NumberField label="Quantity" value={quantity} onChange={setQuantity} />
      <Button
        size="sm"
        onClick={() =>
          run(() =>
            api.itemCommand('auto-compound-mark', characterName, item, null, {
              targetTier: Math.min(7, Math.max(1, Number(targetTier) || 1)),
              quantity: Number(quantity) || 1,
            }),
          )
        }
      >
        Set
      </Button>
    </div>
  )
}

function AutoStandForm({ characterName, item, run }: { characterName: string; item: Item; run: (action: () => Promise<ApiResult<CommandResult>>) => void }) {
  const api = usePartyApi()
  const [price, setPrice] = useState(item.price != null ? String(item.price) : '')
  return (
    <div className="flex items-end gap-2 py-2 pl-4">
      <NumberField label="Price" value={price} onChange={setPrice} />
      <Button size="sm" onClick={() => run(() => api.autoStand(characterName, item, Number(price) || 0))}>
        Set
      </Button>
    </div>
  )
}

function StandForm({ item, slot, run }: { item: Item; slot: number; run: (action: () => Promise<ApiResult<CommandResult>>) => void }) {
  const api = usePartyApi()
  const [price, setPrice] = useState(item.price != null ? String(item.price) : '')
  return (
    <div className="flex items-end gap-2 py-2 pl-4">
      <NumberField label="Price" value={price} onChange={setPrice} />
      <Button size="sm" onClick={() => run(() => api.markForStand(item, slot, Number(price) || 0))}>
        List
      </Button>
    </div>
  )
}
