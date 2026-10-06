import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePartyApi, useCharacterDiagnosticsMap, useCharacters, useDynamicState, useRefreshDynamicStateNow, useDomainInterest } from '@/data/PartyDataProvider'
import { useCatalogLookup } from '@/lib/catalogLookup'
import { useClock } from '@/lib/duration'
import {
  blacklistRecord,
  dealValuesByItem,
  filterAlData,
  filterBuyOrders,
  groupAlData,
  groupPonty,
  ownedCounts,
  ownedKey,
  ownedSource,
  priceComparison,
  type AlDataBuyOrder,
  type AlDataListing,
  type AlDataPublicTrade,
  type BlacklistRecord,
  type PontyGroup,
  type PontyListing,
} from '@/lib/market'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { SpriteIcon } from '@/components/SpriteIcon'
import { StandListingForm } from '@/components/StandListingForm'
import { WtbDialog } from '@/components/Wtb'
import { ItemDetailBrowser } from '@/screens/itemdetail/ItemDetailBrowser'
import { AccountScreenScaffold } from './AccountScreenScaffold'
import type { ApiResult, CommandResult } from '@/api/partyApi'
import type { InventoryEntry, Item } from '@/models'

type Tab = 'wts' | 'wtb' | 'classifieds' | 'ponty'
const ageLabel = (age: number) => (age < 3600 ? `${age}s` : `${Math.floor(age / 3600)}h`)

