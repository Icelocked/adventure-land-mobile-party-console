import { useMemo, useState } from 'react'
import { Eye } from 'lucide-react'
import { useDomainInterest, useDynamicState, usePartyApi } from '@/data/PartyDataProvider'
import { gold, orderProgress, orderSummary, type NpcShopNpc, type NpcShopOrder, type NpcShopView } from '@/lib/npcShop'
import { estimateTotal, levelPrices, type PriceDefinitions } from '@/lib/npcPrice'
import { filterMarket } from '@/lib/marketFilter'
import type { ApiResult, CommandResult } from '@/api/partyApi'
import type { CatalogItem } from '@/models'
import { MarketFilterBar } from '@/components/MarketFilterBar'
import { marketRowFor, useStoredMarketFilter } from '@/lib/marketRows'
import { SpriteIcon } from '@/components/SpriteIcon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

/** The "Watch list" button and its sheet, from the console fork's
 *  npc-shop-dialog.tsx (topic15/ponty-ron-buys). Watches buy from Ponty or
 *  Ron on the merchant's realm while merchant plus bank gold stays above the
 *  reserve. */
export type WatchPrefill = { npc: NpcShopNpc; item: string; level: number }

export function NpcShopButton() {
  const state = useDynamicState()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="outline" disabled={!state.merchantCharacter} onClick={() => setOpen(true)}>
        <Eye className="mr-1 size-3.5" />
        Watch list
      </Button>
      {open && <WatchListSheet prefill={null} onClose={() => setOpen(false)} />}
    </>
  )
}

type Send = (action: () => Promise<ApiResult<CommandResult>>) => Promise<boolean>

