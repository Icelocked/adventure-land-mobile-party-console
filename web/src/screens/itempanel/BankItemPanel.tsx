import { useRef, useState } from 'react'
import { useDynamicState, usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { useCatalogLookup } from '@/lib/catalogLookup'
import { itemMaximumLevel } from '@/lib/itemFormulas'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { StandListingForm } from '@/components/StandListingForm'
import { NpcSaleSheet } from '@/components/NpcSaleSheet'
import { standIsFull } from '@/lib/standInspection'
import { AutoNpcSaleConfirmation, DeconstructionConfirmation } from '@/components/ItemConfirmations'
import { ItemDetailBrowser } from '@/screens/itemdetail/ItemDetailBrowser'
import { automaticCommerceRuleKey, canDeconstruct, sameMarkedItem, type InventoryEntry } from '@/models'
import { TapRow, UpgradeTierPicker } from './ItemActionPanel'
import type { ApiResult, CommandResult } from '@/api/partyApi'

/** The options list for one bank item - bank-sheet.tsx's context menu, in
 *  order, all acting through the configured merchant: Item details,
 *  withdrawal (one / all), stand (mark / unmark, auto), upgrade (mark via
 *  withdrawal / auto), deconstruction (mark / auto), NPC sale (sell / auto),
 *  and Clear all marks. */
export function BankItemPanel({ pack, entry, onClose }: { pack: string; entry: InventoryEntry; onClose: () => void }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const state = useDynamicState()
  const catalogFor = useCatalogLookup(state.merchantCatalog)
  const merchant = state.merchantCharacter ?? null
  const { item } = entry
  const meta = catalogFor(item.name)?.meta ?? undefined
  const level = item.level ?? 0
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showingDetails, setShowingDetails] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toggle = (key: string) => setExpanded((current) => (current === key ? null : key))

  // bank-sheet.tsx: the same identity checks the dashboard badges with.
  const withdrawMarked = !!merchant && (state.withdrawals[merchant] ?? []).some((w) => w.pack === pack && w.slot === entry.slot && sameMarkedItem(w.item, item))
  const standListing = state.standListings.find((l) => l.bankPack === pack && l.bankSlot === entry.slot && sameMarkedItem(l.item, item))
  // bank-sheet.tsx: standIsFull, and an already-marked copy can still be edited.
  const standFull = standIsFull(state.standListings, state.standBids)
  const canUpgrade = !!merchant && !item.l && !(item as { b?: unknown }).b && !!meta?.upgradeable && itemMaximumLevel(meta) > level

  const confirmWith = async (action: () => Promise<ApiResult<CommandResult>>) => {
    const result = await action()
    if (result.kind === 'failure') return result.message
    await refreshNow()
    onClose()
    return null
  }
  const run = async (action: () => Promise<ApiResult<CommandResult>>) => {
    setError(null)
    const result = await action()
    if (result.kind === 'failure') return setError(result.message)
    await refreshNow()
    onClose()
  }

  // bank-withdrawal.tsx: in-flight guard (withdraw is a server toggle) and
  // the "Remove automatic bank mark?" consent on auto_bank_confirmation_required.
  const withdrawInFlight = useRef(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [confirmingWithdraw, setConfirmingWithdraw] = useState<{ markAll: boolean; upgradeTiers?: number } | null>(null)
  const withdraw = async (markAll: boolean, upgradeTiers?: number, confirmed = false) => {
    if (withdrawInFlight.current || !merchant) return
    withdrawInFlight.current = true
    setWithdrawing(true)
    try {
      const result = await api.withdrawFromBank(merchant, item, pack, entry.slot, markAll, confirmed, upgradeTiers)
      if (result.kind === 'failure' && !confirmed && result.code === 'auto_bank_confirmation_required') {
        setError(null)
        setConfirmingWithdraw({ markAll, upgradeTiers })
        return
      }
      setConfirmingWithdraw(null)
      if (result.kind === 'failure') return setError(result.message)
      await refreshNow()
      onClose()
    } finally {
      withdrawInFlight.current = false
      setWithdrawing(false)
    }
  }

  return (
    <>
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-4">
          <div className="text-sm text-muted-foreground">
            Bank · {pack} · slot {entry.slot}
          </div>
          <div className="flex gap-3 text-sm">
            {item.stat_type && <span>{item.stat_type}</span>}
            {item.q != null && item.q > 1 && <span>x{item.q}</span>}
            {item.p && <span className="text-primary">{item.p}</span>}
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
          <div className="my-2 border-t border-border" />

          <TapRow label="Item details" onClick={() => setShowingDetails(true)} />

          {merchant ? (
            <>
              <TapRow label={withdrawMarked ? 'Unmark withdrawal' : 'Mark for withdrawal'} onClick={() => !withdrawing && void withdraw(false)} />
              <TapRow label="Mark all for withdrawal" onClick={() => !withdrawing && void withdraw(true)} />
            </>
          ) : (
            <p className="py-2 text-xs text-muted-foreground">No merchant is configured.</p>
          )}
          {confirmingWithdraw && (
            <div role="group" aria-label="Remove automatic bank mark?" className="my-1.5 flex flex-col gap-2 rounded-md border border-border p-2.5 pl-4">
              <p className="text-sm font-medium">Remove automatic bank mark?</p>
              <p className="text-xs text-muted-foreground">This item is automatically marked for bank. Allow withdrawal and remove mark?</p>
              <div className="flex gap-2">
                <Button size="sm" disabled={withdrawing} onClick={() => void withdraw(confirmingWithdraw.markAll, confirmingWithdraw.upgradeTiers, true)}>
                  {withdrawing ? 'Withdrawing…' : 'Confirm'}
                </Button>
                <Button size="sm" variant="outline" disabled={withdrawing} onClick={() => setConfirmingWithdraw(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {standListing ? (
            <TapRow label="Unmark for stand" onClick={() => void run(() => api.removeStandListing(standListing))} />
          ) : (
            <TapRow label="Mark for stand" disabled={standFull} onClick={() => toggle('stand')} />
          )}
          {expanded === 'stand' && (
            <StandListingForm
              item={item}
              meta={meta}
              existing={standListing}
              onCancel={() => setExpanded(null)}
              onSubmit={({ price, quantity, markAll }) => confirmWith(() => api.markForStand(item, entry.slot, price, { id: standListing?.id, bankPack: pack, quantity, markAll }))}
            />
          )}
          {merchant && !item.l && <TapRow label="Auto mark for stand…" onClick={() => toggle('autostand')} />}
          {expanded === 'autostand' && (
            <StandListingForm
              auto
              item={item}
              meta={meta}
              existing={state.autoStandMarks[automaticCommerceRuleKey(item)] as { price?: number } | undefined}
              onCancel={() => setExpanded(null)}
              onSubmit={({ price }) => confirmWith(() => api.autoStand(item, price))}
            />
          )}

          {canUpgrade && (
            <>
              <TapRow label="Mark for upgrade" onClick={() => toggle('upgrade')} />
              {expanded === 'upgrade' && <UpgradeTierPicker meta={meta} level={level} onPick={(tiers) => void withdraw(false, tiers)} />}
              <TapRow label="Auto mark for upgrade" onClick={() => toggle('autoupgrade')} />
              {expanded === 'autoupgrade' && (
                <UpgradeTierPicker meta={meta} level={level} onPick={(tiers) => void run(() => api.itemCommand('auto-upgrade-mark', merchant!, item, -1, { tiers }))} />
              )}
            </>
          )}

          {canDeconstruct(item, state.deconstructionCatalog) && merchant && (
            <>
              <TapRow label="Mark for deconstruction" onClick={() => toggle('decon')} />
              {expanded === 'decon' && (
                <DeconstructionConfirmation
                  item={item}
                  auto={false}
                  catalog={state.deconstructionCatalog}
                  catalogFor={catalogFor}
                  onCancel={() => setExpanded(null)}
                  onConfirm={() => confirmWith(() => api.markBankItemForDeconstruction(item, pack, entry.slot, false))}
                />
              )}
              <TapRow label="Auto mark for deconstruction" onClick={() => toggle('autodecon')} />
              {expanded === 'autodecon' && (
                <DeconstructionConfirmation
                  item={item}
                  auto
                  catalog={state.deconstructionCatalog}
                  catalogFor={catalogFor}
                  onCancel={() => setExpanded(null)}
                  onConfirm={() => confirmWith(() => api.autoDeconstruct(merchant, item))}
                />
              )}
            </>
          )}

          <TapRow label="Sell to NPC…" onClick={() => toggle('npcsale')} />
          {expanded === 'npcsale' && (
            <NpcSaleSheet
              item={item}
              meta={meta}
              location={`Bank · ${pack} · slot ${entry.slot}`}
              available={Number(item.q || 1)}
              onCancel={() => setExpanded(null)}
              onConfirm={async (quantity, acknowledged) => {
                const result = await api.sellBankItemToNpc(item, pack, entry.slot, { quantity, acknowledged })
                if (result.kind === 'failure') return result.message
                await refreshNow()
                onClose()
                return null
              }}
            />
          )}
          {/* party-inventory-panels.tsx onBankAutoNpcSale: the rule is created for the merchant. */}
          {merchant && !item.l && <TapRow label="Auto sell to NPC…" onClick={() => toggle('autonpc')} />}
          {merchant && expanded === 'autonpc' && (
            <AutoNpcSaleConfirmation
              item={item}
              meta={meta}
              name={String(meta?.definition.name || catalogFor(item.name)?.name || item.name)}
              character={merchant}
              onCancel={() => setExpanded(null)}
              onConfirm={() => confirmWith(() => api.autoNpcSale(merchant, item))}
            />
          )}

          {merchant && (
            <TapRow
              label="Clear all marks"
              onClick={() => void run(() => api.post('command', { character: merchant, type: 'clear-item-marks', pack, slot: entry.slot, item }))}
            />
          )}
        </SheetContent>
      </Sheet>
      {showingDetails && (
        <Sheet open onOpenChange={(open) => !open && setShowingDetails(false)}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-4">
            <ItemDetailBrowser
              context={{ character: `Bank · ${pack}`, slot: entry.slot }}
              onAddStand={
                merchant
                  ? () => {
                      setShowingDetails(false)
                      setExpanded('stand')
                    }
                  : undefined
              }
              rootItemId={item.name}
              rootLevel={level}
              rootStatType={item.stat_type}
              rootGift={item.gift === true}
              rootExpires={item.expires}
              catalog={state.merchantCatalog}
              monsters={state.bestiaryCatalog}
            />
          </SheetContent>
        </Sheet>
      )}
    </>
  )
}
