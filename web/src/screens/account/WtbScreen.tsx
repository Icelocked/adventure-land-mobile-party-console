import { useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { usePartyApi, useDynamicState, useRefreshDynamicStateNow, useConfigLoaded } from '@/data/PartyDataProvider'
import { ConfigLoadingNote } from '@/components/ConfigLoadingNote'
import { SpriteIcon } from '@/components/SpriteIcon'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { WtbDialog, WtbPreference, autoStandExplanation, higherLevelExplanation, standBuyExplanation, useWtbReplacement } from '@/components/Wtb'
import { ItemDetailBrowser } from '@/screens/itemdetail/ItemDetailBrowser'
import { useCatalogLookup } from '@/lib/catalogLookup'
import { AccountScreenScaffold } from './AccountScreenScaffold'
import type { ApiResult, CommandResult } from '@/api/partyApi'
import type { CatalogItem, Item, StandBid } from '@/models'

const ACTIVE_OPEN_KEY = 'adventure-land-active-wtb-open'

/** stand-sheet.tsx "Active WTB orders": filter with visible/total, each
 *  order's inspect, inline quantity/price/priority (single-field edits with
 *  the bid revision), Use stand / Accept higher levels, the Auto badge and
 *  native-stand problem, and a two-step cancel; "New WTB order" picks an
 *  item for the WTB dialog. */
export function WtbScreen() {
  const api = usePartyApi()
  const state = useDynamicState()
  const refreshNow = useRefreshDynamicStateNow()
  const configLoaded = useConfigLoaded()
  const catalogFor = useCatalogLookup(state.merchantCatalog)
  const replacement = useWtbReplacement(catalogFor)
  const [picking, setPicking] = useState(false)
  const [dialog, setDialog] = useState<Item | null>(null)
  const [inspecting, setInspecting] = useState<Item | null>(null)
  const [filter, setFilter] = useState('')
  const [open, setOpen] = useState(() => {
    try {
      return window.localStorage.getItem(ACTIVE_OPEN_KEY) !== 'false'
    } catch {
      return true
    }
  })
  const [savingBid, setSavingBid] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null)
  const [bidError, setBidError] = useState('')
  const cancelling = useRef(false)

  const catalog = state.merchantCatalog?.allItems ?? []
  const bids = state.standBids
  const nativeOffers = Object.values(state.nativeStand?.offers ?? {})
  const visibleBids = Object.entries(bids).filter(([itemId]) => `${catalogFor(itemId)?.name || ''} ${itemId}`.toLowerCase().includes(filter.trim().toLowerCase()))

  const send = async (itemId: string, action: () => Promise<ApiResult<CommandResult>>) => {
    setSavingBid(itemId)
    setBidError('')
    const result = await action()
    setSavingBid(null)
    if (result.kind === 'failure') {
      setBidError(result.message)
      return result.message
    }
    await refreshNow()
    return null
  }
  const cancelBid = async (itemId: string, bid: StandBid) => {
    if (cancelling.current || savingBid) return
    setBidError('')
    if (confirmCancel !== itemId) return setConfirmCancel(itemId)
    cancelling.current = true
    const failure = await send(itemId, () => api.saveBid(itemId, bid.price, bid.quantity, bid.minimumQuality || 0, true))
    if (!failure) setConfirmCancel(null)
    cancelling.current = false
  }

  return (
    <AccountScreenScaffold title="WTB orders" onRefresh={() => void refreshNow()}>
      <div className="mx-3 mb-3 rounded-md border border-violet-900/70 p-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            aria-expanded={open}
            onClick={() =>
              setOpen((value) => {
                try {
                  window.localStorage.setItem(ACTIVE_OPEN_KEY, String(!value))
                } catch {
                  /* ignored */
                }
                return !value
              })
            }
            className="flex items-center gap-1 font-mono text-xs uppercase text-violet-400"
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Active WTB orders ({Object.keys(bids).length})
          </button>
          <Button size="sm" variant="outline" disabled={!configLoaded} onClick={() => setPicking(true)}>
            New WTB order
          </Button>
        </div>
        <ConfigLoadingNote />
        {bidError && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {bidError}
          </p>
        )}
        {replacement.dialog}
        {open && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2">
              <Input aria-label="Filter WTB orders" placeholder="Filter WTB orders by item name..." value={filter} onChange={(event) => setFilter(event.target.value)} className="min-w-0 flex-1" />
              <span className="shrink-0 text-xs tabular-nums text-violet-400">
                {visibleBids.length} / {Object.keys(bids).length}
              </span>
              {filter && (
                <Button size="sm" variant="outline" onClick={() => setFilter('')}>
                  Clear
                </Button>
              )}
            </div>
            {visibleBids.length ? (
              visibleBids.map(([itemId, bid]) => {
                const item = catalogFor(itemId)
                const name = item?.name || itemId
                const autoLive = nativeOffers.some((offer) => offer.itemId === itemId && offer.auto && offer.phase === 'live')
                const problem = state.nativeStand?.problems[itemId] || nativeOffers.find((offer) => offer.itemId === itemId)?.problem
                const leveled = !!(item?.upgradeable || item?.compoundable)
                return (
                  <div key={itemId} role="group" aria-label={`WTB ${name}`} className="flex flex-wrap items-center gap-2 rounded border border-violet-900 p-2">
                    <button
                      type="button"
                      aria-label={`Inspect ${name}`}
                      onClick={() => setInspecting({ name: itemId, level: bid.minimumQuality || 0 })}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <SpriteIcon sprite={item?.sprite} size={32} />
                      <span className="min-w-0 flex-1 truncate text-xs">
                        {name}
                        {leveled ? ` · +${bid.minimumQuality || 0} minimum` : ''}
                      </span>
                    </button>
                    <ActiveWtbFields
                      name={name}
                      bid={bid}
                      disabled={!!savingBid}
                      onEditPrice={() => setDialog({ name: itemId, level: bid.minimumQuality || 0 })}
                      onSave={(field, value) =>
                        send(itemId, () =>
                          api.saveBid(itemId, field === 'price' ? value! : bid.price, field === 'quantity' ? value! : bid.quantity, bid.minimumQuality || 0, false, field === 'priority' ? value : bid.priorityOverride, {
                            editField: field === 'priority' ? 'priorityOverride' : field,
                            value,
                            bidRevision: bid.revision || 0,
                          }),
                        )
                      }
                    />
                    <div className="flex shrink-0 items-center gap-2">
                      <WtbPreference
                        label="Use stand"
                        description={standBuyExplanation}
                        checked={bid.useStandSlot === true}
                        onChange={(useStandSlot) =>
                          void replacement.save((replaceStandEntry) =>
                            api.saveBid(itemId, bid.price, bid.quantity, bid.minimumQuality || 0, false, bid.priorityOverride, { useStandSlot, replaceStandEntry, preferencesOnly: true }),
                          )
                        }
                      />
                      {autoLive && (
                        <span title={autoStandExplanation} className="rounded border border-cyan-600 px-2 text-xs text-cyan-400">
                          Auto
                        </span>
                      )}
                    </div>
                    {(leveled || problem) && (
                      <div className="order-last grid w-full gap-2 border-t border-violet-900 pt-2">
                        {leveled && (
                          <WtbPreference
                            label="Accept higher levels"
                            description={higherLevelExplanation}
                            checked={bid.acceptHigherLevels !== false}
                            onChange={(acceptHigherLevels) =>
                              void replacement.save(() => api.saveBid(itemId, bid.price, bid.quantity, bid.minimumQuality || 0, false, bid.priorityOverride, { acceptHigherLevels, preferencesOnly: true }))
                            }
                          />
                        )}
                        {problem && <p className="text-xs text-amber-500">{problem}</p>}
                      </div>
                    )}
                    <Button size="sm" variant="outline" className="text-rose-500" disabled={!!savingBid} onClick={() => void cancelBid(itemId, bid)}>
                      {savingBid === itemId ? 'Saving…' : confirmCancel === itemId ? 'Really cancel?' : 'Cancel'}
                    </Button>
                  </div>
                )
              })
            ) : (
              <span className="text-xs text-muted-foreground">{Object.keys(bids).length ? 'No WTB orders match this filter.' : 'No active orders.'}</span>
            )}
          </div>
        )}
      </div>

      {picking && (
        <ItemPicker
          catalog={catalog}
          onCancel={() => setPicking(false)}
          onPick={(id) => {
            setPicking(false)
            setDialog({ name: id, level: state.standBids[id]?.minimumQuality || 0 })
          }}
        />
      )}
      {dialog && (
        <WtbDialog
          item={dialog}
          meta={catalogFor(dialog.name)?.meta}
          catalogFor={catalogFor}
          buyable={state.merchantCatalog?.buyable ?? []}
          history={state.standPriceHistory?.[dialog.name]}
          existing={state.standBids[dialog.name]}
          onClose={() => setDialog(null)}
        />
      )}
      {inspecting && (
        <Sheet open onOpenChange={(value) => !value && setInspecting(null)}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-4">
            <ItemDetailBrowser rootItemId={inspecting.name} rootLevel={inspecting.level ?? 0} catalog={state.merchantCatalog} monsters={state.bestiaryCatalog} />
          </SheetContent>
        </Sheet>
      )}
    </AccountScreenScaffold>
  )
}

