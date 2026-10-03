import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useCharacters, useDomainInterest, useDynamicState, usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { inventoryCounts } from '@/lib/inventoryCounts'
import { upgradeEstimate } from '@/lib/suggestedItemValue'
import type { ApiResult } from '@/api/partyApi'
import { SpriteIcon } from '@/components/SpriteIcon'
import { Chip } from '@/components/Chip'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AccountScreenScaffold, EmptyState } from './AccountScreenScaffold'
import type { CraftMaterial, MerchantBuyItem, MerchantCraftRecipe, MerchantExchangeItem } from '@/models'

type Mode = 'buy' | 'craft' | 'exchange'
const MODES: Mode[] = ['buy', 'craft', 'exchange']

/** merchant-commerce-dialog.tsx ported as its own screen (a dialog with a
 *  cart doesn't fit a phone the way it fits a desktop popup). */

// merchant-commerce-dialog.tsx: quantities are capped at 9999.
const capQuantity = (value: string) => Math.min(9999, Math.max(0, Number(value.replace(/[^0-9]/g, '')) || 0))

type Inventories = { name: string; items?: ({ item?: { name?: string; level?: number; q?: number } | null } | null)[] }[]
function inventories(characters: ReturnType<typeof useCharacters>, filter: (state: ReturnType<typeof useCharacters>[string]) => boolean = () => true): Inventories {
  return Object.entries(characters)
    .filter(([, state]) => filter(state))
    .map(([name, state]) => ({ name, items: state.inventory?.items ?? [] }))
}