/** Inline Yes/Cancel confirmation. */
function Confirm({ title, text, busy, error, onYes, onCancel }: { title: string; text: string; busy: boolean; error?: string | null; onYes: () => void; onCancel: () => void }) {
  return (
    <div role="group" aria-label={title} className="w-full rounded-md border border-cyan-700/60 p-2.5">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{text}</p>
      {error && (
        <p role="alert" className="mt-1 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" disabled={busy} onClick={onYes}>
          {busy ? 'Queuing…' : 'Yes'}
        </Button>
      </div>
    </div>
  )
}

/** Market: ALData/Ponty status, Live WTS / Live WTB /
 *  Classifieds / Ponty tabs with counts, one search, the WTS filters (deals,
 *  bad deals, affordable with bank gold, blacklisted), grouped listings with
 *  deal colouring and stale dimming, confirmed buys split across grouped
 *  listings, "Make WTB" for stale rows, selling into live WTB offers (or
 *  "List" at the WTB price when stale), classifieds' Add to WTB / Add to
 *  stand, and Ponty's grouped lots. Every row inspects its item. */
export function MarketScreen() {
  useDomainInterest('market')
  const api = usePartyApi()
  const state = useDynamicState()
  const characters = useCharacters()
  const diagnostics = useCharacterDiagnosticsMap()
  const refreshNow = useRefreshDynamicStateNow()
  const navigate = useNavigate()
  const catalogFor = useCatalogLookup(state.merchantCatalog)
  const now = useClock()
  const [tab, setTab] = useState<Tab>('wts')
  const [query, setQuery] = useState('')
  const [showDealsOnly, setShowDealsOnly] = useState(false)
  const [hideBadDeals, setHideBadDeals] = useState(false)
  const [hideUnaffordable, setHideUnaffordable] = useState(false)
  const [hideBlacklisted, setHideBlacklisted] = useState(true)
  const [hideUnowned, setHideUnowned] = useState(false)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{ key: string; message: string } | null>(null)
  const [inspecting, setInspecting] = useState<Item | null>(null)
  // Source label for the item-details header.
  const [inspectSource, setInspectSource] = useState('')
  const [wtbItem, setWtbItem] = useState<Item | null>(null)
  const [listing, setListing] = useState<{ key: string; entry: InventoryEntry; bankPack?: string; price: number; quantity: number } | null>(null)

  const merchantName = state.merchantCharacter ?? undefined
  const merchantItems = (merchantName ? characters[merchantName]?.inventory?.items : undefined) ?? []
  const bankPacks = state.bank?.packs ?? {}
  const catalog = state.merchantCatalog?.allItems ?? []
  const nameFor = (id: string) => catalogFor(id)?.name
  const aldata = (state.aldata ?? {}) as { listings?: unknown[]; buyOrders?: unknown[]; trades?: unknown[]; auth?: string; error?: string | null; merchantsUpdatedAt?: number }
  const ponty = (state.ponty ?? {}) as { listings?: unknown[]; error?: string | null }
  const allAlData = (aldata.listings ?? []) as AlDataListing[]
  const allBuyOrders = ((aldata.buyOrders ?? []) as AlDataBuyOrder[]).filter((order) => order.buyer !== merchantName)
  const blacklist = (state.merchantBlacklist ?? {}) as Record<string, BlacklistRecord>
  const bankGold = Number(state.bank?.gold ?? state.bankGold ?? 0)
  const values = useMemo(() => dealValuesByItem(catalog, state.merchantCatalog?.buyable ?? []), [catalog, state.merchantCatalog?.buyable])
  const listingValue = (entry: AlDataListing) => values.get(entry.item.name) || 1
  const grouped = useMemo(() => groupAlData(allAlData), [allAlData])
  const wts = filterAlData(grouped, query, now, nameFor).filter(
    (entry) =>
      (!showDealsOnly || entry.price < listingValue(entry) * 0.5) &&
      (!hideBadDeals || !(entry.price > listingValue(entry) * 2)) &&
      (!hideUnaffordable || entry.price <= bankGold) &&
      (!hideBlacklisted || !blacklistRecord(blacklist, !!state.autoBlacklistMerchants, now, entry.seller, entry.serverRegion, entry.serverIdentifier)),
  )
  const owned = ownedCounts(merchantItems, bankPacks)
  const buyOrders = filterBuyOrders(allBuyOrders, query, now, hideUnowned, owned, nameFor)
  const bankWtb = buyOrders.filter((order) => owned.has(ownedKey(order.item)))
  const ownOwner = merchantName && diagnostics[merchantName]?.owner != null ? String(diagnostics[merchantName]?.owner) : ''
  const publicTrades = ((aldata.trades ?? []) as AlDataPublicTrade[]).filter((owner) => String(owner.owner) !== ownOwner).flatMap((owner) => (owner.listings || []).map((entry) => ({ owner, listing: entry })))
  const classifieds = publicTrades.filter(({ owner, listing: entry }) =>
    `${nameFor(entry.name) || ''} ${entry.name} ${owner.label || ''} ${owner.characters?.join(' ') || ''}`.toLowerCase().includes(query.trim().toLowerCase()),
  )
  const pontyRows = groupPonty((ponty.listings ?? []) as PontyListing[], query, now, nameFor)

  const run = async (key: string, action: () => Promise<ApiResult<CommandResult> | string | null>) => {
    setBusy(key)
    setRowError(null)
    const result = await action()
    setBusy(null)
    const message = typeof result === 'string' ? result : result && result.kind === 'failure' ? result.message : null
    if (message) return setRowError({ key, message })
    setConfirming(null)
    await refreshNow()
  }
  // Split the purchase quantity across the grouped listings.
  const buyGrouped = async (entry: AlDataListing, quantity: number) => {
    let remaining = quantity
    for (const physical of entry.groupedListings || [entry]) {
      if (remaining <= 0) break
      const purchasing = Math.min(remaining, Math.max(1, Number(physical.quantity) || 1))
      const result = await api.buyAlData(physical as unknown as Record<string, unknown>, purchasing)
      if (result.kind === 'failure') return result.message
      remaining -= purchasing
    }
    return remaining > 0 ? `Only ${quantity - remaining} of ${quantity} listings could be queued` : null
  }
  const listFor = (key: string, item: Item, price: number, quantity: number) => {
    const source = ownedSource(item, merchantItems, bankPacks)
    if (!source) return
    setListing({ key, entry: source.entry, bankPack: source.bankPack, price, quantity: Math.max(1, Math.min(quantity, Number(source.entry.item.q || 1))) })
  }
  const listingForm = (key: string) =>
    listing?.key === key ? (
      <div className="w-full">
        <StandListingForm
          item={listing.entry.item}
          meta={catalogFor(listing.entry.item.name)?.meta}
          existing={{
            id: state.standListings.find((mark) => mark.bankPack === listing.bankPack && mark.slot === listing.entry.slot && mark.item.name === listing.entry.item.name)?.id,
            price: listing.price,
            quantity: listing.quantity,
          }}
          onCancel={() => setListing(null)}
          onSubmit={async ({ price, quantity, markAll }) => {
            const existing = state.standListings.find((mark) => mark.bankPack === listing.bankPack && mark.slot === listing.entry.slot && mark.item.name === listing.entry.item.name)
            const result = await api.markForStand(listing.entry.item, listing.entry.slot, price, { id: existing?.id, bankPack: listing.bankPack, quantity, markAll })
            if (result.kind === 'failure') return result.message
            setListing(null)
            await refreshNow()
          }}
        />
      </div>
    ) : null
  const itemLabel = (item: Item) => {
    const entry = catalogFor(item.name)
    return `${entry?.name || item.name}${entry && (entry.upgradeable || entry.compoundable) ? ` +${item.level || 0}` : ''}`
  }

  const tabs: [Tab, string][] = [
    ['wts', `Live WTS (${allAlData.length})`],
    ['wtb', `Live WTB (${allBuyOrders.length})`],
    ['classifieds', `Classifieds (${publicTrades.length})`],
    ['ponty', `Ponty (${ponty.listings?.length || 0})`],
  ]
  const check = (label: string, checked: boolean, onChange: (value: boolean) => void) => (
    <label className="flex items-center gap-2 rounded border border-border px-2 py-1.5 text-xs">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4" />
      {label}
    </label>
  )

  return (
    <AccountScreenScaffold title="Market" onRefresh={() => void refreshNow()}>
      <div className="flex flex-col gap-3 p-3">
        <p className="text-xs text-muted-foreground">Browse live offers and player-published classifieds. Public browsing requires no ALData key.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/market/settings')}>
            Marketplace settings
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/wtb')}>
            Manage WTB orders{Object.keys(state.standBids).length ? ` (${Object.keys(state.standBids).length})` : ''}
          </Button>
        </div>
        {(aldata.auth !== 'CORRECT' || aldata.error || ponty.error || !aldata.merchantsUpdatedAt) && (
          <div aria-live="polite" className="rounded border border-slate-600 p-3 text-sm">
            {aldata.error || ponty.error ? (
              <p className="text-amber-500">Market data unavailable: {aldata.error || ponty.error}. Cached offers may be stale. Retry when ALData is available.</p>
            ) : !aldata.merchantsUpdatedAt ? (
              <p>Loading market data from ALData…</p>
            ) : null}
            {aldata.auth !== 'CORRECT' && (
              <div className="mt-1 flex flex-wrap items-center gap-3 text-red-400">
                <p>ALData publishing is not configured</p>
                <Button size="sm" variant="outline" onClick={() => navigate('/settings')}>
                  Go to setup
                </Button>
              </div>
            )}
          </div>
        )}
        <div role="tablist" className="flex flex-wrap gap-2">
          {tabs.map(([id, label]) => (
            <Button key={id} role="tab" aria-selected={tab === id} size="sm" variant={tab === id ? 'default' : 'outline'} onClick={() => setTab(id)}>
              {label}
            </Button>
          ))}
        </div>
        <Input aria-label="Search market" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search item, seller, server, or map…" />
        {tab === 'wts' && (
          <div className="flex flex-wrap gap-2">
            {check('Show deals only', showDealsOnly, setShowDealsOnly)}
            {check('Hide bad deals', hideBadDeals, setHideBadDeals)}
            {check('Hide unaffordable', hideUnaffordable, setHideUnaffordable)}
            {check('Hide blacklisted merchants', hideBlacklisted, setHideBlacklisted)}
          </div>
        )}
        {tab === 'wtb' && <div className="flex flex-wrap gap-2">{check('Hide unowned', hideUnowned, setHideUnowned)}</div>}

        {tab === 'wts' &&
          (!wts.length ? (
            <p className="text-sm text-muted-foreground">
              {showDealsOnly
                ? 'No listings are currently below 50% of their suggested price.'
                : hideBadDeals
                  ? 'No matching listings remain after hiding prices over 100% above suggested.'
                  : hideUnaffordable
                    ? `No matching listings are affordable with ${bankGold.toLocaleString()} bank gold.`
                    : 'No matching live WTS listings.'}
            </p>
          ) : (
            wts.map((entry) => {
              const item = catalogFor(entry.item.name)
              const key = entry.key
              const stackable = Number(item?.meta?.definition?.s || 1) > 1
              const multiple = entry.quantity > 1
              const age = Math.max(0, Math.floor((now - entry.seenAt) / 1000))
              const fresh = age <= 120 && entry.serverIdentifier !== 'PVP'
              const suggested = listingValue(entry)
              const { deal, badDeal, comparison } = priceComparison(entry.price, suggested)
              const quantity = Number(quantities[key] || 1)
              return (
                <div key={key} role="group" aria-label={`WTS ${itemLabel(entry.item)} from ${entry.seller}`} className={`flex flex-wrap items-center gap-2 rounded border border-cyan-950 p-2 ${fresh ? '' : 'opacity-65'}`}>
                  <button type="button" onClick={() => {
                    setInspectSource(`${entry.seller}'s ALData listing`)
                    setInspecting(entry.item)
                  }} className="flex min-w-0 flex-1 basis-64 items-center gap-3 text-left">
                    <SpriteIcon sprite={item?.sprite} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{itemLabel(entry.item)}</span>
                      <span className="block font-mono text-[10px] text-muted-foreground">
                        {entry.seller} · {entry.serverRegion} {entry.serverIdentifier} · {entry.map} · seen {ageLabel(age)} ago
                        {multiple ? ` · ${entry.quantity} available${stackable ? '' : ' · not stackable'}` : ''}
                      </span>
                    </span>
                  </button>
                  <span title={`Suggested price: ${suggested.toLocaleString()}g · ${comparison}`} className={`whitespace-nowrap font-mono text-xs ${deal ? 'font-semibold text-emerald-400' : badDeal ? 'font-semibold text-rose-400' : 'text-amber-500'}`}>
                    {entry.price.toLocaleString()}g <span className="text-[9px] uppercase">{comparison}</span>
                  </span>
                  {fresh ? (
                    <>
                      {multiple && (
                        <>
                          <Input
                            aria-label={`Quantity of ${entry.item.name}`}
                            inputMode="numeric"
                            value={quantities[key] || '1'}
                            onChange={(event) => setQuantities((old) => ({ ...old, [key]: event.target.value.replace(/[^0-9]/g, '') }))}
                            className="h-8 w-16 font-mono text-xs"
                          />
                          <Button size="sm" variant="outline" disabled={busy === key} onClick={() => setQuantities((old) => ({ ...old, [key]: String(entry.quantity) }))}>
                            All
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        disabled={busy === key}
                        onClick={() => {
                          if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > entry.quantity) return
                          setRowError(null)
                          setConfirming(key)
                        }}
                      >
                        {busy === key ? 'Queuing…' : 'Buy'}
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setWtbItem({ name: entry.item.name, level: Number(entry.item.level || 0) })}>
                      Make WTB
                    </Button>
                  )}
                  {confirming === key && (
                    <Confirm
                      title="Confirm marketplace purchase"
                      text={`Really buy ${quantity.toLocaleString()} ${nameFor(entry.item.name) || entry.item.name} for ${(quantity * entry.price).toLocaleString()}g?`}
                      busy={busy === key}
                      error={rowError?.key === key ? rowError.message : null}
                      onCancel={() => setConfirming(null)}
                      onYes={() => void run(key, () => buyGrouped(entry, quantity))}
                    />
                  )}
                </div>
              )
            })
          ))}

        {tab === 'wtb' && (
          <>
            <div className="rounded border border-emerald-900 p-2 text-xs text-emerald-500">
              {bankWtb.length} offer{bankWtb.length === 1 ? '' : 's'} match exact items currently held by {merchantName || 'the merchant'} or recorded in the bank.
            </div>
            {buyOrders.length ? (
              buyOrders.map((order) => {
                const item = catalogFor(order.item.name)
                const key = order.key
                const have = owned.get(ownedKey(order.item)) || 0
                const source = ownedSource(order.item, merchantItems, bankPacks)
                const age = Math.max(0, Math.floor((now - order.seenAt) / 1000))
                const fresh = age <= 120 && order.serverIdentifier !== 'PVP'
                const maximum = Math.min(have, order.quantity)
                const quantity = Number(quantities[key] || 1)
                return (
                  <div key={key} role="group" aria-label={`WTB ${itemLabel(order.item)} from ${order.buyer}`} className={`flex flex-wrap items-center gap-2 rounded border p-2 ${have ? 'border-emerald-900' : 'border-violet-950'} ${fresh ? '' : 'opacity-60'}`}>
                    <button type="button" onClick={() => {
                      setInspectSource(`${order.buyer}'s live WTB`)
                      setInspecting(order.item)
                    }} className="flex min-w-0 flex-1 basis-64 items-center gap-3 text-left">
                      <SpriteIcon sprite={item?.sprite} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{`${item?.name || order.item.name}${item?.meta?.upgradeable || item?.meta?.compoundable ? ` +${Number(order.item.level) || 0}` : ''}`}</span>
                        <span className="block font-mono text-[10px] text-muted-foreground">
                          {order.buyer} · {order.serverRegion} {order.serverIdentifier} · seen {ageLabel(age)} ago · wants {order.quantity}
                        </span>
                      </span>
                    </button>
                    <span className="whitespace-nowrap font-mono text-xs text-violet-400">WTB {order.price.toLocaleString()}g</span>
                    <span className={`whitespace-nowrap font-mono text-[10px] ${have ? 'text-emerald-400' : 'text-muted-foreground'}`}>You have {have}</span>
                    {fresh && maximum > 0 ? (
                      <>
                        <Input
                          aria-label={`Quantity of ${order.item.name} to sell`}
                          inputMode="numeric"
                          value={quantities[key] || '1'}
                          onChange={(event) => setQuantities((old) => ({ ...old, [key]: event.target.value.replace(/[^0-9]/g, '') }))}
                          className="h-8 w-16 font-mono text-xs"
                        />
                        <Button size="sm" variant="outline" onClick={() => setQuantities((old) => ({ ...old, [key]: String(maximum) }))}>
                          All
                        </Button>
                        <Button
                          size="sm"
                          disabled={busy === key}
                          onClick={() => {
                            if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > maximum) return
                            setRowError(null)
                            setConfirming(key)
                          }}
                        >
                          Sell
                        </Button>
                      </>
                    ) : !fresh && source ? (
                      <Button size="sm" variant="outline" onClick={() => listFor(key, order.item, order.price, maximum)}>
                        List
                      </Button>
                    ) : (
                      <span className="font-mono text-[10px] uppercase text-muted-foreground">{!fresh ? 'Stale · no match owned' : 'No match owned'}</span>
                    )}
                    {confirming === key && (
                      <Confirm
                        title="Confirm marketplace sale"
                        text={`Really sell ${quantity.toLocaleString()} ${nameFor(order.item.name) || order.item.name} to ${order.buyer} for ${(quantity * order.price).toLocaleString()}g?`}
                        busy={busy === key}
                        error={rowError?.key === key ? rowError.message : null}
                        onCancel={() => setConfirming(null)}
                        onYes={() => void run(key, () => api.sellAlData(order as unknown as Record<string, unknown>, quantity))}
                      />
                    )}
                    {listingForm(key)}
                  </div>
                )
              })
            ) : (
              <p className="text-sm text-muted-foreground">No matching live WTB offers.</p>
            )}
          </>
        )}

        {tab === 'classifieds' &&
          (classifieds.length ? (
            classifieds.map(({ owner, listing: entry }, index) => {
              const item = catalogFor(entry.name)
              const requested: Item = { name: entry.name, level: entry.level || 0, ...(entry.p ? { p: entry.p } : {}) }
              const source = ownedSource(requested, merchantItems, bankPacks)
              const key = `${owner.owner}-${entry.name}-${index}`
              return (
                <div key={key} role="group" aria-label={`Classified ${entry.name}`} className="flex flex-wrap items-center gap-2 rounded border border-border p-2">
                  <button type="button" onClick={() => {
                    setInspectSource('Published trade intention')
                    setInspecting(requested)
                  }} className="flex min-w-0 flex-1 basis-64 items-center gap-3 text-left">
                    <SpriteIcon sprite={item?.sprite} size={40} />
                    <span>
                      <span className="block text-sm">
                        {item?.name || entry.name}
                        {entry.level ? ` +${entry.level}` : ''}
                      </span>
                      <span className="block font-mono text-[10px] text-muted-foreground">
                        {owner.label || owner.characters?.[0] || owner.owner} · {entry.note || 'Published intention'}
                      </span>
                    </span>
                  </button>
                  <span className="font-mono text-xs text-emerald-400">{entry.wts?.price ? `WTS ${entry.wts.price.toLocaleString()}g` : ''}</span>
                  <span className="font-mono text-xs text-violet-400">{entry.wtb?.price ? `WTB ${entry.wtb.price.toLocaleString()}g` : ''}</span>
                  {entry.wts?.price ? (
                    <Button size="sm" variant="outline" onClick={() => setWtbItem({ name: entry.name, level: Number(entry.level) || 0 })}>
                      Add to WTB
                    </Button>
                  ) : null}
                  {entry.wtb?.price && source ? (
                    <Button size="sm" variant="outline" disabled={state.standListings.length >= 16} onClick={() => listFor(key, requested, Number(entry.wtb?.price), Number(entry.wtb?.quantity || 1))}>
                      Add to stand
                    </Button>
                  ) : null}
                  {listingForm(key)}
                </div>
              )
            })
          ) : (
            <p className="text-sm text-muted-foreground">No published trade intentions from other owners. These classifieds are separate from live stand slots.</p>
          ))}

        {tab === 'ponty' && (
          <>
            {ponty.error && <div className="rounded border border-fuchsia-900 p-2 text-sm">Last refresh failed: {ponty.error}</div>}
            {pontyRows.length ? pontyRows.map((group) => pontyRow(group)) : <p className="text-sm text-muted-foreground">Ponty currently has no matching items.</p>}
          </>
        )}
      </div>

      {inspecting && (
        <Sheet open onOpenChange={(value) => !value && setInspecting(null)}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-4">
            <ItemDetailBrowser rootItemId={inspecting.name} rootLevel={inspecting.level ?? 0} rootStatType={inspecting.stat_type} catalog={state.merchantCatalog} monsters={state.bestiaryCatalog} context={{ character: inspectSource, slot: -1 }} />
          </SheetContent>
        </Sheet>
      )}
      {wtbItem && (
        <WtbDialog
          item={wtbItem}
          meta={catalogFor(wtbItem.name)?.meta}
          catalogFor={catalogFor}
          buyable={state.merchantCatalog?.buyable ?? []}
          history={state.standPriceHistory?.[wtbItem.name]}
          existing={state.standBids[wtbItem.name]}
          onClose={() => setWtbItem(null)}
        />
      )}
    </AccountScreenScaffold>
  )

  function pontyRow(group: PontyGroup) {
    const clock = now
    const item = catalogFor(group.item.name)
    const level = Number(group.item.level) || 0
    const requested = Number(quantities[group.key] ?? group.minimumLot ?? 1)
    const realmLabel = group.realms.size > 1 ? 'Mixed realms' : [...group.realms][0]
    const bid = state.standBids[group.item.name]
    const satisfiesBid =
      !!bid && group.unitPrice <= bid.price && (bid.acceptHigherLevels === false ? level === Number(bid.minimumQuality || 0) : level >= Number(bid.minimumQuality || 0))
    const name = item?.name || group.item.name
    return (
      <div key={group.key} role="group" aria-label={`Ponty ${name}`} className="flex flex-wrap items-center gap-2 rounded border border-fuchsia-900 p-2">
        <button type="button" onClick={() => {
          setInspectSource("Ponty's inventory")
          setInspecting(group.item)
        }} className="flex min-w-0 flex-1 basis-64 items-center gap-3 text-left">
          <SpriteIcon sprite={item?.sprite} size={40} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">
              {name}
              {item && (item.upgradeable || item.compoundable) ? ` +${level}` : ''}
            </span>
            <span className="block font-mono text-xs text-fuchsia-400">
              {realmLabel} · {group.quantity} available · {group.unitPrice.toLocaleString()}g each
            </span>
            <span className="block text-xs text-muted-foreground">
              Observed {group.seenAt ? `${Math.max(0, Math.floor((clock - group.seenAt) / 1000))}s ago` : 'at an unknown time'}
              {group.stale ? ' · stale' : ' · fresh'}
            </span>
          </span>
        </button>
        {satisfiesBid && <span className="rounded border border-violet-600 px-2 py-1 font-mono text-[10px] uppercase text-violet-400">Matches WTB</span>}
        <Input
          aria-label={`Ponty quantity for ${name}`}
          type="number"
          min={1}
          max={group.quantity}
          step={1}
          value={quantities[group.key] ?? group.minimumLot ?? 1}
          onChange={(event) => setQuantities((previous) => ({ ...previous, [group.key]: event.target.value }))}
          className="w-24"
        />
        <span className="whitespace-nowrap font-mono text-xs text-fuchsia-400">Up to {(group.unitPrice * (requested || 0)).toLocaleString()}g</span>
        <Button
          size="sm"
          disabled={busy === group.key || group.stale || !Number.isSafeInteger(requested) || requested < 1 || requested > group.quantity}
          onClick={() => {
            setRowError(null)
            setConfirming(group.key)
          }}
        >
          {busy === group.key ? 'Queuing…' : 'Buy'}
        </Button>
        {confirming === group.key && (
          <Confirm
            title="Confirm Ponty purchase"
            text={`Buy ${requested.toLocaleString()} ${name} for up to ${(requested * group.unitPrice).toLocaleString()}g? ${realmLabel || ''}. One purchase job will be queued per realm. ${merchantName || 'The merchant'} will travel as needed and verify each listing. Any matching WTB quantity will be decremented.`}
            busy={busy === group.key}
            error={rowError?.key === group.key ? rowError.message : null}
            onCancel={() => setConfirming(null)}
            onYes={() => void run(group.key, () => api.buyPonty({ keys: group.keys, quantity: requested, unitPrice: group.unitPrice }))}
          />
        )}
      </div>
    )
  }
}
