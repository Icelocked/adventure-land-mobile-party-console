import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useCharacters, useDynamicState, usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { inventoryCounts } from '@/lib/inventoryCounts'
import { SpriteIcon } from '@/components/SpriteIcon'
import { Chip } from '@/components/Chip'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AccountScreenScaffold, EmptyState } from './AccountScreenScaffold'
import type { CraftMaterial, MerchantBuyItem, MerchantCraftRecipe, MerchantExchangeItem } from '@/models'

type Mode = 'buy' | 'craft' | 'exchange'
const MODES: Mode[] = ['buy', 'craft', 'exchange']

/** merchant-commerce-dialog.tsx ported as its own screen (a dialog with a
 *  cart doesn't fit a phone the way it fits a desktop popup) - Buy/Craft/
 *  Exchange were entirely unbuilt before this (Android's Merchant Activity
 *  screen literally said "coming soon" where this belongs). One deliberate
 *  scope cut from the dashboard version: the per-item "90% budget" upgrade-
 *  scroll cost estimate is a 3000-iteration Monte Carlo simulation the
 *  server re-runs and OVERWRITES anyway before queuing an upgradeable buy
 *  (runtime/coordinator/http/merchant-order.ts's estimate()) - so it's
 *  display-only on the dashboard, and skipping it here costs no real
 *  functionality, just a preview number. Buy-mode cost below is a simple
 *  cost×quantity total instead. */
export function MerchantCommerceScreen() {
  const { mode: modeParam } = useParams<{ mode: string }>()
  const mode: Mode = MODES.includes(modeParam as Mode) ? (modeParam as Mode) : 'buy'
  const navigate = useNavigate()
  const dynamicState = useDynamicState()
  const characters = useCharacters()
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const catalog = dynamicState.merchantCatalog

  const [search, setSearch] = useState('')
  const [buyCart, setBuyCart] = useState<Record<string, { quantity: number; level: number }>>({})
  const [craftCart, setCraftCart] = useState<Record<string, number>>({})
  const [exchangeCart, setExchangeCart] = useState<Record<string, number>>({})
  const [choosing, setChoosing] = useState<GroupedExchangeItem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const owned = useMemo(() => inventoryCounts(characters, dynamicState.bank, true), [characters, dynamicState.bank])
  const buyableById = useMemo(() => Object.fromEntries((catalog?.buyable ?? []).map((item) => [item.id, item])), [catalog])

  const setModeParam = (next: Mode) => navigate(`/merchant/${next}`, { replace: true })

  if (mode === 'buy') {
    return (
      <BuyScreen
        search={search}
        setSearch={setSearch}
        setMode={setModeParam}
        catalog={catalog?.buyable ?? []}
        cart={buyCart}
        setCart={setBuyCart}
        onSubmit={async () => {
          setSubmitting(true)
          setError(null)
          const lines = Object.entries(buyCart)
            .filter(([, line]) => line.quantity > 0)
            .map(([id, line]) => ({ id, quantity: line.quantity, ...(line.level > 0 ? { level: line.level } : {}) }))
          const result = await api.submitMerchantOrder(lines, [])
          setSubmitting(false)
          if (result.kind === 'failure') setError(result.message)
          else {
            setBuyCart({})
            await refreshNow()
            navigate(-1)
          }
        }}
        submitting={submitting}
        error={error}
      />
    )
  }
  if (mode === 'craft') {
    return (
      <CraftScreen
        search={search}
        setSearch={setSearch}
        setMode={setModeParam}
        recipes={catalog?.craftable ?? []}
        buyableById={buyableById}
        owned={owned}
        cart={craftCart}
        setCart={setCraftCart}
        onSubmit={async () => {
          setSubmitting(true)
          setError(null)
          const lines = Object.entries(craftCart)
            .filter(([, quantity]) => quantity > 0)
            .map(([id, quantity]) => ({ id, quantity }))
          const result = await api.submitMerchantOrder([], lines)
          setSubmitting(false)
          if (result.kind === 'failure') setError(result.message)
          else {
            setCraftCart({})
            await refreshNow()
            navigate(-1)
          }
        }}
        submitting={submitting}
        error={error}
      />
    )
  }
  return (
    <ExchangeScreen
      search={search}
      setSearch={setSearch}
      setMode={setModeParam}
      exchangeable={catalog?.exchangeable ?? []}
      characters={characters}
      bank={dynamicState.bank}
      cart={exchangeCart}
      setCart={setExchangeCart}
      choosing={choosing}
      setChoosing={setChoosing}
      onSubmit={async () => {
        setSubmitting(true)
        setError(null)
        const byKey = new Map<string, MerchantExchangeItem>((catalog?.exchangeable ?? []).map((item) => [item.key, item]))
        const lines = Object.entries(exchangeCart)
          .filter(([, quantity]) => quantity > 0)
          .map(([key, quantity]) => {
            const item = byKey.get(key)
            return { id: item?.id ?? key, quantity, level: item?.level ?? 0, reward: item?.reward ?? undefined }
          })
        const result = await api.submitExchangeOrder(lines)
        setSubmitting(false)
        if (result.kind === 'failure') setError(result.message)
        else {
          setExchangeCart({})
          await refreshNow()
          navigate(-1)
        }
      }}
      submitting={submitting}
      error={error}
    />
  )
}

