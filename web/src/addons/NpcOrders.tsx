import { useMemo, useState } from 'react'
import { useDynamicState } from '@/data/PartyDataProvider'
import { useAddonEnabled, useAddonRead, useAddons, useAddonWrites } from '@/data/useAddons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  NPC_ORDERS, boughtOf, nextPurchase, placeOrder, pontyStock, readOrders, removeOrder, resumeOrder, ronStock, stopOrder, triedOf,
  type Npc, type Order, type RonListed, type StockRow,
} from './npcOrderRules'

// The NPC Orders add-on's "Ponty / Ron" button and the sheet it opens (console
// runtime/addons/npc-orders/dashboard.tsx): a tab per NPC with its stock, and the order list. The
// order list saves through POST /addons, "Visit Ron" through POST /addon-command, and "Retry
// skipped lots" clears the party store's tried list. The console's button sits in its top bar; the
// PWA's sits with the merchant's other shop buttons, where the fork's watch list was.

const TABS: readonly { npc: Npc; label: string }[] = [
  { npc: 'ponty', label: 'Ponty' },
  { npc: 'ron', label: 'Ron' },
]
const itemLabel = (item: string, level: number | null | undefined) => (level === null || level === undefined ? item : `${item} +${level}`)
const gold = (value: number) => `${value.toLocaleString()}g`

export function NpcOrdersButton() {
  const enabled = useAddonEnabled(NPC_ORDERS)
  const [open, setOpen] = useState(false)
  if (!enabled) return null
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Ponty / Ron
      </Button>
      {open && <OrdersSheet onClose={() => setOpen(false)} />}
    </>
  )
}

function OrderRow({ order, bought, plan, busy, onStop, onResume, onRemove }: {
  order: Order
  bought: number
  plan: ReturnType<typeof nextPurchase>
  busy: boolean
  onStop: () => void
  onResume: () => void
  onRemove: () => void
}) {
  const what = order.count === 0 ? 'Buy all' : `Buy ${order.count}`
  const next = 'buy' in plan ? `Next: ${plan.quantity} at ${gold(plan.buy.unitPrice)} each${plan.buy.realm ? ` on ${plan.buy.realm}` : ''}` : plan.wait
  return (
    <li data-order={order.id} className="flex flex-wrap items-center gap-2 rounded border border-border px-2 py-1">
      <span className="font-semibold">{itemLabel(order.item, order.level)}</span>
      <span className="text-muted-foreground">
        {what}, up to {gold(order.maxPrice)} each, {bought} bought
      </span>
      <span className="text-muted-foreground">{next}</span>
      {order.stopped ? (
        <Button size="xs" variant="outline" disabled={busy} onClick={onResume}>
          Resume
        </Button>
      ) : (
        <Button size="xs" variant="outline" disabled={busy} onClick={onStop}>
          Stop
        </Button>
      )}
      <Button size="xs" variant="outline" disabled={busy} onClick={onRemove} aria-label={`Remove ${itemLabel(order.item, order.level)}`}>
        Remove
      </Button>
    </li>
  )
}

// One row per item to order: Ponty's lots on every realm, or Ron's last list.
function OfferList({ npc, rows, orders, busy, place }: { npc: Npc; rows: StockRow[]; orders: Order[]; busy: boolean; place: (ask: Omit<Order, 'id' | 'stopped'>) => void }) {
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [caps, setCaps] = useState<Record<string, string>>({})
  if (!rows.length) return <p className="text-muted-foreground">{npc === 'ponty' ? 'No Ponty stock seen.' : 'No Ron list yet. Visit Ron to read it.'}</p>
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((row) => {
        const held = orders.find((order) => order.item === row.item && (order.level ?? null) === row.level)
        const capText = caps[row.key] ?? String(held?.maxPrice ?? Math.ceil(row.unitPrice))
        const cap = Number(capText)
        const count = Number(counts[row.key] ?? 1)
        const validCap = Number.isInteger(cap) && cap > 0
        const validCount = Number.isInteger(count) && count > 0
        const ask = (n: number) => place({ npc, item: row.item, ...(row.level === null ? {} : { level: row.level }), count: n, maxPrice: cap })
        return (
          <li key={row.key} data-stock={row.key} className="flex flex-wrap items-center gap-2 rounded border border-border px-2 py-1">
            <span className="font-semibold">{itemLabel(row.item, row.level)}</span>
            <span className="text-muted-foreground">
              {row.realm ? `${row.realm} · ` : ''}
              {row.quantity} at {gold(row.unitPrice)}
            </span>
            <Input type="number" min={1} className="h-7 w-16" aria-label={`Copies of ${row.item}`} value={counts[row.key] ?? '1'} onChange={(event) => setCounts({ ...counts, [row.key]: event.target.value })} />
            <Input type="number" min={1} className="h-7 w-24" aria-label={`Max unit price for ${row.item}`} value={capText} onChange={(event) => setCaps({ ...caps, [row.key]: event.target.value })} />
            <Button size="xs" disabled={busy || !validCap || !validCount} onClick={() => ask(count)}>
              Buy {validCount ? count : 'X'}
            </Button>
            <Button size="xs" variant="outline" disabled={busy || !validCap} onClick={() => ask(0)}>
              Buy all
            </Button>
          </li>
        )
      })}
    </ul>
  )
}