type WtbField = 'quantity' | 'price' | 'priority'
const FIELD_LABELS = { quantity: 'Quantity', price: 'Price', priority: 'Priority' }

/** active-wtb-fields.tsx: ×qty / price / "P n" buttons; quantity and
 *  priority edit inline (Enter or blur saves, Escape cancels), price opens
 *  the WTB dialog. */
function ActiveWtbFields({ name, bid, disabled, onEditPrice, onSave }: { name: string; bid: StandBid; disabled?: boolean; onEditPrice: () => void; onSave: (field: WtbField, value: number | null) => Promise<string | null> }) {
  const [editing, setEditing] = useState<WtbField | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const current = useRef<WtbField | null>(null)
  const pending = useRef(false)
  const edit = (field: WtbField) => {
    if (pending.current) return
    current.current = field
    setEditing(field)
    setError('')
    setDraft(String((field === 'priority' ? bid.priorityOverride : bid[field]) ?? ''))
  }
  const save = async () => {
    const field = current.current
    if (!field || pending.current) return
    const value = field === 'priority' && draft === '' ? null : Number(draft)
    if (value !== null && (!Number.isSafeInteger(value) || value < (field === 'priority' ? 0 : 1) || (field === 'priority' && value > 100))) {
      setError(field === 'priority' ? 'Priority must be 0–100 or blank.' : `${FIELD_LABELS[field]} must be a positive whole number.`)
      return
    }
    pending.current = true
    setSaving(true)
    setError('')
    const failure = await onSave(field, value)
    if (failure) setError(failure)
    else {
      current.current = null
      setEditing(null)
    }
    pending.current = false
    setSaving(false)
  }
  const dimensions = 'h-8 w-20 shrink-0 rounded border px-2 text-right font-mono text-xs tabular-nums'
  return (
    <div className="relative flex shrink-0 items-center gap-1">
      {(['quantity', 'price', 'priority'] as const).map((field) =>
        editing === field ? (
          <Input
            key={field}
            autoFocus
            aria-label={`${FIELD_LABELS[field]} for ${name}`}
            title="Enter or click away to save; Escape to cancel"
            inputMode="numeric"
            placeholder={field === 'priority' ? 'Default' : undefined}
            value={draft}
            disabled={disabled || saving}
            onFocus={(event) => event.target.select()}
            onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ''))}
            onBlur={() => void save()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void save()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                current.current = null
                setEditing(null)
                setError('')
              }
            }}
            className={dimensions}
          />
        ) : (
          <button
            key={field}
            type="button"
            aria-label={`Edit ${FIELD_LABELS[field].toLowerCase()} for ${name}`}
            title={FIELD_LABELS[field]}
            disabled={disabled || saving}
            onClick={() => (field === 'price' ? onEditPrice() : edit(field))}
            className={`${dimensions} truncate border-violet-600 text-violet-300 disabled:opacity-50`}
          >
            {field === 'quantity' ? `×${bid.quantity.toLocaleString()}` : field === 'price' ? `${bid.price.toLocaleString()}g` : `P ${bid.priorityOverride ?? 'Default'}`}
          </button>
        ),
      )}
      {error && (
        <span role="alert" className="absolute right-0 top-full z-10 mt-1 max-w-72 rounded border border-rose-700 bg-background p-2 text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  )
}

function ItemPicker({ catalog, onCancel, onPick }: { catalog: CatalogItem[]; onCancel: () => void; onPick: (id: string) => void }) {
  const [search, setSearch] = useState('')
  const filtered = catalog.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())).slice(0, 100)

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border p-3">
        <span className="text-sm font-medium">Choose an item</span>
        <Button variant="link" size="xs" className="text-muted-foreground" onClick={onCancel}>
          Close
        </Button>
      </div>
      <div className="p-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items..." />
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {filtered.map((item) => (
          <button key={item.id} onClick={() => onPick(item.id)} className="flex w-full items-center gap-2.5 rounded-md p-2 text-left hover:bg-accent">
            <SpriteIcon sprite={item.sprite} size={28} />
            <span className="text-sm">{item.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
