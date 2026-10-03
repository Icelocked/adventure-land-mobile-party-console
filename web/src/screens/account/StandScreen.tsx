import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import { usePartyApi, useCharacterDiagnosticsMap, useCharacters, useDynamicState, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { useCatalogLookup } from '@/lib/catalogLookup'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { SpriteIcon } from '@/components/SpriteIcon'
import { MluckClover, SuggestedPriceDetails } from '@/components/ItemTileParts'
import { StandListingForm } from '@/components/StandListingForm'
import { WtbDialog, WtbPreference, WtbPriorityInput, autoStandExplanation, standBuyExplanation, useWtbReplacement } from '@/components/Wtb'
import { ItemTile } from '@/screens/character-detail/sections/InventorySection'
import { ItemDetailBrowser } from '@/screens/itemdetail/ItemDetailBrowser'
import { statBadgeClass } from '@/lib/itemActionBanner'
import { standBuyRows, standOccupancy, standSaleRows, type StandMerchant } from '@/lib/standInspection'
import { AccountScreenScaffold } from './AccountScreenScaffold'
import type { ApiResult, CommandResult } from '@/api/partyApi'
import type { Item, StandBid, StandListing } from '@/models'

/** The configured merchant as the stand inspection needs it: its equipped
 *  trade slots and whether the stand is open (live vitals, else diagnostics). */
export function useStandMerchant(): StandMerchant | undefined {
  const state = useDynamicState()
  const characters = useCharacters()
  const diagnostics = useCharacterDiagnosticsMap()
  const name = state.merchantCharacter
  if (!name) return undefined
  const character = characters[name]
  const standOpen = (character?.vitals?.standOpen ?? (diagnostics[name] as { standOpen?: boolean } | undefined)?.standOpen) as boolean | undefined
  return { slots: character?.inventory?.slots ?? {}, standOpen }
}

/** stand-sheet.tsx "Inspect stand": items for sale reconciled against the
 *  live trade slots (Live / Paused, read-only unmanaged rows, a separate
 *  "Queued sales for stand"), each with its price (opens the stand form) and
 *  a two-step Remove; then the buy orders on the stand (N wanted, price via
 *  the WTB dialog, native batch, priority, Auto, Use stand, Really cancel?).
 *  Tapping a row inspects it; a long press shows the suggested price. */
export function StandScreen() {
  const api = usePartyApi()
  const state = useDynamicState()
  const refreshNow = useRefreshDynamicStateNow()
  const catalogFor = useCatalogLookup(state.merchantCatalog)
  const merchant = useStandMerchant()
  const replacement = useWtbReplacement(catalogFor)
  const listings = state.standListings
  const bids = state.standBids
  const occupancy = standOccupancy(listings, state.nativeStand, merchant)
  const saleRows = standSaleRows(listings, merchant, state.nativeStand)
  const buyRows = standBuyRows(bids, state.nativeStand, merchant, listings)
  const [editing, setEditing] = useState<string | null>(null)
  const [editingBuy, setEditingBuy] = useState<Item | null>(null)
  const [inspecting, setInspecting] = useState<Item | null>(null)
  const [suggesting, setSuggesting] = useState<Item | null>(null)
  const [removeConfirmation, setRemoveConfirmation] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [confirmBidCancel, setConfirmBidCancel] = useState<string | null>(null)
  const [savingBid, setSavingBid] = useState<string | null>(null)
  const [priorityDrafts, setPriorityDrafts] = useState<Record<string, string>>({})
  const [bidError, setBidError] = useState('')
  const busy = useRef(false)

  const send = async (id: string, action: () => Promise<ApiResult<CommandResult>>) => {
    setSavingBid(id)
    setBidError('')
    const result = await action()
    setSavingBid(null)
    if (result.kind === 'failure') {
      setBidError(result.message)
      return false
    }
    await refreshNow()
    return true
  }
  const removeSale = async (key: string, listing: StandListing) => {
    if (busy.current) return
    setConfirmBidCancel(null)
    setBidError('')
    if (removeConfirmation !== key) return setRemoveConfirmation(key)
    busy.current = true
    setRemoving(true)
    const result = await api.removeStandListing(listing)
    setRemoving(false)
    busy.current = false
    if (result.kind === 'failure') return setBidError(result.message)
    setRemoveConfirmation(null)
    await refreshNow()
  }
  const cancelBid = async (id: string, bid: StandBid) => {
    if (busy.current || savingBid) return
    setRemoveConfirmation(null)
    setBidError('')
    if (confirmBidCancel !== id) return setConfirmBidCancel(id)
    busy.current = true
    if (await send(id, () => api.saveBid(id, bid.price, bid.quantity, bid.minimumQuality || 0, true))) setConfirmBidCancel(null)
    busy.current = false
  }
  const dropDraft = (id: string) =>
    setPriorityDrafts((previous) => {
      const next = { ...previous }
      delete next[id]
      return next
    })
  const saveStandPriority = async (id: string, bid: StandBid) => {
    const draft = priorityDrafts[id]
    if (draft === undefined || busy.current) return
    const priority = draft === '' ? null : Number(draft)
    if (priority === (bid.priorityOverride ?? null)) return
    busy.current = true
    if (await send(id, () => api.saveBid(id, bid.price, bid.quantity, bid.minimumQuality || 0, false, priority, { editField: 'priorityOverride', value: priority, bidRevision: bid.revision || 0 })))
      dropDraft(id)
    busy.current = false
  }

  return (
    <AccountScreenScaffold title={`Inspect stand · ${occupancy.total}/16`} onRefresh={() => void refreshNow()}>
      <div className="flex flex-col gap-4 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold text-amber-500">Items for sale · {occupancy.sales}/16 slots</h2>
          <span className={`text-xs font-semibold ${merchant?.standOpen ? 'text-emerald-400' : 'text-red-400'}`}>
            {merchant?.standOpen === true ? 'Stand open' : merchant?.standOpen === false ? 'Stand closed' : 'Stand status unknown'}
          </span>
        </div>
        {[
          { queued: false, rows: saleRows.filter((row) => row.occupied) },
          { queued: true, rows: saleRows.filter((row) => !row.occupied) },
        ]
          .filter((group) => !group.queued || group.rows.length)
          .map((group) => (
            <section key={String(group.queued)} aria-label={group.queued ? 'Queued sales for stand' : 'Items for sale'} className="flex flex-col gap-2">
              {group.queued && <h2 className="text-base font-semibold text-amber-500">Queued sales for stand</h2>}
              {group.rows.length ? (
                group.rows.map(({ configured, liveEntry, status, editable, key }) => {
                  const meta = liveEntry?.meta || catalogFor(configured.item.name)?.meta
                  const item = liveEntry?.item || configured.item
                  const name = String(meta?.definition.name || catalogFor(configured.item.name)?.name || configured.item.name)
                  const level = Number(liveEntry?.item.level ?? configured.item.level) || 0
                  const statType = liveEntry?.item.stat_type || configured.item.stat_type
                  return (
                    <div key={key} role="group" aria-label={`Sale ${name}`} className="flex flex-wrap items-center gap-3 rounded border border-amber-800 p-2">
                      <ItemTile label={`Inspect ${name}`} className="overflow-hidden border-amber-900/70" onTap={() => setInspecting(configured.item)} onLongPress={() => setSuggesting(item)}>
                        <SpriteIcon sprite={meta?.sprite ?? catalogFor(configured.item.name)?.sprite} size={58} />
                        {level > 0 && <span className="absolute left-1 top-1 z-10 rounded bg-black/80 px-1 font-mono text-[9px] font-semibold text-emerald-300">+{level}</span>}
                        {statType && <span className={`absolute right-1 top-1 z-10 rounded px-1 font-mono text-[8px] uppercase ring-1 ${statBadgeClass(String(statType))}`}>{String(statType)}</span>}
                        <MluckClover item={item} />
                        <span className="absolute bottom-1 left-1 z-10 rounded bg-black/80 px-1 font-mono text-[9px] text-amber-200">
                          {Math.max(1, Number(liveEntry?.item.q || configured.quantity || configured.item.q || 1))}
                        </span>
                      </ItemTile>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {name}
                        {meta && (meta.upgradeable || meta.compoundable) ? ` +${configured.item.level || 0}` : ''}
                      </span>
                      {status !== 'Queued' && (
                        <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase ${status === 'Live' ? 'border-emerald-700 text-emerald-400' : 'border-rose-800 text-rose-400'}`}>{status}</span>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`Edit sale price for ${configured.item.name}`}
                        className="font-mono text-amber-500"
                        disabled={!editable}
                        onClick={() => setEditing(editing === key ? null : key)}
                      >
                        {Number(liveEntry?.item.price || configured.price || 0).toLocaleString()}g
                      </Button>
                      {editable && (
                        <Button size="sm" variant="outline" aria-label={`Remove ${name} from stand`} title="Remove from stand" disabled={removing || !!savingBid} onClick={() => void removeSale(key, configured)} className="text-rose-500">
                          {removing && removeConfirmation === key ? 'Removing…' : removeConfirmation === key ? 'Really remove?' : 'Remove'} <X className="h-4 w-4" />
                        </Button>
                      )}
                      {editing === key && (
                        <div className="w-full">
                          {/* party-inventory-panels.tsx onStandEdit: same listing (id, bank source), current price and quantity. */}
                          <StandListingForm
                            item={configured.item}
                            meta={catalogFor(configured.item.name)?.meta}
                            existing={configured}
                            onCancel={() => setEditing(null)}
                            onSubmit={async ({ price, quantity, markAll }) => {
                              const result = await api.markForStand(configured.item, configured.slot, price, { id: configured.id, bankPack: configured.bankPack, quantity, markAll })
                              if (result.kind === 'failure') return result.message
                              setEditing(null)
                              await refreshNow()
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })
              ) : (
                <p className="text-sm text-muted-foreground">No sale items are occupying stand slots.</p>
              )}
            </section>
          ))}

        <section aria-label="Buy orders" className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-violet-400">Buy orders · {occupancy.buys}/16 slots</h2>
          {bidError && (
            <p role="alert" className="text-sm text-destructive">
              {bidError}
            </p>
          )}
          {replacement.dialog}
          {buyRows.map(({ key, id, bid, offer, observed, level, price, quantity }) => {
            const item = catalogFor(id)
            const name = item?.name || id
            return (
              <div key={key} role="group" aria-label={`Buy order ${name}`} className="relative flex flex-col gap-2 rounded border border-violet-800 p-3">
                <button type="button" onClick={() => setInspecting({ name: id, level })} className="flex items-center gap-3 pr-12 text-left">
                  <SpriteIcon sprite={item?.sprite || item?.meta?.sprite} size={48} />
                  <span>
                    {name} +{level}
                  </span>
                </button>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">{(bid?.quantity ?? quantity).toLocaleString()} wanted</span>
                  <Button size="sm" variant="outline" disabled={!bid} aria-label={`Edit buy price for ${name}`} onClick={() => setEditingBuy({ name: id, level })} className="font-mono text-violet-400">
                    {price.toLocaleString()}g
                  </Button>
                </div>
                {bid && observed && Number(observed.item.q || 1) !== bid.quantity && <p className="text-sm text-muted-foreground">Native batch: {Number(observed.item.q || 1).toLocaleString()}</p>}
                {bid && (
                  <label className="flex items-center gap-2 text-xs">
                    Priority
                    <WtbPriorityInput
                      className="h-8 w-24 font-mono"
                      value={priorityDrafts[id] ?? (bid.priorityOverride == null ? '' : String(bid.priorityOverride))}
                      disabled={!!savingBid}
                      onChange={(value) => setPriorityDrafts((previous) => ({ ...previous, [id]: value }))}
                      onBlur={() => void saveStandPriority(id, bid)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur()
                        if (event.key === 'Escape') dropDraft(id)
                      }}
                    />
                  </label>
                )}
                {offer?.auto && (
                  <span title={autoStandExplanation} className="absolute right-3 top-3 rounded border border-cyan-600 px-2 text-xs text-cyan-400">
                    Auto
                  </span>
                )}
                {bid && (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <WtbPreference
                      label="Use stand"
                      description={standBuyExplanation}
                      checked={bid.useStandSlot === true}
                      disabled={!!savingBid}
                      onChange={(useStandSlot) =>
                        void replacement.save((replaceStandEntry) => api.saveBid(id, bid.price, bid.quantity, bid.minimumQuality || 0, false, bid.priorityOverride, { useStandSlot, replaceStandEntry, preferencesOnly: true }))
                      }
                    />
                    <Button size="sm" variant="outline" className="text-rose-500" disabled={!!savingBid || removing} onClick={() => void cancelBid(id, bid)}>
                      {savingBid === id ? 'Saving…' : confirmBidCancel === id ? 'Really cancel?' : 'Cancel'}
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
          {!buyRows.length && <p className="text-sm text-muted-foreground">No stand buy orders.</p>}
        </section>
      </div>

      {editingBuy && (
        <WtbDialog
          item={editingBuy}
          meta={catalogFor(editingBuy.name)?.meta}
          catalogFor={catalogFor}
          buyable={state.merchantCatalog?.buyable ?? []}
          history={state.standPriceHistory?.[editingBuy.name]}
          existing={bids[editingBuy.name]}
          onClose={() => setEditingBuy(null)}
        />
      )}
      {inspecting && (
        <Sheet open onOpenChange={(value) => !value && setInspecting(null)}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-4">
            <ItemDetailBrowser rootItemId={inspecting.name} rootLevel={inspecting.level ?? 0} rootStatType={inspecting.stat_type} catalog={state.merchantCatalog} monsters={state.bestiaryCatalog} />
          </SheetContent>
        </Sheet>
      )}
      {suggesting && (
        <Sheet open onOpenChange={(value) => !value && setSuggesting(null)}>
          <SheetContent side="bottom" aria-label="Suggested price" className="max-h-[85vh] overflow-y-auto p-4 font-mono text-[11px] leading-relaxed">
            <SuggestedPriceDetails entry={{ slot: -1, item: suggesting, meta: catalogFor(suggesting.name)?.meta }} buyable={state.merchantCatalog?.buyable ?? []} observed={state.standPriceHistory?.[suggesting.name]} />
          </SheetContent>
        </Sheet>
      )}
    </AccountScreenScaffold>
  )
}
