import { useMemo, useState } from 'react'
import { Store } from 'lucide-react'
import { useDomainInterest, useDynamicState, usePartyApi } from '@/data/PartyDataProvider'
import { npcShopOffers, npcShopRows, type NpcShopNpc, type NpcShopOffer, type NpcShopRow } from '@/lib/npcShop'
import type { ApiResult, CommandResult } from '@/api/partyApi'
import { SpriteIcon } from '@/components/SpriteIcon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

/** The "Ponty / Ron" button and its sheet, from the console fork's
 *  npc-shop-dialog.tsx (live build 2db4d763). Orders buy whole stacks up
 *  to a maximum unit price while merchant plus bank gold stays above the
 *  reserve. */
export function NpcShopButton() {
  const state = useDynamicState()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="outline" disabled={!state.merchantCharacter} onClick={() => setOpen(true)}>
        <Store className="mr-1 size-3.5" />
        Ponty / Ron
      </Button>
      {open && <NpcShopSheet onClose={() => setOpen(false)} />}
    </>
  )
}

function NpcShopSheet({ onClose }: { onClose: () => void }) {
  // The sheet polls the market section at its fast cadence while open.
  useDomainInterest('market')
  const state = useDynamicState()
  const api = usePartyApi()
  const [tab, setTab] = useState<NpcShopNpc>('ponty')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, { quantity?: string; price?: string }>>({})
  const [reserve, setReserve] = useState<string | null>(null)
  // The checkbox shows the chosen consent until the market poll returns the saved value.
  const [donation, setDonation] = useState<boolean | null>(null)
  const shop = state.npcShop
  const catalog = useMemo(() => new Map((state.merchantCatalog?.allItems ?? []).map((item) => [item.id, item])), [state.merchantCatalog])
  const offers = npcShopOffers(tab, (state.ponty?.listings ?? []) as NpcShopOffer[], shop)
  const orders = (shop?.orders ?? []).filter((order) => order.npc === tab)
  const label = (name: string, level: number) => (catalog.get(name)?.name || name) + (level ? ` +${level}` : '')
  const send = async (action: () => Promise<ApiResult<CommandResult>>) => {
    setError(null)
    setPending(true)
    const result = await action()
    setPending(false)
    if (result.kind === 'failure') setError(result.message || 'Request failed')
    return result.kind === 'success'
  }
  const order = (row: NpcShopRow, mode: 'count' | 'all') => {
    const draft = drafts[row.key] ?? {}
    void send(() =>
      api.createNpcShopOrder({ npc: tab, item: row.name, level: row.level, mode, quantity: Number(draft.quantity || 1), maxUnitPrice: Number(draft.price || row.low) }),
    )
  }
  const edit = (key: string, field: 'quantity' | 'price', value: string) => setDrafts((previous) => ({ ...previous, [key]: { ...previous[key], [field]: value } }))
  const ron = shop?.ron
  const realm = shop?.merchantRealm
  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto p-4">
        <SheetHeader className="p-0">
          <SheetTitle>Ponty and Ron</SheetTitle>
          <SheetDescription>
            What Ponty and Ron sell on the merchant's realm{realm ? ` (${realm})` : ''}. Orders buy whole stacks up to your maximum unit price.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div role="tablist" className="flex gap-1.5">
            {(['ponty', 'ron'] as const).map((npc) => (
              <Button key={npc} role="tab" aria-selected={tab === npc} size="sm" variant={tab === npc ? 'default' : 'outline'} onClick={() => setTab(npc)}>
                {npc === 'ponty' ? 'Ponty' : 'Ron'}
              </Button>
            ))}
          </div>
          <label className="ml-auto flex items-center gap-2 text-xs">
            Gold reserve
            <Input
              aria-label="Gold reserve"
              type="number"
              min={0}
              step={1}
              className="h-8 w-32"
              value={reserve ?? String(shop?.settings.goldReserve ?? 0)}
              onChange={(e) => setReserve(e.target.value)}
            />
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
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Orders keep merchant plus bank gold at or above the reserve. Spendable now: {(shop?.spendable ?? 0).toLocaleString()}g.
        </p>
        {tab === 'ron' && (
          <div className="mt-2 flex flex-col gap-2 rounded border border-border p-2 text-xs">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={donation !== null && donation !== shop?.settings.ronDonation ? donation : !!shop?.settings.ronDonation}
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
              minutes while a Ron order is active
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" disabled={pending} onClick={() => void send(() => api.visitRon())}>
                Check Ron now
              </Button>
              <span>
                {ron?.updatedAt ? `Read ${new Date(ron.updatedAt).toLocaleTimeString()}` : 'Not read since the console started'}
                {ron?.error ? ` · ${ron.error}` : ''}
              </span>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="mt-3 flex flex-col gap-2">
          {npcShopRows(offers).map((row) => {
            const item = catalog.get(row.name)
            const name = label(row.name, row.level)
            const draft = drafts[row.key] ?? {}
            return (
              <div key={row.key} className="flex flex-wrap items-center gap-2 rounded border border-border p-2">
                <SpriteIcon sprite={item?.sprite} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{name}</p>
                  <p className="font-mono text-xs text-fuchsia-300">
                    {row.copies} available · {row.low.toLocaleString()}g each
                  </p>
                </div>
                <Input
                  aria-label={`Quantity for ${name}`}
                  type="number"
                  min={1}
                  step={1}
                  className="h-8 w-16"
                  value={draft.quantity ?? '1'}
                  onChange={(e) => edit(row.key, 'quantity', e.target.value)}
                />
                <Input
                  aria-label={`Max unit price for ${name}`}
                  type="number"
                  min={1}
                  step={1}
                  className="h-8 w-28"
                  value={draft.price ?? String(row.low)}
                  onChange={(e) => edit(row.key, 'price', e.target.value)}
                />
                <Button size="sm" variant="outline" aria-label={`Buy ${draft.quantity ?? '1'} ${name}`} disabled={pending} onClick={() => order(row, 'count')}>
                  Buy {draft.quantity ?? '1'}
                </Button>
                <Button size="sm" variant="outline" aria-label={`Buy all ${name}`} disabled={pending} onClick={() => order(row, 'all')}>
                  Buy all
                </Button>
              </div>
            )
          })}
          {!offers.length && (
            <p className="text-sm text-muted-foreground">
              {tab === 'ponty' ? 'Ponty lists nothing on this realm right now.' : ron?.updatedAt ? 'Ron lists nothing right now.' : 'Check Ron to read his stock.'}
            </p>
          )}
        </div>
        <section aria-label="Orders" className="mt-3 flex flex-col gap-2 rounded border border-border p-2">
          <h3 className="font-mono text-[10px] uppercase text-muted-foreground">Orders</h3>
          {orders
            .slice()
            .reverse()
            .map((entry) => {
              const name = label(entry.item, entry.level)
              return (
                <div key={entry.id} className="flex items-center gap-2 rounded border border-border p-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      {name} · {entry.mode === 'count' ? `buy ${entry.quantity}` : 'buy all'} ≤ {entry.maxUnitPrice.toLocaleString()}g
                    </p>
                    <p className="font-mono text-muted-foreground">
                      {entry.bought}
                      {entry.mode === 'count' ? `/${entry.quantity}` : ''} bought · {entry.spent.toLocaleString()}g · {entry.status}
                    </p>
                  </div>
                  {entry.status === 'active' && (
                    <Button size="sm" variant="outline" aria-label={`Stop ${name} order`} disabled={pending} onClick={() => void send(() => api.stopNpcShopOrder(entry.id))}>
                      Stop
                    </Button>
                  )}
                </div>
              )
            })}
          {!orders.length && <p className="text-xs text-muted-foreground">No orders yet.</p>}
        </section>
      </SheetContent>
    </Sheet>
  )
}