export function WatchListSheet({ prefill, onClose }: { prefill: WatchPrefill | null; onClose: () => void }) {
  // The sheet polls the market section at its fast cadence while open.
  useDomainInterest('market')
  const state = useDynamicState()
  const api = usePartyApi()
  const [current, setCurrent] = useState(prefill)
  const [tab, setTab] = useState<'watches' | 'ron'>('watches')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [reserve, setReserve] = useState<string | null>(null)
  const shop = state.npcShop
  const items = useMemo(() => state.merchantCatalog?.allItems ?? [], [state.merchantCatalog])
  const catalog = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const send: Send = async (action) => {
    setError(null)
    setPending(true)
    const result = await action()
    setPending(false)
    if (result.kind === 'failure') setError(result.message || 'Request failed')
    return result.kind === 'success'
  }
  const watchFrom = (next: WatchPrefill) => {
    setCurrent(next)
    setTab('watches')
  }
  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto p-4">
        <SheetHeader className="p-0">
          <SheetTitle>Watch list</SheetTitle>
          <SheetDescription>
            Watches buy from Ponty or Ron on the merchant's realm{shop?.merchantRealm ? ` (${shop.merchantRealm})` : ''} as copies appear.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div role="tablist" className="flex gap-1.5">
            {(['watches', 'ron'] as const).map((entry) => (
              <Button key={entry} role="tab" aria-selected={tab === entry} size="sm" variant={tab === entry ? 'default' : 'outline'} onClick={() => setTab(entry)}>
                {entry === 'watches' ? 'Watches' : 'Ron'}
              </Button>
            ))}
          </div>
          <label className="ml-auto flex items-center gap-2 text-xs">
            Gold reserve
            <Input aria-label="Gold reserve" type="number" min={0} step={1} className="h-8 w-32" value={reserve ?? String(shop?.settings.goldReserve ?? 0)} onChange={(e) => setReserve(e.target.value)} />
          </label>
          <Button
            size="sm"
            variant="outline"
            disabled={reserve === null || pending}
            onClick={async () => {
              if (await send(() => api.saveNpcShopSettings({ goldReserve: Number(reserve) }))) setReserve(null)
            }}
          >
            Save reserve
          </Button>
          <span className="text-xs text-muted-foreground">Spendable {gold(shop?.spendable ?? 0)}</span>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="mt-3">
          {tab === 'watches' ? (
            <Watches key={JSON.stringify(current)} shop={shop} items={items} catalog={catalog} prefill={current} send={send} pending={pending} />
          ) : (
            <RonStock shop={shop} catalog={catalog} send={send} pending={pending} onWatch={watchFrom} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Watches({ shop, items, catalog, prefill, send, pending }: { shop?: NpcShopView | null; items: CatalogItem[]; catalog: ReadonlyMap<string, CatalogItem>; prefill: WatchPrefill | null; send: Send; pending: boolean }) {
  const api = usePartyApi()
  const [npc, setNpc] = useState<NpcShopNpc>(prefill?.npc ?? 'ponty')
  const [name, setName] = useState(prefill ? catalog.get(prefill.item)?.name || prefill.item : '')
  const [levels, setLevels] = useState({ min: String(prefill?.level ?? 0), max: String(prefill?.level ?? 0) })
  const [quantity, setQuantity] = useState('1')
  const [untilStop, setUntilStop] = useState(false)
  const [cap, setCap] = useState('')
  const defs = useMemo<PriceDefinitions>(() => Object.fromEntries(items.map((item) => [item.id, item.meta?.definition])), [items])
  const typed = name.trim().toLowerCase()
  const item = items.find((entry) => entry.name.toLowerCase() === typed || entry.id === typed)
  const low = Math.max(0, Number(levels.min) || 0)
  const high = Math.max(low, Number(levels.max) || 0)
  const ponty = item ? levelPrices(defs, item.id, low, high, 'ponty') : []
  const ron = item ? levelPrices(defs, item.id, low, high, 'ron') : []
  const prices = npc === 'ponty' ? ponty : ron
  const total = estimateTotal(prices, untilStop ? null : Number(quantity) || 0)
  const units = prices.map((entry) => entry.unitPrice)
  const span = (from: number, to: number) => (from === to ? gold(from) : `${from.toLocaleString()} to ${gold(to)}`)
  const orders = (shop?.orders ?? []).slice().reverse()
  return (
    <div className="flex flex-col gap-3">
      <section aria-label="New watch" className="flex flex-col gap-2 rounded border border-border p-2 text-xs">
        <label className="flex items-center gap-2">
          Shop
          <select aria-label="Shop" value={npc} onChange={(e) => setNpc(e.target.value === 'ron' ? 'ron' : 'ponty')} className="h-8 rounded border border-border bg-background px-2">
            <option value="ponty">Ponty</option>
            <option value="ron">Ron</option>
          </select>
        </label>
        <Input aria-label="Watch item" list="watch-items" placeholder="Item" value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
        <datalist id="watch-items">
          {items.map((entry) => (
            <option key={entry.id} value={entry.name}>
              {entry.id}
            </option>
          ))}
        </datalist>
        <div className="flex items-center gap-2">
          <Input aria-label="Lowest level" type="number" min={0} value={levels.min} onChange={(e) => setLevels({ ...levels, min: e.target.value })} className="h-8 w-20" />
          to
          <Input aria-label="Highest level" type="number" min={0} value={levels.max} onChange={(e) => setLevels({ ...levels, max: e.target.value })} className="h-8 w-20" />
        </div>
        {ponty.map((entry, index) => (
          <p key={entry.level} className="font-mono text-fuchsia-400">
            +{entry.level} · Ponty {gold(entry.unitPrice)} · Ron {gold(ron[index]?.unitPrice ?? 0)}
          </p>
        ))}
        <div className="flex items-center gap-2">
          <Input aria-label="Quantity" type="number" min={1} disabled={untilStop} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="h-8 w-24" />
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={untilStop} onChange={(e) => setUntilStop(e.target.checked)} />
            Until I stop
          </label>
        </div>
        <Input aria-label="Spend cap" type="number" min={1} placeholder="Spend cap (optional)" value={cap} onChange={(e) => setCap(e.target.value)} className="h-8" />
        {item && <p className="text-muted-foreground">{total ? `Estimated total ${span(total.low, total.high)}` : `${span(Math.min(...units), Math.max(...units))} per copy`}</p>}
        <Button
          size="sm"
          variant="outline"
          disabled={!item || pending}
          onClick={() =>
            item &&
            void send(() =>
              api.createNpcShopOrder({ npc, kind: 'watch', item: item.id, levelMin: low, levelMax: high, quantity: untilStop ? null : Number(quantity), spendCap: cap.trim() ? Number(cap) : null }),
            )
          }
        >
          Add watch
        </Button>
      </section>
      <section aria-label="Watches" className="flex flex-col gap-2">
        {orders.map((order) => (
          <OrderRow key={order.id} order={order} catalog={catalog} send={send} pending={pending} />
        ))}
        {!orders.length && <p className="text-xs text-muted-foreground">No watches yet.</p>}
      </section>
    </div>
  )
}

function OrderRow({ order, catalog, send, pending }: { order: NpcShopOrder; catalog: ReadonlyMap<string, CatalogItem>; send: Send; pending: boolean }) {
  const api = usePartyApi()
  const entry = catalog.get(order.item)
  const name = entry?.name || order.item
  const label = `${name} ${order.kind === 'watch' ? 'watch' : 'order'}`
  return (
    <div className="flex items-center gap-2 rounded border border-border p-2 text-xs">
      <SpriteIcon sprite={entry?.sprite} size={32} />
      <div className="min-w-0 flex-1">
        <p className="truncate">{orderSummary(order, name)}</p>
        <p className="font-mono text-muted-foreground">{orderProgress(order)}</p>
      </div>
      {order.status === 'active' && (
        <Button size="sm" variant="outline" aria-label={`Stop ${label}`} disabled={pending} onClick={() => void send(() => api.stopNpcShopOrder(order.id))}>
          Stop
        </Button>
      )}
      {order.status === 'paused' && (
        <Button size="sm" variant="outline" aria-label={`Resume ${label}`} disabled={pending} onClick={() => void send(() => api.resumeNpcShopOrder(order.id))}>
          Resume
        </Button>
      )}
    </div>
  )
}

function RonStock({ shop, catalog, send, pending, onWatch }: { shop?: NpcShopView | null; catalog: ReadonlyMap<string, CatalogItem>; send: Send; pending: boolean; onWatch: (prefill: WatchPrefill) => void }) {
  const api = usePartyApi()
  const [filter, setFilter] = useStoredMarketFilter('ron')
  // The checkbox shows the chosen consent until the market poll returns the saved value.
  const [donation, setDonation] = useState<boolean | null>(null)
  const [counts, setCounts] = useState<Record<string, string>>({})
  const ron = shop?.ron
  const saved = !!shop?.settings.ronDonation
  const offers = filterMarket(ron?.listings ?? [], filter, (offer) => marketRowFor(catalog.get(offer.item.name), offer.item, offer.unitPrice, offer.firstSeenAt ?? null))
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 rounded border border-border p-2 text-xs">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={donation !== null && donation !== saved ? donation : saved}
            onChange={(e) => {
              setDonation(e.target.checked)
              void send(() => api.saveNpcShopSettings({ ronDonation: e.target.checked }))
            }}
          />
          Allow a 1,000,000 gold donation when Ron asks for one (once per login)
        </label>
        <label className="flex flex-wrap items-center gap-2">
          Visit every
          <Input
            aria-label="Ron visit minutes"
            type="number"
            min={1}
            max={1440}
            step={1}
            className="h-7 w-20"
            defaultValue={shop?.settings.ronVisitMinutes ?? 10}
            onBlur={(e) => void send(() => api.saveNpcShopSettings({ ronVisitMinutes: Number(e.target.value) }))}
          />
          minutes while a Ron watch is active
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={pending} onClick={() => void send(() => api.visitRon())}>
            Check Ron now
          </Button>
          <span>
            {ron?.updatedAt ? `Visited ${new Date(ron.updatedAt).toLocaleTimeString()}` : 'Not visited since the console started'}
            {ron?.error ? ` · ${ron.error}` : ''}
          </span>
        </div>
      </div>
      <MarketFilterBar filter={filter} onChange={setFilter} />
      {offers.map((offer) => {
        const entry = catalog.get(offer.item.name)
        const level = Number(offer.item.level) || 0
        const name = (entry?.name || offer.item.name) + (level ? ` +${level}` : '')
        const count = counts[offer.rid] ?? String(offer.quantity)
        return (
          <div key={offer.rid} className="flex flex-wrap items-center gap-2 rounded border border-border p-2">
            <SpriteIcon sprite={entry?.sprite} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{name}</p>
              <p className="font-mono text-xs text-fuchsia-400">
                {offer.quantity} available · {gold(offer.unitPrice)} each
              </p>
              {offer.firstSeenAt && <p className="text-xs text-muted-foreground">First seen {new Date(offer.firstSeenAt).toLocaleTimeString()}</p>}
            </div>
            <Input aria-label={`Quantity for ${name}`} type="number" min={1} value={count} onChange={(e) => setCounts({ ...counts, [offer.rid]: e.target.value })} className="h-8 w-16" />
            <Button
              size="sm"
              variant="outline"
              aria-label={`Buy ${count} now ${name}`}
              disabled={pending}
              onClick={() => void send(() => api.createNpcShopOrder({ npc: 'ron', kind: 'now', item: offer.item.name, levelMin: level, levelMax: level, quantity: Number(count), spendCap: null }))}
            >
              Buy {count} now
            </Button>
            <Button size="sm" variant="outline" aria-label={`Watch ${name}`} onClick={() => onWatch({ npc: 'ron', item: offer.item.name, level })}>
              Watch
            </Button>
          </div>
        )
      })}
      {!offers.length && <p className="text-sm text-muted-foreground">{ron?.updatedAt ? "Nothing in Ron's last-visit stock matches." : 'Check Ron to read his stock.'}</p>}
    </div>
  )
}