function OrdersSheet({ onClose }: { onClose: () => void }) {
  const state = useDynamicState()
  const { addons, stores } = useAddons()
  const writes = useAddonWrites()
  const [tab, setTab] = useState<Npc>('ponty')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  // What the console's top bar hands its dialog: the merchant and its realm, gold and reserve.
  const merchant = state.merchantCharacter ?? null
  const realm = state.realmControl?.merchantRealm ?? state.realmControl?.activeRealm ?? ''
  const carried = merchant ? Number(state.characterSnapshots?.[merchant]?.gold) : NaN
  const merchantGold = Number.isFinite(carried) ? carried : null
  const reserve = Number(state.goldReserve ?? 0)
  const settings = Object.fromEntries(Object.entries(addons.find((addon) => addon.name === NPC_ORDERS)?.settings ?? {}).map(([key, setting]) => [key, setting.value]))
  const orders = readOrders(settings.orders)
  const consent = settings.ronDonate === true
  const party = stores[NPC_ORDERS]?.party ?? {}
  const bought = boughtOf(party)
  const tried = triedOf(party)
  const ron = party.ronStock as { lots: RonListed[]; at: number } | undefined
  const listings = useAddonRead<unknown>('market.ponty', [])
  const stock: Record<Npc, StockRow[]> = useMemo(() => ({ ponty: pontyStock(listings), ron: ronStock(ron?.lots ?? []) }), [listings, ron])
  const run = async (work: () => Promise<unknown>, done?: string) => {
    setBusy(true)
    setNote('')
    try {
      await work()
      if (done) setNote(done)
    } catch (failure) {
      setNote((failure as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const write = (values: Record<string, unknown>) => run(() => writes.save(NPC_ORDERS, { settings: values }))
  const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const shown = orders.filter((order) => order.npc === tab)
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" data-area="npc-orders" className="max-h-[85vh] gap-3 overflow-y-auto p-4 text-sm">
        <SheetHeader className="p-0">
          <SheetTitle>Ponty / Ron</SheetTitle>
          <SheetDescription>
            Standing buy orders for {merchant ?? 'the merchant'}, now on {realm || 'an unknown realm'}:{merchantGold === null ? ' gold unknown' : ` ${gold(merchantGold)} carried`}, reserve {gold(reserve)}.
          </SheetDescription>
        </SheetHeader>
        <div role="tablist" className="flex gap-2">
          {TABS.map((entry) => (
            <Button key={entry.npc} size="sm" role="tab" aria-selected={tab === entry.npc} variant={tab === entry.npc ? 'default' : 'outline'} onClick={() => setTab(entry.npc)}>
              {entry.label}
            </Button>
          ))}
        </div>
        <div role="tabpanel" className="flex flex-col gap-3">
          {tab === 'ron' ? (
            <>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="size-4" checked={consent} disabled={busy} aria-label="Donate to Ron to see his list" onChange={(event) => void write({ ronDonate: event.target.checked })} />
                Donate {gold(Number(settings.ronDonation) || 0)} to Ron on each visit to see his list
              </label>
              {consent ? (
                <p className="text-muted-foreground">The merchant visits only while its "Ron orders" routine is switched on.</p>
              ) : (
                <p className="text-amber-200">Ron shows his list only after a donation. Tick the box to let the merchant donate.</p>
              )}
              <Button size="sm" className="self-start" disabled={busy || !consent} onClick={() => void run(() => writes.command(NPC_ORDERS, undefined, { visitRon: true }), 'The merchant visits Ron on its next free pass.')}>
                Visit Ron
              </Button>
              {ron && <p className="text-muted-foreground">Ron's list read {new Date(ron.at).toLocaleString()}.</p>}
            </>
          ) : (
            tried.length > 0 && (
              <Button size="sm" variant="outline" className="self-start" disabled={busy} onClick={() => void run(() => writes.store(NPC_ORDERS, 'party', { tried: [] }))}>
                Retry {tried.length} skipped lots
              </Button>
            )
          )}
          <OfferList npc={tab} rows={stock[tab]} orders={shown} busy={busy} place={(ask) => void write({ orders: placeOrder(orders, ask, id()) })} />
          <h3 className="font-semibold">Orders</h3>
          {shown.length ? (
            <ul className="flex flex-col gap-1">
              {shown.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  busy={busy}
                  bought={bought[order.id] ?? 0}
                  plan={nextPurchase(order, stock[order.npc], merchantGold, reserve, bought[order.id] ?? 0, order.npc === 'ponty' ? tried : [])}
                  onStop={() => void write({ orders: stopOrder(orders, order.id) })}
                  onResume={() => void write({ orders: resumeOrder(orders, order.id) })}
                  onRemove={() => void write({ orders: removeOrder(orders, order.id) })}
                />
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No orders.</p>
          )}
          {note && (
            <p role="status" className="text-muted-foreground">
              {note}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