function ModeTabs({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="flex gap-1.5 px-3 pb-2 pt-1">
      {MODES.map((m) => (
        <Chip key={m} selected={mode === m} onClick={() => setMode(m)}>
          {m === 'buy' ? 'Buy' : m === 'craft' ? 'Craft' : 'Exchange'}
        </Chip>
      ))}
    </div>
  )
}

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="px-3 pb-2">
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Search items..." />
    </div>
  )
}

function ItemRow({
  name,
  sprite,
  subtitle,
  disabled,
  onAdd,
  addLabel = 'Add',
}: {
  name: string
  sprite?: { url: string; tileSize: number; columns: number; rows: number; x: number; y: number } | null
  subtitle: string
  disabled?: boolean
  onAdd: () => void
  addLabel?: string
}) {
  return (
    <div className={`flex items-center gap-3 rounded-md border border-border bg-card p-2.5 ${disabled ? 'opacity-40' : ''}`}>
      <SpriteIcon sprite={sprite} size={36} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{name}</div>
        <div className="font-mono text-xs text-muted-foreground">{subtitle}</div>
      </div>
      <Button size="sm" disabled={disabled} onClick={onAdd}>
        {addLabel}
      </Button>
    </div>
  )
}

function CartRow({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2 border-t border-border py-2 first:border-t-0">{children}</div>
}

function SubmitBar({ label, disabled, submitting, error, onSubmit }: { label: string; disabled: boolean; submitting: boolean; error: string | null; onSubmit: () => void }) {
  return (
    <div className="sticky bottom-0 border-t border-border bg-background p-3">
      {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
      <Button className="w-full" disabled={disabled || submitting} onClick={onSubmit}>
        {submitting ? 'Queuing...' : label}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------- Buy ----

function BuyScreen({
  search,
  setSearch,
  setMode,
  catalog,
  cart,
  setCart,
  onSubmit,
  submitting,
  error,
}: {
  search: string
  setSearch: (v: string) => void
  setMode: (m: Mode) => void
  catalog: MerchantBuyItem[]
  cart: Record<string, { quantity: number; level: number }>
  setCart: (fn: (old: Record<string, { quantity: number; level: number }>) => Record<string, { quantity: number; level: number }>) => void
  onSubmit: () => void
  submitting: boolean
  error: string | null
}) {
  const filtered = catalog.filter((item) => `${item.name} ${item.id}`.toLowerCase().includes(search.toLowerCase()))
  const selected = catalog.filter((item) => (cart[item.id]?.quantity ?? 0) > 0)
  const goldTotal = selected.reduce((sum, item) => sum + item.cost * (cart[item.id]?.quantity ?? 0), 0)

  return (
    <AccountScreenScaffold title="Merchant shopping">
      <ModeTabs mode="buy" setMode={setMode} />
      <SearchBar value={search} onChange={setSearch} />
      {filtered.length === 0 ? (
        <EmptyState message="No buyable items found." />
      ) : (
        <div className="flex flex-col gap-1.5 px-3">
          {filtered.map((item) => (
            <ItemRow
              key={item.id}
              name={item.name}
              sprite={item.sprite}
              subtitle={`${item.cost.toLocaleString()}g`}
              onAdd={() => setCart((old) => ({ ...old, [item.id]: { quantity: (old[item.id]?.quantity ?? 0) + 1, level: old[item.id]?.level ?? 0 } }))}
            />
          ))}
        </div>
      )}

      {selected.length > 0 && (
        <div className="mt-3 border-t border-border px-3 pt-3">
          <p className="mb-1 font-mono text-xs uppercase text-muted-foreground">Cart</p>
          {selected.map((item) => {
            const line = cart[item.id]
            return (
              <CartRow key={item.id}>
                <SpriteIcon sprite={item.sprite} size={28} />
                <span className="min-w-0 flex-1 truncate text-xs">{item.name}</span>
                <Input
                  aria-label={`${item.name} quantity`}
                  value={String(line.quantity)}
                  onChange={(e) => setCart((old) => ({ ...old, [item.id]: { ...old[item.id], quantity: Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0) } }))}
                  className="h-8 w-14 px-1.5 text-center text-xs"
                />
                {item.upgradeable && (
                  <label className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
                    Target
                    <Input
                      aria-label={`${item.name} target level`}
                      value={`+${line.level}`}
                      onChange={(e) => setCart((old) => ({ ...old, [item.id]: { ...old[item.id], level: Math.max(0, Math.min(13, Number(e.target.value.replace(/\D/g, '')) || 0)) } }))}
                      className="h-8 w-14 px-1.5 text-center text-xs"
                    />
                  </label>
                )}
                <button className="text-xs text-destructive" onClick={() => setCart((old) => ({ ...old, [item.id]: { quantity: 0, level: 0 } }))}>
                  Remove
                </button>
              </CartRow>
            )
          })}
          <p className="mt-2 font-mono text-sm text-primary">Gold: {goldTotal.toLocaleString()}g</p>
        </div>
      )}
      <SubmitBar label="Buy all" disabled={!selected.length} submitting={submitting} error={error} onSubmit={onSubmit} />
    </AccountScreenScaffold>
  )
}

// -------------------------------------------------------------- Craft ----

function CraftScreen({
  search,
  setSearch,
  setMode,
  recipes,
  buyableById,
  owned,
  cart,
  setCart,
  onSubmit,
  submitting,
  error,
}: {
  search: string
  setSearch: (v: string) => void
  setMode: (m: Mode) => void
  recipes: MerchantCraftRecipe[]
  buyableById: Record<string, MerchantBuyItem>
  owned: Record<string, number>
  cart: Record<string, number>
  setCart: (fn: (old: Record<string, number>) => Record<string, number>) => void
  onSubmit: () => void
  submitting: boolean
  error: string | null
}) {
  const filtered = recipes.filter((item) => `${item.name} ${item.id}`.toLowerCase().includes(search.toLowerCase()))
  const canPurchaseMaterial = (material: CraftMaterial) => (material.level ?? 0) === 0 && !!buyableById[material.id]

  const requirements = useMemo(() => {
    const required: Record<string, { material: CraftMaterial; quantity: number }> = {}
    recipes.forEach((recipe) => {
      const quantity = cart[recipe.id] ?? 0
      if (quantity <= 0) return
      recipe.materials.forEach((material) => {
        const key = `${material.id}@${material.level ?? 0}`
        if (!required[key]) required[key] = { material, quantity: 0 }
        required[key].quantity += material.quantity * quantity
      })
    })
    return required
  }, [cart, recipes])

  const canAddRecipe = (recipe: MerchantCraftRecipe) =>
    recipe.materials.every((material) => {
      const key = `${material.id}@${material.level ?? 0}`
      const needed = (requirements[key]?.quantity ?? 0) + material.quantity
      return needed <= (owned[key] ?? 0) || canPurchaseMaterial(material)
    })

  const selected = recipes.filter((item) => (cart[item.id] ?? 0) > 0)

  return (
    <AccountScreenScaffold title="Merchant crafting">
      <ModeTabs mode="craft" setMode={setMode} />
      <p className="px-3 pb-1 text-xs text-muted-foreground">Recipes account for materials held by the active party and the latest bank snapshot.</p>
      <SearchBar value={search} onChange={setSearch} />
      {filtered.length === 0 ? (
        <EmptyState message="No craftable recipes found." />
      ) : (
        <div className="flex flex-col gap-1.5 px-3">
          {filtered.map((recipe) => {
            const enabled = canAddRecipe(recipe)
            return (
              <ItemRow
                key={recipe.id}
                name={recipe.name}
                sprite={recipe.sprite}
                subtitle={`${recipe.cost.toLocaleString()}g + materials`}
                disabled={!enabled}
                onAdd={() => setCart((old) => ({ ...old, [recipe.id]: (old[recipe.id] ?? 0) + 1 }))}
              />
            )
          })}
        </div>
      )}

      {selected.length > 0 && (
        <div className="mt-3 border-t border-border px-3 pt-3">
          <p className="mb-1 font-mono text-xs uppercase text-muted-foreground">Craft list</p>
          {selected.map((item) => (
            <CartRow key={item.id}>
              <SpriteIcon sprite={item.sprite} size={28} />
              <span className="min-w-0 flex-1 truncate text-xs">{item.name}</span>
              <Input
                aria-label={`${item.name} quantity`}
                value={String(cart[item.id])}
                onChange={(e) => setCart((old) => ({ ...old, [item.id]: Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0) }))}
                className="h-8 w-14 px-1.5 text-center text-xs"
              />
              <button className="text-xs text-destructive" onClick={() => setCart((old) => ({ ...old, [item.id]: 0 }))}>
                Remove
              </button>
            </CartRow>
          ))}
          <div className="mt-2 border-t border-border pt-2">
            <p className="mb-1 font-mono text-[10px] uppercase text-muted-foreground">Ingredient totals</p>
            {Object.entries(requirements).map(([key, requirement]) => {
              const available = owned[key] ?? 0
              const ok = requirement.quantity <= available || canPurchaseMaterial(requirement.material)
              return (
                <div key={key} className="flex items-center gap-2 border-t border-border py-1.5 first:border-t-0">
                  <SpriteIcon sprite={requirement.material.sprite} size={22} />
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {requirement.material.name}
                    {requirement.material.level ? ` +${requirement.material.level}` : ''}
                  </span>
                  <span className={`shrink-0 font-mono text-[10px] ${ok ? 'text-muted-foreground' : 'text-destructive'}`}>
                    {requirement.quantity} needed · {available} owned
                    {requirement.quantity > available && canPurchaseMaterial(requirement.material) ? ` · buy ${requirement.quantity - available}` : ''}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
      <SubmitBar label="Craft" disabled={!selected.length} submitting={submitting} error={error} onSubmit={onSubmit} />
    </AccountScreenScaffold>
  )
}

// ----------------------------------------------------------- Exchange ----

/** The dashboard groups every exchangeable entry that has a `reward` (a
 *  straight "pay N of this currency, get Y back" exchange) under one
 *  synthetic "currency" tile keyed by the currency item's own id, so a
 *  currency with several possible rewards (shells, cx, anniversary
 *  tokens, ...) shows once with a "Choose" button instead of once per
 *  reward. Entries WITHOUT `reward` (box/table pulls with a `results`
 *  chance table) are never grouped - they're their own row. This grouping
 *  is UI-only, not part of the wire shape, hence the local type here
 *  rather than adding `choices` to the shared MerchantExchangeItem model. */
type GroupedExchangeItem = MerchantExchangeItem & { choices?: MerchantExchangeItem[] }

function groupExchangeItems(items: MerchantExchangeItem[]): GroupedExchangeItem[] {
  const rows: GroupedExchangeItem[] = []
  for (const item of items) {
    if (!item.reward) {
      rows.push(item)
      continue
    }
    let currency = rows.find((row) => row.choices && row.id === item.id)
    if (!currency) {
      currency = {
        ...item,
        key: `${item.id}@choose`,
        name: item.currencyName || item.id,
        sprite: item.currencySprite ?? null,
        reward: undefined,
        required: 0,
        choices: [],
      }
      rows.push(currency)
    }
    currency.choices!.push(item)
  }
  return rows
}

function ExchangeScreen({
  search,
  setSearch,
  setMode,
  exchangeable,
  characters,
  bank,
  cart,
  setCart,
  choosing,
  setChoosing,
  onSubmit,
  submitting,
  error,
}: {
  search: string
  setSearch: (v: string) => void
  setMode: (m: Mode) => void
  exchangeable: MerchantExchangeItem[]
  characters: ReturnType<typeof useCharacters>
  bank: ReturnType<typeof useDynamicState>['bank']
  cart: Record<string, number>
  setCart: (fn: (old: Record<string, number>) => Record<string, number>) => void
  choosing: GroupedExchangeItem | null
  setChoosing: (v: GroupedExchangeItem | null) => void
  onSubmit: () => void
  submitting: boolean
  error: string | null
}) {
  // Only the merchant's own carried items count toward exchange
  // requirements (exchanges run through the merchant), matching
  // use-party-console.tsx's `exchangeOwned` scoping - distinct from the
  // full-account `owned` totals Buy/Craft use.
  const merchantOnly = useMemo(() => {
    const filtered: typeof characters = {}
    for (const [name, state] of Object.entries(characters)) {
      if (state.vitals?.ctype === 'merchant') filtered[name] = state
    }
    return filtered
  }, [characters])
  const exchangeOwned = useMemo(() => inventoryCounts(merchantOnly, bank, true), [merchantOnly, bank])

  const grouped = useMemo(() => groupExchangeItems(exchangeable), [exchangeable])
  const filtered = grouped.filter((item) => `${item.name} ${item.id}`.toLowerCase().includes(search.toLowerCase()))
  const byKey = useMemo(() => new Map(exchangeable.map((item) => [item.key, item])), [exchangeable])
  const selected = Array.from(new Set(Object.keys(cart)))
    .map((key) => byKey.get(key))
    .filter((item): item is MerchantExchangeItem => !!item && (cart[item.key] ?? 0) > 0)

  const exchangeRequired = (id: string, level: number) =>
    exchangeable.reduce((sum, item) => sum + (item.id === id && item.level === level ? item.required * (cart[item.key] ?? 0) : 0), 0)

  const add = (key: string) => setCart((old) => ({ ...old, [key]: (old[key] ?? 0) + 1 }))

  return (
    <AccountScreenScaffold title="Merchant exchanges">
      <ModeTabs mode="exchange" setMode={setMode} />
      <p className="px-3 pb-1 text-xs text-muted-foreground">Backed by the merchant's own inventory and the latest bank snapshot.</p>
      <SearchBar value={search} onChange={setSearch} />
      {filtered.length === 0 ? (
        <EmptyState message="No exchange operations available." />
      ) : (
        <div className="flex flex-col gap-1.5 px-3">
          {filtered.map((item) => {
            const isChoice = !!item.choices
            const ownedCount = exchangeOwned[`${item.id}@${item.level ?? 0}`] ?? 0
            const enabled = isChoice || ownedCount >= item.required * ((cart[item.key] ?? 0) + 1)
            return (
              <ItemRow
                key={item.key}
                name={item.name}
                sprite={item.sprite}
                subtitle={isChoice ? `${ownedCount} owned` : `${item.required} required · ${ownedCount} owned`}
                disabled={!enabled}
                addLabel={isChoice ? 'Choose' : 'Add'}
                onAdd={() => (isChoice ? setChoosing(item) : add(item.key))}
              />
            )
          })}
        </div>
      )}

      {selected.length > 0 && (
        <div className="mt-3 border-t border-border px-3 pt-3">
          <p className="mb-1 font-mono text-xs uppercase text-muted-foreground">Exchange cart</p>
          {selected.map((item) => (
            <CartRow key={item.key}>
              <SpriteIcon sprite={item.sprite} size={28} />
              <span className="min-w-0 flex-1 truncate text-xs">
                {item.name}
                {(item.rewardQuantity ?? 1) > 1 ? ` ×${item.rewardQuantity}` : ''} · uses {item.required} {item.currencyName || 'ea.'}
              </span>
              <Input
                aria-label={`${item.name} quantity`}
                value={String(cart[item.key])}
                onChange={(e) => setCart((old) => ({ ...old, [item.key]: Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0) }))}
                className="h-8 w-14 px-1.5 text-center text-xs"
              />
              <button className="text-xs text-destructive" onClick={() => setCart((old) => ({ ...old, [item.key]: 0 }))}>
                Remove
              </button>
            </CartRow>
          ))}
        </div>
      )}
      <SubmitBar label="Exchange all" disabled={!selected.length} submitting={submitting} error={error} onSubmit={onSubmit} />

      {choosing && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center justify-between border-b border-border p-3">
            <div className="flex items-center gap-2">
              <SpriteIcon sprite={choosing.sprite} size={32} />
              <span className="text-sm font-medium">{choosing.name}</span>
            </div>
            <button className="text-sm text-muted-foreground" onClick={() => setChoosing(null)}>
              Close
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <p className="mb-2 font-mono text-xs uppercase text-muted-foreground">Available rewards</p>
            <div className="flex flex-col gap-1.5">
              {choosing.choices?.map((choice) => {
                const disabled = exchangeRequired(choice.id, choice.level) + choice.required > (exchangeOwned[`${choice.id}@${choice.level}`] ?? 0)
                return (
                  <div key={choice.key} className="flex items-center gap-3 rounded-md border border-border bg-card p-2.5">
                    <SpriteIcon sprite={choice.sprite} size={32} />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {choice.name}
                      {(choice.rewardQuantity ?? 1) > 1 ? ` ×${choice.rewardQuantity}` : ''}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-primary">
                      <SpriteIcon sprite={choice.currencySprite} size={20} />× {choice.required}
                    </span>
                    <Button
                      size="sm"
                      disabled={disabled}
                      onClick={() => {
                        add(choice.key)
                        setChoosing(null)
                      }}
                    >
                      Add
                    </Button>
                  </div>
                )
              })}
            </div>
            {!!choosing.results?.length && (
              <>
                <p className="mb-2 mt-4 font-mono text-xs uppercase text-muted-foreground">Potential results</p>
                <div className="flex flex-col gap-1.5">
                  {choosing.results.map((result, index) => (
                    <div key={`${result.kind}-${result.id}-${index}`} className="flex items-center gap-3 rounded-md border border-border bg-card p-2.5">
                      <SpriteIcon sprite={result.sprite} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs">
                          {result.name}
                          {result.quantity > 1 ? ` ×${result.quantity}` : ''}
                        </p>
                        <p className="font-mono text-[10px] text-primary">{(result.chance * 100).toFixed(result.chance * 100 < 0.01 ? 4 : 2)}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </AccountScreenScaffold>
  )
}