/** merchant-commerce-dialog.tsx submit's catch: the message plus each 409 `missing` entry. */
function orderError(result: Extract<ApiResult<unknown>, { kind: 'failure' }>) {
  const missing = Array.isArray(result.body?.missing) ? (result.body.missing as { id: string; level?: number; required: number; available: number }[]) : []
  return (result.message || 'Could not queue order') + missing.map((item) => ` · ${item.id} +${item.level || 0}: ${item.required} required, ${item.available} available`).join('')
}
export function MerchantCommerceScreen() {
  const { mode: modeParam } = useParams<{ mode: string }>()
  const mode: Mode = MODES.includes(modeParam as Mode) ? (modeParam as Mode) : 'buy'
  const navigate = useNavigate()
  const dynamicState = useDynamicState()
  const characters = useCharacters()
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const catalog = dynamicState.merchantCatalog
  // party-merchant-commerce-dialog.tsx: usePanelModel(base, { inventory: true, bank: true }).
  useDomainInterest('bank')

  const [search, setSearch] = useState('')
  const [buyCart, setBuyCart] = useState<Record<string, { quantity: number; level: number }>>({})
  const [craftCart, setCraftCart] = useState<Record<string, number>>({})
  const [exchangeCart, setExchangeCart] = useState<Record<string, number>>({})
  const [choosing, setChoosing] = useState<GroupedExchangeItem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const owned = useMemo(() => inventoryCounts(inventories(characters), dynamicState.bank, dynamicState.bankbois, true), [characters, dynamicState.bank, dynamicState.bankbois])
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
        onSubmit={async (lines) => {
          setSubmitting(true)
          setError(null)
          const result = await api.submitMerchantOrder(lines, [])
          setSubmitting(false)
          if (result.kind === 'failure') setError(orderError(result))
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
          if (result.kind === 'failure') setError(orderError(result))
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
      bankbois={dynamicState.bankbois}
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
        if (result.kind === 'failure') setError(orderError(result))
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
  return <div className="flex flex-wrap items-center gap-2 border-t border-border py-2 first:border-t-0">{children}</div>
}

function SubmitBar({ label, disabled, submitting, error, onSubmit }: { label: string; disabled: boolean; submitting: boolean; error: string | null; onSubmit: () => void }) {
  return (
    <div className="sticky bottom-0 border-t border-border bg-background p-3">
      {error && <p role="alert" className="mb-2 text-sm text-destructive">{error}</p>}
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
  onSubmit: (lines: { id: string; quantity: number; level?: number; budget?: number; maxAttempts?: number }[]) => void
  submitting: boolean
  error: string | null
}) {
  const filtered = catalog.filter((item) => `${item.name} ${item.id}`.toLowerCase().includes(search.toLowerCase()))
  const selected = catalog.filter((item) => (cart[item.id]?.quantity ?? 0) > 0)
  // merchant-commerce-dialog.tsx: estimates, hasEstimatedGold, goldTotal and the submitted lines.
  const estimates = Object.fromEntries(selected.map((item) => [item.id, upgradeEstimate(item, cart[item.id].quantity, cart[item.id]?.level || 0)]))
  const hasEstimatedGold = selected.some((item) => (cart[item.id]?.level || 0) > 0 && item.upgradeable)
  const goldTotal = selected.reduce((sum, item) => sum + estimates[item.id].gold, 0)
  const lines = () =>
    selected.map((item) => ({
      id: item.id,
      quantity: cart[item.id].quantity,
      ...(cart[item.id]?.level ? { level: cart[item.id].level } : {}),
      ...(item.upgradeable ? { budget: estimates[item.id].gold, maxAttempts: estimates[item.id].attempts } : {}),
    }))

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
                  onChange={(e) => setCart((old) => ({ ...old, [item.id]: { ...old[item.id], quantity: capQuantity(e.target.value) } }))}
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
                <Button variant="link" size="xs" className="text-destructive" onClick={() => setCart((old) => ({ ...old, [item.id]: { quantity: 0, level: 0 } }))}>
                  Remove
                </Button>
                {line.level > 0 && item.upgradeable ? (
                  <p className="ml-9 w-full font-mono text-[10px] text-violet-300">
                    90% budget: {estimates[item.id].attempts} base items ·{' '}
                    {estimates[item.id].scrolls
                      .map((count, grade) => (count ? `${count} scroll${grade}` : ''))
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                ) : null}
              </CartRow>
            )
          })}
          <p className="mt-2 font-mono text-sm text-primary">
            Gold{hasEstimatedGold ? ' (est)' : ''}: {goldTotal.toLocaleString()}g
          </p>
        </div>
      )}
      <SubmitBar label="Buy all" disabled={!selected.length} submitting={submitting} error={error} onSubmit={() => onSubmit(lines())} />
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

  // merchant-commerce-dialog.tsx: ingredientPurchaseCost and additionalRecipeCost.
  const ingredientPurchaseCost = Object.entries(requirements).reduce((sum, [key, requirement]) => {
    const missing = Math.max(0, requirement.quantity - (owned[key] || 0))
    return sum + missing * (buyableById[requirement.material.id]?.cost || 0)
  }, 0)
  const additionalRecipeCost = (recipe: MerchantCraftRecipe) =>
    recipe.cost +
    recipe.materials.reduce((sum, material) => {
      const key = `${material.id}@${material.level || 0}`
      const before = Math.max(0, (requirements[key]?.quantity || 0) - (owned[key] || 0))
      const after = Math.max(0, (requirements[key]?.quantity || 0) + material.quantity - (owned[key] || 0))
      return sum + (after - before) * (buyableById[material.id]?.cost || 0)
    }, 0)
  const [previewing, setPreviewing] = useState<string | null>(null)

  const selected = recipes.filter((item) => (cart[item.id] ?? 0) > 0)
  const goldTotal = selected.reduce((sum, item) => sum + item.cost * cart[item.id], 0) + ingredientPurchaseCost
  // Per-recipe canAddRecipe only guards the incremental +1 tap - typing a
  // quantity directly into the cart Input bypasses it entirely, so the
  // submit button needs its own aggregate check across every material's
  // running total, matching the dashboard's materialsAvailable gate.
  const materialsAvailable = Object.entries(requirements).every(
    ([key, requirement]) => requirement.quantity <= (owned[key] ?? 0) || canPurchaseMaterial(requirement.material),
  )

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
            const open = previewing === recipe.id
            return (
              <div key={recipe.id} className="flex flex-col gap-1">
                <ItemRow
                  name={recipe.name}
                  sprite={recipe.sprite}
                  subtitle={`${recipe.cost.toLocaleString()}g + materials`}
                  disabled={!enabled}
                  onAdd={() => setCart((old) => ({ ...old, [recipe.id]: (old[recipe.id] ?? 0) + 1 }))}
                />
                {/* The dashboard's hover preview; a phone has no hover, so it toggles inline. */}
                <Button variant="link" size="xs" className="self-start text-violet-300" aria-expanded={open} onClick={() => setPreviewing(open ? null : recipe.id)}>
                  {open ? 'Hide recipe' : 'Complete recipe'}
                </Button>
                {open && (
                  <div role="group" aria-label={`${recipe.name} recipe`} className="rounded-md border border-violet-600 bg-card p-2.5">
                    <p className="text-sm font-semibold text-violet-200">{recipe.name}</p>
                    <p className="mb-2 font-mono text-[10px] uppercase text-violet-300">Complete recipe</p>
                    {recipe.materials.map((material) => {
                      const available = owned[`${material.id}@${material.level || 0}`] || 0
                      return (
                        <div key={`${material.id}-${material.level}`} className="flex items-center gap-2 py-1">
                          <SpriteIcon sprite={material.sprite} size={28} />
                          <span className="min-w-0 flex-1 text-xs">
                            {material.quantity} × {material.name}
                            {material.level ? ` +${material.level}` : ''}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                            {available >= material.quantity
                              ? `${available} owned`
                              : canPurchaseMaterial(material)
                                ? `${available} owned · buy ${material.quantity - available}`
                                : `${available} owned · missing`}
                          </span>
                        </div>
                      )
                    })}
                    <p className="mt-2 border-t border-violet-800 pt-2 text-right font-mono text-xs text-amber-300">
                      Next craft: {additionalRecipeCost(recipe).toLocaleString()}g total
                    </p>
                  </div>
                )}
              </div>
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
                onChange={(e) => setCart((old) => ({ ...old, [item.id]: capQuantity(e.target.value) }))}
                className="h-8 w-14 px-1.5 text-center text-xs"
              />
              <Button variant="link" size="xs" className="text-destructive" onClick={() => setCart((old) => ({ ...old, [item.id]: 0 }))}>
                Remove
              </Button>
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
          <p className="mt-2 font-mono text-sm text-primary">Gold: {goldTotal.toLocaleString()}g</p>
        </div>
      )}
      <SubmitBar label="Craft" disabled={!selected.length || !materialsAvailable} submitting={submitting} error={error} onSubmit={onSubmit} />
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
  bankbois,
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
  bankbois: ReturnType<typeof useDynamicState>['bankbois']
  cart: Record<string, number>
  setCart: (fn: (old: Record<string, number>) => Record<string, number>) => void
  choosing: GroupedExchangeItem | null
  setChoosing: (v: GroupedExchangeItem | null) => void
  onSubmit: () => void
  submitting: boolean
  error: string | null
}) {
  // merchant-commerce-dialog.tsx exchangeOwned: merchant-class characters, the bank and bankbois.
  const exchangeOwned = useMemo(
    () => inventoryCounts(inventories(characters, (state) => state.vitals?.ctype === 'merchant'), bank, bankbois, true),
    [characters, bank, bankbois],
  )

  const grouped = useMemo(() => groupExchangeItems(exchangeable), [exchangeable])
  const filtered = grouped.filter((item) => `${item.name} ${item.id}`.toLowerCase().includes(search.toLowerCase()))
  const byKey = useMemo(() => new Map(exchangeable.map((item) => [item.key, item])), [exchangeable])
  const selected = Array.from(new Set(Object.keys(cart)))
    .map((key) => byKey.get(key))
    .filter((item): item is MerchantExchangeItem => !!item && (cart[item.key] ?? 0) > 0)

  const exchangeRequired = (id: string, level: number) =>
    exchangeable.reduce((sum, item) => sum + (item.id === id && item.level === level ? item.required * (cart[item.key] ?? 0) : 0), 0)

  const add = (key: string) => setCart((old) => ({ ...old, [key]: (old[key] ?? 0) + 1 }))
  // Same gap as Craft's materialsAvailable: the per-row `enabled` check only
  // guards the incremental Add tap, and typing a quantity directly into the
  // cart Input bypasses it - so the submit button needs its own aggregate
  // check across every selected item's running total.
  const exchangesAvailable = selected.every((item) => {
    const ownedCount = exchangeOwned[`${item.id}@${item.level ?? 0}`] ?? 0
    return ownedCount >= item.required * (cart[item.key] ?? 0)
  })

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
                onChange={(e) => setCart((old) => ({ ...old, [item.key]: capQuantity(e.target.value) }))}
                className="h-8 w-14 px-1.5 text-center text-xs"
              />
              <Button variant="link" size="xs" className="text-destructive" onClick={() => setCart((old) => ({ ...old, [item.key]: 0 }))}>
                Remove
              </Button>
            </CartRow>
          ))}
        </div>
      )}
      <SubmitBar label="Exchange all" disabled={!selected.length || !exchangesAvailable} submitting={submitting} error={error} onSubmit={onSubmit} />

      {choosing && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center justify-between border-b border-border p-3">
            <div className="flex items-center gap-2">
              <SpriteIcon sprite={choosing.sprite} size={32} />
              <span className="text-sm font-medium">{choosing.name}</span>
            </div>
            <Button variant="link" size="xs" className="text-muted-foreground" onClick={() => setChoosing(null)}>
              Close
            </Button>
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
